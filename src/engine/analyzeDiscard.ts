import { TILE_TYPES, type TileIndex } from './tiles';
import { type Counts, handKey, totalTiles } from './hand';
import { effectiveDraws, type UkeireEntry } from './ukeire';

/** 一種「第一次打牌」選擇的完整分析結果。 */
export interface DiscardOption {
  discard: TileIndex;
  /** 有效進張（依牌序），每項含剩餘枚數。 */
  ukeire: UkeireEntry[];
  /** 有效進張種類數。 */
  kinds: number;
  /** 總有效進張枚數（最佳打牌的比較標準）。 */
  totalRemaining: number;
  /** totalRemaining 是否等於全體最大值。並列最佳全部為 true。 */
  isBest: boolean;
}

/** 整手牌的最佳打牌分析。 */
export interface HandAnalysis {
  /** 依總枚數由高到低排序（同枚數依牌序），涵蓋所有不同牌種的打法。 */
  options: DiscardOption[];
  /** 所有並列最佳的第一次打牌（依牌序）。 */
  bestDiscards: TileIndex[];
  maxTotal: number;
  /** 本次分析耗時（毫秒；cache 命中時為原始計算耗時）。 */
  elapsedMs: number;
}

const analysisCache = new Map<string, HandAnalysis>();
const ANALYSIS_CACHE_LIMIT = 4_000;

/**
 * 分析一道題目：對手牌中每個「不同牌種」模擬第一次打牌，
 * 計算有效進張、剩餘枚數與總枚數，並找出所有並列最佳打牌。
 *
 * 只以【總有效進張枚數】比較，不使用種類數或其他 tie-breaker；
 * 所有 totalRemaining == max 的打法都是正確答案。
 */
export function analyzeHand(
  counts: Counts,
  requiredMelds: number,
): HandAnalysis {
  if (totalTiles(counts) !== requiredMelds * 3 + 2) {
    throw new Error(
      `analyzeHand: expected ${requiredMelds * 3 + 2} tiles, got ${totalTiles(counts)}`,
    );
  }

  const key = handKey(counts);
  const cached = analysisCache.get(key);
  if (cached) return cached;

  const t0 = now();
  const work = [...counts];
  const options: DiscardOption[] = [];

  for (let t = 0; t < TILE_TYPES; t++) {
    if (work[t] === 0) continue; // 相同牌種只分析一次
    work[t]--;
    const ukeire = effectiveDraws(work, requiredMelds, counts);
    work[t]++;

    let totalRemaining = 0;
    for (const entry of ukeire) totalRemaining += entry.remaining;

    options.push({
      discard: t,
      ukeire,
      kinds: ukeire.length,
      totalRemaining,
      isBest: false,
    });
  }

  let maxTotal = 0;
  for (const option of options) {
    if (option.totalRemaining > maxTotal) maxTotal = option.totalRemaining;
  }
  for (const option of options) {
    option.isBest = option.totalRemaining === maxTotal;
  }

  options.sort(
    (a, b) => b.totalRemaining - a.totalRemaining || a.discard - b.discard,
  );

  const analysis: HandAnalysis = {
    options,
    bestDiscards: options
      .filter((o) => o.isBest)
      .map((o) => o.discard)
      .sort((a, b) => a - b),
    maxTotal,
    elapsedMs: now() - t0,
  };

  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) analysisCache.clear();
  analysisCache.set(key, analysis);
  return analysis;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
