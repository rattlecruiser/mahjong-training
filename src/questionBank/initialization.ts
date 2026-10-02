import type { GeneratedQuestionData, GenerationResult } from '../generator/generate';
import type { Mode } from '../game/modes';
import type { StoredQuestion } from './types';
import { loadBank, makeQuestion, saveBank } from './storage';
import { removeFeedbackForQuestion } from './feedback';
import { parseHandText } from './parser';

/** GeneratedQuestionData → StoredQuestion（初始化與 Admin append 共用）。 */
export function storedQuestionFromGenerated(
  g: GeneratedQuestionData,
  id: string,
  generatorVersion: string,
  now: number,
): StoredQuestion {
  return {
    id,
    mode: g.mode,
    tiles: g.tiles,
    key: g.key,
    source: 'GENERATED',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    meta: {
      qualityScore: g.quality,
      qualityBreakdown: g.qualityBreakdown,
      penaltyDetails: g.penaltyDetails,
      difficultyRaw: g.difficultyRaw,
      difficultyTier: g.difficultyTier,
      structureTags: g.structureTags,
      decisionTags: g.decisionTags,
      primaryStructureArchetype: g.primaryStructureArchetype,
      bestDiscards: g.bestDiscards,
      bestUkeire: g.bestUkeire,
      bestKinds: g.bestKinds,
      structuralFingerprint: { iso: g.iso, translation: g.translation },
      generatorVersion,
    },
  };
}

/**
 * 題庫一次性初始化（PART AG / AH / BI）。
 *
 * 正式生成題庫由 `npm run generate` 離線執行 Generator 產生
 * （generatedBank.v1.json，每一題都經引擎完整驗證），
 * 第一次啟動時匯入 Persistent Storage 一次。
 *
 * 保證：
 * - meta.questionBankInitialized === true 或題庫已初始化 → 直接讀取，
 *   【永遠不會在 startup 重新生成 / 重新匯入】。
 *   Refresh / 關閉重開 / New Game / Mode 切換 / USER / ADMIN 啟動皆同。
 * - generatorVersion 改變也不會自動重建（只是 metadata）；
 *   重建必須由 ADMIN 明確觸發（adminActions.rebuild）。
 * - 匯入 + 標記 initialized 在同一次 saveBank 完成（單一 setItem =
 *   atomic commit），中途失敗不會留下「半初始化」狀態。
 * - 匯入時對既有題目（含第一階段 MANUAL 題）做 exact duplicate 檢查，
 *   絕不覆蓋、絕不刪除既有資料。
 */

export interface InitializationOutcome {
  ran: boolean;
  imported: number;
  skippedDuplicates: number;
  /** 題庫維護 patch 是否在這次啟動套用（一次性）。 */
  patched: boolean;
  patchRemoved: number;
  patchAdded: number;
}

let inflight: Promise<InitializationOutcome> | null = null;

/**
 * App 啟動呼叫。進行中的初始化共用同一個 promise（避免並行雙重執行）；
 * 完成後的重複呼叫走 runInitialization 的 idempotent 快速路徑
 * （讀到 meta.questionBankInitialized === true 直接回傳，不做任何事）。
 */
export function ensureQuestionBankInitialized(): Promise<InitializationOutcome> {
  if (inflight) return inflight;
  const promise = runInitialization().finally(() => {
    if (inflight === promise) inflight = null;
  });
  inflight = promise;
  return promise;
}

/** 不經 cache 的初始化（Admin REBUILD 匯入時也使用）。 */
export async function runInitialization(): Promise<InitializationOutcome> {
  const first = await importInitialBankIfNeeded();
  // 一次性題庫維護 patch（idempotent；已套用或 fresh install 皆為 no-op）
  const patch = await applyBankPatches();
  return { ...first, ...patch };
}

async function importInitialBankIfNeeded(): Promise<
  Pick<InitializationOutcome, 'ran' | 'imported' | 'skippedDuplicates'>
> {
  const bank = loadBank();
  if (bank.meta.questionBankInitialized) {
    return { ran: false, imported: 0, skippedDuplicates: 0 };
  }

  // 動態載入內建正式生成題庫（獨立 chunk，首次初始化才載入）
  const module = await import('./generatedBank.v1.json');
  const data = module.default as unknown as GenerationResult;
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('內建生成題庫載入失敗（generatedBank.v1.json）');
  }

  const existing = new Set(bank.questions.map((q) => `${q.mode}:${q.key}`));
  const now = Date.now();
  const toAdd: StoredQuestion[] = [];
  let skippedDuplicates = 0;

  data.questions.forEach((g, index) => {
    const composite = `${g.mode}:${g.key}`;
    if (existing.has(composite)) {
      skippedDuplicates++;
      return;
    }
    existing.add(composite);
    toAdd.push(
      storedQuestionFromGenerated(g, `g1-${g.mode}-${index}`, data.generatorVersion, now),
    );
  });

  // 匯入 + 初始化 metadata：單一 atomic 寫入
  bank.questions.push(...toAdd);
  bank.meta = {
    ...bank.meta,
    questionBankInitialized: true,
    generatorVersion: data.generatorVersion,
    generatedAt: data.generatedAt,
    generationSeed: data.generationSeed,
    generationConfigVersion: data.configVersion,
  };
  saveBank(bank);

  return { ran: true, imported: toAdd.length, skippedDuplicates };
}

/* ---------------- 題庫維護 patch（PART 1：quad-best-discard cleanup） ---------------- */

export const CURRENT_BANK_PATCH_LEVEL = 1;

interface BankPatchFile {
  patchLevel: number;
  removals: { mode: Mode; key: string; notation: string }[];
  generatedReplacementKeys: { mode: Mode; key: string }[];
  defaultReplacements: { mode: Mode; notation: string }[];
}

/**
 * Patch 1：從既有 Persistent 題庫移除「手牌中某 tile 有 4 張、且該 tile
 * 屬於引擎最佳打牌」的題目（實戰存在暗槓決策，目前遊戲不建模），
 * 並補入等量、已通過全部 Generator 規則＋引擎驗證的 replacement——
 * 各模式題數維持不變。
 *
 * - 以 (mode, canonical key) 比對，不依賴 question id。
 * - Idempotent：meta.bankPatchLevel 已達標即直接跳過；
 *   fresh install（匯入的是修正後題庫）removals 找不到、additions 全部
 *   dup-skip，同樣安全。
 * - 這不是「重新生成題庫」：只動 patch 清單上的題，其他題目、
 *   MANUAL 題、DISABLED 狀態與回饋完全不動。
 */
async function applyBankPatches(): Promise<
  Pick<InitializationOutcome, 'patched' | 'patchRemoved' | 'patchAdded'>
> {
  const bank = loadBank();
  if ((bank.meta.bankPatchLevel ?? 0) >= CURRENT_BANK_PATCH_LEVEL) {
    return { patched: false, patchRemoved: 0, patchAdded: 0 };
  }

  const [patchModule, bankModule] = await Promise.all([
    import('./bankPatch.v1.json'),
    import('./generatedBank.v1.json'),
  ]);
  const patch = patchModule.default as unknown as BankPatchFile;
  const bankJson = bankModule.default as unknown as GenerationResult;

  // 1) 移除無效題（同時記下 id 供回饋清理）
  const removalSet = new Set(patch.removals.map((r) => `${r.mode}:${r.key}`));
  const removed = bank.questions.filter((q) => removalSet.has(`${q.mode}:${q.key}`));
  bank.questions = bank.questions.filter((q) => !removalSet.has(`${q.mode}:${q.key}`));

  // 2) 補入 replacement（GENERATED：從修正後題庫 JSON 取完整 metadata）
  const existing = new Set(bank.questions.map((q) => `${q.mode}:${q.key}`));
  const byKey = new Map(bankJson.questions.map((g) => [`${g.mode}:${g.key}`, g]));
  const now = Date.now();
  let added = 0;
  patch.generatedReplacementKeys.forEach((r, i) => {
    const composite = `${r.mode}:${r.key}`;
    if (existing.has(composite)) return;
    const g = byKey.get(composite);
    if (!g) return; // patch 與題庫 JSON 不同步時保守跳過（不硬塞）
    bank.questions.push(
      storedQuestionFromGenerated(g, `g1p1-${r.mode}-${i}`, bankJson.generatorVersion, now),
    );
    existing.add(composite);
    added++;
  });
  // 3) 內建 demo 題的 replacement（MANUAL，與 fresh install 的 seed 一致）
  for (const d of patch.defaultReplacements) {
    const parsed = parseHandText(d.notation);
    if (!parsed.ok) continue;
    const q = makeQuestion(d.mode, parsed.tiles, 'MANUAL');
    const composite = `${q.mode}:${q.key}`;
    if (existing.has(composite)) continue;
    bank.questions.push(q);
    existing.add(composite);
    added++;
  }

  // 標記 + 寫入：單一 atomic 寫入
  bank.meta = { ...bank.meta, bankPatchLevel: CURRENT_BANK_PATCH_LEVEL };
  saveBank(bank);
  for (const q of removed) removeFeedbackForQuestion(q.id);

  return { patched: true, patchRemoved: removed.length, patchAdded: added };
}

/** 測試用：清掉 in-flight cache。 */
export function resetInitializationForTests(): void {
  inflight = null;
}
