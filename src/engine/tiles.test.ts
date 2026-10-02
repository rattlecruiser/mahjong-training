import { describe, expect, it } from 'vitest';
import {
  ALL_TILE_IDS,
  TILE_TYPES,
  sortTiles,
  tileIdOf,
  tileIndexOf,
  tileName,
} from './tiles';

describe('牌 representation', () => {
  it('34 種基本牌 id 與 index 互轉一致', () => {
    expect(ALL_TILE_IDS).toHaveLength(34);
    for (let i = 0; i < TILE_TYPES; i++) {
      expect(tileIndexOf(tileIdOf(i))).toBe(i);
    }
  });

  it('id 對應正確（邊界）', () => {
    expect(tileIdOf(0)).toBe('1m');
    expect(tileIdOf(8)).toBe('9m');
    expect(tileIdOf(9)).toBe('1p');
    expect(tileIdOf(17)).toBe('9p');
    expect(tileIdOf(18)).toBe('1s');
    expect(tileIdOf(26)).toBe('9s');
    expect(tileIdOf(27)).toBe('1z');
    expect(tileIdOf(33)).toBe('7z');
  });

  it('非法牌被拒絕（沒有赤五、沒有 8z/9z）', () => {
    expect(() => tileIndexOf('0m')).toThrow();
    expect(() => tileIndexOf('0p')).toThrow();
    expect(() => tileIndexOf('0s')).toThrow();
    expect(() => tileIndexOf('8z')).toThrow();
    expect(() => tileIndexOf('9z')).toThrow();
    expect(() => tileIndexOf('10m')).toThrow();
    expect(() => tileIdOf(34)).toThrow();
    expect(() => tileIdOf(-1)).toThrow();
  });

  it('中文名稱正確（aria-label 用）', () => {
    expect(tileName(tileIndexOf('5m'))).toBe('五萬');
    expect(tileName(tileIndexOf('3p'))).toBe('三筒');
    expect(tileName(tileIndexOf('9s'))).toBe('九索');
    expect(tileName(tileIndexOf('1z'))).toBe('東風');
    expect(tileName(tileIndexOf('5z'))).toBe('白板');
    expect(tileName(tileIndexOf('6z'))).toBe('發財');
    expect(tileName(tileIndexOf('7z'))).toBe('紅中');
  });
});

describe('排序', () => {
  it('萬 → 筒 → 索 → 字，數字 1→9，字牌 東南西北白發中', () => {
    const shuffled = ['7z', '9s', '1m', '5p', '1z', '2m', '9m', '1p'].map(tileIndexOf);
    expect(sortTiles(shuffled).map(tileIdOf)).toEqual([
      '1m', '2m', '9m', '1p', '5p', '9s', '1z', '7z',
    ]);
  });

  it('不修改原陣列', () => {
    const original = ['9s', '1m'].map(tileIndexOf);
    const copy = [...original];
    sortTiles(original);
    expect(original).toEqual(copy);
  });
});
