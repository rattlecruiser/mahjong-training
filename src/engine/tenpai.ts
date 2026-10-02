import { MAX_COPIES, TILE_TYPES, type TileIndex } from './tiles';
import { type Counts, handKey, totalTiles } from './hand';
import { tenpaiCache } from './cache';
import { isWinningHand } from './winning';

/**
 * 聽牌判定。
 *
 * 手牌張數必須等於 requiredMelds * 3 + 1。
 * 若存在至少一種牌 X（手上未滿 4 張），摸入後可以完整拆解為
 * requiredMelds 組面子 + 1 對將，即為聽牌。
 */
export function isTenpai(counts: Counts, requiredMelds: number): boolean {
  if (totalTiles(counts) !== requiredMelds * 3 + 1) return false;
  const key = handKey(counts);
  const cached = tenpaiCache.get(key);
  if (cached !== undefined) return cached;

  let result = false;
  for (let x = 0; x < TILE_TYPES && !result; x++) {
    if (counts[x] >= MAX_COPIES) continue; // 第 5 張同牌不存在
    counts[x]++;
    if (isWinningHand(counts, requiredMelds)) result = true;
    counts[x]--;
  }

  tenpaiCache.set(key, result);
  return result;
}

/** 列出所有胡牌張（debug / 分析輔助用）。非聽牌時回傳空陣列。 */
export function winningTilesFor(
  counts: Counts,
  requiredMelds: number,
): TileIndex[] {
  if (totalTiles(counts) !== requiredMelds * 3 + 1) return [];
  const tiles: TileIndex[] = [];
  for (let x = 0; x < TILE_TYPES; x++) {
    if (counts[x] >= MAX_COPIES) continue;
    counts[x]++;
    if (isWinningHand(counts, requiredMelds)) tiles.push(x);
    counts[x]--;
  }
  return tiles;
}
