import { describe, expect, it } from 'vitest';
import { parseBatchText, parseHandText } from './parser';

describe('文字 notation parser', () => {
  it('數字牌：數字串 + m/p/s', () => {
    const result = parseHandText('123m45p9s');
    expect(result).toEqual({
      ok: true,
      tiles: ['1m', '2m', '3m', '4p', '5p', '9s'],
    });
  });

  it('字牌：1z–7z 寫法', () => {
    const result = parseHandText('1234567z');
    expect(result).toEqual({
      ok: true,
      tiles: ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
    });
  });

  it('字牌：大寫字母 E S W N P F C 寫法', () => {
    const result = parseHandText('ESWNPFC');
    expect(result).toEqual({
      ok: true,
      tiles: ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
    });
  });

  it('大小寫有意義：小寫 p/s 是花色，大寫 P/S 是白板/南風', () => {
    expect(parseHandText('55p')).toEqual({ ok: true, tiles: ['5p', '5p'] });
    expect(parseHandText('PP')).toEqual({ ok: true, tiles: ['5z', '5z'] });
    expect(parseHandText('SS')).toEqual({ ok: true, tiles: ['2z', '2z'] });
  });

  it('允許空白分隔', () => {
    const result = parseHandText('123m  456p\t E E');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tiles).toHaveLength(8);
  });

  it('不支援 0m/0p/0s（沒有赤五）', () => {
    for (const bad of ['0m', '10p', '505s']) {
      const result = parseHandText(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('赤五');
    }
  });

  it('字牌只有 1z–7z', () => {
    expect(parseHandText('8z').ok).toBe(false);
    expect(parseHandText('9z').ok).toBe(false);
  });

  it('各種格式錯誤都有明確訊息', () => {
    expect(parseHandText('123').ok).toBe(false); // 缺花色
    expect(parseHandText('m').ok).toBe(false); // 缺數字
    expect(parseHandText('12E').ok).toBe(false); // 數字接字牌字母
    expect(parseHandText('123x').ok).toBe(false); // 未知字元
    expect(parseHandText('').ok).toBe(false); // 空輸入
  });
});

describe('批量解析（一行 = 一題）', () => {
  it('逐行解析並保留行號，空行忽略', () => {
    const lines = parseBatchText('123m456p78s\n\n  \nESWN123m456p\nbad!!');
    expect(lines).toHaveLength(3);
    expect(lines[0].lineNumber).toBe(1);
    expect(lines[0].result.ok).toBe(true);
    expect(lines[1].lineNumber).toBe(4);
    expect(lines[1].result.ok).toBe(true);
    expect(lines[2].lineNumber).toBe(5);
    expect(lines[2].result.ok).toBe(false);
  });
});
