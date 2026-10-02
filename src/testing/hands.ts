import { type Counts, countsFromIds, type TileId } from '../engine';
import { parseHandText } from '../questionBank/parser';

/** 測試輔助：由 notation 建立 counts，解析失敗直接丟錯。 */
export function counts(notation: string): Counts {
  const parsed = parseHandText(notation);
  if (!parsed.ok) throw new Error(`bad test notation "${notation}": ${parsed.error}`);
  return countsFromIds(parsed.tiles);
}

/** 測試輔助：由 notation 取得 tile id 陣列（保持輸入順序）。 */
export function ids(notation: string): TileId[] {
  const parsed = parseHandText(notation);
  if (!parsed.ok) throw new Error(`bad test notation "${notation}": ${parsed.error}`);
  return parsed.tiles;
}
