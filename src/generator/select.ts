import { countsFromIds, type Counts } from '../engine';
import type { Mode } from '../game/modes';
import type { GeneratorConfig } from './config';
import type { Rng } from './rng';
import type { GeneratedQuestionData } from './generate';
import { handJaccard } from './fingerprint';

/**
 * Dedup + Greedy Diversity Selection（PART Z / AA / AC）。
 *
 * - Exact duplicate 在搜尋階段已擋掉。
 * - Suit-isomorphic（萬筒索互換）＝強同構：每個 iso fingerprint 只留品質最高的一題。
 * - Rank translation＝near-duplicate：不硬刪（1/9 邊界會改變牌效），
 *   只在 selection score 中 downweight（novelty）。
 * - Novelty 不屬於 intrinsic quality：同一題的品質不因題庫已有類似題而改變，
 *   只影響 selection score。
 */

export interface SelectionOutcome {
  selected: GeneratedQuestionData[];
  isoDuplicatesRemoved: number;
  /** 入選題中屬於「translation 重複」而被 downweight 過的數量。 */
  nearDuplicatesDownweighted: number;
}

export function selectDiverse(
  pool: GeneratedQuestionData[],
  mode: Mode,
  config: GeneratorConfig,
  rng: Rng,
): SelectionOutcome {
  // ---- Suit-isomorphic 去重：每組留品質最高 ----
  const byIso = new Map<string, GeneratedQuestionData>();
  for (const c of pool) {
    const kept = byIso.get(c.iso);
    if (!kept || c.quality > kept.quality) byIso.set(c.iso, c);
  }
  const candidates = [...byIso.values()];
  const isoDuplicatesRemoved = pool.length - candidates.length;

  const target = config.targets[mode];
  const quota = config.suitCountQuota[mode];
  const dq = config.difficultyQuota;
  const div = config.diversity;

  // 難度 bucket 邊界：以 candidate pool 的分佈計算
  const sortedDiff = candidates.map((c) => c.difficultyRaw).sort((a, b) => a - b);
  const qAt = (p: number) =>
    sortedDiff.length === 0
      ? 0
      : sortedDiff[Math.min(sortedDiff.length - 1, Math.floor(p * sortedDiff.length))];
  const b1 = qAt(dq.easy);
  const b2 = qAt(dq.easy + dq.medium);
  const b3 = qAt(1 - dq.veryHard);
  const bucketOf = (d: number) => (d < b1 ? 0 : d < b2 ? 1 : d < b3 ? 2 : 3);
  const bucketTarget = [dq.easy, dq.medium, dq.hard, dq.veryHard];

  const selected: GeneratedQuestionData[] = [];
  const used = new Array<boolean>(candidates.length).fill(false);
  const usedTranslation = new Map<string, number>();
  const archetypeCount = new Map<string, number>();
  const suitCountCount = new Map<number, number>();
  const bucketCount = [0, 0, 0, 0];
  let nearDuplicatesDownweighted = 0;

  // Near-duplicate similarity：每個候選對「已入選題」的最大 Jaccard，
  // 每選入一題後增量更新（避免 O(n²·selected) 重算）。
  const candidateCounts: Counts[] = candidates.map((c) => countsFromIds(c.tiles));
  const maxSimToSelected = new Array<number>(candidates.length).fill(0);

  while (selected.length < target) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      if (used[i]) continue;
      const c = candidates[i];
      let score = c.quality;

      // Near-duplicate（rank translation）downweight
      const tn = usedTranslation.get(c.translation) ?? 0;
      if (tn > 0) {
        score -= div.translationBasePenalty + div.translationRepeatPenalty * (tn - 1);
      }

      // Near-duplicate（高 Jaccard 相似的「差一兩張」變體）downweight
      if (maxSimToSelected[i] > div.similarityThreshold) {
        score -=
          ((maxSimToSelected[i] - div.similarityThreshold) /
            (1 - div.similarityThreshold)) *
          div.similarityPenalty;
      }

      // Archetype 上限
      if (selected.length > 0) {
        const share = (archetypeCount.get(c.primaryStructureArchetype) ?? 0) / selected.length;
        if (share >= div.archetypeMaxShare) score -= 20;
      }

      // 花色數 quota
      const suitTarget = quota[c.suitCount] ?? 0;
      const suitCur =
        selected.length === 0 ? 0 : (suitCountCount.get(c.suitCount) ?? 0) / selected.length;
      if (suitCur < suitTarget) score += div.suitQuotaBonus;
      else if (suitCur > suitTarget + 0.08) score -= div.suitQuotaBonus;

      // 難度分佈
      const bk = bucketOf(c.difficultyRaw);
      const bCur = selected.length === 0 ? 0 : bucketCount[bk] / selected.length;
      if (bCur < bucketTarget[bk]) score += div.difficultySpreadBonus;
      else if (bCur > bucketTarget[bk] + 0.08) score -= div.difficultySpreadBonus;

      score += rng() * 0.5; // deterministic jitter，避免固定順序偏差

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // pool 耗盡
    used[bestIdx] = true;
    const chosen = candidates[bestIdx];
    selected.push(chosen);

    // 增量更新剩餘候選與已入選題的最大相似度
    const chosenCounts = candidateCounts[bestIdx];
    for (let i = 0; i < candidates.length; i++) {
      if (used[i]) continue;
      const sim = handJaccard(candidateCounts[i], chosenCounts);
      if (sim > maxSimToSelected[i]) maxSimToSelected[i] = sim;
    }

    const tn = usedTranslation.get(chosen.translation) ?? 0;
    if (tn > 0 || maxSimToSelected[bestIdx] > div.similarityThreshold)
      nearDuplicatesDownweighted++;
    usedTranslation.set(chosen.translation, tn + 1);
    archetypeCount.set(
      chosen.primaryStructureArchetype,
      (archetypeCount.get(chosen.primaryStructureArchetype) ?? 0) + 1,
    );
    suitCountCount.set(chosen.suitCount, (suitCountCount.get(chosen.suitCount) ?? 0) + 1);
    bucketCount[bucketOf(chosen.difficultyRaw)]++;
  }

  // ---- Difficulty Tier：同模式入選題內 percentile 指派（PART Y / AC）----
  const ranked = [...selected].sort((a, b) => a.difficultyRaw - b.difficultyRaw);
  const n = ranked.length;
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    ranked[i].difficultyTier =
      p < dq.easy
        ? 'EASY'
        : p < dq.easy + dq.medium
          ? 'MEDIUM'
          : p < 1 - dq.veryHard
            ? 'HARD'
            : 'VERY_HARD';
  }

  return { selected, isoDuplicatesRemoved, nearDuplicatesDownweighted };
}
