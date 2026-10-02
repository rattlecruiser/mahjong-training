import type { CandidateEvaluation } from './evaluate';
import type { QualityBreakdown } from './quality';

/**
 * Difficulty Raw Score（PART X）。
 *
 * 與 Quality 完全獨立：一題可以很簡單但品質很好，也可以很難但品質很差。
 * Difficulty 只是描述，【絕對不影響引擎答案】。
 *
 * Tier（Easy/Medium/Hard/VeryHard）不用固定分數門檻，
 * 而是同模式內以 percentile 指派（PART Y / AC），見 select.ts。
 */
export function scoreDifficultyRaw(
  ev: CandidateEvaluation,
  breakdown: QualityBreakdown,
): number {
  const { r2, competitors, competitiveOptions } = ev.competition;

  // 跨花色競爭：最佳與任一競爭打法屬於不同花色（含字牌組）
  const suitOf = (tile: number) => (tile >= 27 ? 3 : Math.floor(tile / 9));
  const bestSuits = new Set(ev.analysis.bestDiscards.map(suitOf));
  const crossSuit = competitors.some((o) => !bestSuits.has(suitOf(o.discard)));

  // 競爭打法的進張集合差異（越不同越難比較）
  let avgDistance = 0;
  if (competitiveOptions.length > 1) {
    const sets = competitiveOptions.map((o) => new Set(o.ukeire.map((e) => e.tile)));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        let inter = 0;
        for (const t of sets[i]) if (sets[j].has(t)) inter++;
        const union = sets[i].size + sets[j].size - inter;
        sum += union === 0 ? 0 : 1 - inter / union;
        n++;
      }
    }
    avgDistance = n === 0 ? 0 : sum / n;
  }

  const raw =
    30 * r2 +
    22 * (breakdown.deceptiveness / 100) +
    14 * (breakdown.compoundComplexity / 100) +
    10 * (crossSuit ? 1 : 0) +
    12 * avgDistance +
    12 * (Math.min(competitors.length, 4) / 4);

  return Math.round(raw * 10) / 10;
}
