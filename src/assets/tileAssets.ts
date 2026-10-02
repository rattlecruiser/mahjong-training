import type { TileId } from '../engine';

/**
 * 牌面素材對應層 —— 所有「一張牌長什麼樣」的知識都集中在這裡。
 *
 * 目前使用 Unicode 麻將牌（暫時方案）。
 *
 * ══════════════ 如何替換成 PNG / SVG 素材 ══════════════
 *
 * 把圖片放進 src/assets/tiles/，檔名如下（png 或 svg 皆可）：
 *
 *   1m.png … 9m.png   萬子
 *   1p.png … 9p.png   筒子
 *   1s.png … 9s.png   索子
 *   east.png south.png west.png north.png   東南西北
 *   white.png green.png red.png             白發中
 *
 * 放進去之後【不需要改任何程式碼】：本檔案用 import.meta.glob
 * 自動偵測 src/assets/tiles/ 內的圖片，存在就用圖片、缺少的牌
 * 自動 fallback 回 Unicode。麻將引擎、遊戲邏輯、題庫、分析畫面
 * 完全不用動——它們只認識 tile id（'5m'）與 MahjongTile 元件。
 * ════════════════════════════════════════════════════════
 */

export type TileAsset =
  | { kind: 'unicode'; glyph: string }
  | { kind: 'image'; src: string };

// ---------- Unicode 對應（U+1F000 起的 Mahjong Tiles 區段） ----------

function u(codePoint: number, forceTextStyle = false): TileAsset {
  return {
    kind: 'unicode',
    // U+FE0E（變體選擇器）強制文字樣式，避免 🀄 被顯示成 emoji
    glyph: String.fromCodePoint(codePoint) + (forceTextStyle ? '︎' : ''),
  };
}

const UNICODE_TILES: Record<TileId, TileAsset> = (() => {
  const map: Record<TileId, TileAsset> = {};
  for (let n = 1; n <= 9; n++) map[`${n}m`] = u(0x1f006 + n); // 🀇–🀏
  for (let n = 1; n <= 9; n++) map[`${n}p`] = u(0x1f018 + n); // 🀙–🀡
  for (let n = 1; n <= 9; n++) map[`${n}s`] = u(0x1f00f + n); // 🀐–🀘
  map['1z'] = u(0x1f000); // 🀀 東
  map['2z'] = u(0x1f001); // 🀁 南
  map['3z'] = u(0x1f002); // 🀂 西
  map['4z'] = u(0x1f003); // 🀃 北
  map['5z'] = u(0x1f006); // 🀆 白
  map['6z'] = u(0x1f005); // 🀅 發
  map['7z'] = u(0x1f004, true); // 🀄︎ 中（強制文字樣式）
  return map;
})();

// ---------- 圖片自動偵測 ----------

/** tile id → 圖片檔名（不含副檔名）。 */
const IMAGE_FILE_NAMES: Record<TileId, string> = (() => {
  const map: Record<TileId, string> = {};
  for (let n = 1; n <= 9; n++) {
    map[`${n}m`] = `${n}m`;
    map[`${n}p`] = `${n}p`;
    map[`${n}s`] = `${n}s`;
  }
  map['1z'] = 'east';
  map['2z'] = 'south';
  map['3z'] = 'west';
  map['4z'] = 'north';
  map['5z'] = 'white';
  map['6z'] = 'green';
  map['7z'] = 'red';
  return map;
})();

/** 建置時掃描 src/assets/tiles/ 內所有 png/svg（沒有檔案時為空物件）。 */
const IMAGE_MODULES = import.meta.glob('./tiles/*.{png,svg,PNG,SVG}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function imageFor(id: TileId): string | null {
  const name = IMAGE_FILE_NAMES[id];
  for (const ext of ['png', 'svg', 'PNG', 'SVG']) {
    const hit = IMAGE_MODULES[`./tiles/${name}.${ext}`];
    if (hit) return hit;
  }
  return null;
}

/** 取得一張牌目前應使用的素材。 */
export function tileAsset(id: TileId): TileAsset {
  const image = imageFor(id);
  if (image) return { kind: 'image', src: image };
  const unicode = UNICODE_TILES[id];
  if (!unicode) throw new Error(`unknown tile id: ${id}`);
  return unicode;
}
