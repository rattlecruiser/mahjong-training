import {
  analyzeHand,
  type Counts,
  type DiscardOption,
  type HandAnalysis,
} from '../engine';
import { type Mode, requiredMeldsFor } from '../game/modes';
import type { GeneratorConfig } from './config';
import { analyzeHandStructure, type HandStructure } from './suitAnalysis';

/**
 * 候選題評估容器：引擎分析結果（唯一答案權威）＋結構分析＋競爭統計。
 * Quality / Difficulty / Tags 都從這裡讀取，不重算、更不改寫引擎結果。
 */

export interface CompetitionInfo {
  /** 最佳總枚數。 */
  t1: number;
  /** 次佳（第一個非並列最佳）的總枚數；沒有其他打法時為 0。 */
  t2: number;
  /** t2 / t1（0–1）。 */
  r2: number;
  /** 並列最佳數。 */
  bestCount: number;
  /** 非最佳但 total >= competitiveRatio * t1 的打法。 */
  competitors: DiscardOption[];
  /** 用於比較的競爭打法（最佳一個 + competitors，最多 4 個）。 */
  competitiveOptions: DiscardOption[];
}

export interface CandidateEvaluation {
  counts: Counts;
  mode: Mode;
  melds: number;
  /** 引擎分析（Truth）。 */
  analysis: HandAnalysis;
  structure: HandStructure;
  competition: CompetitionInfo;
}

export function buildCompetitionInfo(
  analysis: HandAnalysis,
  competitiveRatio: number,
): CompetitionInfo {
  const options = analysis.options; // 已依 total 由高到低排序
  const t1 = analysis.maxTotal;
  const bestCount = analysis.bestDiscards.length;
  const nonBest = options.filter((o) => !o.isBest);
  const t2 = nonBest.length > 0 ? nonBest[0].totalRemaining : 0;
  const competitors = nonBest.filter(
    (o) => t1 > 0 && o.totalRemaining >= competitiveRatio * t1,
  );
  const best = options.find((o) => o.isBest)!;
  return {
    t1,
    t2,
    r2: t1 > 0 ? t2 / t1 : 0,
    bestCount,
    competitors,
    competitiveOptions: [best, ...competitors].slice(0, 4),
  };
}

export function evaluateCandidate(
  counts: Counts,
  mode: Mode,
  config: GeneratorConfig,
): CandidateEvaluation {
  const melds = requiredMeldsFor(mode);
  const analysis = analyzeHand([...counts], melds);
  return {
    counts,
    mode,
    melds,
    analysis,
    structure: analyzeHandStructure(counts),
    competition: buildCompetitionInfo(analysis, config.competitiveRatio),
  };
}
