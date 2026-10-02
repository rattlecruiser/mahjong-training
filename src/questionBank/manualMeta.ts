import type { Counts } from '../engine';
import { tileIdOf } from '../engine';
import type { Mode } from '../game/modes';
import { DEFAULT_GENERATOR_CONFIG, GENERATOR_VERSION } from '../generator/config';
import { evaluateCandidate } from '../generator/evaluate';
import { scoreQuality } from '../generator/quality';
import { scoreDifficultyRaw } from '../generator/difficulty';
import { deriveTags } from '../generator/tags';
import { isoFingerprint, translationFingerprint } from '../generator/fingerprint';
import type { QuestionMetadata } from './types';
import { questionsForMode } from './storage';

/**
 * 手動新增題目的 metadata 計算（PART AS）。
 *
 * Quality Analyzer 能正常處理（含字牌）就計算完整 metadata；
 * 任何失敗都回傳 null——metadata 是選配，不影響題目本身與引擎答案。
 * difficultyTier 以該模式現有題目的 difficultyRaw 分佈做 percentile 估計。
 */
export function computeManualMetadata(
  counts: Counts,
  mode: Mode,
): QuestionMetadata | null {
  try {
    const ev = evaluateCandidate([...counts], mode, DEFAULT_GENERATOR_CONFIG);
    const quality = scoreQuality(ev, DEFAULT_GENERATOR_CONFIG);
    const difficultyRaw = scoreDifficultyRaw(ev, quality.breakdown);
    const tags = deriveTags(ev, quality.breakdown);
    const best = ev.analysis.options.find((o) => o.isBest)!;

    // percentile 估計 tier
    const raws = questionsForMode(mode)
      .map((q) => q.meta?.difficultyRaw)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    let tier: QuestionMetadata['difficultyTier'] = 'MEDIUM';
    if (raws.length >= 10) {
      const below = raws.filter((v) => v < difficultyRaw).length;
      const p = below / raws.length;
      tier = p < 0.2 ? 'EASY' : p < 0.6 ? 'MEDIUM' : p < 0.9 ? 'HARD' : 'VERY_HARD';
    }

    return {
      qualityScore: Math.round(quality.quality * 10) / 10,
      qualityBreakdown: quality.breakdown,
      penaltyDetails: quality.penaltyDetails,
      difficultyRaw,
      difficultyTier: tier,
      structureTags: tags.structureTags,
      decisionTags: tags.decisionTags,
      primaryStructureArchetype: tags.primaryStructureArchetype,
      bestDiscards: ev.analysis.bestDiscards.map(tileIdOf),
      bestUkeire: ev.analysis.maxTotal,
      bestKinds: best.kinds,
      structuralFingerprint: {
        iso: isoFingerprint(counts),
        translation: translationFingerprint(counts),
      },
      generatorVersion: `manual (analyzer ${GENERATOR_VERSION})`,
    };
  } catch {
    return null;
  }
}
