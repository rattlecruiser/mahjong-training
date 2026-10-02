import { useMemo, useReducer, useState } from 'react';
import {
  emptyCounts,
  tileIdOf,
  tileIndexOf,
  tileName,
  type TileIndex,
} from '../engine';
import { analyzeSimulatorHandFromIds, type SimulatorDiscardCandidate } from '../simulator';
import { MahjongTile } from '../components/MahjongTile';
import { TilePicker } from '../components/TilePicker';
import {
  INITIAL_SIM_STATE,
  MAX_HAND_TILES,
  canAnalyze,
  orderCandidatesForDisplay,
  shantenLabel,
  simulatorPageReducer,
  targetMeldsForHandCount,
} from './simulatorPageLogic';

export interface SimulatorPageProps {
  onHome: () => void;
}

/**
 * 牌效模擬器（Phase 3 UI）。
 *
 * UI 只做三件事：prepare input → call Phase 2 Analyzer → render result。
 * 沒有任何 Shanten / Ukeire / Remaining / Best ranking 的重新實作；
 * 「最佳」完全依 Analyzer 的 isBest / bestDiscards。
 */
export function SimulatorPage({ onHome }: SimulatorPageProps) {
  const [state, dispatch] = useReducer(simulatorPageReducer, INITIAL_SIM_STATE);
  const [expanded, setExpanded] = useState<ReadonlySet<TileIndex>>(new Set());

  // Hand + Known 合計 counts：palette 以此在第五張之前就 disable
  const combinedCounts = useMemo(() => {
    const counts = emptyCounts();
    for (const id of state.hand) counts[tileIndexOf(id)]++;
    for (const id of state.known) counts[tileIndexOf(id)]++;
    return counts;
  }, [state.hand, state.known]);

  const handCount = state.hand.length;
  const analyzable = canAnalyze(state);
  const targetMelds = targetMeldsForHandCount(handCount);

  const analyze = () => {
    const t = targetMeldsForHandCount(state.hand.length);
    if (t === null) return;
    try {
      // 5/8/11/14/17 → targetMelds 1–5（薄 mapping）；數學全在 Analyzer
      const result = analyzeSimulatorHandFromIds(state.hand, state.known, t);
      dispatch({ type: 'analyzed', result });
      setExpanded(new Set(result.bestDiscards)); // 預設展開最佳
    } catch (e) {
      console.error(e); // 保留給開發 console；UI 顯示簡潔訊息
      dispatch({
        type: 'analyzeFailed',
        message: e instanceof Error ? e.message : '分析失敗，請檢查輸入',
      });
    }
  };

  const toggleExpanded = (tile: TileIndex) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(tile)) next.delete(tile);
      else next.add(tile);
      return next;
    });
  };

  return (
    <div className="page page--sim">
      <header className="page-topbar">
        <button type="button" className="wordmark" onClick={onHome}>
          聽牌訓練
        </button>
        <h2 className="page-topbar__title">牌效模擬器</h2>
        <button type="button" className="btn btn--ghost btn--sm sim-back" onClick={onHome}>
          返回首頁
        </button>
      </header>
      <p className="sim-intro">自由輸入手牌，分析向聽數、有效進張與最佳打牌</p>

      {/* ---------------- 手牌 ---------------- */}
      <section className="sim-section">
        <div className="sim-section__head">
          <h3 className="section-heading">手牌</h3>
          <span className="sim-count num">
            目前 <b>{handCount}</b> / {MAX_HAND_TILES} 張
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={handCount === 0}
            onClick={() => dispatch({ type: 'clearHand' })}
          >
            清空手牌
          </button>
        </div>
        <div className="picked-area__tiles sim-selected" aria-label="已選手牌">
          {state.hand.length === 0 ? (
            <p className="empty-note">從下方選牌加入手牌（點擊已選的牌可移除一張）。</p>
          ) : (
            state.hand.map((t, i) => (
              <MahjongTile
                key={`${t}-${i}`}
                tile={t}
                size="picker"
                onClick={() => dispatch({ type: 'removeHand', pos: i })}
                ariaLabel={`移除手牌：${tileName(tileIndexOf(t))}`}
              />
            ))
          )}
        </div>
        {!analyzable && handCount > 0 && (
          <p className="sim-hint">可分析的手牌張數：5、8、11、14、17 張</p>
        )}
        {analyzable && (
          <p className="sim-hint sim-hint--ok">
            {handCount} 張 → {targetMelds} 面子 + 1 對將
          </p>
        )}
        <h4 className="sim-picker-label">選擇手牌</h4>
        <TilePicker
          counts={combinedCounts}
          onPick={(tile) => dispatch({ type: 'addHand', tile })}
          full={handCount >= MAX_HAND_TILES}
          ariaPrefix="加入手牌："
        />
      </section>

      {/* ---------------- 已知牌 ---------------- */}
      <section className="sim-section sim-section--known">
        <div className="sim-section__head">
          <h3 className="section-heading">已知牌</h3>
          <span className="sim-count num">
            目前已知 <b>{state.known.length}</b> 張
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={state.known.length === 0}
            onClick={() => dispatch({ type: 'clearKnown' })}
          >
            清空已知牌
          </button>
        </div>
        <p className="sim-note">
          已知牌會從剩餘牌數中扣除，但<b>不影響手牌向聽數</b>。
          可加入桌面棄牌、吃碰牌、自己已副露的牌等。
        </p>
        <div className="picked-area__tiles sim-selected" aria-label="已選已知牌">
          {state.known.length === 0 ? (
            <p className="empty-note">（選填）從下方加入已知牌。</p>
          ) : (
            state.known.map((t, i) => (
              <MahjongTile
                key={`${t}-${i}`}
                tile={t}
                size="picker"
                onClick={() => dispatch({ type: 'removeKnown', pos: i })}
                ariaLabel={`移除已知牌：${tileName(tileIndexOf(t))}`}
              />
            ))
          )}
        </div>
        <h4 className="sim-picker-label">選擇已知牌</h4>
        <TilePicker
          counts={combinedCounts}
          onPick={(tile) => dispatch({ type: 'addKnown', tile })}
          ariaPrefix="加入已知牌："
        />
      </section>

      {/* ---------------- 分析 ---------------- */}
      <div className="sim-analyze">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={!analyzable}
          onClick={analyze}
        >
          開始分析
        </button>
        {!analyzable && (
          <span className="sim-hint">
            目前 {handCount} 張——需要 5、8、11、14 或 17 張才能分析
          </span>
        )}
      </div>

      {state.error && (
        <p className="sim-error" role="alert">
          {state.error}
        </p>
      )}

      {state.result && (
        <section className="sim-result">
          <h3 className="section-heading">分析結果</h3>
          <p className="sim-result__summary">
            目前手牌 <b className="num">{handCount}</b> 張（{state.result.targetMelds} 面子 + 1 對將）
            <i className="dot" />
            目前狀態：
            <b className={state.result.currentShanten <= 0 ? 'sim-state--good' : ''}>
              {shantenLabel(state.result.currentShanten)}
            </b>
            {state.result.currentState === 'complete' && '（此手牌已是完成形）'}
          </p>

          <ol className="sim-candidates">
            {orderCandidatesForDisplay(state.result.candidates).map((c) => (
              <CandidateRow
                key={c.discard}
                candidate={c}
                expanded={expanded.has(c.discard)}
                onToggle={() => toggleExpanded(c.discard)}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function CandidateRow({
  candidate: c,
  expanded,
  onToggle,
}: {
  candidate: SimulatorDiscardCandidate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tenpai = c.postDiscardShanten === 0;
  const drawsWord = tenpai ? '胡牌張' : '有效進張';

  return (
    <li className={`sim-candidate${c.isBest ? ' is-best' : ''}`}>
      <button type="button" className="sim-candidate__head" aria-expanded={expanded} onClick={onToggle}>
        <span className="sim-candidate__discard">
          <span className="analysis-row__verb">打</span>
          <MahjongTile tile={tileIdOf(c.discard)} size="analysis" />
        </span>
        {c.isBest && <span className="chip chip--best">最佳</span>}
        <span className="sim-candidate__state">{shantenLabel(c.postDiscardShanten)}</span>
        <span className="sim-candidate__stats num">
          {c.effectiveTileTypeCount === 0
            ? tenpai
              ? '目前可摸胡牌張：0 張'
              : '目前無可用有效進張'
            : `${drawsWord} ${c.effectiveTileTypeCount} 種・${c.totalUkeireCopies} 張`}
        </span>
        <span className={`review-row__chevron${expanded ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {expanded && (
        <div className="sim-candidate__body">
          {c.effectiveDraws.length === 0 ? (
            <p className="empty-note">
              {tenpai
                ? '結構上已聽牌，但所有胡牌張都已被看見（剩餘 0 張）。'
                : '目前無可用有效進張。'}
            </p>
          ) : (
            <div className="sim-draws">
              {c.effectiveDraws.map((e) => (
                <span key={e.tile} className="sim-draw">
                  <MahjongTile tile={tileIdOf(e.tile)} size="mini" />
                  <span className="ukeire-item__count">×{e.remainingCopies}</span>
                  <span className="sim-draw__to">
                    →{e.resultingShanten === -1 ? '胡牌' : shantenLabel(e.resultingShanten)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
