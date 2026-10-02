import { useEffect, useMemo, useState } from 'react';
import {
  type HandAnalysis,
  analyzeHand,
  countsFromIds,
  emptyCounts,
  sortTiles,
  tileIdOf,
  tileIndexOf,
  tileName,
  toNotation,
  type TileId,
} from '../engine';
import { MODE_INFO, type Mode, requiredMeldsFor } from '../game/modes';
import { addManualQuestions, existingKeysForMode } from '../questionBank/storage';
import { computeManualMetadata } from '../questionBank/manualMeta';
import { isAdmin } from '../auth/roles';
import { parseBatchText } from '../questionBank/parser';
import { precheckQuestion, validateQuestionTiles } from '../questionBank/validation';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { MahjongTile } from '../components/MahjongTile';
import { TilePicker } from '../components/TilePicker';

export interface AddQuestionPageProps {
  initialMode: Mode | null;
  onBack: () => void;
  onHome: () => void;
}

interface PreviewItem {
  label: string;
  raw: string;
  tiles: TileId[] | null;
  errors: string[];
  key: string | null;
  /** pending = 等待引擎計算；ready = 可加入；invalid = 有錯誤 */
  status: 'pending' | 'ready' | 'invalid';
  analysis: HandAnalysis | null;
}

export function AddQuestionPage({ initialMode, onBack, onHome }: AddQuestionPageProps) {
  const [mode, setMode] = useState<Mode | null>(initialMode);
  const [method, setMethod] = useState<'picker' | 'text'>('picker');
  const [picked, setPicked] = useState<TileId[]>([]);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bankVersion, setBankVersion] = useState(0);

  const existingKeys = useMemo(
    () => (mode ? existingKeysForMode(mode) : new Set<string>()),
    [mode, bankVersion],
  );

  const pickedCounts = useMemo(() => {
    const counts = emptyCounts();
    for (const id of picked) counts[tileIndexOf(id)]++;
    return counts;
  }, [picked]);

  // 引擎預檢逐題進行（避免大批量一次卡住 UI）
  useEffect(() => {
    if (!preview || !mode) return;
    const nextIndex = preview.findIndex((p) => p.status === 'pending');
    if (nextIndex === -1) return;
    const timer = window.setTimeout(() => {
      setPreview((cur) => {
        if (!cur) return cur;
        const item = cur[nextIndex];
        if (!item || item.status !== 'pending' || !item.tiles) return cur;
        const counts = countsFromIds(item.tiles);
        const melds = requiredMeldsFor(mode);
        const precheck = precheckQuestion(counts, mode);
        const analysis = analyzeHand(counts, melds);
        const updated: PreviewItem = precheck.ok
          ? { ...item, status: 'ready', analysis }
          : { ...item, status: 'invalid', errors: [precheck.reason!], analysis };
        return cur.map((p, i) => (i === nextIndex ? updated : p));
      });
    }, 10);
    return () => window.clearTimeout(timer);
  }, [preview, mode]);

  // Privileged action：手動新增為 ADMIN 專屬（統一權限層，PART AJ/AK）
  if (!isAdmin()) {
    return (
      <div className="page page--add">
        <Topbar onHome={onHome} />
        <p className="empty-note">需要管理者權限才能新增題目。</p>
      </div>
    );
  }

  if (mode === null) {
    return (
      <div className="page page--add">
        <Topbar onHome={onHome} />
        <h3 className="section-heading">第一步：選擇題目模式</h3>
        <div className="mode-grid mode-grid--compact">
          {MODE_INFO.map((info) => (
            <button
              key={info.mode}
              type="button"
              className="mode-card"
              onClick={() => setMode(info.mode)}
            >
              <span className="mode-card__num">{info.mode}</span>
              <span className="mode-card__unit">張</span>
              <span className="mode-card__formula">{info.formula}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const buildPreview = (
    items: { label: string; raw: string; tiles: TileId[] | null; parseError: string | null }[],
  ) => {
    setMessage(null);
    const batchKeys = new Set<string>();
    const built: PreviewItem[] = items.map((item) => {
      if (!item.tiles) {
        return {
          label: item.label,
          raw: item.raw,
          tiles: null,
          errors: [item.parseError ?? '無法解析'],
          key: null,
          status: 'invalid',
          analysis: null,
        };
      }
      const validation = validateQuestionTiles(item.tiles, mode, existingKeys);
      const errors = [...validation.errors];
      if (validation.key && batchKeys.has(validation.key)) {
        errors.push('與本次輸入中的另一題重複');
      }
      if (validation.key) batchKeys.add(validation.key);
      return {
        label: item.label,
        raw: item.raw,
        tiles: sortTiles(item.tiles.map(tileIndexOf)).map(tileIdOf),
        errors,
        key: validation.key,
        status: errors.length > 0 ? 'invalid' : 'pending',
        analysis: null,
      };
    });
    setPreview(built);
  };

  const previewFromPicker = () => {
    buildPreview([
      {
        label: '選牌輸入',
        raw: toNotation(pickedCounts),
        tiles: picked,
        parseError: null,
      },
    ]);
  };

  const previewFromText = () => {
    const lines = parseBatchText(text);
    if (lines.length === 0) {
      setMessage('請先輸入至少一行牌');
      setPreview(null);
      return;
    }
    buildPreview(
      lines.map((line) => ({
        label: `第 ${line.lineNumber} 行`,
        raw: line.raw,
        tiles: line.result.ok ? line.result.tiles : null,
        parseError: line.result.ok ? null : line.result.error,
      })),
    );
  };

  const readyItems = preview?.filter((p) => p.status === 'ready') ?? [];
  const pendingCount = preview?.filter((p) => p.status === 'pending').length ?? 0;
  const invalidCount = preview?.filter((p) => p.status === 'invalid').length ?? 0;

  const confirmAdd = () => {
    if (readyItems.length === 0) return;
    // MANUAL 題目：引擎可正常分析才會到這裡；metadata 能算就一併保存
    const added = addManualQuestions(
      readyItems.map((p) => ({
        mode,
        tiles: p.tiles!,
        meta: computeManualMetadata(countsFromIds(p.tiles!), mode) ?? undefined,
      })),
    );
    setMessage(
      `已加入 ${added.length} 題到 ${mode} 張題庫（來源 MANUAL）` +
        (invalidCount > 0 ? `，跳過 ${invalidCount} 題` : ''),
    );
    setPreview(null);
    setPicked([]);
    setText('');
    setBankVersion((v) => v + 1);
  };

  const pickTile = (id: TileId) => {
    if (picked.length >= mode) return;
    setPreview(null);
    setPicked((cur) => sortTiles([...cur, id].map(tileIndexOf)).map(tileIdOf));
  };

  const removeTileAt = (pos: number) => {
    setPreview(null);
    setPicked((cur) => cur.filter((_, i) => i !== pos));
  };

  return (
    <div className="page page--add">
      <Topbar onHome={onHome} />

      <div className="add-header">
        <h3 className="section-heading">新增題目 · {mode} 張模式</h3>
        <div className="add-header__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setMode(null);
              setPicked([]);
              setPreview(null);
              setMessage(null);
            }}
          >
            更換模式
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            回管理主控台
          </button>
        </div>
      </div>

      <div className="method-tabs" role="tablist" aria-label="輸入方式">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'picker'}
          className={`method-tab${method === 'picker' ? ' is-active' : ''}`}
          onClick={() => setMethod('picker')}
        >
          視覺選牌
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'text'}
          className={`method-tab${method === 'text' ? ' is-active' : ''}`}
          onClick={() => setMethod('text')}
        >
          文字輸入
        </button>
      </div>

      {method === 'picker' ? (
        <section className="add-picker">
          <TilePicker counts={pickedCounts} onPick={pickTile} full={picked.length >= mode} />

          <div className="picked-area">
            <p className="picked-area__count">
              目前 <b className="num">{picked.length}</b> / {mode} 張
              {picked.length > 0 && <span className="picked-area__hint">（點擊已選的牌可移除）</span>}
            </p>
            <div className="picked-area__tiles">
              {picked.length === 0 ? (
                <p className="empty-note">從上方選牌，會自動排序。</p>
              ) : (
                picked.map((t, i) => (
                  <MahjongTile
                    key={`${t}-${i}`}
                    tile={t}
                    size="picker"
                    onClick={() => removeTileAt(i)}
                    title={`移除 ${tileName(tileIndexOf(t))}`}
                  />
                ))
              )}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={picked.length !== mode}
              onClick={previewFromPicker}
            >
              檢查並預覽
            </button>
          </div>
        </section>
      ) : (
        <section className="add-text">
          <textarea
            className="input add-text__area"
            rows={6}
            placeholder={'一行一題，例如：\n123m456p789s11223z\n23m 5578p EE'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            aria-label="文字輸入題目"
          />
          <details className="notation-help">
            <summary>Notation 說明</summary>
            <ul>
              <li>
                數字牌：數字串＋小寫字母 <code>m</code>=萬 <code>p</code>=筒 <code>s</code>=索，
                例如 <code>123m45p67s</code>
              </li>
              <li>
                字牌寫法一：<code>1z</code>=東 <code>2z</code>=南 <code>3z</code>=西{' '}
                <code>4z</code>=北 <code>5z</code>=白 <code>6z</code>=發 <code>7z</code>=中
              </li>
              <li>
                字牌寫法二（大寫字母）：<code>E</code>=東 <code>S</code>=南 <code>W</code>=西{' '}
                <code>N</code>=北 <code>P</code>=白 <code>F</code>=發 <code>C</code>=中
              </li>
              <li>大小寫有意義：小寫 p/s 是筒/索，大寫 P/S 是白板/南風</li>
              <li>沒有赤五：不支援 0m / 0p / 0s；空白可自由加入；一行＝一題</li>
              <li>手動新增【允許字牌】（自動生成題庫 V1 不含字牌，此限制不適用於手動題）</li>
            </ul>
          </details>
          <button type="button" className="btn btn--primary" onClick={previewFromText}>
            解析預覽
          </button>
        </section>
      )}

      {message && <p className="add-message" role="status">{message}</p>}

      {preview && (
        <section className="preview">
          <h3 className="section-heading">
            預覽（{preview.length} 題
            {pendingCount > 0 && `，引擎計算中 ${pendingCount} 題…`}）
          </h3>
          <ol className="preview__list">
            {preview.map((item, i) => (
              <PreviewCard key={i} item={item} mode={mode} />
            ))}
          </ol>
          <div className="preview__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={readyItems.length === 0 || pendingCount > 0}
              onClick={confirmAdd}
            >
              加入題庫（{readyItems.length} 題）
            </button>
            {invalidCount > 0 && (
              <span className="preview__skip-note">{invalidCount} 題有問題，將被跳過</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Topbar({ onHome }: { onHome: () => void }) {
  return (
    <header className="page-topbar">
      <button type="button" className="wordmark" onClick={onHome}>
        聽牌訓練
      </button>
      <h2 className="page-topbar__title">新增題目</h2>
    </header>
  );
}

function PreviewCard({ item, mode }: { item: PreviewItem; mode: Mode }) {
  const tileCount = item.tiles?.length ?? 0;
  const parseOk = item.tiles !== null;
  const countOk = parseOk && tileCount === mode;
  const duplicateError = item.errors.find((e) => e.includes('重複'));
  const bestOption = item.analysis?.options[0] ?? null;

  return (
    <li
      className={`preview-card${
        item.status === 'invalid' ? ' is-invalid' : item.status === 'ready' ? ' is-ready' : ''
      }`}
    >
      <div className="preview-card__head">
        <span className="preview-card__label">{item.label}</span>
        <code className="preview-card__raw">{item.raw}</code>
      </div>

      <ul className="preview-checks">
        <Check ok={parseOk} okText="格式正確" failText={item.tiles ? '' : item.errors[0]} />
        {parseOk && (
          <Check
            ok={countOk}
            okText={`張數正確（${mode} 張）`}
            failText={`張數錯誤（目前 ${tileCount} 張）`}
          />
        )}
        {parseOk && countOk && (
          <Check ok={!duplicateError} okText="無重複" failText={duplicateError ?? ''} />
        )}
        {item.status === 'pending' && <li className="check is-pending">… 牌效計算中</li>}
        {item.status === 'ready' && <Check ok okText="牌效計算完成" failText="" />}
        {item.status === 'invalid' &&
          item.errors
            .filter((e) => e !== duplicateError && parseOk)
            .filter((e) => !e.includes('張數'))
            .map((e, i) => <Check key={i} ok={false} okText="" failText={e} />)}
      </ul>

      {item.tiles && (
        <div className="tile-strip">
          {item.tiles.map((t, i) => (
            <MahjongTile key={`${t}-${i}`} tile={t} size="mini" />
          ))}
        </div>
      )}

      {item.analysis && item.status === 'ready' && bestOption && (
        <div className="preview-card__answer">
          <p>
            最佳打牌：
            <span className="fact-tile">
              {item.analysis.bestDiscards.map((t) => (
                <MahjongTile key={t} tile={tileIdOf(t)} size="mini" />
              ))}
              {item.analysis.bestDiscards.map((t) => tileName(t)).join('、')}
            </span>
            <span className="preview-card__stats">
              有效進張 {bestOption.kinds} 種 / {bestOption.totalRemaining} 張
            </span>
          </p>
          <details>
            <summary>完整牌效分析</summary>
            <AnalysisPanel analysis={item.analysis} compact />
          </details>
        </div>
      )}
    </li>
  );
}

function Check({ ok, okText, failText }: { ok: boolean; okText: string; failText: string }) {
  if (ok) {
    return <li className="check is-ok">✓ {okText}</li>;
  }
  if (!failText) return null;
  return <li className="check is-err">✕ {failText}</li>;
}
