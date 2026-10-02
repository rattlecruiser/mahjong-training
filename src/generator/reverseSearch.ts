import { MAX_COPIES, type Counts } from '../engine';
import type { GeneratorConfig } from './config';
import { type Rng } from './rng';
import { tileContext } from './suitAnalysis';
import type { TenpaiSeed } from './seeds';

/**
 * Reverse Search：T → B → X → A → Q（PART K / L / M）。
 *
 *   T（tenpai seed, n−1 張）
 *   + B（加一張 → M, n 張）
 *   − X（移除一張 → H, n−1 張）
 *   + A（補一張 → Q, n 張 = 候選題目）
 *
 * B / X / A 不是純 random：以結構關聯分數排序後取 beam top-N
 * （可以 rank / prune / prioritize，但答案永遠由引擎決定；
 * Reverse 加入的 A 不需要最後成為真正最佳打牌）。
 */

/** emit 回傳 false 表示候選預算已滿，停止搜尋。 */
export type CandidateEmitter = (counts: Counts) => boolean;

export interface BeamWidths {
  maxB: number;
  maxX: number;
  maxA: number;
}

interface Scored {
  tile: number;
  score: number;
}

function topTiles(scored: Scored[], limit: number): number[] {
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.tile);
}

/** 展開一個 seed 的候選題目。回傳 false = 預算耗盡。 */
export function expandSeed(
  seed: TenpaiSeed,
  beams: BeamWidths,
  config: GeneratorConfig,
  rng: Rng,
  emit: CandidateEmitter,
): boolean {
  const { maxB, maxX, maxA } = beams;
  const allowed: number[] = [];
  for (const suit of seed.suits) {
    for (let r = 0; r < 9; r++) allowed.push(suit * 9 + r);
  }

  const T = seed.counts;

  // ---- B：加牌（偏好與現有結構有關聯、偶爾允許較孤立的牌）----
  const bScores: Scored[] = [];
  for (const b of allowed) {
    if (T[b] >= MAX_COPIES) continue;
    T[b]++;
    const score = tileContext(T, b).connectivity + rng() * 2.2;
    T[b]--;
    bScores.push({ tile: b, score });
  }

  for (const b of topTiles(bScores, maxB)) {
    T[b]++; // M = T + B

    // ---- X：移除（優先拆有結構的位置，製造 deceptive 殘形）----
    const xScores: Scored[] = [];
    for (let x = 0; x < 27; x++) {
      if (T[x] === 0) continue;
      // X == B 會使 Q ⊇ T（打掉 A 即回到聽牌），必被 immediate-tenpai
      // hard filter 刪除，直接剪枝
      if (config.forbidImmediateTenpai && x === b) continue;
      xScores.push({
        tile: x,
        score: tileContext(T, x).connectivity + rng() * 2.2,
      });
    }

    for (const x of topTiles(xScores, maxX)) {
      T[x]--; // H = M − X

      // ---- A：補牌（與 H 有結構關聯者優先）----
      const aScores: Scored[] = [];
      for (const a of allowed) {
        if (a === x || T[a] >= MAX_COPIES) continue;
        T[a]++;
        const score = tileContext(T, a).connectivity + rng() * 2.2;
        T[a]--;
        aScores.push({ tile: a, score });
      }

      for (const a of topTiles(aScores, maxA)) {
        T[a]++; // Q = H + A
        const ok = emit([...T]);
        T[a]--;
        if (!ok) {
          T[x]++;
          T[b]--;
          return false;
        }
      }

      T[x]++;
    }

    T[b]--;
  }

  return true;
}
