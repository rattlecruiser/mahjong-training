import { describe, expect, it } from 'vitest';
import { validateQuestionTiles, precheckQuestion } from './validation';
import { counts, ids } from '../testing/hands';

const NO_KEYS = new Set<string>();

describe('題庫驗證', () => {
  it('張數正確 + 合法牌 → 通過', () => {
    const result = validateQuestionTiles(ids('23m5578p11z'), 8, NO_KEYS);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.key).not.toBeNull();
  });

  it('張數不符模式 → 錯誤', () => {
    const result = validateQuestionTiles(ids('123m456p'), 8, NO_KEYS);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('張數錯誤');
  });

  it('第 5 張相同牌 → 錯誤', () => {
    const result = validateQuestionTiles(ids('55555m123p'), 8, NO_KEYS);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('最多 4 張');
  });

  it('重複題目判定忽略輸入順序', () => {
    const first = validateQuestionTiles(ids('23m5578p11z'), 8, NO_KEYS);
    const existing = new Set([first.key!]);
    // 同一副牌、不同輸入順序
    const second = validateQuestionTiles(ids('11z78p55p23m'), 8, existing);
    expect(second.ok).toBe(false);
    expect(second.errors.join()).toContain('重複');
    // 不同牌組不算重複
    const third = validateQuestionTiles(ids('23m5578p22z'), 8, existing);
    expect(third.ok).toBe(true);
  });
});

describe('引擎預檢', () => {
  it('正常題目通過預檢', () => {
    expect(precheckQuestion(counts('23m5578p11z'), 8).ok).toBe(true);
  });

  it('沒有任何有效進張的手牌不適合作為題目', () => {
    // 8 張模式：四組毫無關聯的孤張——距離聽牌太遠
    const result = precheckQuestion(counts('19m19p19s12z'), 8);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('有效進張');
  });
});
