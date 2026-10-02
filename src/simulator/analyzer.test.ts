import { describe, expect, it } from 'vitest';
import {
  analyzeSimulatorHand,
  analyzeSimulatorHandFromIds,
  computeRemaining,
} from './analyzer';
import { calculateShanten } from './shanten';
import { counts, ids } from '../testing/hands';
import { mulberry32, randomMutatedHand } from './testHelpers';
import { TILE_TYPES, tileIndexOf } from '../engine';

const T = (id: string) => tileIndexOf(id);
const empty34 = () => new Array<number>(34).fill(0);

describe('Test A — Remaining Copies（唯一公式 4 − Hand − Known）', () => {
  it('對照表', () => {
    const hand = empty34();
    const known = empty34();
    hand[T('1m')] = 1; // → 3
    hand[T('2m')] = 2;
    known[T('2m')] = 1; // → 1
    hand[T('3m')] = 3;
    known[T('3m')] = 1; // → 0
    hand[T('4m')] = 4; // → 0
    const remaining = computeRemaining(hand, known);
    expect(remaining[T('9s')]).toBe(4); // 0/0 → 4
    expect(remaining[T('1m')]).toBe(3);
    expect(remaining[T('2m')]).toBe(1);
    expect(remaining[T('3m')]).toBe(0);
    expect(remaining[T('4m')]).toBe(0);
  });
});

describe('Test B — Physical limit（hand + known ≤ 4）', () => {
  it('hand + known = 4 合法', () => {
    const hand = empty34();
    const known = empty34();
    hand[T('5p')] = 2;
    known[T('5p')] = 2;
    expect(computeRemaining(hand, known)[T('5p')]).toBe(0);
  });
  it('hand 單獨 > 4 → throw', () => {
    const hand = empty34();
    hand[T('5p')] = 5;
    expect(() => computeRemaining(hand, null)).toThrow(/不合法/);
  });
  it('known 單獨 > 4 → throw', () => {
    const known = empty34();
    known[T('5p')] = 5;
    expect(() => computeRemaining(empty34(), known)).toThrow(/不合法/);
  });
  it('合計 > 4 → throw（物理上不可能）', () => {
    const hand = empty34();
    const known = empty34();
    hand[T('5p')] = 2;
    known[T('5p')] = 3;
    expect(() => computeRemaining(hand, known)).toThrow(/物理上不可能/);
    expect(() =>
      analyzeSimulatorHandFromIds(ids('55m234p678s'), ids('555m'), 2),
    ).toThrow(/物理上不可能/);
  });
});

describe('Test C — 打出的牌不會回到牌牆（永久保留）', () => {
  it('原手牌 3m×2 + Known 3m×1：分析打 3m 時 Remaining(3m) 仍 = 1', () => {
    // hand: 334455m 78p（T=2, 8 張）
    const result = analyzeSimulatorHandFromIds(ids('334455m78p'), ids('3m'), 2);
    expect(result.remaining[T('3m')]).toBe(1); // 4 − 2(hand) − 1(known)

    const discard3m = result.candidates.find((c) => c.discard === T('3m'))!;
    const draw3m = discard3m.effectiveDraws.find((e) => e.tile === T('3m'));
    // 摸回 3m 回到 345+345 的完整 full 結構 → 有效；但剩餘枚數
    // 必須仍以「原始手牌＋Known」為基準 = 1，不能因打出而變 2，
    // 也不能被 double subtract 成 0。
    expect(draw3m).toBeDefined();
    expect(draw3m!.remainingCopies).toBe(1);

    // 所有 candidate 中任何 3m entry 都必須是 1
    for (const c of result.candidates) {
      for (const e of c.effectiveDraws) {
        if (e.tile === T('3m')) expect(e.remainingCopies).toBe(1);
      }
    }
  });
});

describe('Test G / I / J — Known Tiles：遮蔽進張、不動 Shanten', () => {
  const HAND = '223m456p55s'; // T=2 full；打 2m 後聽 1m/4m

  it('無 Known：打 2m → 聽牌，進張 1m×4 + 4m×4 = 2 種 8 張', () => {
    const result = analyzeSimulatorHandFromIds(ids(HAND), null, 2);
    const c = result.candidates.find((x) => x.discard === T('2m'))!;
    expect(c.postDiscardShanten).toBe(0);
    expect(c.effectiveDraws.map((e) => [e.tile, e.remainingCopies])).toEqual([
      [T('1m'), 4],
      [T('4m'), 4],
    ]);
    expect(c.effectiveTileTypeCount).toBe(2);
    expect(c.totalUkeireCopies).toBe(8);
  });

  it('Known = 1m×4：結構上有效的 1m 剩 0 枚 → 完全不列入（Test G）', () => {
    const result = analyzeSimulatorHandFromIds(ids(HAND), ids('1111m'), 2);
    const c = result.candidates.find((x) => x.discard === T('2m'))!;
    expect(c.postDiscardShanten).toBe(0); // Shanten 不受 Known 影響（Test I）
    expect(c.effectiveDraws.map((e) => e.tile)).toEqual([T('4m')]);
    expect(c.effectiveTileTypeCount).toBe(1); // 不計入種類
    expect(c.totalUkeireCopies).toBe(4); // 不計入枚數（Test J：8 → 4）
  });

  it('Test I：Known 前後所有 candidate 的 postDiscardShanten 完全一致', () => {
    const a = analyzeSimulatorHandFromIds(ids(HAND), null, 2);
    const b = analyzeSimulatorHandFromIds(ids(HAND), ids('1111m44m'), 2);
    expect(b.candidates.map((c) => [c.discard, c.postDiscardShanten])).toEqual(
      a.candidates.map((c) => [c.discard, c.postDiscardShanten]),
    );
    expect(b.currentShanten).toBe(a.currentShanten);
  });
});

describe('Test K / N — Known Tiles 可以翻轉 Best；完全 tie 並列', () => {
  // T=3, 11 張：23m 456789p 555s
  //   打 5s → 聽 1m/4m（理論 8 枚）
  //   打 2m → 單騎聽 3m（3 枚）；打 3m → 單騎聽 2m（3 枚）
  const HAND = '23m456789p555s';

  it('無 Known：Best = 打 5s（同為聽牌中枚數最多）', () => {
    const result = analyzeSimulatorHandFromIds(ids(HAND), null, 3);
    const c5s = result.candidates.find((c) => c.discard === T('5s'))!;
    expect(c5s.postDiscardShanten).toBe(0);
    expect(c5s.totalUkeireCopies).toBe(8);
    expect(result.bestDiscards).toEqual([T('5s')]);
  });

  it('Known = 1m×4 + 4m×3：Best 從 5s 翻轉為 2m / 3m 並列（tie 無第三順位）', () => {
    const result = analyzeSimulatorHandFromIds(ids(HAND), ids('1111m444m'), 3);
    const c5s = result.candidates.find((c) => c.discard === T('5s'))!;
    const c2m = result.candidates.find((c) => c.discard === T('2m'))!;
    const c3m = result.candidates.find((c) => c.discard === T('3m'))!;

    // Shanten 結構完全不變
    expect(c5s.postDiscardShanten).toBe(0);
    expect(c2m.postDiscardShanten).toBe(0);
    expect(c3m.postDiscardShanten).toBe(0);
    // 枚數改變：5s → 只剩 4m×1；2m/3m 不受影響
    expect(c5s.totalUkeireCopies).toBe(1);
    expect(c2m.totalUkeireCopies).toBe(3);
    expect(c3m.totalUkeireCopies).toBe(3);
    // Best 翻轉且並列（Test N：兩者 isBest，無 tile-order tie-break）
    expect(result.bestDiscards).toEqual([T('2m'), T('3m')]);
    expect(c2m.isBest).toBe(true);
    expect(c3m.isBest).toBe(true);
    expect(c5s.isBest).toBe(false);
  });
});

describe('Test L / M — 排序：Shanten 優先，同 Shanten 比枚數', () => {
  it('Shanten 優先於 Ukeire（聽牌 8 枚 勝過 一向聽更多枚）', () => {
    const result = analyzeSimulatorHandFromIds(ids('223m456p55s'), null, 2);
    const best = result.candidates.find((c) => c.isBest)!;
    expect(best.discard).toBe(T('2m'));
    expect(best.postDiscardShanten).toBe(0);
    // 確認存在「向聽較高但枚數更多」的 candidate，仍然不是 Best
    const bigger = result.candidates.find(
      (c) => c.postDiscardShanten > 0 && c.totalUkeireCopies > best.totalUkeireCopies,
    );
    expect(bigger).toBeDefined();
    expect(bigger!.isBest).toBe(false);
  });

  it('同 Shanten 比 totalUkeireCopies（枚數，不是種類數）', () => {
    // 223m456p55s：打 2m → 0 向聽 8 枚；打 3m → 0 向聽（雙碰 2m/5s）4 枚
    const result = analyzeSimulatorHandFromIds(ids('223m456p55s'), null, 2);
    const c3m = result.candidates.find((c) => c.discard === T('3m'))!;
    expect(c3m.postDiscardShanten).toBe(0);
    expect(c3m.totalUkeireCopies).toBe(4);
    expect(result.bestDiscards).toEqual([T('2m')]); // 8 > 4
  });
});

describe('Test O — Distinct discard candidates', () => {
  it('手牌 555s 三張：candidate 只出現一次；candidate 數 = 不同牌種數', () => {
    const result = analyzeSimulatorHandFromIds(ids('23m456789p555s'), null, 3);
    expect(result.candidates.filter((c) => c.discard === T('5s'))).toHaveLength(1);
    const hand = counts('23m456789p555s');
    const distinct = hand.filter((n) => n > 0).length;
    expect(result.candidates).toHaveLength(distinct);
  });
});

describe('Test R — Honors', () => {
  it('字牌雙碰聽 + Known 字牌遮蔽', () => {
    // 223m456p11z（T=2）：打 3m → 22m 456p 11z 雙碰聽 2m/1z
    const noKnown = analyzeSimulatorHandFromIds(ids('223m456p11z'), null, 2);
    const c = noKnown.candidates.find((x) => x.discard === T('3m'))!;
    expect(c.postDiscardShanten).toBe(0);
    expect(c.effectiveDraws.map((e) => [e.tile, e.remainingCopies])).toEqual([
      [T('2m'), 2],
      [T('1z'), 2],
    ]);
    for (const e of c.effectiveDraws) expect(e.resultingShanten).toBe(-1);

    const withKnown = analyzeSimulatorHandFromIds(ids('223m456p11z'), ids('11z'), 2);
    const c2 = withKnown.candidates.find((x) => x.discard === T('3m'))!;
    expect(c2.postDiscardShanten).toBe(0); // 不變
    expect(c2.effectiveDraws.map((e) => e.tile)).toEqual([T('2m')]);
    expect(c2.totalUkeireCopies).toBe(2);
  });

  it('字牌 discard candidate 正常分析', () => {
    const result = analyzeSimulatorHandFromIds(ids('223m456p11z'), null, 2);
    expect(result.candidates.some((c) => c.discard === T('1z'))).toBe(true);
  });
});

describe('Complete input state（不 crash、明確語意）', () => {
  it('輸入本身已胡：currentShanten = -1、currentState = complete、candidates 照常', () => {
    const result = analyzeSimulatorHandFromIds(ids('123m456p88s'), null, 2);
    expect(result.currentShanten).toBe(-1);
    expect(result.currentState).toBe('complete');
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.postDiscardShanten).toBe(0); // 胡牌拆一張必聽
      expect(Number.isFinite(c.totalUkeireCopies)).toBe(true);
    }
  });
});

describe('Validation — 入口張數 / targetMelds', () => {
  it('public analyzer 要求 full draw state（5/8/11/14/17）', () => {
    expect(() => analyzeSimulatorHandFromIds(ids('123m45p'), null, 2)).toThrow(/8 張/);
    expect(() => analyzeSimulatorHandFromIds(ids('123m456p88s'), null, 3)).toThrow(/11 張/);
  });
  it('targetMelds 範圍', () => {
    expect(() => analyzeSimulatorHandFromIds(ids('123m55p'), null, 0)).toThrow(/targetMelds/);
    expect(() => analyzeSimulatorHandFromIds(ids('123m55p'), null, 6)).toThrow(/targetMelds/);
  });
  it('counts 長度錯誤', () => {
    expect(() => analyzeSimulatorHand([0, 1, 2], null, 2)).toThrow(/長度/);
  });
});

describe('Test Q + S — 全 targetMelds property / randomized（固定 seed）', () => {
  it('T=1..5 隨機手牌 + 隨機 Known：九項 invariant 全部成立', () => {
    const rng = mulberry32(20261002);
    for (let t = 1; t <= 5; t++) {
      for (let run = 0; run < 12; run++) {
        const hand = randomMutatedHand(rng, t, true); // full state
        // 隨機 Known（不超過 4 − hand）
        const known = empty34();
        for (let i = 0; i < 34; i++) {
          const room = 4 - hand[i];
          if (room > 0 && rng() < 0.25) {
            known[i] = Math.min(room, Math.floor(rng() * 3));
          }
        }
        const handSnapshot = [...hand];
        const knownSnapshot = [...known];

        const result = analyzeSimulatorHand(hand, known, t);

        // 9) input 不被 mutation
        expect(hand).toEqual(handSnapshot);
        expect(known).toEqual(knownSnapshot);

        expect(result.currentShanten).toBe(calculateShanten(hand, t));

        // 1) remaining ∈ [0,4] 且等於公式
        for (let i = 0; i < 34; i++) {
          expect(result.remaining[i]).toBe(4 - hand[i] - known[i]);
          expect(result.remaining[i]).toBeGreaterThanOrEqual(0);
          expect(result.remaining[i]).toBeLessThanOrEqual(4);
        }

        const work = [...hand];
        for (const c of result.candidates) {
          work[c.discard]--;
          const post = calculateShanten(work, t);
          expect(c.postDiscardShanten).toBe(post);

          let sum = 0;
          const listed = new Set<number>();
          for (const e of c.effectiveDraws) {
            // 2) remaining > 0；3) 每個 effective draw 都 strict lower
            expect(e.remainingCopies).toBeGreaterThan(0);
            expect(e.remainingCopies).toBe(result.remaining[e.tile]);
            work[e.tile]++;
            const s = calculateShanten(work, t);
            work[e.tile]--;
            expect(s).toBe(e.resultingShanten);
            expect(s).toBeLessThan(post);
            sum += e.remainingCopies;
            listed.add(e.tile);
          }
          // 4) 所有 available 且 strict-lowering 的 X 都被列出
          for (let x = 0; x < 34; x++) {
            if (result.remaining[x] <= 0) continue;
            work[x]++;
            const s = calculateShanten(work, t);
            work[x]--;
            expect(listed.has(x), `discard=${c.discard} x=${x}`).toBe(s < post);
          }
          // 5) 6) 總和與種類數
          expect(c.totalUkeireCopies).toBe(sum);
          expect(c.effectiveTileTypeCount).toBe(c.effectiveDraws.length);
          work[c.discard]++;
        }

        // 7) best 最優性 + 精確 tie 全標記
        const minShanten = Math.min(...result.candidates.map((c) => c.postDiscardShanten));
        const maxUkeire = Math.max(
          ...result.candidates
            .filter((c) => c.postDiscardShanten === minShanten)
            .map((c) => c.totalUkeireCopies),
        );
        for (const c of result.candidates) {
          expect(c.isBest).toBe(
            c.postDiscardShanten === minShanten && c.totalUkeireCopies === maxUkeire,
          );
        }
        expect(result.bestDiscards).toEqual(
          result.candidates.filter((c) => c.isBest).map((c) => c.discard),
        );

        // 8) Known 不影響 postDiscardShanten
        const noKnown = analyzeSimulatorHand(hand, null, t);
        expect(noKnown.candidates.map((c) => c.postDiscardShanten)).toEqual(
          result.candidates.map((c) => c.postDiscardShanten),
        );
      }
    }
  }, 120_000);
});

describe('候選排序為顯示用牌序，與 tie-break 無關', () => {
  it('candidates 依 tile index 遞增排列', () => {
    const result = analyzeSimulatorHandFromIds(ids('23m456789p555s'), null, 3);
    const order = result.candidates.map((c) => c.discard);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('TILE_TYPES sanity', () => {
    expect(TILE_TYPES).toBe(34);
  });
});
