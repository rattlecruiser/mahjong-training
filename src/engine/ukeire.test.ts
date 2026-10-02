import { describe, expect, it } from 'vitest';
import { analyzeHand } from './analyzeDiscard';
import { isTenpai } from './tenpai';
import { tileIdOf, tileIndexOf } from './tiles';
import type { UkeireEntry } from './ukeire';
import { counts } from '../testing/hands';

function ukeireMap(entries: UkeireEntry[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of entries) map[tileIdOf(e.tile)] = e.remaining;
  return map;
}

/**
 * 手算驗證的核心案例（8 張模式，2 面子 + 1 對）：
 *
 * 題目：2m3m 5p5p 7p8p 東東
 *
 * - 打 五筒：留 23m 5p 78p 東東 → 有效進張 = 1m 4m 6p 9p 各 4 張 → 4 種 16 張
 * - 打 東　：留 23m 55p 78p 東 → 同樣 1m 4m 6p 9p 各 4 張 → 4 種 16 張
 * - 打 八筒：留 23m 55p 7p 東東 → 1m 4m 6p 各 4 + 5p 東 各 2 → 5 種 16 張
 *   （6p 有效：摸 6p 打 5p 後 567p + 東東 + 23m 搭子即聽牌）
 * - 打 二萬/三萬：→ 6p 9p 各 4 + 5p 東 各 2 → 4 種 12 張
 * - 打 七筒：→ 1m 4m 各 4 + 5p 東 各 2 → 4 種 12 張
 *   （7p 與 8p 不對稱：留 78p 可經 5p5p 連到 567p，留單張 8p 則不行）
 *
 * 最佳打牌 = 五筒、八筒、東（三者並列，總枚數 16），全部視為正確。
 */
const CORE = '23m5578p11z';

describe('有效進張與最佳打牌（手算驗證案例）', () => {
  it('任何第一次打牌後都尚未聽牌（確保不是送分題）', () => {
    const hand = counts(CORE);
    for (let t = 0; t < hand.length; t++) {
      if (hand[t] === 0) continue;
      hand[t]--;
      expect(isTenpai(hand, 2)).toBe(false);
      hand[t]++;
    }
  });

  it('每個不同牌種只分析一次，共 6 種打法', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    expect(analysis.options).toHaveLength(6);
  });

  it('打 五筒：有效進張 1m 4m 6p 9p 各 4 → 4 種 16 張', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('5p'))!;
    expect(ukeireMap(option.ukeire)).toEqual({ '1m': 4, '4m': 4, '6p': 4, '9p': 4 });
    expect(option.kinds).toBe(4);
    expect(option.totalRemaining).toBe(16);
  });

  it('打 東：有效進張 1m 4m 6p 9p 各 4 → 4 種 16 張', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('1z'))!;
    expect(ukeireMap(option.ukeire)).toEqual({ '1m': 4, '4m': 4, '6p': 4, '9p': 4 });
    expect(option.totalRemaining).toBe(16);
  });

  it('打 二萬：6p 9p 各 4 + 5p 東 各 2（剩餘枚數以原始題目為準）', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('2m'))!;
    expect(ukeireMap(option.ukeire)).toEqual({ '6p': 4, '9p': 4, '5p': 2, '1z': 2 });
    expect(option.kinds).toBe(4);
    expect(option.totalRemaining).toBe(12);
  });

  it('打 七筒：1m 4m 各 4 + 5p 東 各 2 → 12 張', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('7p'))!;
    expect(ukeireMap(option.ukeire)).toEqual({ '1m': 4, '4m': 4, '5p': 2, '1z': 2 });
    expect(option.totalRemaining).toBe(12);
  });

  it('打 八筒：1m 4m 6p 各 4 + 5p 東 各 2 → 5 種 16 張（經 567p）', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('8p'))!;
    expect(ukeireMap(option.ukeire)).toEqual({
      '1m': 4, '4m': 4, '5p': 2, '6p': 4, '1z': 2,
    });
    expect(option.kinds).toBe(5);
    expect(option.totalRemaining).toBe(16);
  });

  it('並列最佳：五筒、八筒、東三者並列（16 張），不加 tie-breaker', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    expect(analysis.maxTotal).toBe(16);
    expect(analysis.bestDiscards).toEqual([
      tileIndexOf('5p'),
      tileIndexOf('8p'),
      tileIndexOf('1z'),
    ]);
    for (const option of analysis.options) {
      expect(option.isBest).toBe(option.totalRemaining === 16);
    }
  });

  it('結果依總枚數由高到低排序', () => {
    const analysis = analyzeHand(counts(CORE), 2);
    const totals = analysis.options.map((o) => o.totalRemaining);
    expect(totals).toEqual([16, 16, 16, 12, 12, 12]);
  });
});

describe('四種模式共用同一套參數化演算法', () => {
  // 相同的核心結構（23m 55p 78p + 廢牌 6z 7z），
  // 其餘用字牌刻子補滿：字牌不可能組順子，理論上不影響核心的有效進張。
  const HANDS: Record<number, { notation: string; melds: number }> = {
    8: { notation: '23m5578p67z', melds: 2 },
    11: { notation: '23m5578p22267z', melds: 3 },
    14: { notation: '23m5578p22233367z', melds: 4 },
    17: { notation: '23m5578p22233344467z', melds: 5 },
  };

  for (const [mode, { notation, melds }] of Object.entries(HANDS)) {
    it(`${mode} 張模式（${melds} 面子）：打 7z 後有效進張同為 1m 4m 6p 9p 各 4`, () => {
      const analysis = analyzeHand(counts(notation), melds);
      const option = analysis.options.find((o) => o.discard === tileIndexOf('7z'))!;
      expect(ukeireMap(option.ukeire)).toEqual({ '1m': 4, '4m': 4, '6p': 4, '9p': 4 });
      expect(option.totalRemaining).toBe(16);
      // 廢牌 6z / 7z 互為對稱，皆為最佳
      expect(analysis.maxTotal).toBe(16);
      expect(analysis.bestDiscards).toEqual([tileIndexOf('6z'), tileIndexOf('7z')]);
    });
  }
});

describe('打牌後已聽牌的情況', () => {
  it('打掉廢牌即聽牌 → 所有剩餘枚數 > 0 的牌都是有效進張', () => {
    // 123m 456m 55p 79s + 廢牌 3z（11 張模式）
    // 打 3z 後：123m 456m 55p 79s 聽 8s。
    // 摸進任何一張 X 再把 X 打回去即可回到聽牌 → 34 種全部有效。
    const analysis = analyzeHand(counts('123m456m55p79s3z'), 3);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('3z'))!;
    expect(option.kinds).toBe(34);
    // 總枚數 = 34 * 4 - 11（原始題目的 11 張都是已知牌）
    expect(option.totalRemaining).toBe(34 * 4 - 11);
    expect(analysis.bestDiscards).toEqual([tileIndexOf('3z')]);
    expect(analysis.maxTotal).toBe(125);
  });

  it('剩餘 0 枚的牌不列入有效進張（手上已有 4 張）', () => {
    // 4444m 567p 1z（8 張模式）：打 1z 後，摸任何牌 X 打掉一張 4m
    // 即為 444m + 567p + X 單騎聽 → 除 4m（剩 0 枚）外全部有效。
    const analysis = analyzeHand(counts('4444m567p1z'), 2);
    const option = analysis.options.find((o) => o.discard === tileIndexOf('1z'))!;
    expect(option.kinds).toBe(33);
    expect(option.ukeire.some((e) => e.tile === tileIndexOf('4m'))).toBe(false);
    expect(option.totalRemaining).toBe(34 * 4 - 8);
  });
});

describe('analyzeHand 輸入檢查', () => {
  it('張數與模式不符時丟出錯誤', () => {
    expect(() => analyzeHand(counts('123m'), 5)).toThrow();
  });
});
