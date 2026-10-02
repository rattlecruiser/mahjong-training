import { describe, expect, it } from 'vitest';
import { analyzeSimulatorHand, analyzeSimulatorHandFromIds } from './analyzer';
// 現有遊戲引擎【只作為唯讀 oracle】，不修改、不反向依賴。
import { countsFromIds, tileIndexOf, winningTilesFor } from '../engine';
import { ids } from '../testing/hands';
import { mulberry32, randomMutatedHand } from './testHelpers';

/**
 * Test P / T — 聽牌胡牌張與現有引擎 cross-validation。
 *
 * postDiscardShanten = 0 時，Simulator 的 effectiveDraws 語意即為
 * Winning Tiles / Waits（resultingShanten = -1，由同一套 general
 * shanten 數學自然得出，沒有另寫第二套規則）。
 *
 * 對照時區分：
 * - STRUCTURAL WAIT：引擎 winningTilesFor 列出的結構聽牌張
 * - AVAILABLE WAIT：Simulator 以 Remaining(X) > 0 過濾後的實際可摸張
 * Remaining = 0 造成的差異是 availability difference，不是 Shanten 算錯。
 */

const T = (id: string) => tileIndexOf(id);

describe('Test P — 各種聽型的胡牌張（resultingShanten = -1）+ 引擎對照', () => {
  const cases: [string, string, number, string][] = [
    ['223m456p55s', '2m', 2, 'ryanmen（聽 1m/4m）'],
    ['1123m46p88s', '1m', 2, 'kanchan（聽 5p）'],
    ['1123m12p88s', '1m', 2, 'penchan（聽 3p）'],
    ['223m456p11z', '3m', 2, 'shanpon（聽 2m/1z）'],
    ['123m456p99s', '9s', 2, 'tanki（聽 9s）'],
    ['123m456p1z9s', '9s', 2, 'honor tanki（聽東）'],
    ['2345678m5p', '5p', 2, '三面（聽 2m/5m/8m）'],
    ['123m456m789m123s456s77z', '7z', 5, '17 張 tanki'],
    ['23m456789p555s', '2m', 3, '11 張 tanki（聽 3m）'],
  ];

  for (const [hand, discardId, t, label] of cases) {
    it(`${hand} 打 ${discardId}（T=${t}，${label}）`, () => {
      const result = analyzeSimulatorHandFromIds(ids(hand), null, t);
      const candidate = result.candidates.find((c) => c.discard === T(discardId));
      expect(candidate, `找不到 candidate ${discardId}`).toBeDefined();
      expect(candidate!.postDiscardShanten).toBe(0);
      for (const e of candidate!.effectiveDraws) {
        expect(e.resultingShanten).toBe(-1);
      }
      // 引擎對照：H = hand − discard
      const handCounts = countsFromIds(ids(hand));
      handCounts[candidate!.discard]--;
      const engineWaits = winningTilesFor(handCounts, t);
      const available = engineWaits.filter((x) => result.remaining[x] > 0);
      expect(candidate!.effectiveDraws.map((e) => e.tile)).toEqual(available);
      expect(available.length).toBeGreaterThan(0);
    });
  }
});

describe('Test T — 大量隨機 post-discard 聽牌與引擎 cross-validation', () => {
  it('T=1..5：Simulator waits == 引擎 structural waits ∩ available', () => {
    const rng = mulberry32(20261003);
    let tenpaiCandidatesChecked = 0;
    for (let t = 1; t <= 5; t++) {
      for (let run = 0; run < 15; run++) {
        const hand = randomMutatedHand(rng, t, true);
        const result = analyzeSimulatorHand(hand, null, t);
        for (const c of result.candidates) {
          if (c.postDiscardShanten !== 0) continue;
          tenpaiCandidatesChecked++;
          hand[c.discard]--;
          const engineWaits = winningTilesFor([...hand], t);
          hand[c.discard]++;
          const available = engineWaits.filter((x) => result.remaining[x] > 0);
          // AVAILABLE WAIT 完全一致
          expect(c.effectiveDraws.map((e) => e.tile), `T=${t}`).toEqual(available);
          // Simulator 列出的每一張都是引擎承認的 STRUCTURAL WAIT
          for (const e of c.effectiveDraws) {
            expect(engineWaits).toContain(e.tile);
            expect(e.resultingShanten).toBe(-1);
          }
        }
      }
    }
    expect(tenpaiCandidatesChecked).toBeGreaterThan(50);
  }, 120_000);

  it('STRUCTURAL vs AVAILABLE：Known 遮蔽的聽牌張不是 Shanten 錯誤', () => {
    // 223m456p55s + Known 1m×4：打 2m 後結構聽 1m/4m，實際可摸只剩 4m
    const result = analyzeSimulatorHandFromIds(ids('223m456p55s'), ids('1111m'), 2);
    const c = result.candidates.find((x) => x.discard === T('2m'))!;
    expect(c.postDiscardShanten).toBe(0); // Shanten 不因 Known 改變

    const handCounts = countsFromIds(ids('223m456p55s'));
    handCounts[T('2m')]--;
    const engineWaits = winningTilesFor(handCounts, 2);
    expect(engineWaits).toEqual([T('1m'), T('4m')]); // structural
    expect(c.effectiveDraws.map((e) => e.tile)).toEqual([T('4m')]); // available
    expect(c.totalUkeireCopies).toBe(4);
  });
});
