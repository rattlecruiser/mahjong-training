import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATOR_CONFIG,
  MODE_SUIT_RULE,
  type GeneratorConfig,
} from './config';
import { createRng } from './rng';
import { generateForMode } from './generate';
import {
  HONOR_START,
  MAX_COPIES,
  TILE_TYPES,
  analyzeHand,
  countsFromIds,
  tileIdOf,
} from '../engine';
import { MODES, requiredMeldsFor } from '../game/modes';

/**
 * Generator Property / Invariant Tests（PART BA）。
 * 用縮小的搜尋預算實跑 pipeline，驗證所有硬性規則。
 */

function smallConfig(): GeneratorConfig {
  const config = structuredClone(DEFAULT_GENERATOR_CONFIG) as GeneratorConfig;
  config.winningHandsPerMode = { 8: 30, 11: 30, 14: 30, 17: 30 };
  config.search.maxB = { 8: 5, 11: 5, 14: 5, 17: 5 };
  config.search.maxX = { 8: 4, 11: 4, 14: 4, 17: 4 };
  config.search.maxA = { 8: 6, 11: 6, 14: 6, 17: 6 };
  config.search.maxCandidatesPerMode = { 8: 200, 11: 200, 14: 160, 17: 130 };
  config.search.poolMultiple = { 8: 2, 11: 2, 14: 2, 17: 2 };
  config.targets = { 8: 10, 11: 10, 14: 10, 17: 10 };
  return config;
}

describe('Generator invariants（縮小規模實跑）', () => {
  for (const mode of MODES) {
    it(
      `${mode} 張模式：花色規則 / 無字牌 / ≤4 張 / 引擎答案一致`,
      async () => {
        const config = smallConfig();
        const rng = createRng(999 + mode);
        const { selected } = await generateForMode(mode, config, new Set(), rng);
        expect(selected.length).toBeGreaterThan(0);

        const rule = MODE_SUIT_RULE[mode];
        const seenKeys = new Set<string>();
        const seenIso = new Set<string>();

        for (const q of selected) {
          // 張數正確
          expect(q.tiles).toHaveLength(mode);
          const counts = countsFromIds(q.tiles);

          // 每種牌最多 4 張；Generated 完全沒有字牌
          for (let i = 0; i < TILE_TYPES; i++) {
            expect(counts[i]).toBeLessThanOrEqual(MAX_COPIES);
          }
          for (let i = HONOR_START; i < TILE_TYPES; i++) {
            expect(counts[i]).toBe(0);
          }

          // 花色數規則（8=1、11=1–2、14=2–3、17=2–3）
          expect(q.suitCount).toBeGreaterThanOrEqual(rule.min);
          expect(q.suitCount).toBeLessThanOrEqual(rule.max);

          // 引擎重新分析必須與 cached metadata 一致（Engine 是唯一 truth）
          const analysis = analyzeHand(counts, requiredMeldsFor(mode));
          expect(analysis.bestDiscards.map(tileIdOf)).toEqual(q.bestDiscards);
          expect(analysis.maxTotal).toBe(q.bestUkeire);

          // 剩餘枚數 0–4（實際上 >0 才會列入）
          for (const option of analysis.options) {
            for (const entry of option.ukeire) {
              expect(entry.remaining).toBeGreaterThanOrEqual(1);
              expect(entry.remaining).toBeLessThanOrEqual(4);
            }
          }

          // Metadata 完整
          expect(q.quality).toBeGreaterThan(0);
          expect(q.qualityBreakdown).toBeDefined();
          expect(['EASY', 'MEDIUM', 'HARD', 'VERY_HARD']).toContain(q.difficultyTier);
          expect(q.iso.length).toBe(34);

          // Dedup：exact 與 iso 都不重複
          expect(seenKeys.has(q.key)).toBe(false);
          seenKeys.add(q.key);
          expect(seenIso.has(q.iso)).toBe(false);
          seenIso.add(q.iso);
        }
      },
      180_000,
    );
  }

  it('deterministic：相同 seed/config 產生相同結果', async () => {
    const config = smallConfig();
    const a = await generateForMode(8, config, new Set(), createRng(1234));
    const b = await generateForMode(8, config, new Set(), createRng(1234));
    expect(a.selected.map((q) => q.key)).toEqual(b.selected.map((q) => q.key));
  }, 120_000);

  it('exact duplicate 排除：existingKeys 中的手牌不會再被選入', async () => {
    const config = smallConfig();
    const first = await generateForMode(8, config, new Set(), createRng(77));
    const keys = new Set(first.selected.map((q) => q.key));
    const second = await generateForMode(8, config, keys, createRng(77));
    for (const q of second.selected) {
      expect(keys.has(q.key)).toBe(false);
    }
  }, 120_000);

  it(
    'Quad-Best-Discard exclusion：大量 fixed-seed 生成，accepted 題目永不出現' +
      '「四張同牌且該牌屬於引擎最佳打牌」',
    async () => {
      // 比 smallConfig 更大的批量（不是只測一兩題）
      const config = smallConfig();
      config.targets = { 8: 30, 11: 25, 14: 20, 17: 15 };
      config.winningHandsPerMode = { 8: 600, 11: 250, 14: 160, 17: 120 };
      config.search.maxCandidatesPerMode = { 8: 5000, 11: 1600, 14: 900, 17: 500 };
      config.search.poolMultiple = { 8: 4, 11: 3, 14: 3, 17: 3 };

      let totalAccepted = 0;
      let totalQuadRejected = 0;
      for (const mode of MODES) {
        const { selected, stats } = await generateForMode(
          mode,
          config,
          new Set(),
          createRng(4242 + mode),
        );
        totalQuadRejected += stats.quadBestDiscardRejected;
        for (const q of selected) {
          const counts = countsFromIds(q.tiles);
          // 必須用引擎真正算出的 bestDiscards 驗證（Engine 是唯一 truth）
          const analysis = analyzeHand(counts, requiredMeldsFor(mode));
          for (const t of analysis.bestDiscards) {
            expect(counts[t], `${q.notation} 最佳打牌不可為手上第 4 張`).toBeLessThan(4);
          }
          totalAccepted++;
        }
      }
      expect(totalAccepted).toBeGreaterThan(50);
      // 規則確實在攔截（搜尋過程一定會遇到 quad-best candidate）
      expect(totalQuadRejected).toBeGreaterThan(0);
    },
    300_000,
  );
});
