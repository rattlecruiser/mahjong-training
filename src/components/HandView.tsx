import type { CSSProperties } from 'react';
import type { TileId } from '../engine';
import { MahjongTile } from './MahjongTile';

export interface HandViewProps {
  tiles: TileId[];
  /** 目前選中的位置（以位置而非牌種記錄，重複牌也能正確顯示）。 */
  selectedPos?: number | null;
  onSelect?: (pos: number) => void;
  disabled?: boolean;
  /** 播放出牌動畫的位置。 */
  discardingPos?: number | null;
  /** 已打出（reveal 時半透明標示）的位置。 */
  playedPos?: number | null;
}

/**
 * 一整排手牌。17 張在 desktop 寬度下優先單排顯示，
 * 牌寬以 CSS 變數依張數自動計算，過窄時允許水平捲動。
 */
export function HandView({
  tiles,
  selectedPos = null,
  onSelect,
  disabled = false,
  discardingPos = null,
  playedPos = null,
}: HandViewProps) {
  const n = tiles.length;
  const style = {
    // 單排優先：以實際內容寬（頁面 max-width 1080 − 內距）平均分配，
    // 上限 60px、下限 30px（再小改用水平捲動，不讓牌小到看不清楚）
    '--hand-tile-w': `clamp(30px, calc((min(100vw - 52px, 1032px) - ${(n - 1) * 6}px) / ${n}), 60px)`,
  } as CSSProperties;

  return (
    <div className="hand-scroll">
      <div className="hand-row" style={style} role="group" aria-label="手牌">
        {tiles.map((tile, pos) => (
          <MahjongTile
            key={`${tile}-${pos}`}
            tile={tile}
            size="hand"
            selected={selectedPos === pos}
            dimmed={playedPos === pos}
            discarding={discardingPos === pos}
            disabled={disabled}
            onClick={onSelect ? () => onSelect(pos) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
