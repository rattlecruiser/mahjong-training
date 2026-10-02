import type { HandAnalysis, TileIndex } from '../engine';
import { tileIdOf } from '../engine';
import { MahjongTile } from './MahjongTile';

export interface AnalysisPanelProps {
  analysis: HandAnalysis;
  /** 玩家的第一次打牌（標示「你的選擇」）；null / undefined = 不標示。 */
  chosen?: TileIndex | null;
  compact?: boolean;
  /**
   * accepted bestDiscards 的 badge 文字。
   * Admin / 新增題目預覽維持預設「最佳」；玩家練習模式傳入「正確答案」。
   */
  bestLabel?: string;
}

/**
 * 打牌分析面板：列出每一種第一次打牌與其有效進張，
 * 依總有效進張枚數由高到低排序（引擎輸出順序，UI 不重新計算、
 * 不因 correct/wrong 重新排序）。
 *
 * 視覺層（原版 Correct/Wrong presentation，原 CSS classes 原樣 reuse）：
 * - accepted bestDiscards（可能多個）→ is-best（淺綠底 --ok-bg + 綠框）
 *   ＋ chip--best badge（bestLabel）
 * - 玩家選中且正確 → 同一列同時有 bestLabel 與「你的選擇」（chip--you）
 * - 玩家選中且錯誤 → is-chosen-wrong（紅框 + 紅色縱條）＋
 *   chip--you-wrong「你的選擇」
 * - 其他 candidates → neutral（不上紅綠色）
 */
export function AnalysisPanel({
  analysis,
  chosen = null,
  compact = false,
  bestLabel = '最佳',
}: AnalysisPanelProps) {
  return (
    <div className={compact ? 'analysis analysis--compact' : 'analysis'}>
      <ol className="analysis__list">
        {analysis.options.map((option) => {
          const isChosen = chosen !== null && option.discard === chosen;
          const rowClass = [
            'analysis-row',
            option.isBest && 'is-best',
            isChosen && (option.isBest ? 'is-chosen' : 'is-chosen-wrong'),
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={option.discard} className={rowClass}>
              <div className="analysis-row__discard">
                <span className="analysis-row__verb">打</span>
                <MahjongTile tile={tileIdOf(option.discard)} size={compact ? 'mini' : 'analysis'} />
                <span className="analysis-row__chips">
                  {option.isBest && <span className="chip chip--best">{bestLabel}</span>}
                  {isChosen && (
                    <span className={option.isBest ? 'chip chip--you' : 'chip chip--you-wrong'}>
                      你的選擇
                    </span>
                  )}
                </span>
              </div>

              <div className="analysis-row__ukeire">
                {option.ukeire.length === 0 ? (
                  <span className="analysis-row__none">無有效進張</span>
                ) : (
                  option.ukeire.map((entry) => (
                    <span key={entry.tile} className="ukeire-item">
                      <MahjongTile tile={tileIdOf(entry.tile)} size="mini" />
                      <span className="ukeire-item__count">×{entry.remaining}</span>
                    </span>
                  ))
                )}
              </div>

              <div className="analysis-row__stats">
                <span className="analysis-row__kinds">{option.kinds} 種</span>
                <span className="analysis-row__total">{option.totalRemaining} 張</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
