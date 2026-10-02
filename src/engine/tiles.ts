/**
 * 牌的基本定義。
 *
 * 引擎內部一律使用 0–33 的 tile index（frequency-array 的下標）：
 *   0–8   : 一萬–九萬 (1m–9m)
 *   9–17  : 一筒–九筒 (1p–9p)
 *   18–26 : 一索–九索 (1s–9s)
 *   27–33 : 東 南 西 北 白 發 中 (1z–7z)
 *
 * index 的自然遞增順序即為題目顯示排序：
 * 萬 → 筒 → 索 → 字牌；數字 1→9；字牌 東南西北白發中。
 */

export type TileIndex = number;

/** 牌的字串 id，例如 '5m'、'3p'、'1z'（東）。 */
export type TileId = string;

export const TILE_TYPES = 34;
export const HONOR_START = 27;
export const MAX_COPIES = 4;

const SUIT_LETTERS: readonly string[] = ['m', 'p', 's'];

export function isHonor(index: TileIndex): boolean {
  return index >= HONOR_START;
}

export function tileIdOf(index: TileIndex): TileId {
  if (!Number.isInteger(index) || index < 0 || index >= TILE_TYPES) {
    throw new Error(`illegal tile index: ${index}`);
  }
  if (index < HONOR_START) {
    return `${(index % 9) + 1}${SUIT_LETTERS[Math.floor(index / 9)]}`;
  }
  return `${index - HONOR_START + 1}z`;
}

export function tileIndexOf(id: TileId): TileIndex {
  const m = /^([1-9])([mpsz])$/.exec(id);
  if (!m) throw new Error(`illegal tile id: ${id}`);
  const n = Number(m[1]);
  const suit = m[2];
  if (suit === 'z') {
    if (n > 7) throw new Error(`illegal tile id: ${id}`);
    return HONOR_START + n - 1;
  }
  return SUIT_LETTERS.indexOf(suit) * 9 + n - 1;
}

export const ALL_TILES: readonly TileIndex[] = Array.from(
  { length: TILE_TYPES },
  (_, i) => i,
);

export const ALL_TILE_IDS: readonly TileId[] = ALL_TILES.map(tileIdOf);

const NUM_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_NAMES = ['萬', '筒', '索'];
const HONOR_NAMES = ['東風', '南風', '西風', '北風', '白板', '發財', '紅中'];
const HONOR_SHORT = ['東', '南', '西', '北', '白', '發', '中'];

/** 牌的中文全名（也用於 aria-label），例如 五萬、三筒、東風、白板。 */
export function tileName(index: TileIndex): string {
  if (index < HONOR_START) {
    return `${NUM_NAMES[index % 9]}${SUIT_NAMES[Math.floor(index / 9)]}`;
  }
  return HONOR_NAMES[index - HONOR_START];
}

/** 牌的短名稱，字牌只取單字，例如 五萬、東、白。 */
export function tileShortName(index: TileIndex): string {
  if (index < HONOR_START) return tileName(index);
  return HONOR_SHORT[index - HONOR_START];
}

/** 依顯示順序排序（萬→筒→索→字、1→9、東南西北白發中）。回傳新陣列。 */
export function sortTiles(tiles: readonly TileIndex[]): TileIndex[] {
  return [...tiles].sort((a, b) => a - b);
}
