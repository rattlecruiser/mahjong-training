import { useEffect, useMemo, useState } from 'react';
import { getRole, setRole as persistRole, type Role } from './auth/roles';
import type { Mode } from './game/modes';
import { ensureQuestionBankInitialized } from './questionBank/initialization';
import { AddQuestionPage } from './pages/AddQuestionPage';
import { AdminPage } from './pages/AdminPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { SimulatorPage } from './pages/SimulatorPage';

type Route =
  | { page: 'home' }
  | { page: 'game'; mode: Mode }
  | { page: 'simulator' }
  | { page: 'admin' }
  | { page: 'add'; mode: Mode | null };

export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'home' });
  const [role, setRoleState] = useState<Role>(() => getRole());
  const [ready, setReady] = useState(false);
  const [initNote, setInitNote] = useState<string | null>(null);

  // ?debug=true 才顯示開發用引擎分析（正式 UI 不顯示）
  const debug = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === 'true',
    [],
  );

  // 題庫初始化（PART AG）：只有第一次（meta 未標記 initialized）會
  // 匯入離線 Generator 產生的正式題庫；之後每次啟動、refresh、
  // 換模式、新的一局都直接讀現有 Persistent 題庫，永不重新生成。
  useEffect(() => {
    let cancelled = false;
    ensureQuestionBankInitialized()
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.ran) {
          setInitNote(`已建立初始題庫：匯入 ${outcome.imported} 題正式生成題目`);
        } else if (outcome.patched && (outcome.patchRemoved > 0 || outcome.patchAdded > 0)) {
          setInitNote(
            `題庫維護：移除 ${outcome.patchRemoved} 題（含四張同牌為最佳打牌的題型）、補充 ${outcome.patchAdded} 題`,
          );
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setInitNote('初始題庫匯入失敗，暫時只使用既有題庫');
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeRole = (next: Role) => {
    persistRole(next);
    setRoleState(next);
    if (next === 'USER' && (route.page === 'admin' || route.page === 'add')) {
      setRoute({ page: 'home' });
    }
  };

  const startGame = (mode: Mode) => {
    setRoute({ page: 'game', mode });
  };

  if (!ready) {
    return (
      <div className="page page--boot">
        <p className="boot-text">正在準備題庫…</p>
      </div>
    );
  }

  switch (route.page) {
    case 'home':
      return (
        <>
          {initNote && (
            <div className="init-note" role="status">
              {initNote}
              <button type="button" className="init-note__close" onClick={() => setInitNote(null)}>
                ✕
              </button>
            </div>
          )}
          <HomePage
            role={role}
            onStart={startGame}
            onSimulator={() => setRoute({ page: 'simulator' })}
            onAdmin={() => setRoute({ page: 'admin' })}
            onRoleChange={changeRole}
          />
        </>
      );
    case 'game':
      return (
        <GamePage
          key={route.mode}
          mode={route.mode}
          debug={debug}
          onExit={() => setRoute({ page: 'home' })}
        />
      );
    case 'simulator':
      return <SimulatorPage onHome={() => setRoute({ page: 'home' })} />;
    case 'admin':
      return (
        <AdminPage
          onHome={() => setRoute({ page: 'home' })}
          onManualAdd={(mode) => setRoute({ page: 'add', mode })}
        />
      );
    case 'add':
      return (
        <AddQuestionPage
          initialMode={route.mode}
          onBack={() => setRoute({ page: 'admin' })}
          onHome={() => setRoute({ page: 'home' })}
        />
      );
  }
}
