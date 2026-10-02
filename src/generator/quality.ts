import { HONOR_START, type Counts, type TileIndex } from '../engine';
import type { GeneratorConfig } from './config';
import type { CandidateEvaluation } from './evaluate';
import { tileContext } from './suitAnalysis';

/**
 * Intrinsic Quality Score（PART N–U）。
 *
 * quality = 0.25*C + 0.20*D + 0.20*S + 0.15*X + 0.20*U − penalties
 *
 * - 與 Difficulty 完全分離。
 * - 只用於篩選 / 選題，【絕對不影響引擎答案】：
 *   即使並列最佳降低了 Competition 分數，所有並列最佳仍然都是正確答案。
 * - 每個 subscore 與 penalty 都完整保存，不只保存 final score。
 */

export interface QualityBreakdown {
  competition: number;
  deceptiveness: number;
  structural: number;
  compoundComplexity: number;
  ukeireRichness: number;
  /** 扣分總點數。 */
  penalties: number;
}

export interface QualityResult {
  quality: number;
  breakdown: QualityBreakdown;
  penaltyDetails: Record<string, number>;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/* ---------------- C：Competition（PART P） ---------------- */

export function competitionScore(ev: CandidateEvaluation): number {
  const { r2, bestCount, competitors } = ev.competition;
  if (ev.analysis.options.length <= 1) return 0;

  // 次佳距離：r2 落在 0.7–0.97 之間最有鑑別度
  let score = clamp(((r2 - 0.35) / 0.6) * 100);
  if (r2 > 0.97 && bestCount === 1) score = 96; // 極接近但未並列＝很好的題

  const competitorCount = competitors.length;
  if (competitorCount === 0) score = Math.min(score, 30);
  else if (competitorCount <= 3) score += 8;
  else score -= 6 * (competitorCount - 3);

  // 並列最佳降低鑑別性（但不改變「全部都算對」）
  score -= 18 * (bestCount - 1);

  return clamp(score);
}

/* ---------------- D：Deceptiveness（PART Q） ---------------- */

function tileDeceptiveness(counts: Counts, tile: TileIndex): number {
  const ctx = tileContext(counts, tile);
  if (tile >= HONOR_START) {
    return ctx.copiesInHand >= 2 ? 55 : 6;
  }
  let score = 8;
  if (ctx.copiesInHand >= 2) score += 34;
  if (ctx.copiesInHand >= 3) score += 8;
  if (ctx.hasAdjacent) score += 24;
  if (ctx.hasGap) score += 10;
  if (ctx.inSequenceWindow) score += 16;
  return clamp(score);
}

export function deceptivenessScore(ev: CandidateEvaluation): number {
  // 玩家只需要找到「任何一個」最佳打牌，
  // 所以取所有最佳打牌中最不迷惑（最顯眼）的那一個。
  let minScore = 100;
  for (const best of ev.analysis.bestDiscards) {
    minScore = Math.min(minScore, tileDeceptiveness(ev.counts, best));
  }

  // 陷阱加成：手上存在「不是答案」的完全孤張
  // （看起來就該丟，但引擎說不是）→ 更具迷惑性
  const bestSet = new Set(ev.analysis.bestDiscards);
  let hasNonBestIsolated = false;
  for (let t = 0; t < ev.counts.length; t++) {
    if (ev.counts[t] === 0 || bestSet.has(t)) continue;
    if (tileContext(ev.counts, t).isolated) hasNonBestIsolated = true;
  }
  if (hasNonBestIsolated) minScore += 16;

  return clamp(minScore);
}

/* ---------------- S：Structural Quality（PART R） ---------------- */

export function structuralScore(ev: CandidateEvaluation): number {
  const s = ev.structure;
  let score =
    62 * s.participationRate +
    16 * Math.min(1, s.largestComponentTiles / 6) +
    22 * s.minActiveSuitParticipation;
  if (s.totalIsolated > 2) score -= 12 * (s.totalIsolated - 2);
  return clamp(score);
}

/* ---------------- X：Compound Complexity（PART S） ---------------- */

export function compoundComplexityScore(ev: CandidateEvaluation): number {
  const counts = ev.counts;
  let raw = 0;
  for (let suit = 0; suit < 3; suit++) {
    const st = ev.structure.suits[suit];
    if (st.tileCount === 0) continue;
    const c = (r: number) => (r >= 1 && r <= 9 ? counts[suit * 9 + r - 1] : 0);
    let pairInteract = 0;
    let tripletInteract = 0;
    for (let r = 1; r <= 9; r++) {
      const n = c(r);
      if (n < 2) continue;
      const neighbor =
        c(r - 1) > 0 || c(r + 1) > 0 || c(r - 2) > 0 || c(r + 2) > 0;
      if (!neighbor) continue;
      if (n >= 3) tripletInteract++;
      else pairInteract++;
    }
    raw +=
      3.0 * st.overlappingWindows +
      1.5 * Math.max(0, st.sequenceWindows - 1) +
      2.5 * pairInteract +
      2.2 * tripletInteract +
      1.5 * Math.max(0, st.largestComponentTiles - 4) +
      0.7 * st.gapLinks;
  }
  // 依手牌大小正規化（大手牌天然有更多結構）
  const norm = 3.5 + ev.mode * 0.55;
  return clamp((raw / norm) * 55);
}

/* ---------------- U：Ukeire Richness（PART T） ---------------- */

export function ukeireRichnessScore(ev: CandidateEvaluation): number {
  const options = ev.competition.competitiveOptions;
  if (options.length <= 1) return 25;

  const sets = options.map((o) => new Set(o.ukeire.map((e) => e.tile)));
  let pairCount = 0;
  let distanceSum = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let inter = 0;
      for (const t of sets[i]) if (sets[j].has(t)) inter++;
      const union = sets[i].size + sets[j].size - inter;
      distanceSum += union === 0 ? 0 : 1 - inter / union; // Jaccard distance
      pairCount++;
    }
  }
  const avgDistance = pairCount === 0 ? 0 : distanceSum / pairCount;
  const avgKinds =
    options.reduce((n, o) => n + o.kinds, 0) / options.length;

  return clamp(72 * avgDistance + 28 * Math.min(1, avgKinds / 10));
}

/* ---------------- Penalties（PART U，soft） ---------------- */

export function scoreQuality(
  ev: CandidateEvaluation,
  config: GeneratorConfig,
): QualityResult {
  const C = competitionScore(ev);
  const D = deceptivenessScore(ev);
  const S = structuralScore(ev);
  const X = compoundComplexityScore(ev);
  const U = ukeireRichnessScore(ev);

  const p = config.penalties;
  const penaltyDetails: Record<string, number> = {};

  if (D < 25) penaltyDetails.obviousIsolatedBest = p.obviousIsolatedBest;

  if (ev.structure.totalIsolated > 2) {
    penaltyDetails.excessiveIsolation = Math.min(
      p.excessiveIsolationCap,
      p.excessiveIsolationPerTile * (ev.structure.totalIsolated - 2),
    );
  }

  const fakeSuit = ev.structure.suits.some(
    (s) => s.suit < 3 && s.tileCount >= 2 && s.participationRate < 0.34,
  );
  if (fakeSuit) penaltyDetails.fakeActiveSuit = p.fakeActiveSuit;

  if (ev.competition.bestCount === 2) penaltyDetails.tiedBest = p.tiedBestPair;
  else if (ev.competition.bestCount >= 3) penaltyDetails.tiedBest = p.tiedBestMany;

  if (ev.analysis.options.length > 1 && ev.competition.r2 < 0.4) {
    penaltyDetails.extremeDominance = p.extremeDominance;
  }

  if (X < 18) penaltyDetails.structurallyTrivial = p.structurallyTrivial;

  const penalties = Object.values(penaltyDetails).reduce((a, b) => a + b, 0);
  const w = config.qualityWeights;
  const quality = clamp(
    w.C * C + w.D * D + w.S * S + w.X * X + w.U * U - penalties,
  );

  return {
    quality,
    breakdown: {
      competition: round1(C),
      deceptiveness: round1(D),
      structural: round1(S),
      compoundComplexity: round1(X),
      ukeireRichness: round1(U),
      penalties: round1(penalties),
    },
    penaltyDetails,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
