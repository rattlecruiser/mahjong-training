import {
  TILE_TYPES,
  type TileId,
  type TileIndex,
  tileIdOf,
  tileIndexOf,
} from './tiles';

/**
 * 手牌的 frequency-array 表示：長度 34 的陣列，
 * counts[i] = tile index i 的張數（0–4）。
 * 引擎內部所有計算都使用這個表示，避免大量排序與物件配置。
 */
export type Counts = number[];

export function emptyCounts(): Counts {
  return new Array<number>(TILE_TYPES).fill(0);
}

export function countsFromTiles(tiles: readonly TileIndex[]): Counts {
  const counts = emptyCounts();
  for (const t of tiles) counts[t]++;
  return counts;
}

export function countsFromIds(ids: readonly TileId[]): Counts {
  return countsFromTiles(ids.map(tileIndexOf));
}

/** 依顯示順序展開為 tile index 陣列（自然遞增即為排序後結果）。 */
export function tilesFromCounts(counts: Counts): TileIndex[] {
  const tiles: TileIndex[] = [];
  for (let i = 0; i < TILE_TYPES; i++) {
    for (let k = 0; k < counts[i]; k++) tiles.push(i);
  }
  return tiles;
}

export function idsFromCounts(counts: Counts): TileId[] {
  return tilesFromCounts(counts).map(tileIdOf);
}

export function totalTiles(counts: Counts): number {
  let total = 0;
  for (let i = 0; i < TILE_TYPES; i++) total += counts[i];
  return total;
}

/**
 * canonical hand key：34 個字元，每個字元是該牌張數。
 * 與輸入順序無關，可用於 memoization 與重複題目判定。
 */
export function handKey(counts: Counts): string {
  let key = '';
  for (let i = 0; i < TILE_TYPES; i++) key += counts[i];
  return key;
}

/**
 * 精簡 notation（顯示 / 搜尋用），例如 "23m5578p11z"。
 * z 的數字對應：1東 2南 3西 4北 5白 6發 7中。
 */
export function toNotation(counts: Counts): string {
  const suits = ['m', 'p', 's', 'z'];
  const parts: string[] = [];
  for (let s = 0; s < 4; s++) {
    const size = s === 3 ? 7 : 9;
    let digits = '';
    for (let n = 0; n < size; n++) {
      const idx = s * 9 + n; // 字牌起點 27 = 3 * 9
      for (let k = 0; k < counts[idx]; k++) digits += String(n + 1);
    }
    if (digits) parts.push(digits + suits[s]);
  }
  return parts.join('');
}
