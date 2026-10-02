import { describe, expect, it } from 'vitest';
import { isWinningHand } from './winning';
import { counts } from '../testing/hands';

describe('胡牌判定（一般形：N 面子 + 1 對將）', () => {
  it('17 張模式（5 面子 + 1 對）', () => {
    expect(isWinningHand(counts('123m456m789m123s456s77z'), 5)).toBe(true);
    expect(isWinningHand(counts('123m456m789m123s457s77z'), 5)).toBe(false);
  });

  it('14 張模式（4 面子 + 1 對）', () => {
    expect(isWinningHand(counts('123m456m789m123p55p'), 4)).toBe(true);
    expect(isWinningHand(counts('123m456m789m124p55p'), 4)).toBe(false);
  });

  it('11 張模式（3 面子 + 1 對）', () => {
    expect(isWinningHand(counts('123m456p789s11z'), 3)).toBe(true);
    expect(isWinningHand(counts('123m456p789s12z'), 3)).toBe(false);
  });

  it('8 張模式（2 面子 + 1 對）', () => {
    expect(isWinningHand(counts('123m456m77p'), 2)).toBe(true);
    expect(isWinningHand(counts('123m456m78p'), 2)).toBe(false);
  });

  it('字牌只能組刻子，不能組順子', () => {
    // 東東東 南南南 西西西 北北北 + 白白
    expect(isWinningHand(counts('111z222z333z444z55z'), 4)).toBe(true);
    // 東南西 / 北白發 不是順子
    expect(isWinningHand(counts('123z456z789m123p99m'), 4)).toBe(false);
  });

  it('不計算七對子（台灣麻將沒有特殊牌型）', () => {
    // 純七對（無法拆成 4 面子 + 1 對）在日麻是胡牌，這裡必須是 false
    expect(isWinningHand(counts('1199m1199p1199s55z'), 4)).toBe(false);
  });

  it('同一張牌 4 張可同時用於刻子與順子（數字牌）', () => {
    // 3333m45m → 333m + 345m
    expect(isWinningHand(counts('3333m45m111p22p'), 3)).toBe(true);
  });

  it('4 張相同字牌無法拆解（字牌沒有順子可用）', () => {
    expect(isWinningHand(counts('1111z5566m'), 2)).toBe(false);
    expect(isWinningHand(counts('111z555m66m'), 2)).toBe(true);
  });

  it('張數不符直接不成立', () => {
    expect(isWinningHand(counts('123m456m789m123p55p'), 5)).toBe(false);
    expect(isWinningHand(counts('123m'), 1)).toBe(false);
  });
});
