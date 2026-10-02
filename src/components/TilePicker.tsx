import {
  ALL_TILES,
  HONOR_START,
  MAX_COPIES,
  type Counts,
  type TileId,
  tileIdOf,
  tileName,
} from '../engine';
import { MahjongTile } from './MahjongTile';

export interface TilePickerProps {
  /** 目前已用掉的 counts（用來 disable 已滿 4 張的牌）。 */
  counts: Counts;
  onPick: (tile: TileId) => void;
  /** 已達張數上限時整體 disable。 */
  full?: boolean;
  /** aria-label 前綴，例如「加入手牌：」（預設無前綴 = 牌名）。 */
  ariaPrefix?: string;
}

const ROWS: { label: string; tiles: number[] }[] = [
  { label: '萬', tiles: ALL_TILES.filter((t) => t < 9) },
  { label: '筒', tiles: ALL_TILES.filter((t) => t >= 9 && t < 18) },
  { label: '索', tiles: ALL_TILES.filter((t) => t >= 18 && t < HONOR_START) },
  { label: '字', tiles: ALL_TILES.filter((t) => t >= HONOR_START) },
];

/** 完整 34 種牌的選牌器（視覺化新增題目用）。 */
export function TilePicker({ counts, onPick, full = false, ariaPrefix }: TilePickerProps) {
  return (
    <div className="tile-picker">
      {ROWS.map((row) => (
        <div key={row.label} className="tile-picker__row">
          <span className="tile-picker__label">{row.label}</span>
          <div className="tile-picker__tiles">
            {row.tiles.map((t) => {
              const id = tileIdOf(t);
              const used = counts[t];
              const disabled = full || used >= MAX_COPIES;
              return (
                <span key={id} className="tile-picker__cell">
                  <MahjongTile
                    tile={id}
                    size="picker"
                    disabled={disabled}
                    onClick={() => onPick(id)}
                    ariaLabel={ariaPrefix ? `${ariaPrefix}${tileName(t)}` : undefined}
                  />
                  <span
                    className={`tile-picker__count${used > 0 ? ' is-used' : ''}`}
                    aria-hidden="true"
                  >
                    {used > 0 ? `${used}/4` : ''}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
