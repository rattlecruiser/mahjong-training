import { memo } from 'react';
import {
  HONOR_START,
  type TileId,
  tileIndexOf,
  tileName,
  tileShortName,
} from '../engine';
import { tileAsset } from '../assets/tileAssets';
import { mahjongGlyphsSupported } from './glyphSupport';

export type TileSize = 'hand' | 'analysis' | 'picker' | 'mini';

export interface MahjongTileProps {
  /** 牌 id，例如 "5m"、"1z"。 */
  tile: TileId;
  size?: TileSize;
  selected?: boolean;
  disabled?: boolean;
  /** 半透明顯示（例如已打出的牌）。 */
  dimmed?: boolean;
  /** 短暫的出牌動畫。 */
  discarding?: boolean;
  onClick?: () => void;
  title?: string;
  /** 覆寫 aria-label（預設為牌名，例如「五萬」）。 */
  ariaLabel?: string;
}

const NUM_CHARS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_CHARS: Record<string, string> = { m: '萬', p: '筒', s: '索' };

/**
 * 全站唯一的麻將牌顯示元件。
 *
 * 手牌、分析畫面、題庫新增、本局回顧……所有地方都必須透過它顯示牌；
 * 牌面素材（Unicode / 圖片）由 src/assets/tileAssets.ts 決定，
 * 這裡只負責牌身（圓角、陰影、hover、selected）與可及性。
 */
export const MahjongTile = memo(function MahjongTile({
  tile,
  size = 'hand',
  selected = false,
  disabled = false,
  dimmed = false,
  discarding = false,
  onClick,
  title,
  ariaLabel,
}: MahjongTileProps) {
  const name = tileName(tileIndexOf(tile));
  const label = ariaLabel ?? name;
  const asset = tileAsset(tile);

  const className = [
    'mj-tile',
    `mj-tile--${size}`,
    selected && 'mj-tile--selected',
    dimmed && 'mj-tile--dimmed',
    discarding && 'mj-tile--discarding',
  ]
    .filter(Boolean)
    .join(' ');

  let face: JSX.Element;
  if (asset.kind === 'image') {
    face = <img className="mj-tile__img" src={asset.src} alt="" draggable={false} />;
  } else if (mahjongGlyphsSupported()) {
    face = (
      <span className="mj-tile__glyph" aria-hidden="true">
        {asset.glyph}
      </span>
    );
  } else {
    // 系統字型不支援 Unicode 麻將牌 → 中文字 fallback
    const index = tileIndexOf(tile);
    face =
      index < HONOR_START ? (
        <span className="mj-tile__text" aria-hidden="true">
          <span>{NUM_CHARS[index % 9]}</span>
          <span>{SUIT_CHARS[tile[1]]}</span>
        </span>
      ) : (
        <span className="mj-tile__text mj-tile__text--honor" aria-hidden="true">
          {tileShortName(index)}
        </span>
      );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected}
        title={title ?? label}
      >
        {face}
      </button>
    );
  }

  return (
    <span className={className} role="img" aria-label={label} title={title ?? label}>
      {face}
    </span>
  );
});
