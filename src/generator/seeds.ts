import {
  MAX_COPIES,
  type Counts,
  emptyCounts,
  handKey,
  isTenpai,
  isWinningHand,
  winningTilesFor,
} from '../engine';
import { type Mode, requiredMeldsFor } from '../game/modes';
import { type Rng, pick, randInt, shuffleInPlace } from './rng';

/**
 * Seed Generator（PART H / I / J）——Reverse Construction。
 *
 * 1. 先產生合法完整胡牌形 W（k melds + 1 pair），只用指定的數牌花色，
 *    生成時偏向 overlapping / adjacent / dense 結構（不是彼此獨立的隨機面子）。
 * 2. 對 W 中所有 distinct Y 枚舉：T = W − Y，並以【現有引擎】驗證 isTenpai(T)。
 *
 * Auto Generator V1 完全禁止字牌：這裡只會產生 0–26 的數牌。
 */

export interface TenpaiSeed {
  counts: Counts;
  /** 此 seed 使用的數牌花色（0=萬 1=筒 2=索）。 */
  suits: number[];
  winningTileTypes: number[];
  winningTileTypeCount: number;
}

/** 產生一副完整胡牌形（失敗回傳 null，由呼叫端重試）。 */
export function generateWinningHand(
  mode: Mode,
  suits: number[],
  rng: Rng,
): Counts | null {
  const melds = requiredMeldsFor(mode);

  outer: for (let attempt = 0; attempt < 12; attempt++) {
    const counts = emptyCounts();

    // 將對 + 每組面子指定花色：round-robin 保證每個花色都真正參與
    const blockSuits: number[] = [];
    for (let i = 0; i < melds; i++) blockSuits.push(suits[i % suits.length]);
    shuffleInPlace(rng, blockSuits);

    // 對將
    const pairSuit = pick(rng, suits);
    const pairRank = randInt(rng, 9);
    counts[pairSuit * 9 + pairRank] += 2;

    for (const suit of blockSuits) {
      let placed = false;
      for (let tries = 0; tries < 16 && !placed; tries++) {
        const isRun = rng() < 0.62;

        // 叢聚偏好：70% 錨定在該花色已有的牌附近，
        // 產生 overlapping sequences / pair+sequence 互動等 compound 結構
        const present: number[] = [];
        for (let r = 0; r < 9; r++) {
          if (counts[suit * 9 + r] > 0) present.push(r);
        }
        let base: number;
        if (present.length > 0 && rng() < 0.7) {
          const anchor = pick(rng, present);
          base = Math.min(8, Math.max(0, anchor + randInt(rng, 5) - 2));
        } else {
          base = randInt(rng, 9);
        }

        if (isRun) {
          const start = Math.min(base, 6);
          if (
            counts[suit * 9 + start] < MAX_COPIES &&
            counts[suit * 9 + start + 1] < MAX_COPIES &&
            counts[suit * 9 + start + 2] < MAX_COPIES
          ) {
            counts[suit * 9 + start]++;
            counts[suit * 9 + start + 1]++;
            counts[suit * 9 + start + 2]++;
            placed = true;
          }
        } else if (counts[suit * 9 + base] + 3 <= MAX_COPIES) {
          counts[suit * 9 + base] += 3;
          placed = true;
        }
      }
      if (!placed) continue outer;
    }

    // 引擎驗證（唯一答案權威）
    if (isWinningHand(counts, melds)) return counts;
  }
  return null;
}

/**
 * 由胡牌形 W 枚舉所有 distinct Y → T = W − Y 的 Tenpai Seeds。
 * 每個 T 都經引擎 isTenpai 驗證，並保存 winningTiles metadata。
 */
export function tenpaiSeedsFromWinningHand(
  winning: Counts,
  mode: Mode,
  suits: number[],
): TenpaiSeed[] {
  const melds = requiredMeldsFor(mode);
  const seeds: TenpaiSeed[] = [];
  const seen = new Set<string>();

  for (let y = 0; y < 27; y++) {
    if (winning[y] === 0) continue;
    winning[y]--;
    const key = handKey(winning);
    if (!seen.has(key) && isTenpai(winning, melds)) {
      seen.add(key);
      const winningTileTypes = winningTilesFor(winning, melds);
      seeds.push({
        counts: [...winning],
        suits,
        winningTileTypes,
        winningTileTypeCount: winningTileTypes.length,
      });
    }
    winning[y]++;
  }
  return seeds;
}
