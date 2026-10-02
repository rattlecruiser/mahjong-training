/**
 * PART 1 replacement pipeline（一次性離線執行）：
 *
 * 1. 用引擎重新掃描 generatedBank.v1.json + 內建 demo 題，
 *    找出 quad-best-discard 無效題（handCount=4 且該牌 ∈ 引擎最佳打牌）。
 * 2. 只替換無效題（絕不重新生成整個題庫）：
 *    - 以現有 Generator（含新 quad exclusion rule）生成 replacement，
 *      existingKeys = 保留題的 keys（exact dedup），再對保留題 iso 去重。
 *    - replacement 通過全部原有 quality / suit / dedup / engine 驗證
 *      + 新 quad rule（generateForMode 內建）。
 * 3. 生成題庫 JSON 內【原位替換】（其他題目的 index / 匯入 ID 不變）。
 * 4. Difficulty tier：替換題依 difficultyRaw 由低到高補足各 tier 缺額，
 *    使每模式 tier 分佈與原本（20/40/30/10）完全一致。
 * 5. 輸出 bankPatch.v1.json：已初始化的既有安裝（localStorage 題庫）
 *    用它移除無效題並補入相同的 replacement（idempotent patch）。
 *
 * 執行：npx tsx scripts/replaceQuadInvalid.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bankData from '../src/questionBank/generatedBank.v1.json';
import { DEFAULT_QUESTION_NOTATIONS } from '../src/questionBank/defaultQuestions';
import { parseHandText } from '../src/questionBank/parser';
import {
  DEFAULT_GENERATOR_CONFIG,
  type GeneratorConfig,
} from '../src/generator/config';
import { createRng } from '../src/generator/rng';
import {
  generateForMode,
  type GeneratedQuestionData,
  type GenerationResult,
} from '../src/generator/generate';
import { analyzeHand, countsFromIds, handKey, tileIdOf } from '../src/engine';
import { MODES, type Mode, requiredMeldsFor } from '../src/game/modes';

const here = dirname(fileURLToPath(import.meta.url));
const BANK_PATH = join(here, '../src/questionBank/generatedBank.v1.json');
const PATCH_PATH = join(here, '../src/questionBank/bankPatch.v1.json');

const data = structuredClone(bankData) as unknown as GenerationResult;
const TIER_ORDER = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;

function quadBestTiles(tiles: readonly string[], mode: Mode): number[] {
  const c = countsFromIds(tiles);
  return analyzeHand(c, requiredMeldsFor(mode)).bestDiscards.filter((t) => c[t] === 4);
}

interface ModePlan {
  mode: Mode;
  invalidJsonIndices: number[];
  invalidDefaultIdx: number[];
  keptKeys: Set<string>;
  keptIsos: Set<string>;
}

const plans = new Map<Mode, ModePlan>();
for (const mode of MODES) {
  plans.set(mode, {
    mode,
    invalidJsonIndices: [],
    invalidDefaultIdx: [],
    keptKeys: new Set(),
    keptIsos: new Set(),
  });
}

// ---- 掃描生成題庫 ----
data.questions.forEach((q, index) => {
  const plan = plans.get(q.mode)!;
  if (quadBestTiles(q.tiles, q.mode).length > 0) {
    plan.invalidJsonIndices.push(index);
  } else {
    plan.keptKeys.add(q.key);
    plan.keptIsos.add(q.iso);
  }
});

// ---- 掃描內建 demo 題 ----
for (const mode of MODES) {
  const plan = plans.get(mode)!;
  DEFAULT_QUESTION_NOTATIONS[mode].forEach((notation, idx) => {
    const parsed = parseHandText(notation);
    if (!parsed.ok) throw new Error(`default 解析失敗：${notation}`);
    if (quadBestTiles(parsed.tiles, mode).length > 0) {
      plan.invalidDefaultIdx.push(idx);
    } else {
      plan.keptKeys.add(handKey(countsFromIds(parsed.tiles)));
      // defaults 沒有存 iso，僅 exact-key 防撞（歷史上 demo 題含字牌，
      // 生成題不含字牌，實際不會 iso 撞）
    }
  });
}

// ---- 每模式生成 replacement ----
const patchRemovals: { mode: Mode; key: string; notation: string }[] = [];
const patchGeneratedKeys: { mode: Mode; key: string }[] = [];
const patchDefaultAdds: { mode: Mode; notation: string }[] = [];
const replacedIds: string[] = [];

interface Round {
  seed: number;
  targetMultiple: number;
  maxCandidates: Record<Mode, number>;
  winningHands: Record<Mode, number>;
  wideBeams?: boolean;
}

/**
 * 多輪累積式補題：每輪 deterministic；上一輪選到的 keys/isos 加入排除集，
 * 下一輪換 seed、加大預算繼續找。單色 8 張模式 iso 空間高度收斂
 *（原 run 已挖走大量 iso），通常需要多輪。
 */
const ROUNDS: Round[] = [
  {
    seed: 20261007,
    targetMultiple: 2.5,
    maxCandidates: { 8: 90000, 11: 24000, 14: 14000, 17: 13000 },
    winningHands: { 8: 14000, 11: 4000, 14: 3000, 17: 3200 },
  },
  {
    seed: 20261011,
    targetMultiple: 5,
    maxCandidates: { 8: 200000, 11: 40000, 14: 22000, 17: 20000 },
    winningHands: { 8: 30000, 11: 7000, 14: 5000, 17: 5200 },
  },
  {
    seed: 20261013,
    targetMultiple: 8,
    maxCandidates: { 8: 300000, 11: 60000, 14: 30000, 17: 28000 },
    winningHands: { 8: 45000, 11: 10000, 14: 7000, 17: 7200 },
    wideBeams: true,
  },
];

function replacementConfig(mode: Mode, need: number, round: Round): GeneratorConfig {
  const c = structuredClone(DEFAULT_GENERATOR_CONFIG) as GeneratorConfig;
  c.targets = { ...c.targets, [mode]: Math.ceil(need * round.targetMultiple) + 6 };
  // 補題搜尋預算（僅此離線 script 使用；不影響 DEFAULT config）
  c.search.maxCandidatesPerMode = round.maxCandidates;
  c.winningHandsPerMode = round.winningHands;
  if (round.wideBeams) {
    // 最後一輪：加寬 beam（每個 seed 展開更多變體）擠出剩餘稀有 iso
    c.search.maxB = { 8: 12, 11: 7, 14: 7, 17: 7 };
    c.search.maxX = { 8: 8, 11: 5, 14: 5, 17: 5 };
    c.search.maxA = { 8: 12, 11: 8, 14: 8, 17: 8 };
  }
  // 與原 run 不同的 deterministic seed（避免走回完全相同的搜尋路徑）
  c.rngSeed = round.seed;
  return c;
}

for (const mode of MODES) {
  const plan = plans.get(mode)!;
  const needJson = plan.invalidJsonIndices.length;
  const needDefault = plan.invalidDefaultIdx.length;
  const totalNeed = needJson + needDefault;
  if (totalNeed === 0) {
    console.log(`mode ${mode}: invalid = 0，不需替換`);
    continue;
  }

  console.log(`mode ${mode}: 生成 replacement（json=${needJson} default=${needDefault}）…`);
  const picks: GeneratedQuestionData[] = [];
  const excludeKeys = new Set(plan.keptKeys);
  const excludeIsos = new Set(plan.keptIsos);

  for (const round of ROUNDS) {
    if (picks.length >= totalNeed) break;
    // target 一律以 totalNeed 計（不能用 remaining：剩 1 題時 target 太小，
    // 選擇層只會回傳寥寥數題，反而找不到稀有的新 iso）
    const config = replacementConfig(mode, totalNeed, round);
    const rng = createRng(config.rngSeed + mode * 7919);
    const { selected, stats } = await generateForMode(mode, config, excludeKeys, rng);

    // 對保留題＋已選 replacement 做 iso 去重
    //（selectDiverse 只保證同一輪新題之間 iso 唯一）
    let gained = 0;
    for (const q of selected) {
      if (excludeIsos.has(q.iso)) continue;
      picks.push(q);
      excludeKeys.add(q.key);
      excludeIsos.add(q.iso);
      gained++;
      if (picks.length === totalNeed) break;
    }
    console.log(
      `  round(seed=${round.seed}) selected=${selected.length} +${gained}` +
        ` → ${picks.length}/${totalNeed} thresholdUsed=${stats.thresholdUsed}` +
        ` quadRejected=${stats.quadBestDiscardRejected}`,
    );
  }
  if (picks.length < totalNeed) {
    throw new Error(`mode ${mode} replacement 不足：${picks.length}/${totalNeed}`);
  }

  // ---- JSON 替換題：tier 依缺額補齊（維持 20/40/30/10 分佈不變）----
  const jsonPicks = picks.slice(0, needJson);
  const defaultPicks = picks.slice(needJson);

  const target: Record<(typeof TIER_ORDER)[number], number> = {
    EASY: 0,
    MEDIUM: 0,
    HARD: 0,
    VERY_HARD: 0,
  };
  const n = data.questions.filter((q) => q.mode === mode).length; // 200/300/400/600
  const dq = DEFAULT_GENERATOR_CONFIG.difficultyQuota;
  target.EASY = Math.round(n * dq.easy);
  target.MEDIUM = Math.round(n * dq.medium);
  target.HARD = Math.round(n * dq.hard);
  target.VERY_HARD = n - target.EASY - target.MEDIUM - target.HARD;
  for (const q of data.questions) {
    if (q.mode !== mode) continue;
    if (plan.invalidJsonIndices.includes(data.questions.indexOf(q))) continue;
    target[q.difficultyTier as (typeof TIER_ORDER)[number]]--;
  }
  jsonPicks.sort((a, b) => a.difficultyRaw - b.difficultyRaw);
  let cursor = 0;
  for (const tier of TIER_ORDER) {
    for (let i = 0; i < target[tier]; i++) {
      if (cursor >= jsonPicks.length) break;
      jsonPicks[cursor].difficultyTier = tier;
      cursor++;
    }
  }

  // ---- 原位替換（其他題 index / 匯入 ID 不變）----
  plan.invalidJsonIndices.forEach((jsonIndex, i) => {
    const old = data.questions[jsonIndex];
    patchRemovals.push({ mode, key: old.key, notation: old.notation });
    replacedIds.push(`g1-${mode}-${jsonIndex}`);
    data.questions[jsonIndex] = jsonPicks[i];
    patchGeneratedKeys.push({ mode, key: jsonPicks[i].key });
  });

  // ---- 內建 demo 題替換 ----
  plan.invalidDefaultIdx.forEach((defIdx, i) => {
    const oldNotation = DEFAULT_QUESTION_NOTATIONS[mode][defIdx];
    const parsed = parseHandText(oldNotation);
    if (!parsed.ok) throw new Error('unreachable');
    patchRemovals.push({
      mode,
      key: handKey(countsFromIds(parsed.tiles)),
      notation: oldNotation,
    });
    replacedIds.push(`default-${mode}-#${defIdx + 1}（${oldNotation}）`);
    patchDefaultAdds.push({ mode, notation: defaultPicks[i].notation });
    console.log(
      `  default 替換：${oldNotation} → ${defaultPicks[i].notation}` +
        `（best=${defaultPicks[i].bestDiscards.join('/')}）`,
    );
  });
}

// ---- 重新驗證新 JSON：0 quad-invalid、題數不變、dedup 完整 ----
const finalCounts: Record<Mode, number> = { 8: 0, 11: 0, 14: 0, 17: 0 };
const seenKey = new Set<string>();
const seenIso = new Map<Mode, Set<string>>();
for (const q of data.questions) {
  finalCounts[q.mode]++;
  if (quadBestTiles(q.tiles, q.mode).length > 0) {
    throw new Error(`替換後仍有 quad-invalid：${q.notation}`);
  }
  const composite = `${q.mode}:${q.key}`;
  if (seenKey.has(composite)) throw new Error(`exact duplicate：${q.notation}`);
  seenKey.add(composite);
  const isoSet = seenIso.get(q.mode) ?? new Set();
  if (isoSet.has(q.iso)) throw new Error(`iso duplicate：${q.notation}`);
  isoSet.add(q.iso);
  seenIso.set(q.mode, isoSet);
  // 引擎 cached metadata 一致性
  const counts = countsFromIds(q.tiles);
  const analysis = analyzeHand(counts, requiredMeldsFor(q.mode));
  const best = analysis.bestDiscards.map(tileIdOf);
  if (JSON.stringify(best) !== JSON.stringify(q.bestDiscards)) {
    throw new Error(`cached best 不一致：${q.notation}`);
  }
}
console.log('替換後驗證 OK。題數：', finalCounts);

// tier 分佈檢查
for (const mode of MODES) {
  const qs = data.questions.filter((q) => q.mode === mode);
  const dist = TIER_ORDER.map(
    (t) => `${t}=${qs.filter((q) => q.difficultyTier === t).length}`,
  ).join(' ');
  console.log(`mode ${mode} tier: ${dist}`);
}

writeFileSync(BANK_PATH, JSON.stringify(data));
writeFileSync(
  PATCH_PATH,
  JSON.stringify({
    patchLevel: 1,
    description:
      'quad-best-discard cleanup：移除「手牌四張同牌且該牌屬引擎最佳打牌」的題目，補入等量 replacement',
    removals: patchRemovals,
    generatedReplacementKeys: patchGeneratedKeys,
    defaultReplacements: patchDefaultAdds,
  }),
);
console.log(`✓ 已寫入 ${BANK_PATH}`);
console.log(`✓ 已寫入 ${PATCH_PATH}`);
console.log('\n被替換的匯入 question IDs（g1-{mode}-{index}）與 demo 題：');
console.log(replacedIds.join(', '));
console.log('\ndefaultQuestions.ts 需要的替換：');
for (const d of patchDefaultAdds) console.log(`  mode ${d.mode}: + ${d.notation}`);
