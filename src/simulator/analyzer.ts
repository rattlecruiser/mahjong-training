import {
  MAX_COPIES,
  TILE_TYPES,
  type TileId,
  type TileIndex,
  countsFromIds,
} from '../engine';
import {
  MAX_TARGET_MELDS,
  MIN_TARGET_MELDS,
  calculateShanten,
} from './shanten';

/**
 * ============================================================
 * Simulator Phase 2 — Known Tiles / Ukeire / Best Discard Analyzer
 * ============================================================
 *
 * 依賴方向：analyzer → Phase 1 shanten core（VERIFIED，唯讀）
 *          → engine 的牌表示常數（唯讀）。
 * 現有遊戲不 import 本模組；本模組不含 UI / router / persistence。
 *
 * 【Remaining Copies（唯一公式）】
 *   Remaining(X) = 4 − OriginalHandCount(X) − KnownCount(X)
 *
 * 剩餘枚數的基準是「分析前完整資訊」：原始手牌所有牌 + 使用者輸入的
 * Known Tiles 都已離開未知牌牆。模擬 candidate discard（H = Q − D）
 * 只影響 Shanten 結構，【絕不】把打出去的 D 算回牌牆，也不對 D 額外
 * 再扣一次（無 double subtraction）。
 *
 * 【Known Tiles 不參與 Shanten】只影響 remainingCopies /
 * totalUkeireCopies / 同向聽下的 best 排名。
 *
 * 【有效進張（V1 唯一定義）】對 H = Q − D、可摸的 X（Remaining>0）：
 *   Shanten(H + X) < Shanten(H)  ⟺  X 是 effective draw。
 * 一層分析（ONE-LAYER），無 future recursive lookahead。
 * postDiscardShanten = 0 時同一公式自然給出胡牌張（resultingShanten = −1）。
 *
 * 【Best Discard 排序（V1 正式規則）】
 *   PRIMARY：最低 postDiscardShanten
 *   SECONDARY：同向聽時最高 totalUkeireCopies
 *   兩者皆同 → 並列最佳（無第三順位 tie-breaker；候選列表的
 *   牌序排列只是顯示順序，不影響 isBest）。
 */

export interface SimulatorEffectiveDraw {
  tile: TileIndex;
  /** 4 − 原始手牌張數 − Known 張數（0 枚的牌不會出現在此清單）。 */
  remainingCopies: number;
  /** 摸入後的 Shanten（聽牌摸胡牌張 = −1）。 */
  resultingShanten: number;
}

export interface SimulatorDiscardCandidate {
  discard: TileIndex;
  postDiscardShanten: number;
  effectiveDraws: SimulatorEffectiveDraw[];
  effectiveTileTypeCount: number;
  totalUkeireCopies: number;
  isBest: boolean;
}

export interface SimulatorAnalysis {
  targetMelds: number;
  /** 完整輸入手牌的 Shanten（−1 = 已是完成形）。 */
  currentShanten: number;
  /** 'complete' = 輸入本身已胡；仍照常提供 candidate 分析，不 crash。 */
  currentState: 'complete' | 'normal';
  /** 34 格：分析基準的未知牌牆剩餘枚數。 */
  remaining: number[];
  /** 依牌序排列（顯示順序；與 best 判定無關）。 */
  candidates: SimulatorDiscardCandidate[];
  bestDiscards: TileIndex[];
}

/** Remaining(X) = 4 − hand − known；輸入不合法時丟出錯誤。 */
export function computeRemaining(
  handCounts: ArrayLike<number>,
  knownCounts?: ArrayLike<number> | null,
): number[] {
  validateCountsShape(handCounts, 'hand');
  if (knownCounts != null) validateCountsShape(knownCounts, 'known');
  const remaining: number[] = [];
  for (let i = 0; i < TILE_TYPES; i++) {
    const hand = handCounts[i];
    const known = knownCounts != null ? knownCounts[i] : 0;
    const seen = hand + known;
    if (seen > MAX_COPIES) {
      throw new Error(
        `第 ${i} 種牌 hand(${hand}) + known(${known}) = ${seen} > ${MAX_COPIES}：物理上不可能的狀態`,
      );
    }
    remaining.push(MAX_COPIES - seen);
  }
  return remaining;
}

function validateCountsShape(counts: ArrayLike<number>, label: string): void {
  if (counts.length !== TILE_TYPES) {
    throw new Error(`${label} counts 長度必須是 ${TILE_TYPES}，收到 ${counts.length}`);
  }
  for (let i = 0; i < TILE_TYPES; i++) {
    const c = counts[i];
    if (!Number.isInteger(c) || c < 0 || c > MAX_COPIES) {
      throw new Error(`${label} 第 ${i} 種牌數量不合法（${c}）：必須是 0–${MAX_COPIES} 的整數`);
    }
  }
}

/**
 * Best Discard / Ukeire 分析（public 入口）。
 *
 * @param handCounts   完整摸牌後手牌：張數必須恰為 3×targetMelds+2
 *                     （T1→5、T2→8、T3→11、T4→14、T5→17）
 * @param knownCounts  已知牌（棄牌/副露/其他可見牌）；null/省略 = 無。
 *                     只影響 Remaining，絕不影響 Shanten。
 * @param targetMelds  1–5，由 caller 明確指定（不從張數推導語意）
 */
export function analyzeSimulatorHand(
  handCounts: ArrayLike<number>,
  knownCounts: ArrayLike<number> | null | undefined,
  targetMelds: number,
): SimulatorAnalysis {
  if (
    !Number.isInteger(targetMelds) ||
    targetMelds < MIN_TARGET_MELDS ||
    targetMelds > MAX_TARGET_MELDS
  ) {
    throw new Error(
      `targetMelds 必須是 ${MIN_TARGET_MELDS}–${MAX_TARGET_MELDS} 的整數，收到 ${targetMelds}`,
    );
  }

  // remaining 基準（含 hand+known ≤ 4 驗證；shape 驗證）
  const remaining = computeRemaining(handCounts, knownCounts);

  // 複製 input：本函式絕不修改 caller 的 hand / known
  const hand: number[] = [];
  let total = 0;
  for (let i = 0; i < TILE_TYPES; i++) {
    hand.push(handCounts[i]);
    total += handCounts[i];
  }
  const fullSize = targetMelds * 3 + 2;
  if (total !== fullSize) {
    throw new Error(
      `Best Discard 分析需要完整摸牌後手牌：targetMelds=${targetMelds} 必須是 ${fullSize} 張，收到 ${total} 張`,
    );
  }

  const currentShanten = calculateShanten(hand, targetMelds);

  const candidates: SimulatorDiscardCandidate[] = [];
  const work = [...hand];

  for (let d = 0; d < TILE_TYPES; d++) {
    if (work[d] === 0) continue; // distinct discard：同牌種只分析一次

    work[d]--; // H = Q − D（只影響結構；不改變 remaining 基準）
    const postDiscardShanten = calculateShanten(work, targetMelds);

    const effectiveDraws: SimulatorEffectiveDraw[] = [];
    let totalUkeireCopies = 0;
    for (let x = 0; x < TILE_TYPES; x++) {
      const remainingCopies = remaining[x];
      if (remainingCopies <= 0) continue; // 實戰已無此牌可摸（含結構上有效者）
      work[x]++;
      const resultingShanten = calculateShanten(work, targetMelds);
      work[x]--;
      if (resultingShanten < postDiscardShanten) {
        effectiveDraws.push({ tile: x, remainingCopies, resultingShanten });
        totalUkeireCopies += remainingCopies;
      }
    }
    work[d]++;

    candidates.push({
      discard: d,
      postDiscardShanten,
      effectiveDraws,
      effectiveTileTypeCount: effectiveDraws.length,
      totalUkeireCopies,
      isBest: false,
    });
  }

  // 排名：最低 postDiscardShanten → 最高 totalUkeireCopies → 並列
  let bestShanten = Infinity;
  for (const c of candidates) {
    if (c.postDiscardShanten < bestShanten) bestShanten = c.postDiscardShanten;
  }
  let bestUkeire = -1;
  for (const c of candidates) {
    if (c.postDiscardShanten === bestShanten && c.totalUkeireCopies > bestUkeire) {
      bestUkeire = c.totalUkeireCopies;
    }
  }
  const bestDiscards: TileIndex[] = [];
  for (const c of candidates) {
    c.isBest =
      c.postDiscardShanten === bestShanten && c.totalUkeireCopies === bestUkeire;
    if (c.isBest) bestDiscards.push(c.discard);
  }

  return {
    targetMelds,
    currentShanten,
    currentState: currentShanten === -1 ? 'complete' : 'normal',
    remaining,
    candidates,
    bestDiscards,
  };
}

/** 便利版：tile id 陣列輸入（input 不會被修改）。 */
export function analyzeSimulatorHandFromIds(
  handTiles: readonly TileId[],
  knownTiles: readonly TileId[] | null | undefined,
  targetMelds: number,
): SimulatorAnalysis {
  return analyzeSimulatorHand(
    countsFromIds(handTiles as TileId[]),
    knownTiles != null ? countsFromIds(knownTiles as TileId[]) : null,
    targetMelds,
  );
}
