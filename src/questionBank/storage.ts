import {
  countsFromIds,
  handKey,
  sortTiles,
  tileIdOf,
  tileIndexOf,
  type TileId,
} from '../engine';
import { MODES, type Mode, isMode } from '../game/modes';
import { requireAdmin } from '../auth/roles';
import { removeFeedbackForQuestion } from './feedback';
import {
  BANK_SCHEMA_VERSION,
  type BankData,
  type BankDataV1,
  type BankMeta,
  type QuestionMetadata,
  type QuestionSource,
  type QuestionStatus,
  type StoredQuestion,
} from './types';
import { DEFAULT_QUESTION_NOTATIONS } from './defaultQuestions';
import { parseHandText } from './parser';

/**
 * 題庫儲存（localStorage，schema v2）。
 *
 * - 題庫是 Persistent Data，不是 runtime temporary data：
 *   refresh / 重開 App / 換模式 / 新的一局都直接讀取現有題庫。
 * - v1（第一階段）資料自動 migration 為 v2，既有題目全部保留
 *  （標記為 MANUAL / ACTIVE），不會弄丟可玩題庫（PART BJ）。
 * - 正常遊戲只抽 status === 'ACTIVE'。
 * - 管理動作（新增 / 停用 / 啟用 / 永久刪除）統一經過 requireAdmin。
 */

const BANK_KEY = 'tenpai-training:bank';
// 注意：舊版競賽模式曾使用 'tenpai-training:best'（最佳分數紀錄）。
// 練習模式已移除計分；該 key 的既有資料保留原樣、不讀不寫不刪
//（不做危險 migration，也不破壞舊資料）。

function storageAvailable(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 測試 / 無 localStorage 環境下的 in-memory fallback。 */
let memoryBank: BankData | null = null;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeQuestion(
  mode: Mode,
  tiles: readonly TileId[],
  source: QuestionSource,
  meta?: QuestionMetadata,
): StoredQuestion {
  const sorted = sortTiles(tiles.map(tileIndexOf)).map(tileIdOf);
  const now = Date.now();
  return {
    id: newId(),
    mode,
    tiles: sorted,
    key: handKey(countsFromIds(sorted)),
    source,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    meta,
  };
}

/** 第一階段內建 demo 題（保留為 MANUAL；生成題庫另外匯入）。 */
function seedBank(): BankData {
  const questions: StoredQuestion[] = [];
  for (const mode of MODES) {
    for (const notation of DEFAULT_QUESTION_NOTATIONS[mode]) {
      const parsed = parseHandText(notation);
      if (parsed.ok && parsed.tiles.length === mode) {
        questions.push(makeQuestion(mode, parsed.tiles, 'MANUAL'));
      }
    }
  }
  return {
    version: BANK_SCHEMA_VERSION,
    questions,
    meta: { questionBankInitialized: false },
  };
}

function isValidQuestionShape(q: unknown): q is StoredQuestion {
  if (typeof q !== 'object' || q === null) return false;
  const question = q as StoredQuestion;
  return (
    typeof question.id === 'string' &&
    isMode(question.mode) &&
    Array.isArray(question.tiles) &&
    typeof question.key === 'string' &&
    (question.source === 'GENERATED' || question.source === 'MANUAL') &&
    (question.status === 'ACTIVE' || question.status === 'DISABLED')
  );
}

function isValidBankV2(data: unknown): data is BankData {
  if (typeof data !== 'object' || data === null) return false;
  const bank = data as BankData;
  return (
    bank.version === 2 &&
    Array.isArray(bank.questions) &&
    bank.questions.every(isValidQuestionShape) &&
    typeof bank.meta === 'object' &&
    bank.meta !== null &&
    typeof bank.meta.questionBankInitialized === 'boolean'
  );
}

function isValidBankV1(data: unknown): data is BankDataV1 {
  if (typeof data !== 'object' || data === null) return false;
  const bank = data as BankDataV1;
  return (
    bank.version === 1 &&
    Array.isArray(bank.questions) &&
    bank.questions.every(
      (q) =>
        typeof q === 'object' &&
        q !== null &&
        typeof q.id === 'string' &&
        isMode(q.mode) &&
        Array.isArray(q.tiles) &&
        typeof q.key === 'string',
    )
  );
}

/** v1 → v2：保留全部既有題目（MANUAL / ACTIVE），不弄丟任何資料。 */
function migrateV1(v1: BankDataV1): BankData {
  return {
    version: BANK_SCHEMA_VERSION,
    questions: v1.questions.map((q) => ({
      id: q.id,
      mode: q.mode,
      tiles: q.tiles,
      key: q.key,
      source: 'MANUAL' as const,
      status: 'ACTIVE' as const,
      createdAt: q.createdAt ?? Date.now(),
      updatedAt: q.createdAt ?? Date.now(),
    })),
    meta: { questionBankInitialized: false },
  };
}

export function loadBank(): BankData {
  const storage = storageAvailable();
  if (!storage) {
    if (!memoryBank) memoryBank = seedBank();
    return memoryBank;
  }
  const raw = storage.getItem(BANK_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValidBankV2(parsed)) return parsed;
      if (isValidBankV1(parsed)) {
        const migrated = migrateV1(parsed);
        saveBank(migrated);
        return migrated;
      }
    } catch {
      /* fallthrough：資料損毀，重建 */
    }
  }
  const seeded = seedBank();
  saveBank(seeded);
  return seeded;
}

/** 單一 setItem 寫入 = atomic commit（避免 partial state）。 */
export function saveBank(bank: BankData): void {
  const storage = storageAvailable();
  if (!storage) {
    memoryBank = bank;
    return;
  }
  storage.setItem(BANK_KEY, JSON.stringify(bank));
}

export function getBankMeta(): BankMeta {
  return loadBank().meta;
}

/* ---------------- 查詢 ---------------- */

/** 全部題目（Admin 用）。 */
export function questionsForMode(mode: Mode): StoredQuestion[] {
  return loadBank().questions.filter((q) => q.mode === mode);
}

/** 正常遊戲抽題：只取 ACTIVE（PART AV）。 */
export function activeQuestionsForMode(mode: Mode): StoredQuestion[] {
  return loadBank().questions.filter((q) => q.mode === mode && q.status === 'ACTIVE');
}

export function getQuestionById(id: string): StoredQuestion | null {
  return loadBank().questions.find((q) => q.id === id) ?? null;
}

/** 重複判定用：該模式所有題目（含 DISABLED）的 canonical keys。 */
export function existingKeysForMode(mode: Mode): Set<string> {
  return new Set(questionsForMode(mode).map((q) => q.key));
}

/** 首頁顯示：可玩（ACTIVE）題數。 */
export function bankCounts(): Record<Mode, number> {
  const counts = { 17: 0, 14: 0, 11: 0, 8: 0 } as Record<Mode, number>;
  for (const q of loadBank().questions) {
    if (q.status === 'ACTIVE') counts[q.mode]++;
  }
  return counts;
}

export interface AdminBankCounts {
  active: number;
  disabled: number;
  total: number;
}

export function adminBankCounts(): Record<Mode, AdminBankCounts> {
  const counts = {} as Record<Mode, AdminBankCounts>;
  for (const mode of MODES) counts[mode] = { active: 0, disabled: 0, total: 0 };
  for (const q of loadBank().questions) {
    counts[q.mode].total++;
    if (q.status === 'ACTIVE') counts[q.mode].active++;
    else counts[q.mode].disabled++;
  }
  return counts;
}

/* ---------------- 系統內部寫入（初始化 / 生成匯入用） ---------------- */

/**
 * 內部 append：不經 requireAdmin（供一次性初始化與 Admin actions 模組使用）。
 * 一律做 (mode, key) exact duplicate 檢查。
 */
export function appendQuestionsInternal(questions: readonly StoredQuestion[]): number {
  const bank = loadBank();
  const existing = new Set(bank.questions.map((q) => `${q.mode}:${q.key}`));
  let added = 0;
  for (const q of questions) {
    const composite = `${q.mode}:${q.key}`;
    if (existing.has(composite)) continue;
    existing.add(composite);
    bank.questions.push(q);
    added++;
  }
  saveBank(bank);
  return added;
}

/* ---------------- Admin 管理動作（統一權限檢查） ---------------- */

/** ADMIN 手動新增題目（可含字牌）。 */
export function addManualQuestions(
  items: readonly { mode: Mode; tiles: readonly TileId[]; meta?: QuestionMetadata }[],
): StoredQuestion[] {
  requireAdmin('新增題目');
  const bank = loadBank();
  const existing = new Set(bank.questions.map((q) => `${q.mode}:${q.key}`));
  const added: StoredQuestion[] = [];
  for (const item of items) {
    const question = makeQuestion(item.mode, item.tiles, 'MANUAL', item.meta);
    const composite = `${question.mode}:${question.key}`;
    if (existing.has(composite)) continue;
    existing.add(composite);
    bank.questions.push(question);
    added.push(question);
  }
  saveBank(bank);
  return added;
}

/** ADMIN 停用 / 重新啟用（DISABLED 題目保留全部資料與回饋）。 */
export function setQuestionStatus(id: string, status: QuestionStatus): void {
  requireAdmin(status === 'DISABLED' ? '停用題目' : '啟用題目');
  const bank = loadBank();
  const question = bank.questions.find((q) => q.id === id);
  if (!question) return;
  question.status = status;
  question.updatedAt = Date.now();
  saveBank(bank);
}

/** ADMIN 永久刪除：同時清理關聯回饋（referential integrity）。 */
export function deleteQuestionPermanently(id: string): void {
  requireAdmin('永久刪除題目');
  const bank = loadBank();
  bank.questions = bank.questions.filter((q) => q.id !== id);
  saveBank(bank);
  removeFeedbackForQuestion(id);
}

/** 供測試使用：重設題庫。 */
export function resetBankForTests(): void {
  memoryBank = null;
  storageAvailable()?.removeItem(BANK_KEY);
}
