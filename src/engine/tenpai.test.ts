import { describe, expect, it } from 'vitest';
import { isTenpai, winningTilesFor } from './tenpai';
import { tileIndexOf } from './tiles';
import { counts } from '../testing/hands';

describe('聽牌判定', () => {
  it('17 張模式：16 張時判斷（摸 1 張可成 5 面子 + 1 對）', () => {
    // 聽 3s / 6s
    expect(isTenpai(counts('123m456m789m123s45s77z'), 5)).toBe(true);
    // 459s + 1z 無法一張進入胡牌
    expect(isTenpai(counts('123m456m789m123s459s1z'), 5)).toBe(false);
  });

  it('14 張模式：13 張時判斷', () => {
    expect(isTenpai(counts('123m456m789m45p11z'), 4)).toBe(true);
    expect(isTenpai(counts('123m456m789m4p1s9s1z'), 4)).toBe(false);
  });

  it('11 張模式：10 張時判斷', () => {
    expect(isTenpai(counts('123m456p78s11z'), 3)).toBe(true);
    expect(isTenpai(counts('123m456p7s9s1z2z'), 3)).toBe(false);
  });

  it('8 張模式：7 張時判斷', () => {
    expect(isTenpai(counts('123m45p66s'), 2)).toBe(true);
    expect(isTenpai(counts('123m4p6s11z'), 2)).toBe(false);
  });

  it('手上已有 4 張的牌不能再摸（第 5 張不存在）', () => {
    // 只可能聽第 5 張 2m → 不算聽牌
    expect(isTenpai(counts('2222m345p'), 2)).toBe(false);
  });

  it('張數不符直接不成立', () => {
    expect(isTenpai(counts('123m456m789m45p11z'), 5)).toBe(false);
  });

  it('winningTilesFor 列出正確的胡牌張', () => {
    const tiles = winningTilesFor(counts('123m456m789m45p11z'), 4);
    expect(tiles).toEqual([tileIndexOf('3p'), tileIndexOf('6p')]);
  });
});
