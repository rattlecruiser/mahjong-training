import { describe, expect, it } from 'vitest';
import {
  MAX_TARGET_MELDS,
  MIN_TARGET_MELDS,
  SIMULATOR_COMPLETE,
  calculateShanten,
  calculateShantenFromIds,
} from './shanten';
import { counts, ids } from '../testing/hands';
import { mulberry32, randomCompleteHand, randomHand, randomMutatedHand } from './testHelpers';

/**
 * Simulator Shanten Calculator 測試（Group A–G）。
 *
 * Convention：-1 = Complete、0 = Tenpai、s = 距離聽牌 s 次有效交換。
 * 只驗證 Simulator 模組本身；與現有引擎的交叉驗證在
 * crossValidation.test.ts（引擎僅作為唯讀 oracle）。
 */

const sh = (notation: string, targetMelds: number) =>
  calculateShanten(counts(notation), targetMelds);

describe('Group A — Complete hands（各 targetMelds 完成形 = -1）', () => {
  const cases: [string, number][] = [
    // T = 1（5 張 = 1 面子 + 1 對）
    ['123m55p', 1],
    ['111z22m', 1],
    ['11123m', 1], // overlapping：123 + 11（greedy 先拿 111 會失敗）
    // T = 2（8 張）
    ['123m456m77p', 2],
    ['555m777p33z', 2],
    ['22334455m', 2], // 345+345+22 的 overlapping 拆解
    ['789s111z22z', 2],
    // T = 3（11 張）
    ['233445567m88p', 3], // 234+345+567 + 88
    ['111222333m44p', 3], // 刻子×3 或 123×3 雙重拆解
    ['22233344455m', 3], // 222+333+444+55（或含順子的拆法）
    ['123m456p789s11z', 3],
    // T = 4（14 張）
    ['123m456m789m123p55p', 4],
    ['111z222z333z444z55z', 4], // 純字牌刻子
    // T = 5（17 張）
    ['123m456m789m123s456s77z', 5],
    ['11123m334455p777999s', 5], // 11+123m / 345+345p / 777+999s 混合 overlapping
  ];
  for (const [hand, t] of cases) {
    it(`${hand}（T=${t}）→ -1`, () => {
      expect(sh(hand, t)).toBe(SIMULATOR_COMPLETE);
    });
  }
});

describe('Group B — Tenpai（waiting states = 0）', () => {
  const cases: [string, number, string][] = [
    ['123m45p66s', 2, 'ryanmen'],
    ['123m46p77s', 2, 'kanchan'],
    ['123m12p88s', 2, 'penchan'],
    ['1235566p', 2, 'shanpon'],
    ['123m456p7s', 2, 'tanki'],
    ['123m456p1z', 2, 'honor tanki'],
    ['2345678m', 2, 'multiple waits'],
    ['123m456m789m123s45s77z', 5, '17 張模式 ryanmen（16 張）'],
    ['1234m', 1, '4 張 waiting'],
    ['1122m', 1, 'shanpon（4 張）'],
    ['123m456m789m45p1z1z', 4, '兩面 + 字牌將（13 張）'],
    ['233445567m8p', 3, 'overlapping 結構 + 單騎（10 張）'],
  ];
  for (const [hand, t, label] of cases) {
    it(`${hand}（T=${t}，${label}）→ 0`, () => {
      expect(sh(hand, t)).toBe(0);
    });
  }
});

describe('Group B2 — Full state 的 tenpai 語意（打一張後聽牌 = 0）', () => {
  it('344556677m88p（T=3，11 張 full）→ 0', () => {
    expect(sh('344556677m88p', 3)).toBe(0);
  });
  it('11223344m（T=2，8 張 full）→ -1（123+123+44：greedy 對子思路會誤判）', () => {
    // 表面像四個對子，實際 = 123m + 123m + 44m 完整胡牌
    expect(sh('11223344m', 2)).toBe(-1);
  });
});

describe('Group C — 1 到 5 shanten（涵蓋不同 targetMelds）', () => {
  it('T=1：13m + 孤張 → 1-shanten', () => {
    expect(sh('13m5z9p', 1)).toBe(1); // 4 張 waiting：嵌張13m
  });
  it('T=1：三張互不相干孤張+1 → 2-shanten', () => {
    expect(sh('159m1z', 1)).toBe(2);
  });
  it('T=2：123m + 兩搭無將 → 1-shanten', () => {
    expect(sh('123m45p78s', 2)).toBe(1);
  });
  it('T=2：一組面子 + 全孤張 → 2-shanten', () => {
    expect(sh('123m4p7s2z5z', 2)).toBe(2);
  });
  it('T=3：一組面子 + 將 + 全孤張 → 3-shanten', () => {
    expect(sh('123m147p14s22z', 3)).toBe(3);
  });
  it('T=4：兩組面子 + 全孤張 → 4-shanten', () => {
    expect(sh('123m456m147p147s2z', 4)).toBe(4);
  });
  it('T=5：兩組面子 + 將 + 全孤張 → 5-shanten', () => {
    expect(sh('123m456m147p147s1123z', 5)).toBe(5);
  });
});

describe('Group D — Overlapping structures（greedy 必錯的牌型）', () => {
  it('22334455m（T=2）是完成形，不是「兩對＋兩搭」', () => {
    expect(sh('22334455m', 2)).toBe(-1);
  });
  it('11123m（T=1）：11 將 + 123，先拿 111 會誤判', () => {
    expect(sh('11123m', 1)).toBe(-1);
  });
  it('233445567m88p（T=3）：234+345+567', () => {
    expect(sh('233445567m88p', 3)).toBe(-1);
  });
  it('344556677m + 88p（T=3 full）→ 0（多重拆解取全局最佳）', () => {
    expect(sh('344556677m88p', 3)).toBe(0);
  });
  it('多對子競爭：55m66p77s123m（T=2 full 9 張？）→ 驗證張數規則', () => {
    // 3+2+2+2 = 9 張對 T=2 不合法（必須 7/8），應丟出錯誤
    expect(() => sh('123m55m66p77s', 2)).toThrow(/張數不合法/);
  });
  it('多對子競爭：123m5566p（T=2，7 張）雙碰聽 → 0', () => {
    expect(sh('1235566p', 2)).toBe(0);
  });
  it('444456m（T=2，將可從刻子拆出）：444+56m+4m…', () => {
    // 4444 5 6：444 + 456? 4m 只有 4 張：444(3) + 456(用第 4 張 4m) = 6 張 → +1 張湊 7
    expect(sh('4444566m', 2)).toBe(0); // 444 + 456 + 6 tanki / 444+66+56 兩面
  });
});

describe('Group E — Honors', () => {
  it('不同字牌永遠不能組搭子：1z–7z 全孤張（T=2）→ 4', () => {
    expect(sh('1234567z', 2)).toBe(4);
  });
  it('對照組：同樣 7 張的數牌 1234567m（T=2）→ 0', () => {
    expect(sh('1234567m', 2)).toBe(0);
  });
  it('字牌對子群：1122z33z5m（T=2）→ 1', () => {
    expect(sh('1122z33z5m', 2)).toBe(1);
  });
  it('字牌刻子 + 混合：111z234m55p（T=2 full 8 張）→ -1', () => {
    expect(sh('111z234m55p', 2)).toBe(-1);
  });
  it('四張同字牌拆解（刻子+浮牌）：1111z234m5m（T=2 full）→ 0', () => {
    // 打掉一張 1z → 111z + 234m + 5m 單騎聽 5m
    expect(sh('1111z234m5m', 2)).toBe(0);
  });
});

describe('Group F — Tile limit / validation', () => {
  it('任何牌 > 4 張 → throw', () => {
    expect(() => calculateShantenFromIds(ids('55555m12p'), 2)).toThrow(/不合法/);
  });
  it('張數不符 targetMelds（必須 3T+1 或 3T+2）→ throw', () => {
    expect(() => sh('123456m', 2)).toThrow(/張數不合法/); // 6 張
    expect(() => sh('123m', 1)).toThrow(/張數不合法/); // 3 張
    expect(() => sh('123m456m789m123p55p', 5)).toThrow(/張數不合法/); // 14 張對 T=5
  });
  it('targetMelds 超出 1–5 → throw', () => {
    expect(() => sh('123m55p', 0)).toThrow(/targetMelds/);
    expect(() => sh('123m55p', 6)).toThrow(/targetMelds/);
    expect(MIN_TARGET_MELDS).toBe(1);
    expect(MAX_TARGET_MELDS).toBe(5);
  });
  it('counts 長度錯誤 → throw', () => {
    expect(() => calculateShanten([0, 0, 0], 1)).toThrow(/長度/);
  });
});

describe('Group G — Property tests（deterministic）', () => {
  const rng = mulberry32(20261001);

  it('同一手牌 → 同一 Shanten（重複呼叫）', () => {
    for (let i = 0; i < 50; i++) {
      const hand = randomHand(rng, 10);
      const a = calculateShanten(hand, 3);
      const b = calculateShanten(hand, 3);
      expect(a).toBe(b);
    }
  });

  it('輸入順序不影響結果', () => {
    const base = ids('344556677m88p');
    const shuffled = [...base];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    expect(calculateShantenFromIds(shuffled, 3)).toBe(
      calculateShantenFromIds(base, 3),
    );
  });

  it('花色互換（structure-preserving permutation）Shanten 不變', () => {
    const perms: number[][] = [
      [1, 0, 2],
      [2, 1, 0],
      [0, 2, 1],
      [1, 2, 0],
      [2, 0, 1],
    ];
    for (let i = 0; i < 40; i++) {
      const hand = randomHand(rng, 13);
      const base = calculateShanten(hand, 4);
      for (const perm of perms) {
        const permuted = new Array<number>(34).fill(0);
        for (let suit = 0; suit < 3; suit++) {
          for (let r = 0; r < 9; r++) {
            permuted[perm[suit] * 9 + r] = hand[suit * 9 + r];
          }
        }
        for (let h = 27; h < 34; h++) permuted[h] = hand[h];
        expect(calculateShanten(permuted, 4)).toBe(base);
      }
    }
  });

  it('Calculator 不修改 caller input', () => {
    const hand = counts('344556677m88p');
    const snapshot = [...hand];
    calculateShanten(hand, 3);
    expect(hand).toEqual(snapshot);
    const idsInput = ids('123m45p66s');
    const idsSnapshot = [...idsInput];
    calculateShantenFromIds(idsInput, 2);
    expect(idsInput).toEqual(idsSnapshot);
  });

  it('隨機合法完成牌（N melds + pair）全部判定為 Complete', () => {
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < 30; i++) {
        const hand = randomCompleteHand(rng, t);
        expect(calculateShanten(hand, t), `T=${t} #${i}`).toBe(-1);
      }
    }
  });

  it('完成牌移除一張 → 恰為 Tenpai（0），無 off-by-one', () => {
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < 20; i++) {
        const hand = randomCompleteHand(rng, t);
        for (let tile = 0; tile < 34; tile++) {
          if (hand[tile] === 0) continue;
          hand[tile]--;
          expect(calculateShanten(hand, t)).toBe(0);
          hand[tile]++;
        }
      }
    }
  });

  it('Full state 的 Shanten == min over 所有打牌後 waiting state 的 Shanten', () => {
    for (let t = 1; t <= 5; t++) {
      for (let i = 0; i < 15; i++) {
        const hand = randomMutatedHand(rng, t, true);
        const full = calculateShanten(hand, t);
        let best = Infinity;
        for (let tile = 0; tile < 34; tile++) {
          if (hand[tile] === 0) continue;
          hand[tile]--;
          best = Math.min(best, calculateShanten(hand, t));
          hand[tile]++;
        }
        // full = -1（完成）時打任何一張都是 tenpai(0)；否則兩者相等
        if (full === -1) expect(best).toBe(0);
        else expect(full).toBe(best);
      }
    }
  });
});

