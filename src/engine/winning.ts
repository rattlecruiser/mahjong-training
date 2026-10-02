import { HONOR_START, TILE_TYPES } from './tiles';
import { type Counts, handKey, totalTiles } from './hand';
import { suitMeldCache, winCache } from './cache';

/**
 * 台灣麻將一般形胡牌判定：
 *
 *   requiredMelds 組面子（順子或刻子） + 1 對將
 *
 * - 順子只存在於萬/筒/索；字牌只能組刻子或當將。
 * - 不考慮七對子、國士無雙等特殊牌型（台灣麻將訓練不使用）。
 * - counts 總張數必須恰好等於 requiredMelds * 3 + 2，否則回傳 false。
 */
export function isWinningHand(counts: Counts, requiredMelds: number): boolean {
  if (totalTiles(counts) !== requiredMelds * 3 + 2) return false;
  // 總張數由 counts 決定、面子數由總張數決定，因此 key 不需包含 requiredMelds。
  const key = handKey(counts);
  const cached = winCache.get(key);
  if (cached !== undefined) return cached;
  const result = winnable(counts);
  winCache.set(key, result);
  return result;
}

function winnable(counts: Counts): boolean {
  for (let pair = 0; pair < TILE_TYPES; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const ok = restDecomposesIntoMelds(counts);
    counts[pair] += 2;
    if (ok) return true;
  }
  return false;
}

/** 去掉將之後，剩餘所有牌必須完全拆成面子。 */
function restDecomposesIntoMelds(counts: Counts): boolean {
  // 字牌不能組順子：每種字牌必須恰好 0 或 3 張。
  for (let i = HONOR_START; i < TILE_TYPES; i++) {
    if (counts[i] !== 0 && counts[i] !== 3) return false;
  }
  return (
    suitDecomposable(counts, 0) &&
    suitDecomposable(counts, 9) &&
    suitDecomposable(counts, 18)
  );
}

/** 檢查一個花色（counts[offset..offset+8]）能否完全拆成順子+刻子。 */
function suitDecomposable(counts: Counts, offset: number): boolean {
  let key = '';
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    key += counts[offset + i];
    sum += counts[offset + i];
  }
  if (sum === 0) return true;
  if (sum % 3 !== 0) return false;
  const cached = suitMeldCache.get(key);
  if (cached !== undefined) return cached;
  const result = decomposeSuit(counts, offset, 0);
  suitMeldCache.set(key, result);
  return result;
}

/**
 * 遞迴拆解：最小的非零牌必定屬於「刻子」或「以它開頭的順子」
 * （比它小的牌都是 0，它不可能出現在順子中段或尾端）。
 */
function decomposeSuit(counts: Counts, offset: number, start: number): boolean {
  let i = start;
  while (i < 9 && counts[offset + i] === 0) i++;
  if (i === 9) return true;

  // 刻子
  if (counts[offset + i] >= 3) {
    counts[offset + i] -= 3;
    const ok = decomposeSuit(counts, offset, i);
    counts[offset + i] += 3;
    if (ok) return true;
  }

  // 順子 i, i+1, i+2
  if (i <= 6 && counts[offset + i + 1] > 0 && counts[offset + i + 2] > 0) {
    counts[offset + i]--;
    counts[offset + i + 1]--;
    counts[offset + i + 2]--;
    const ok = decomposeSuit(counts, offset, i);
    counts[offset + i]++;
    counts[offset + i + 1]++;
    counts[offset + i + 2]++;
    if (ok) return true;
  }

  return false;
}
