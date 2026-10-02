import { useMemo, useReducer } from 'react';
import {
  analyzeHand,
  countsFromIds,
  tileIdOf,
  tileIndexOf,
  tileName,
  toNotation,
  type HandAnalysis,
  type TileIndex,
} from '../engine';
import { type Mode, requiredMeldsFor } from '../game/modes';
import { shuffleQuestions } from '../game/questionSelector';
import { activeQuestionsForMode } from '../questionBank/storage';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { HandView } from '../components/HandView';
import { RatingButtons } from '../components/RatingButtons';
import { currentQuestion, initPractice, practiceReducer } from './gamePageLogic';

export interface GamePageProps {
  mode: Mode;
  debug: boolean;
  onExit: () => void;
}

/**
 * 牌效練習模式（Practice Mode）＋ Correct/Wrong 判定。
 *
 * 沒有計時、沒有分數、沒有結算畫面（永久移除）。
 * 玩家不限時間選一張打牌 → 以 Existing Game Engine 的
 * analysis.bestDiscards 判定答對/答錯（唯一判定來源；多個並列
 * 答案全部算對）→ 顯示原版綠/紅 verdict 與全部打牌選擇的分析
 *（accepted 答案綠色＋「正確答案」、選錯的紅色＋「你的選擇」、
 * 其他 neutral）→ 不論對錯，左「返回主畫面」/ 右「下一題」，
 * 無限練習。
 */
export function GamePage({ mode, debug, onExit }: GamePageProps) {
  const melds = requiredMeldsFor(mode);

  // 每一輪把該模式 ACTIVE 題庫洗牌一次；走完一整輪才重新洗（PART AV 不變）
  const [state, dispatch] = useReducer(
    practiceReducer,
    undefined,
    () => initPractice(shuffleQuestions(activeQuestionsForMode(mode))),
  );

  const question = currentQuestion(state);

  const analysis = useMemo(
    () => (question ? analyzeHand(countsFromIds(question.tiles), melds) : null),
    [question, melds],
  );

  if (!question || !analysis) {
    return (
      <div className="page">
        <p className="empty-note">此模式題庫沒有題目，請先到題庫管理新增。</p>
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          返回主畫面
        </button>
      </div>
    );
  }

  const confirm = () => {
    if (state.phase !== 'play' || state.selectedPos === null) return;
    // 唯一判定來源：Existing Game Engine 的 analysis.bestDiscards
    dispatch({ type: 'confirm', bestDiscards: analysis.bestDiscards });
    // 約 220ms 的出牌動畫後顯示 verdict + 分析
    window.setTimeout(() => dispatch({ type: 'revealed' }), 220);
  };

  const next = () => {
    dispatch({ type: 'next', reshuffled: shuffleQuestions(activeQuestionsForMode(mode)) });
  };

  const inReveal =
    state.phase === 'reveal' && state.chosen !== null && state.answerVerdict !== 'unanswered';

  return (
    <div className="page page--game">
      <header className="game-topbar">
        <button type="button" className="wordmark" onClick={onExit}>
          聽牌訓練
        </button>
        <div className="game-topbar__stats">
          <span className="stat-pill">{mode} 張</span>
          <span className="stat-item">
            第 <b>{state.questionNo}</b> 題
          </span>
          <span className="stat-item stat-item--muted">牌效練習</span>
        </div>
      </header>

      <main className="game-main">
        {!inReveal && <p className="game-prompt">請選擇最佳打牌</p>}

        {inReveal && (
          <VerdictBanner
            verdict={state.answerVerdict as 'correct' | 'wrong'}
            chosen={state.chosen!}
            bestDiscards={analysis.bestDiscards}
          />
        )}

        <HandView
          tiles={question.tiles}
          selectedPos={state.phase === 'play' ? state.selectedPos : null}
          onSelect={state.phase === 'play' ? (pos) => dispatch({ type: 'select', pos }) : undefined}
          discardingPos={state.phase === 'submitting' ? state.selectedPos : null}
          playedPos={inReveal ? state.selectedPos : null}
        />

        {state.phase === 'play' && (
          <div className="confirm-bar">
            <span className="confirm-bar__selected">
              {state.selectedPos !== null
                ? `已選擇：${tileName(tileIndexOf(question.tiles[state.selectedPos]))}`
                : '點擊一張牌'}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={state.selectedPos === null}
              onClick={confirm}
            >
              確認打出
            </button>
          </div>
        )}

        {inReveal && (
          <PracticeReveal
            questionId={question.id}
            analysis={analysis}
            chosen={state.chosen!}
            onExit={onExit}
            onNext={next}
          />
        )}

        {debug && (
          <details className="debug-panel">
            <summary>Debug：引擎分析</summary>
            <p className="debug-panel__line">
              原始牌：<code>{toNotation(countsFromIds(question.tiles))}</code>
              　計算耗時：<code>{analysis.elapsedMs.toFixed(1)}ms</code>
              　最佳：<code>{analysis.bestDiscards.map((t) => tileIdOf(t)).join(', ')}</code>
              （max {analysis.maxTotal}）
            </p>
            <table className="debug-panel__table">
              <thead>
                <tr>
                  <th>第一次打牌</th>
                  <th>有效進張（×剩餘枚數）</th>
                  <th>種類</th>
                  <th>總枚數</th>
                </tr>
              </thead>
              <tbody>
                {analysis.options.map((o) => (
                  <tr key={o.discard} className={o.isBest ? 'is-best' : ''}>
                    <td>{tileIdOf(o.discard)}</td>
                    <td>
                      {o.ukeire.map((e) => `${tileIdOf(e.tile)}×${e.remaining}`).join(' ')}
                    </td>
                    <td>{o.kinds}</td>
                    <td>{o.totalRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </main>
    </div>
  );
}

/**
 * 原版 Correct / Wrong verdict panel（改版前 GamePage 的
 * .verdict / verdict--ok / verdict--err / verdict__mark / verdict__detail
 * 結構與 class 原樣恢復；「最佳打牌」措辭依規格改為「正確答案」）。
 */
export function VerdictBanner({
  verdict,
  chosen,
  bestDiscards,
}: {
  verdict: 'correct' | 'wrong';
  chosen: TileIndex;
  bestDiscards: readonly TileIndex[];
}) {
  return (
    <div
      className={`verdict ${verdict === 'correct' ? 'verdict--ok' : 'verdict--err'}`}
      role="status"
    >
      {verdict === 'correct' ? (
        <>
          <span className="verdict__mark">✓ 正確</span>
          <span className="verdict__detail">
            你的選擇：{tileName(chosen)}
            {bestDiscards.length > 1 && (
              <>
                <i className="dot" />
                並列正確答案：{bestDiscards.map((t) => tileName(t)).join('、')}
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="verdict__mark">✕ 選擇錯誤</span>
          <span className="verdict__detail">
            你的選擇：{tileName(chosen)}
            <i className="dot" />
            正確答案：{bestDiscards.map((t) => tileName(t)).join('、')}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * 回答後的分析區：完整牌效分析（accepted＝綠＋「正確答案」、
 * 選錯＝紅＋「你的選擇」、其他 neutral）＋ Star/Trash ＋
 * 固定 navigation——不論答對答錯都是同樣的
 * 左「返回主畫面」/ 右「下一題」。
 */
export function PracticeReveal({
  questionId,
  analysis,
  chosen,
  onExit,
  onNext,
}: {
  questionId: string;
  analysis: HandAnalysis;
  chosen: TileIndex;
  onExit: () => void;
  onNext: () => void;
}) {
  return (
    <section className="reveal">
      <div className="reveal__toprow">
        <h3 className="reveal__heading">參考分析（全部打牌選擇）</h3>
        <RatingButtons questionId={questionId} />
      </div>
      <AnalysisPanel analysis={analysis} chosen={chosen} bestLabel="正確答案" />

      <div className="reveal__actions reveal__actions--practice">
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          返回主畫面
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          下一題
        </button>
      </div>
    </section>
  );
}
