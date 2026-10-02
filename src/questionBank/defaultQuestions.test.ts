import { describe, expect, it } from 'vitest';
import { DEFAULT_QUESTION_NOTATIONS } from './defaultQuestions';
import { parseHandText } from './parser';
import { validateQuestionTiles } from './validation';
import { MODES, requiredMeldsFor } from '../game/modes';
import { analyzeHand, countsFromIds, isTenpai } from '../engine';

/**
 * 預設題庫的每一題都必須經引擎驗證：
 * - notation 可解析、張數正確、無第 5 張同牌
 * - 打出任何一張之後都【尚未】聽牌（真正的一向聽訓練題）
 * - 存在有效進張（maxTotal > 0）
 */
describe('預設題庫（demo 題目）', () => {
  for (const mode of MODES) {
    const notations = DEFAULT_QUESTION_NOTATIONS[mode];
    const melds = requiredMeldsFor(mode);

    it(`${mode} 張模式：${notations.length} 題全部通過引擎驗證`, () => {
      const seen = new Set<string>();
      for (const notation of notations) {
        const parsed = parseHandText(notation);
        expect(parsed.ok, `${notation} 應可解析`).toBe(true);
        if (!parsed.ok) continue;

        const validation = validateQuestionTiles(parsed.tiles, mode, seen);
        expect(validation.ok, `${notation}: ${validation.errors.join('；')}`).toBe(true);
        seen.add(validation.key!);

        const handCounts = countsFromIds(parsed.tiles);

        // 打任何一張都尚未聽牌
        for (let t = 0; t < handCounts.length; t++) {
          if (handCounts[t] === 0) continue;
          handCounts[t]--;
          expect(isTenpai(handCounts, melds), `${notation} 打第 ${t} 種牌後不應已聽牌`).toBe(false);
          handCounts[t]++;
        }

        // 有明確的最佳打牌
        const analysis = analyzeHand(handCounts, melds);
        expect(analysis.maxTotal, `${notation} 應有有效進張`).toBeGreaterThan(0);
        expect(analysis.bestDiscards.length).toBeGreaterThan(0);

        // 永久規則：手牌四張同牌的 tile 不可屬於引擎最佳打牌
        //（實戰存在暗槓決策，目前遊戲不建模暗槓 vs 打牌）
        for (const t of analysis.bestDiscards) {
          expect(handCounts[t], `${notation} 四張同牌不可為最佳打牌`).toBeLessThan(4);
        }
      }
    });
  }
});
