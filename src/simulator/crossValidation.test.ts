import { describe, expect, it } from 'vitest';
import { calculateShanten } from './shanten';
import {
  mulberry32,
  randomCompleteHand,
  randomMutatedHand,
} from './testHelpers';
// 現有遊戲引擎【只作為唯讀 oracle】，絕不修改、絕不反向依賴。
import { isTenpai, isWinningHand, winningTilesFor } from '../engine';
import { counts } from '../testing/hands';

/**
 * Group H — Cross Validation（現有引擎為 reference / oracle）。
 *
 * 對照關係（Simulator convention：-1 完成、0 聽牌）：
 * - 3T+2 張：sim == -1  ⟺  engine isWinningHand == true
 * - 3T+1 張：sim == 0   ⟺  engine isTenpai == true
 * - 3T+2 張：sim == 0   ⟺  非胡牌 且 存在打牌使 engine isTenpai
 * - 3T+1 張：sim == 1   ⟺  非聽牌 且 存在 摸X→打d 使 engine isTenpai
 *  （最後一條即現有遊戲「有效進張」的存在性，覆蓋 off-by-one）
 */

const RUNS_PER_T = 40;

describe('Group H — 與現有引擎交叉驗證（引擎唯讀）', () => {
  it('隨機完成牌：engine WIN ⟺ sim Complete(-1)', () => {
    const rng = mulberry32(7701);
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < RUNS_PER_T; i++) {
        const hand = randomCompleteHand(rng, t);
        expect(isWinningHand([...hand], t), `engine win T=${t}`).toBe(true);
        expect(calculateShanten(hand, t), `sim T=${t}`).toBe(-1);
      }
    }
  });

  it('完成牌移除一張 → engine 聽牌 且有 winning tiles；sim == 0', () => {
    const rng = mulberry32(7702);
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < 15; i++) {
        const hand = randomCompleteHand(rng, t);
        for (let tile = 0; tile < 34; tile++) {
          if (hand[tile] === 0) continue;
          hand[tile]--;
          expect(isTenpai([...hand], t)).toBe(true);
          expect(winningTilesFor([...hand], t).length).toBeGreaterThan(0);
          expect(calculateShanten(hand, t)).toBe(0);
          hand[tile]++;
        }
      }
    }
  });

  it('隨機 waiting states（3T+1）：sim == 0 ⟺ engine isTenpai（雙向）', () => {
    const rng = mulberry32(7703);
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < RUNS_PER_T * 2; i++) {
        const hand = randomMutatedHand(rng, t, false);
        const sim = calculateShanten(hand, t);
        const oracle = isTenpai([...hand], t);
        expect(sim === 0, handMsg(hand, t, sim, `engineTenpai=${oracle}`)).toBe(oracle);
        // engine 可證明存在 winning tile 時，sim 不得比 Tenpai 更遠
        if (oracle) {
          expect(winningTilesFor([...hand], t).length).toBeGreaterThan(0);
          expect(sim).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('隨機 full states（3T+2）：sim == -1 ⟺ WIN；sim == 0 ⟺ 有打牌可聽', () => {
    const rng = mulberry32(7704);
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < RUNS_PER_T; i++) {
        const hand = randomMutatedHand(rng, t, true);
        const sim = calculateShanten(hand, t);
        const win = isWinningHand([...hand], t);
        expect(sim === -1, handMsg(hand, t, sim, `win=${win}`)).toBe(win);

        let anyTenpaiAfterDiscard = false;
        for (let d = 0; d < 34 && !anyTenpaiAfterDiscard; d++) {
          if (hand[d] === 0) continue;
          hand[d]--;
          if (isTenpai([...hand], t)) anyTenpaiAfterDiscard = true;
          hand[d]++;
        }
        if (win) {
          expect(anyTenpaiAfterDiscard).toBe(true); // 胡牌拆一張必聽
        } else {
          expect(sim === 0, handMsg(hand, t, sim, `discard→tenpai=${anyTenpaiAfterDiscard}`)).toBe(
            anyTenpaiAfterDiscard,
          );
        }
      }
    }
  });

  it('隨機 waiting states：sim == 1 ⟺ 非聽牌且存在 摸X→打d 成聽（有效進張存在性）', () => {
    const rng = mulberry32(7705);
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < 25; i++) {
        const hand = randomMutatedHand(rng, t, false);
        const sim = calculateShanten(hand, t);
        const tenpaiNow = isTenpai([...hand], t);
        let canReachTenpai = false;
        for (let x = 0; x < 34 && !canReachTenpai; x++) {
          if (hand[x] >= 4) continue;
          hand[x]++;
          for (let d = 0; d < 34 && !canReachTenpai; d++) {
            if (hand[d] === 0) continue;
            hand[d]--;
            if (isTenpai([...hand], t)) canReachTenpai = true;
            hand[d]++;
          }
          hand[x]--;
        }
        if (tenpaiNow) {
          expect(sim).toBe(0);
        } else {
          expect(sim === 1, handMsg(hand, t, sim, `reach=${canReachTenpai}`)).toBe(canReachTenpai);
        }
      }
    }
  });

  it('固定 disagreement 迴歸案例（歷史上容易出錯的形）', () => {
    // 這些案例同時用引擎驗證，永久鎖定
    const fixed: [string, number][] = [
      ['22334455m', 2],
      ['11123m', 1],
      ['233445567m88p', 3],
      ['1111z234m5m', 2],
      ['1234567m', 2],
      ['1234567z', 2],
    ];
    for (const [hand, t] of fixed) {
      const c = counts(hand);
      const total = c.reduce((a, b) => a + b, 0);
      const sim = calculateShanten(c, t);
      if (total === t * 3 + 2) {
        expect(sim === -1).toBe(isWinningHand([...c], t));
      } else {
        expect(sim === 0).toBe(isTenpai([...c], t));
      }
    }
  });
});

function handMsg(hand: number[], t: number, sim: number, extra: string): string {
  const parts: string[] = [];
  const suits = ['m', 'p', 's', 'z'];
  for (let s = 0; s < 4; s++) {
    let str = '';
    const size = s === 3 ? 7 : 9;
    for (let r = 0; r < size; r++) {
      for (let k = 0; k < hand[s * 9 + r]; k++) str += r + 1;
    }
    if (str) parts.push(str + suits[s]);
  }
  return `hand=${parts.join('')} T=${t} sim=${sim} ${extra}`;
}
