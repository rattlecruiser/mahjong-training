import type { CandidateEvaluation } from './evaluate';
import type { QualityBreakdown } from './quality';

/**
 * Structure Tags 與 Decision Tags（PART V / W）。
 * 兩者分開保存；Tags 只是 metadata，不影響引擎答案。
 */

export type StructureTag =
  | 'compoundShape'
  | 'tatsuCompetition'
  | 'crossSuitCompetition'
  | 'pairInteraction'
  | 'tripletInteraction'
  | 'longSequence'
  | 'overlappingSequence'
  | 'denseConnectedShape'
  | 'multiSuitDecision';

export type DecisionTag =
  | 'typeVsCountTrap'
  | 'closeCompetition'
  | 'counterIntuitiveDiscard'
  | 'multipleCompetitiveChoices'
  | 'dominantBest'
  | 'tiedBest';

export interface TagResult {
  structureTags: StructureTag[];
  decisionTags: DecisionTag[];
  primaryStructureArchetype: StructureTag | 'basic';
}

/** primary archetype 的優先序（多樣性選題用）。 */
const ARCHETYPE_PRECEDENCE: StructureTag[] = [
  'crossSuitCompetition',
  'overlappingSequence',
  'compoundShape',
  'denseConnectedShape',
  'longSequence',
  'tatsuCompetition',
  'pairInteraction',
  'tripletInteraction',
  'multiSuitDecision',
];

export function deriveTags(
  ev: CandidateEvaluation,
  breakdown: QualityBreakdown,
): TagResult {
  const structureTags = new Set<StructureTag>();
  const counts = ev.counts;

  for (let suit = 0; suit < 3; suit++) {
    const st = ev.structure.suits[suit];
    if (st.tileCount === 0) continue;
    const c = (r: number) => (r >= 1 && r <= 9 ? counts[suit * 9 + r - 1] : 0);

    // longSequence：>=5 個連續 present ranks
    let run = 0;
    for (let r = 1; r <= 9; r++) {
      run = c(r) > 0 ? run + 1 : 0;
      if (run >= 5) structureTags.add('longSequence');
    }

    if (st.overlappingWindows > 0) structureTags.add('overlappingSequence');
    if (st.largestComponentTiles >= 6) structureTags.add('denseConnectedShape');

    for (let r = 1; r <= 9; r++) {
      const n = c(r);
      if (n < 2) continue;
      const neighbor = c(r - 1) > 0 || c(r + 1) > 0 || c(r - 2) > 0 || c(r + 2) > 0;
      if (!neighbor) continue;
      structureTags.add(n >= 3 ? 'tripletInteraction' : 'pairInteraction');
      // compoundShape：duplicate 出現在 >=4 張的連通結構內
      if (st.largestComponentTiles >= 4) structureTags.add('compoundShape');
    }

    // tatsuCompetition：部分結構（搭子/對子）多於實際需要
    const partialBlocks = st.pairRanks + st.adjacentLinks + st.gapLinks;
    if (partialBlocks > ev.melds + 1) structureTags.add('tatsuCompetition');
  }

  // 跨花色決策
  const suitOf = (tile: number) => (tile >= 27 ? 3 : Math.floor(tile / 9));
  const decisionSuits = new Set(
    ev.competition.competitiveOptions.map((o) => suitOf(o.discard)),
  );
  if (ev.structure.numericSuitCount >= 2) {
    if (decisionSuits.size >= 2) structureTags.add('crossSuitCompetition');
    structureTags.add('multiSuitDecision');
  }

  // ---------- Decision Tags ----------
  const decisionTags = new Set<DecisionTag>();
  const { r2, bestCount, competitors } = ev.competition;

  if (bestCount > 1) decisionTags.add('tiedBest');
  if (ev.analysis.options.length > 1 && r2 < 0.55) decisionTags.add('dominantBest');
  if (r2 >= 0.9) decisionTags.add('closeCompetition');
  if (competitors.length >= 3) decisionTags.add('multipleCompetitiveChoices');
  if (breakdown.deceptiveness >= 65) decisionTags.add('counterIntuitiveDiscard');

  // typeVsCountTrap：存在「種類比最佳多、總枚數卻較少」的競爭打法
  const best = ev.analysis.options.find((o) => o.isBest)!;
  if (
    competitors.some(
      (o) => o.kinds > best.kinds && o.totalRemaining < best.totalRemaining,
    )
  ) {
    decisionTags.add('typeVsCountTrap');
  }

  const primary =
    ARCHETYPE_PRECEDENCE.find((t) => structureTags.has(t)) ?? 'basic';

  return {
    structureTags: [...structureTags],
    decisionTags: [...decisionTags],
    primaryStructureArchetype: primary,
  };
}
