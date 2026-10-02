import type { TileId } from '../engine';

/**
 * 文字 notation 解析。
 *
 * 數字牌：數字串 + 花色字母（小寫）
 *   m = 萬、p = 筒、s = 索        例：123m45p67s
 *
 * 字牌（兩種寫法皆可）：
 *   1z–7z：1z=東 2z=南 3z=西 4z=北 5z=白 6z=發 7z=中   例：11z77z
 *   大寫字母：E=東 S=南 W=西 N=北 P=白 F=發 C=中        例：EESS
 *
 * 大小寫有意義：小寫 p/s 是筒/索，大寫 P/S 是白板/南風，不會衝突。
 * 空白可自由加入。不支援 0m/0p/0s（本遊戲沒有赤五）。
 */

export type ParseResult =
  | { ok: true; tiles: TileId[] }
  | { ok: false; error: string };

const HONOR_LETTERS: Record<string, TileId> = {
  E: '1z',
  S: '2z',
  W: '3z',
  N: '4z',
  P: '5z',
  F: '6z',
  C: '7z',
};

export function parseHandText(input: string): ParseResult {
  const tiles: TileId[] = [];
  let digits = '';

  const fail = (error: string): ParseResult => ({ ok: false, error });

  for (const ch of input) {
    if (/\s/.test(ch)) continue;

    if (ch >= '0' && ch <= '9') {
      digits += ch;
      continue;
    }

    if (ch === 'm' || ch === 'p' || ch === 's' || ch === 'z') {
      if (!digits) {
        return fail(`「${ch}」前面必須有數字，例如 123${ch}`);
      }
      for (const d of digits) {
        if (d === '0') {
          return fail(`不支援 0${ch}：本遊戲沒有赤五`);
        }
        if (ch === 'z' && (d === '8' || d === '9')) {
          return fail(`字牌只有 1z–7z（東南西北白發中），沒有 ${d}z`);
        }
        tiles.push(`${d}${ch}`);
      }
      digits = '';
      continue;
    }

    if (HONOR_LETTERS[ch]) {
      if (digits) {
        return fail(
          `「${digits}${ch}」無法解析：字牌字母 ${ch} 前面不能接數字（字牌請寫 ${ch} 或 ${HONOR_LETTERS[ch]}）`,
        );
      }
      tiles.push(HONOR_LETTERS[ch]);
      continue;
    }

    return fail(
      `無法辨識的字元「${ch}」。可用：數字+小寫 m/p/s/z，或大寫 E S W N P F C（東南西北白發中）`,
    );
  }

  if (digits) {
    return fail(`「${digits}」後面缺少花色字母（m/p/s/z）`);
  }
  if (tiles.length === 0) {
    return fail('沒有輸入任何牌');
  }

  return { ok: true, tiles };
}

export interface BatchLine {
  lineNumber: number;
  raw: string;
  result: ParseResult;
}

/** 批量解析：一行 = 一題，空行忽略。 */
export function parseBatchText(text: string): BatchLine[] {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ lineNumber: i + 1, raw: raw.trim() }))
    .filter((line) => line.raw.length > 0)
    .map((line) => ({ ...line, result: parseHandText(line.raw) }));
}
