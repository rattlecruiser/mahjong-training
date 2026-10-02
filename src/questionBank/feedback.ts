/**
 * 玩家題目回饋（PART AL–AP）。
 *
 * - 獨立的 QuestionFeedback 資料（不是 question.starCount++）。
 * - Unique constraint：(userId, questionId) 最多一筆 active rating。
 * - STAR / TRASH 互斥。
 * - 【回饋絕對不影響 gameplay / 答案 / 引擎 / 題庫內容】：
 *   玩家 Trash 只是「我認為這題不好」，永遠不會刪除或停用題目；
 *   是否停用由 ADMIN 決定。
 */

export type Rating = 'STAR' | 'TRASH';

export interface FeedbackEntry {
  userId: string;
  questionId: string;
  rating: Rating;
  createdAt: number;
  updatedAt: number;
}

interface FeedbackData {
  version: 1;
  entries: FeedbackEntry[];
}

const FEEDBACK_KEY = 'tenpai-training:feedback';

function storageAvailable(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

let memoryData: FeedbackData | null = null;

function load(): FeedbackData {
  const storage = storageAvailable();
  if (!storage) {
    if (!memoryData) memoryData = { version: 1, entries: [] };
    return memoryData;
  }
  try {
    const raw = storage.getItem(FEEDBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FeedbackData;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch {
    /* 損毀時重建空資料 */
  }
  return { version: 1, entries: [] };
}

function save(data: FeedbackData): void {
  const storage = storageAvailable();
  if (!storage) {
    memoryData = data;
    return;
  }
  storage.setItem(FEEDBACK_KEY, JSON.stringify(data));
}

export function getRating(userId: string, questionId: string): Rating | null {
  const entry = load().entries.find(
    (e) => e.userId === userId && e.questionId === questionId,
  );
  return entry?.rating ?? null;
}

/**
 * 設定 / 取消 rating。
 * rating = null 代表取消；設定與現有相同的 rating 也會取消（toggle 由 UI 決定，
 * 這裡單純寫入指定狀態）。互斥由「同一 (userId, questionId) 只有一筆」保證。
 */
export function setRating(
  userId: string,
  questionId: string,
  rating: Rating | null,
): void {
  const data = load();
  const idx = data.entries.findIndex(
    (e) => e.userId === userId && e.questionId === questionId,
  );
  const now = Date.now();
  if (rating === null) {
    if (idx !== -1) data.entries.splice(idx, 1);
  } else if (idx === -1) {
    data.entries.push({ userId, questionId, rating, createdAt: now, updatedAt: now });
  } else {
    data.entries[idx] = { ...data.entries[idx], rating, updatedAt: now };
  }
  save(data);
}

export interface FeedbackCounts {
  star: number;
  trash: number;
}

export function feedbackCountsFor(questionId: string): FeedbackCounts {
  const counts = { star: 0, trash: 0 };
  for (const e of load().entries) {
    if (e.questionId !== questionId) continue;
    if (e.rating === 'STAR') counts.star++;
    else counts.trash++;
  }
  return counts;
}

/** 全題庫 aggregate（Admin 列表用）。 */
export function allFeedbackCounts(): Map<string, FeedbackCounts> {
  const map = new Map<string, FeedbackCounts>();
  for (const e of load().entries) {
    const c = map.get(e.questionId) ?? { star: 0, trash: 0 };
    if (e.rating === 'STAR') c.star++;
    else c.trash++;
    map.set(e.questionId, c);
  }
  return map;
}

/** 永久刪除題目時清理關聯回饋（referential integrity）。 */
export function removeFeedbackForQuestion(questionId: string): void {
  const data = load();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.questionId !== questionId);
  if (data.entries.length !== before) save(data);
}

export function resetFeedbackForTests(): void {
  memoryData = null;
  storageAvailable()?.removeItem(FEEDBACK_KEY);
}
