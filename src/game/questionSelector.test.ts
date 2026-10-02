import { describe, expect, it } from 'vitest';
import { shuffleQuestions } from './questionSelector';

describe('出題順序', () => {
  it('洗牌結果包含所有題目、不重複、不修改原陣列', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const copy = [...items];
    const shuffled = shuffleQuestions(items);
    expect(items).toEqual(copy);
    expect([...shuffled].sort()).toEqual([...items].sort());
    expect(new Set(shuffled).size).toBe(items.length);
  });

  it('可注入 rng，結果可重現', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const a = shuffleQuestions([1, 2, 3, 4, 5], rng);
    seed = 42;
    const b = shuffleQuestions([1, 2, 3, 4, 5], rng);
    expect(a).toEqual(b);
  });
});
