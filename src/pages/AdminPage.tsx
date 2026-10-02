import { useMemo, useState } from 'react';
import { analyzeHand, countsFromIds, tileIdOf, tileName, toNotation } from '../engine';
import { MODES, MODE_INFO, type Mode, requiredMeldsFor } from '../game/modes';
import { isAdmin } from '../auth/roles';
import {
  adminBankCounts,
  deleteQuestionPermanently,
  getBankMeta,
  questionsForMode,
  setQuestionStatus,
} from '../questionBank/storage';
import { allFeedbackCounts, type FeedbackCounts } from '../questionBank/feedback';
import {
  adminGenerateAppend,
  adminRebuildGeneratedBank,
} from '../questionBank/adminActions';
import type { StoredQuestion } from '../questionBank/types';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { MahjongTile } from '../components/MahjongTile';

export interface AdminPageProps {
  onHome: () => void;
  onManualAdd: (mode: Mode) => void;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';
type SourceFilter = 'ALL' | 'GENERATED' | 'MANUAL';
type TierFilter = 'ALL' | 'EASY' | 'MEDIUM' | 'HARD' | 'VERY_HARD';
type SortKey = 'quality' | 'difficulty' | 'stars' | 'trash' | 'newest' | 'oldest';

const TIER_LABEL: Record<string, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  VERY_HARD: 'V.Hard',
};

const EMPTY_FB: FeedbackCounts = { star: 0, trash: 0 };

export function AdminPage({ onHome, onManualAdd }: AdminPageProps) {
  const [mode, setMode] = useState<Mode>(17);
  const [version, setVersion] = useState(0); // 資料異動後 +1 重新讀取
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
  const [genVersionFilter, setGenVersionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('quality');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);

  const counts = useMemo(() => adminBankCounts(), [version]);
  const bankMeta = useMemo(() => getBankMeta(), [version]);
  const feedback = useMemo(() => allFeedbackCounts(), [version]);
  const questions = useMemo(() => questionsForMode(mode), [mode, version]);

  const genVersions = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) set.add(q.meta?.generatorVersion ?? '（無 metadata）');
    return [...set].sort();
  }, [questions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = questions.filter((q) => {
      if (statusFilter !== 'ALL' && q.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && q.source !== sourceFilter) return false;
      if (tierFilter !== 'ALL' && q.meta?.difficultyTier !== tierFilter) return false;
      if (
        genVersionFilter !== 'ALL' &&
        (q.meta?.generatorVersion ?? '（無 metadata）') !== genVersionFilter
      ) {
        return false;
      }
      if (term) {
        const notation = toNotation(countsFromIds(q.tiles));
        if (!q.id.toLowerCase().includes(term) && !notation.includes(term)) return false;
      }
      return true;
    });

    const fb = (q: StoredQuestion) => feedback.get(q.id) ?? EMPTY_FB;
    const sorters: Record<SortKey, (a: StoredQuestion, b: StoredQuestion) => number> = {
      quality: (a, b) => (b.meta?.qualityScore ?? -1) - (a.meta?.qualityScore ?? -1),
      difficulty: (a, b) => (b.meta?.difficultyRaw ?? -1) - (a.meta?.difficultyRaw ?? -1),
      stars: (a, b) => fb(b).star - fb(a).star,
      trash: (a, b) => fb(b).trash - fb(a).trash,
      newest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
    };
    rows = [...rows].sort(sorters[sortKey]);
    return rows;
  }, [questions, statusFilter, sourceFilter, tierFilter, genVersionFilter, search, sortKey, feedback]);

  if (!isAdmin()) {
    return (
      <div className="page page--admin">
        <header className="page-topbar">
          <button type="button" className="wordmark" onClick={onHome}>
            聽牌訓練
          </button>
          <h2 className="page-topbar__title">題庫管理</h2>
        </header>
        <p className="empty-note">需要管理者權限。請從首頁進入管理者模式。</p>
      </div>
    );
  }

  const refresh = () => setVersion((v) => v + 1);

  const toggleStatus = (q: StoredQuestion) => {
    setQuestionStatus(q.id, q.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
    refresh();
  };

  const doDelete = (q: StoredQuestion) => {
    deleteQuestionPermanently(q.id);
    setDeleteConfirmId(null);
    setExpandedId((cur) => (cur === q.id ? null : cur));
    refresh();
  };

  return (
    <div className="page page--admin">
      <header className="page-topbar">
        <button type="button" className="wordmark" onClick={onHome}>
          聽牌訓練
        </button>
        <h2 className="page-topbar__title">題庫管理（管理者）</h2>
        <span className="admin-meta">
          {bankMeta.questionBankInitialized
            ? `初始題庫已建立 · generator ${bankMeta.generatorVersion} · seed ${bankMeta.generationSeed} · ${bankMeta.generationConfigVersion}`
            : '初始題庫尚未匯入'}
        </span>
      </header>

      <GeneratorPanel onDone={refresh} />

      <div className="bank-tabs" role="tablist" aria-label="模式">
        {MODE_INFO.map((info) => (
          <button
            key={info.mode}
            type="button"
            role="tab"
            aria-selected={mode === info.mode}
            className={`bank-tab${mode === info.mode ? ' is-active' : ''}`}
            onClick={() => {
              setMode(info.mode);
              setExpandedId(null);
              setDeleteConfirmId(null);
              setVisibleLimit(100);
            }}
          >
            {info.label}
            <span className="bank-tab__count">
              {counts[info.mode].active} 啟用
              {counts[info.mode].disabled > 0 && ` / ${counts[info.mode].disabled} 停用`}
            </span>
          </button>
        ))}
        <button
          type="button"
          className="btn btn--primary btn--sm admin-add-btn"
          onClick={() => onManualAdd(mode)}
        >
          手動新增題目
        </button>
      </div>

      <div className="admin-filters">
        <select className="input input--sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="狀態篩選">
          <option value="ALL">全部狀態</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
        <select className="input input--sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} aria-label="來源篩選">
          <option value="ALL">全部來源</option>
          <option value="GENERATED">GENERATED</option>
          <option value="MANUAL">MANUAL</option>
        </select>
        <select className="input input--sm" value={tierFilter} onChange={(e) => setTierFilter(e.target.value as TierFilter)} aria-label="難度篩選">
          <option value="ALL">全部難度</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
          <option value="VERY_HARD">Very Hard</option>
        </select>
        <select className="input input--sm" value={genVersionFilter} onChange={(e) => setGenVersionFilter(e.target.value)} aria-label="Generator 版本篩選">
          <option value="ALL">全部 generator</option>
          {genVersions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select className="input input--sm" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="排序">
          <option value="quality">品質 高→低</option>
          <option value="difficulty">難度 高→低</option>
          <option value="stars">★ 多→少</option>
          <option value="trash">🗑 多→少</option>
          <option value="newest">最新</option>
          <option value="oldest">最舊</option>
        </select>
        <input
          type="search"
          className="input input--sm admin-filters__search"
          placeholder="搜尋 ID 或牌（例如 456p）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="搜尋題目"
        />
        <span className="admin-filters__count num">{filtered.length} 題</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>沒有符合條件的題目。</p>
        </div>
      ) : (
        <>
          <ol className="admin-list">
            {filtered.slice(0, visibleLimit).map((q) => (
              <AdminRow
                key={q.id}
                question={q}
                feedback={feedback.get(q.id) ?? EMPTY_FB}
                expanded={expandedId === q.id}
                onToggleExpand={() =>
                  setExpandedId((cur) => (cur === q.id ? null : q.id))
                }
                onToggleStatus={() => toggleStatus(q)}
                deleteConfirming={deleteConfirmId === q.id}
                onDeleteRequest={() =>
                  setDeleteConfirmId((cur) => (cur === q.id ? null : q.id))
                }
                onDeleteConfirm={() => doDelete(q)}
              />
            ))}
          </ol>
          {filtered.length > visibleLimit && (
            <div className="admin-more">
              <button type="button" className="btn btn--ghost" onClick={() => setVisibleLimit((n) => n + 200)}>
                顯示更多（尚有 {filtered.length - visibleLimit} 題）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 單列 ---------------- */

function AdminRow({
  question: q,
  feedback,
  expanded,
  onToggleExpand,
  onToggleStatus,
  deleteConfirming,
  onDeleteRequest,
  onDeleteConfirm,
}: {
  question: StoredQuestion;
  feedback: FeedbackCounts;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  deleteConfirming: boolean;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
}) {
  const disabled = q.status === 'DISABLED';
  return (
    <li className={`admin-row${disabled ? ' is-disabled' : ''}`}>
      <div className="admin-row__main">
        <button type="button" className="admin-row__hand" onClick={onToggleExpand} aria-expanded={expanded} title={`查看詳情 ${q.id}`}>
          <span className="tile-strip">
            {q.tiles.map((t, i) => (
              <MahjongTile key={`${t}-${i}`} tile={t} size="mini" />
            ))}
          </span>
        </button>
        <div className="admin-row__facts">
          <span className={`badge ${q.source === 'GENERATED' ? 'badge--gen' : 'badge--manual'}`}>
            {q.source === 'GENERATED' ? '自動' : '手動'}
          </span>
          <span className={`badge ${disabled ? 'badge--off' : 'badge--on'}`}>
            {q.status}
          </span>
          <span className="admin-row__stat num" title="品質分數">
            Q {q.meta ? q.meta.qualityScore : '—'}
          </span>
          <span className="admin-row__stat" title="難度">
            {q.meta ? TIER_LABEL[q.meta.difficultyTier] : '—'}
          </span>
          <span className="admin-row__stat num" title="好題數">★ {feedback.star}</span>
          <span className="admin-row__stat num" title="不佳題數">🗑 {feedback.trash}</span>
        </div>
        <div className="admin-row__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleExpand}>
            {expanded ? '收合' : '詳情'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleStatus}>
            {disabled ? '啟用' : '停用'}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${deleteConfirming ? 'btn--ghost' : 'btn--ghost'}`}
            onClick={onDeleteRequest}
          >
            刪除
          </button>
        </div>
      </div>

      {deleteConfirming && (
        <div className="admin-delete-confirm" role="alertdialog" aria-label="永久刪除確認">
          <p>
            <b>永久刪除</b>此題？此動作無法復原，題目與其 ★/🗑 回饋紀錄都會一併刪除。
            若只是暫時不想出題，建議改用「停用」。
          </p>
          <div className="admin-delete-confirm__actions">
            <button type="button" className="btn btn--danger btn--sm" onClick={onDeleteConfirm}>
              確認永久刪除
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDeleteRequest}>
              取消
            </button>
          </div>
        </div>
      )}

      {expanded && <AdminDetail question={q} feedback={feedback} />}
    </li>
  );
}

/* ---------------- 詳情 ---------------- */

function AdminDetail({ question: q, feedback }: { question: StoredQuestion; feedback: FeedbackCounts }) {
  // Engine Analysis：即時由引擎計算（引擎是唯一答案權威；meta 只是 cache）
  const analysis = useMemo(
    () => analyzeHand(countsFromIds(q.tiles), requiredMeldsFor(q.mode)),
    [q],
  );
  const meta = q.meta;

  return (
    <div className="admin-detail">
      <dl className="admin-detail__grid">
        <div><dt>Question ID</dt><dd><code>{q.id}</code></dd></div>
        <div><dt>模式</dt><dd>{q.mode} 張</dd></div>
        <div><dt>來源 / 狀態</dt><dd>{q.source} / {q.status}</dd></div>
        <div><dt>建立時間</dt><dd>{new Date(q.createdAt).toLocaleString()}</dd></div>
        <div>
          <dt>最佳打牌（引擎即時）</dt>
          <dd className="fact-tile">
            {analysis.bestDiscards.map((t) => (
              <MahjongTile key={t} tile={tileIdOf(t)} size="mini" />
            ))}
            {analysis.bestDiscards.map((t) => tileName(t)).join('、')}（{analysis.maxTotal} 張）
          </dd>
        </div>
        <div><dt>回饋</dt><dd>★ {feedback.star}　🗑 {feedback.trash}</dd></div>
        {meta && (
          <>
            <div>
              <dt>品質</dt>
              <dd className="num">
                {meta.qualityScore}（C {meta.qualityBreakdown.competition} / D {meta.qualityBreakdown.deceptiveness} / S {meta.qualityBreakdown.structural} / X {meta.qualityBreakdown.compoundComplexity} / U {meta.qualityBreakdown.ukeireRichness} / 扣 {meta.qualityBreakdown.penalties}）
              </dd>
            </div>
            <div>
              <dt>難度</dt>
              <dd className="num">{meta.difficultyRaw}（{TIER_LABEL[meta.difficultyTier]}）</dd>
            </div>
            <div>
              <dt>Structure Tags</dt>
              <dd>{meta.structureTags.length > 0 ? meta.structureTags.join('、') : '—'}（主：{meta.primaryStructureArchetype}）</dd>
            </div>
            <div>
              <dt>Decision Tags</dt>
              <dd>{meta.decisionTags.length > 0 ? meta.decisionTags.join('、') : '—'}</dd>
            </div>
            <div><dt>Generator</dt><dd>{meta.generatorVersion}</dd></div>
            <div>
              <dt>Fingerprint</dt>
              <dd><code className="admin-detail__fp">{meta.structuralFingerprint.translation}</code></dd>
            </div>
            {meta.penaltyDetails && Object.keys(meta.penaltyDetails).length > 0 && (
              <div>
                <dt>Penalties</dt>
                <dd>
                  {Object.entries(meta.penaltyDetails)
                    .map(([k, v]) => `${k} −${v}`)
                    .join('、')}
                </dd>
              </div>
            )}
          </>
        )}
        {!meta && (
          <div><dt>Metadata</dt><dd>此題沒有品質 metadata（第一階段既有題或分析不適用）</dd></div>
        )}
      </dl>

      <span className="review-detail__label">Engine Analysis（每個第一打的有效進張 / 剩餘枚數 / 總枚數）</span>
      <AnalysisPanel analysis={analysis} compact />
    </div>
  );
}

/* ---------------- Generator 面板 ---------------- */

function GeneratorPanel({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [perMode, setPerMode] = useState<Record<Mode, number>>({ 8: 5, 11: 5, 14: 5, 17: 5 });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rebuildText, setRebuildText] = useState('');

  const runAppend = async () => {
    setRunning(true);
    setSummary(null);
    setProgress('準備中…');
    try {
      const result = await adminGenerateAppend(perMode, (p) => {
        setProgress(
          `${p.mode} 張：${p.phase === 'seeds' ? '建立 seeds' : p.phase === 'search' ? '搜尋候選' : '選題'}… 高品質候選 ${p.poolSize}，已分析 ${p.analyzed}`,
        );
      });
      setSummary(
        `完成：新增 ${result.added} 題（生成 ${result.generated} 題、去重後加入；seed ${result.seedUsed}；耗時 ${(result.elapsedMs / 1000).toFixed(0)} 秒）`,
      );
      onDone();
    } catch (e) {
      setSummary(`執行失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  const runRebuild = async () => {
    if (rebuildText !== 'REBUILD') return;
    setRunning(true);
    setSummary(null);
    try {
      const result = await adminRebuildGeneratedBank();
      setSummary(
        `重建完成：移除 ${result.removedGenerated} 題自動生成題（含其回饋），重新匯入 ${result.imported} 題。手動題與其回饋完全保留。`,
      );
      setRebuildOpen(false);
      setRebuildText('');
      onDone();
    } catch (e) {
      setSummary(`重建失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="gen-panel">
      <button type="button" className="gen-panel__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Generator（管理者手動執行）{open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="gen-panel__body">
          <p className="gen-panel__note">
            預設為【新增（append）】：新生成題目經引擎驗證、去重、品質與多樣性分析後加入現有題庫，
            不會覆蓋或刪除任何既有題目。啟動時永遠不會自動重新生成。
          </p>
          <div className="gen-panel__targets">
            {MODES.map((m) => (
              <label key={m} className="gen-panel__target">
                {m} 張 +
                <input
                  type="number"
                  className="input input--sm"
                  min={0}
                  max={50}
                  value={perMode[m]}
                  disabled={running}
                  onChange={(e) =>
                    setPerMode((cur) => ({ ...cur, [m]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }))
                  }
                />
                題
              </label>
            ))}
            <button type="button" className="btn btn--primary btn--sm" disabled={running} onClick={runAppend}>
              {running ? '生成中…' : '執行（新增生成題）'}
            </button>
          </div>
          {running && progress && <p className="gen-panel__progress" role="status">{progress}</p>}
          {summary && <p className="gen-panel__summary" role="status">{summary}</p>}

          <div className="gen-panel__rebuild">
            {!rebuildOpen ? (
              <button type="button" className="home-role__link" disabled={running} onClick={() => setRebuildOpen(true)}>
                重建生成題庫（危險操作）
              </button>
            ) : (
              <div className="admin-delete-confirm">
                <p>
                  <b>REBUILD 將刪除所有自動生成（GENERATED）題目與其回饋紀錄</b>，
                  並重新匯入內建 v1 正式生成題庫。手動（MANUAL）題目與其回饋、停用狀態完全保留。
                  此動作無法復原。輸入 <code>REBUILD</code> 以確認：
                </p>
                <div className="admin-delete-confirm__actions">
                  <input
                    type="text"
                    className="input input--sm"
                    value={rebuildText}
                    onChange={(e) => setRebuildText(e.target.value)}
                    placeholder="REBUILD"
                    aria-label="重建確認文字"
                  />
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={rebuildText !== 'REBUILD' || running}
                    onClick={runRebuild}
                  >
                    確認重建
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setRebuildOpen(false);
                      setRebuildText('');
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
