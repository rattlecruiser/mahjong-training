import { describe, expect, it } from 'vitest';
import bankData from './generatedBank.v1.json';
import type { GenerationResult } from '../generator/generate';
import { MODE_SUIT_RULE } from '../generator/config';
import {
  HONOR_START,
  MAX_COPIES,
  TILE_TYPES,
  analyzeHand,
  countsFromIds,
  isTenpai,
  tileIdOf,
} from '../engine';
import { MODES, type Mode, requiredMeldsFor } from '../game/modes';

/**
 * 正式生成題庫（generatedBank.v1.json）的完整驗證：
 * 這是實際會匯入玩家題庫的 1500 題。
 */
const data = bankData as unknown as GenerationResult;

const TARGETS: Record<Mode, number> = { 8: 200, 11: 300, 14: 400, 17: 600 };

describe('正式生成題庫（1500 題）', () => {
  it('題數：8=200、11=300、14=400、17=600，metadata 完整', () => {
    expect(data.generatorVersion).toBe('v1');
    expect(typeof data.generationSeed).toBe('number');
    for (const mode of MODES) {
      const qs = data.questions.filter((q) => q.mode === mode);
      expect(qs, `${mode} 張`).toHaveLength(TARGETS[mode]);
    }
  });

  it('全部題目：0 字牌、≤4 張、張數正確、花色數符合規則、無重複', () => {
    const seenKey = new Set<string>();
    const seenIsoPerMode = new Map<Mode, Set<string>>();
    for (const q of data.questions) {
      const counts = countsFromIds(q.tiles);
      expect(q.tiles.length).toBe(q.mode);
      for (let i = 0; i < TILE_TYPES; i++) {
        expect(counts[i]).toBeLessThanOrEqual(MAX_COPIES);
      }
      for (let i = HONOR_START; i < TILE_TYPES; i++) {
        expect(counts[i], `${q.notation} 不可含字牌`).toBe(0);
      }
      const rule = MODE_SUIT_RULE[q.mode];
      expect(q.suitCount).toBeGreaterThanOrEqual(rule.min);
      expect(q.suitCount).toBeLessThanOrEqual(rule.max);

      const composite = `${q.mode}:${q.key}`;
      expect(seenKey.has(composite), `${q.notation} exact duplicate`).toBe(false);
      seenKey.add(composite);

      const isoSet = seenIsoPerMode.get(q.mode) ?? new Set();
      expect(isoSet.has(q.iso), `${q.notation} iso duplicate`).toBe(false);
      isoSet.add(q.iso);
      seenIsoPerMode.set(q.mode, isoSet);

      expect(q.quality).toBeGreaterThanOrEqual(55);
      expect(q.qualityBreakdown).toBeDefined();
      expect(q.bestDiscards.length).toBeGreaterThan(0);
    }
  });

  it('難度分佈：各模式約 Easy 20% / Medium 40% / Hard 30% / Very Hard 10%', () => {
    for (const mode of MODES) {
      const qs = data.questions.filter((q) => q.mode === mode);
      const count = (tier: string) => qs.filter((q) => q.difficultyTier === tier).length;
      const n = qs.length;
      expect(Math.abs(count('EASY') - n * 0.2)).toBeLessThanOrEqual(n * 0.02 + 1);
      expect(Math.abs(count('MEDIUM') - n * 0.4)).toBeLessThanOrEqual(n * 0.02 + 1);
      expect(Math.abs(count('HARD') - n * 0.3)).toBeLessThanOrEqual(n * 0.02 + 1);
      expect(Math.abs(count('VERY_HARD') - n * 0.1)).toBeLessThanOrEqual(n * 0.02 + 1);
    }
  });

  it(
    '永久保證（全量掃描）：不存在「手牌四張同牌且該牌屬於引擎最佳打牌」的題目',
    () => {
      // 全部 1500 題逐一用引擎驗證（不用 cached metadata）。
      // 這類題在實戰有「暗槓 vs 打牌」的額外決策，目前遊戲不建模，
      // 因此正式題庫永遠不能包含。
      for (const q of data.questions) {
        const counts = countsFromIds(q.tiles);
        const analysis = analyzeHand(counts, requiredMeldsFor(q.mode));
        for (const t of analysis.bestDiscards) {
          expect(counts[t], `${q.notation} 最佳打 ${tileIdOf(t)} 不可為手上第 4 張`).toBeLessThan(
            4,
          );
        }
      }
    },
    600_000,
  );

  it(
    '引擎抽查：cached 答案與引擎一致、無「打完即聽牌」的退化題',
    () => {
      for (const mode of MODES) {
        const qs = data.questions.filter((q) => q.mode === mode);
        const melds = requiredMeldsFor(mode);
        const step = Math.max(1, Math.floor(qs.length / 15));
        for (let i = 0; i < qs.length; i += step) {
          const q = qs[i];
          const counts = countsFromIds(q.tiles);
          const analysis = analyzeHand(counts, melds);
          expect(analysis.bestDiscards.map(tileIdOf), q.notation).toEqual(q.bestDiscards);
          expect(analysis.maxTotal, q.notation).toBe(q.bestUkeire);
          for (let t = 0; t < TILE_TYPES; t++) {
            if (counts[t] === 0) continue;
            counts[t]--;
            expect(isTenpai(counts, melds), `${q.notation} 打 ${tileIdOf(t)} 不應已聽牌`).toBe(false);
            counts[t]++;
          }
        }
      }
    },
    180_000,
  );
});
