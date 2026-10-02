import { HONOR_START, TILE_TYPES, type Counts, handKey } from '../engine';

/**
 * Structural Fingerprint（PART Z）。
 *
 * 1. Exact key：既有 handKey()（完全相同牌組）。
 * 2. Suit-isomorphic fingerprint：萬/筒/索單純互換視為強同構。
 *    使用 canonical suit permutation：6 種花色排列取字典序最小 key。
 * 3. Translation fingerprint：每個花色的 rank pattern 平移到 min rank=1
 *    再排序組合。suit permutation + rank translation 相同 → near-duplicate。
 *    注意 rank translation 只算 near-duplicate（1/9 邊界會改變牌效），
 *    因此只用於 diversity downweight，不做 hard remove。
 */

const SUIT_PERMS: readonly (readonly number[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

export function exactFingerprint(counts: Counts): string {
  return handKey(counts);
}

export function isoFingerprint(counts: Counts): string {
  let best: string | null = null;
  for (const perm of SUIT_PERMS) {
    let key = '';
    for (const suit of perm) {
      for (let r = 0; r < 9; r++) key += counts[suit * 9 + r];
    }
    for (let i = HONOR_START; i < TILE_TYPES; i++) key += counts[i];
    if (best === null || key < best) best = key;
  }
  return best!;
}

export function translationFingerprint(counts: Counts): string {
  const blocks: string[] = [];
  for (let suit = 0; suit < 3; suit++) {
    let min = -1;
    let max = -1;
    for (let r = 0; r < 9; r++) {
      if (counts[suit * 9 + r] > 0) {
        if (min === -1) min = r;
        max = r;
      }
    }
    if (min === -1) continue;
    let block = '';
    for (let r = min; r <= max; r++) block += counts[suit * 9 + r];
    blocks.push(block);
  }
  blocks.sort();
  let honors = '';
  const honorCounts: number[] = [];
  for (let i = HONOR_START; i < TILE_TYPES; i++) {
    if (counts[i] > 0) honorCounts.push(counts[i]);
  }
  if (honorCounts.length > 0) {
    honors = '#' + honorCounts.sort((a, b) => b - a).join('');
  }
  return blocks.join('|') + honors;
}

/** 兩手牌的 tile-type Jaccard 相似度（0–1），供 near-duplicate 參考。 */
export function handJaccard(a: Counts, b: Counts): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < TILE_TYPES; i++) {
    inter += Math.min(a[i], b[i]);
    union += Math.max(a[i], b[i]);
  }
  return union === 0 ? 1 : inter / union;
}
