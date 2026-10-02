import { useMemo, useState } from 'react';
import { MODE_INFO, type Mode } from '../game/modes';
import { bankCounts } from '../questionBank/storage';
import type { Role } from '../auth/roles';

/**
 * 首頁卡片的【顯示順序】：8 → 11 → 14 → 17 由小到大。
 * 純 presentation order——每張卡片仍對應原本的 mode / 題庫 / 規則，
 * 不改變 MODES / MODE_INFO 本身的定義與 mapping。
 */
const HOME_MODE_ORDER = [...MODE_INFO].sort((a, b) => a.mode - b.mode);

export interface HomePageProps {
  role: Role;
  onStart: (mode: Mode) => void;
  /** 進入牌效模擬器。 */
  onSimulator: () => void;
  /** ADMIN：開啟題庫管理主控台。 */
  onAdmin: () => void;
  onRoleChange: (role: Role) => void;
}

export function HomePage({ role, onStart, onSimulator, onAdmin, onRoleChange }: HomePageProps) {
  const [selected, setSelected] = useState<Mode>(17);
  const [confirmingAdmin, setConfirmingAdmin] = useState(false);
  const counts = useMemo(() => bankCounts(), []);
  const empty = counts[selected] === 0;
  const isAdmin = role === 'ADMIN';

  return (
    <div className="page page--home">
      <header className="hero">
        <h1 className="hero__title">聽牌訓練</h1>
        <p className="hero__sub">TENPAI TRAINING</p>
        <p className="hero__desc">選出有效進張最多的最佳打牌</p>
      </header>

      <div className="mode-grid" role="radiogroup" aria-label="選擇模式">
        {HOME_MODE_ORDER.map((info) => (
          <button
            key={info.mode}
            type="button"
            role="radio"
            aria-checked={selected === info.mode}
            className={`mode-card${selected === info.mode ? ' is-active' : ''}`}
            onClick={() => setSelected(info.mode)}
          >
            <span className="mode-card__num">{info.mode}</span>
            <span className="mode-card__unit">張</span>
            <span className="mode-card__formula">{info.formula}</span>
            <span className="mode-card__count">{counts[info.mode]} 題</span>
          </button>
        ))}
      </div>

      <div className="home-actions">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={empty}
          onClick={() => onStart(selected)}
        >
          開始訓練
        </button>
        {empty && <p className="home-actions__hint">此模式目前沒有可用題目</p>}
        {isAdmin && (
          <button type="button" className="btn btn--ghost" onClick={onAdmin}>
            題庫管理（管理者）
          </button>
        )}
      </div>

      <section className="sim-entry">
        <div className="sim-entry__text">
          <h2 className="sim-entry__title">牌效模擬器</h2>
          <p className="sim-entry__desc">自由輸入手牌，計算向聽數與最高有效進張</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onSimulator}>
          進入模擬器
        </button>
      </section>

      <footer className="home-role">
        {isAdmin ? (
          <>
            <span className="home-role__badge">管理者模式</span>
            <button
              type="button"
              className="home-role__link"
              onClick={() => onRoleChange('USER')}
            >
              切回一般使用者
            </button>
          </>
        ) : confirmingAdmin ? (
          <span className="home-role__confirm">
            進入管理者模式？（可管理題庫、查看回饋統計）
            <button
              type="button"
              className="home-role__link"
              onClick={() => {
                setConfirmingAdmin(false);
                onRoleChange('ADMIN');
              }}
            >
              確認進入
            </button>
            <button
              type="button"
              className="home-role__link"
              onClick={() => setConfirmingAdmin(false)}
            >
              取消
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="home-role__link home-role__link--subtle"
            onClick={() => setConfirmingAdmin(true)}
          >
            管理者模式
          </button>
        )}
      </footer>
    </div>
  );
}
