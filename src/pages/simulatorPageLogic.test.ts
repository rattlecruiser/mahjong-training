import { describe, expect, it } from 'vitest';
import {
  INITIAL_SIM_STATE,
  MAX_HAND_TILES,
  type SimulatorPageState,
  canAddToHand,
  canAddToKnown,
  canAnalyze,
  combinedCount,
  orderCandidatesForDisplay,
  shantenLabel,
  simulatorPageReducer,
  targetMeldsForHandCount,
} from './simulatorPageLogic';
import { analyzeSimulatorHandFromIds, type SimulatorDiscardCandidate } from '../simulator';
import { ids } from '../testing/hands';
import { tileIndexOf, type TileId } from '../engine';

/**
 * Phase 3 Simulator UI 邏輯測試。
 * 專案無 component-testing framework（依規格不為此引入大型新框架），
 * 因此把頁面全部狀態邏輯抽為 pure reducer / helpers 直接單元測試；
 * 與 Analyzer 的整合測試只比對「UI 顯示值 == Analyzer 輸出」，
 * 不重複實作任何麻將數學。Homepage / 導覽 / 實際操作另以
 * headless Chromium smoke test 驗證。
 */

const add = (s: SimulatorPageState, zone: 'addHand' | 'addKnown', tiles: string[]) =>
  tiles.reduce((cur, t) => simulatorPageReducer(cur, { type: zone, tile: t as TileId }), s);

describe('Test B — 手牌張數', () => {
  it('0 → 1 → 2 …張數正確、自動排序', () => {
    let s = INITIAL_SIM_STATE;
    expect(s.hand).toHaveLength(0);
    s = add(s, 'addHand', ['9s', '1m', '5p']);
    expect(s.hand).toHaveLength(3);
    expect(s.hand).toEqual(['1m', '5p', '9s']); // 沿用現有 tile order
  });

  it('手牌上限 17 張：到達後不能再加，但可移除', () => {
    let s = INITIAL_SIM_STATE;
    s = add(s, 'addHand', ids('123m456m789m123p456p88s'));
    expect(s.hand).toHaveLength(17);
    expect(canAddToHand(s, '9s')).toBe(false);
    const blocked = simulatorPageReducer(s, { type: 'addHand', tile: '9s' });
    expect(blocked.hand).toHaveLength(17);
    const removed = simulatorPageReducer(s, { type: 'removeHand', pos: 0 });
    expect(removed.hand).toHaveLength(16);
  });
});

describe('Test C / D — 可分析張數與自動 targetMelds mapping', () => {
  it('只有 5/8/11/14/17 可分析', () => {
    const validCounts = [5, 8, 11, 14, 17];
    for (let n = 0; n <= 17; n++) {
      const expected = validCounts.includes(n);
      expect(targetMeldsForHandCount(n) !== null, `${n} 張`).toBe(expected);
    }
  });

  it('mapping：5→1、8→2、11→3、14→4、17→5', () => {
    expect(targetMeldsForHandCount(5)).toBe(1);
    expect(targetMeldsForHandCount(8)).toBe(2);
    expect(targetMeldsForHandCount(11)).toBe(3);
    expect(targetMeldsForHandCount(14)).toBe(4);
    expect(targetMeldsForHandCount(17)).toBe(5);
  });

  it('canAnalyze 依張數', () => {
    let s = add(INITIAL_SIM_STATE, 'addHand', ids('123m55p')); // 5 張
    expect(canAnalyze(s)).toBe(true);
    s = simulatorPageReducer(s, { type: 'addHand', tile: '9s' }); // 6 張
    expect(canAnalyze(s)).toBe(false);
  });
});

describe('Test E — Hand + Known 同牌 4 張上限（第五張之前就擋）', () => {
  it('Hand 3 + Known 1 → 兩邊都不能再加該牌', () => {
    let s = add(INITIAL_SIM_STATE, 'addHand', ['5m', '5m', '5m']);
    s = add(s, 'addKnown', ['5m']);
    expect(combinedCount(s, '5m')).toBe(4);
    expect(canAddToHand(s, '5m')).toBe(false);
    expect(canAddToKnown(s, '5m')).toBe(false);
    // reducer 也拒絕（雙保險；Analyzer validation 仍是 final layer）
    expect(simulatorPageReducer(s, { type: 'addHand', tile: '5m' }).hand).toHaveLength(3);
    expect(simulatorPageReducer(s, { type: 'addKnown', tile: '5m' }).known).toHaveLength(1);
    // 其他牌不受影響
    expect(canAddToHand(s, '6m')).toBe(true);
  });
});

describe('Test F / G — 移除與清空', () => {
  it('點擊已選牌只移除一張（不是全部同名）', () => {
    let s = add(INITIAL_SIM_STATE, 'addHand', ['5m', '5m', '5m']);
    s = simulatorPageReducer(s, { type: 'removeHand', pos: 1 });
    expect(s.hand).toEqual(['5m', '5m']);
  });

  it('清空手牌只清 Hand；清空已知牌只清 Known', () => {
    let s = add(INITIAL_SIM_STATE, 'addHand', ['1m', '2m']);
    s = add(s, 'addKnown', ['9p', '9p']);
    const clearedHand = simulatorPageReducer(s, { type: 'clearHand' });
    expect(clearedHand.hand).toHaveLength(0);
    expect(clearedHand.known).toEqual(['9p', '9p']);
    const clearedKnown = simulatorPageReducer(s, { type: 'clearKnown' });
    expect(clearedKnown.known).toHaveLength(0);
    expect(clearedKnown.hand).toEqual(['1m', '2m']);
  });
});

describe('Test H — 修改 Hand / Known 即清除舊分析結果', () => {
  const analyzed = (): SimulatorPageState => {
    const base = add(INITIAL_SIM_STATE, 'addHand', ids('223m456p55s'));
    const result = analyzeSimulatorHandFromIds(base.hand, base.known, 2);
    return simulatorPageReducer(base, { type: 'analyzed', result });
  };

  const mutations: [string, (s: SimulatorPageState) => SimulatorPageState][] = [
    ['addHand', (s) => simulatorPageReducer(s, { type: 'addHand', tile: '9s' })],
    ['removeHand', (s) => simulatorPageReducer(s, { type: 'removeHand', pos: 0 })],
    ['clearHand', (s) => simulatorPageReducer(s, { type: 'clearHand' })],
    ['addKnown', (s) => simulatorPageReducer(s, { type: 'addKnown', tile: '1m' })],
    ['clearKnown', (s) => simulatorPageReducer(s, { type: 'clearKnown' })],
  ];

  for (const [label, mutate] of mutations) {
    it(`${label} → result 清除`, () => {
      const s = analyzed();
      expect(s.result).not.toBeNull();
      expect(mutate(s).result).toBeNull();
    });
  }

  it('removeKnown → result 清除', () => {
    let s = add(INITIAL_SIM_STATE, 'addHand', ids('223m456p55s'));
    s = add(s, 'addKnown', ['1m']);
    const result = analyzeSimulatorHandFromIds(s.hand, s.known, 2);
    s = simulatorPageReducer(s, { type: 'analyzed', result });
    expect(s.result).not.toBeNull();
    expect(simulatorPageReducer(s, { type: 'removeKnown', pos: 0 }).result).toBeNull();
  });
});

describe('Test I / J / K — UI 顯示值 == Analyzer 輸出（不重算數學）', () => {
  it('shantenLabel 只是 Analyzer 數字的中文轉換', () => {
    expect(shantenLabel(-1)).toBe('已完成'); // Test O
    expect(shantenLabel(0)).toBe('聽牌'); // Test L
    expect(shantenLabel(1)).toBe('一向聽');
    expect(shantenLabel(2)).toBe('二向聽');
    expect(shantenLabel(5)).toBe('五向聽');
  });

  it('orderCandidatesForDisplay：與 Analyzer 相同物件、isBest 不被改寫、最佳自然置頂', () => {
    const result = analyzeSimulatorHandFromIds(ids('23m456789p555s'), ids('1111m444m'), 3);
    const ordered = orderCandidatesForDisplay(result.candidates);
    // 與 Analyzer 相同的物件（reference 相等）——只重排、不重算
    expect(new Set(ordered)).toEqual(new Set(result.candidates));
    for (const c of ordered) {
      expect(c.isBest).toBe(result.candidates.find((o) => o.discard === c.discard)!.isBest);
    }
    // 最佳 = min shanten + max ukeire，因此排序後必然置頂
    const bestCount = result.candidates.filter((c) => c.isBest).length;
    expect(bestCount).toBe(2); // Analyzer 判定 2m/3m 並列（Test K 案例）
    for (let i = 0; i < bestCount; i++) expect(ordered[i].isBest).toBe(true);
    // 全列表遵守：shanten 遞增；同 shanten 內 ukeire 遞減
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      expect(
        prev.postDiscardShanten < cur.postDiscardShanten ||
          (prev.postDiscardShanten === cur.postDiscardShanten &&
            prev.totalUkeireCopies >= cur.totalUkeireCopies),
      ).toBe(true);
    }
  });

  it('Test K：UI 只跟隨 Analyzer——Known 改變 best 時 UI 標示跟著 Analyzer', () => {
    const before = analyzeSimulatorHandFromIds(ids('23m456789p555s'), null, 3);
    const after = analyzeSimulatorHandFromIds(ids('23m456789p555s'), ids('1111m444m'), 3);
    expect(before.bestDiscards).toEqual([tileIndexOf('5s')]);
    expect(after.bestDiscards).toEqual([tileIndexOf('2m'), tileIndexOf('3m')]);
    // UI 顯示的最佳＝Analyzer bestDiscards（displayed = ordered 前段）
    const orderedAfter = orderCandidatesForDisplay(after.candidates);
    expect(orderedAfter.slice(0, 2).map((c) => c.discard)).toEqual(after.bestDiscards);
  });

  it('Test I：candidate 顯示欄位一律取自 Analyzer 輸出欄位', () => {
    const state = add(INITIAL_SIM_STATE, 'addHand', ids('223m456p55s'));
    const result = analyzeSimulatorHandFromIds(state.hand, state.known, 2);
    const s = simulatorPageReducer(state, { type: 'analyzed', result });
    // UI 渲染來源即 state.result（同一物件），這裡驗證欄位一致性
    expect(s.result).toBe(result);
    for (const c of s.result!.candidates) {
      expect(c.effectiveTileTypeCount).toBe(c.effectiveDraws.length);
      expect(c.totalUkeireCopies).toBe(
        c.effectiveDraws.reduce((sum, e) => sum + e.remainingCopies, 0),
      );
    }
  });
});

describe('顯示排序（presentation sorting）— shanten ↑ → ukeire ↓ → stable', () => {
  /**
   * 純排序測試：用合成的 candidate 物件直接驗證排序規則本身。
   * orderCandidatesForDisplay 是純展示層，不看牌面內容，因此
   * 合成物件即可完整覆蓋（與 Analyzer 的整合已在 Test I/J/K 驗證）。
   */
  const mk = (
    discard: number,
    postDiscardShanten: number,
    totalUkeireCopies: number,
    opts: { isBest?: boolean; effectiveTileTypeCount?: number } = {},
  ): SimulatorDiscardCandidate => ({
    discard: discard as SimulatorDiscardCandidate['discard'],
    postDiscardShanten,
    effectiveDraws: [],
    effectiveTileTypeCount: opts.effectiveTileTypeCount ?? 0,
    totalUkeireCopies,
    isBest: opts.isBest ?? false,
  });

  it('① 較低 shanten 的 candidate 排在較高 shanten 前面', () => {
    const twoAway = mk(0, 2, 99); // ukeire 較高也不能贏過較低 shanten
    const tenpai = mk(1, 0, 1);
    const oneAway = mk(2, 1, 50);
    const ordered = orderCandidatesForDisplay([twoAway, oneAway, tenpai]);
    expect(ordered).toEqual([tenpai, oneAway, twoAway]);
  });

  it('② 相同 shanten：totalUkeireCopies 由高至低（58 → 57 → 54）', () => {
    const a54 = mk(0, 2, 54);
    const a58 = mk(1, 2, 58);
    const a57 = mk(2, 2, 57);
    const ordered = orderCandidatesForDisplay([a54, a58, a57]);
    expect(ordered.map((c) => c.totalUkeireCopies)).toEqual([58, 57, 54]);
  });

  it('③ shanten 與 ukeire 完全相同：維持原本 Analyzer 順序（stable）', () => {
    const first = mk(3, 1, 20);
    const second = mk(1, 1, 20);
    const third = mk(8, 1, 20);
    const ordered = orderCandidatesForDisplay([first, second, third]);
    expect(ordered).toEqual([first, second, third]); // 不因 tile value 重排
  });

  it('④ effectiveTileTypeCount 不影響排序（只比 shanten 與總枚數）', () => {
    const manyTypes = mk(0, 1, 20, { effectiveTileTypeCount: 9 });
    const fewTypes = mk(1, 1, 20, { effectiveTileTypeCount: 1 });
    // 完全平手 → 維持原順序，種類數多寡不介入
    expect(orderCandidatesForDisplay([manyTypes, fewTypes])).toEqual([manyTypes, fewTypes]);
    expect(orderCandidatesForDisplay([fewTypes, manyTypes])).toEqual([fewTypes, manyTypes]);
  });

  it('⑤ 不重新計算 isBest：物件原樣輸出（含「非最佳排最前」的人造情境）', () => {
    // 人造情境：isBest=false 的 candidate 排到最前面，也不能被改寫或重判
    const notBestButFirst = mk(0, 0, 30, { isBest: false });
    const bestButLater = mk(1, 1, 40, { isBest: true });
    const ordered = orderCandidatesForDisplay([bestButLater, notBestButFirst]);
    expect(ordered[0]).toBe(notBestButFirst); // reference 相等：同一物件
    expect(ordered[1]).toBe(bestButLater);
    expect(ordered[0].isBest).toBe(false); // 排序不改動 isBest
    expect(ordered[1].isBest).toBe(true);
  });

  it('⑥ 多個 isBest=true 並列時全部保留 isBest（UI 全部顯示「最佳」）', () => {
    const result = analyzeSimulatorHandFromIds(ids('23m456789p555s'), ids('1111m444m'), 3);
    const ordered = orderCandidatesForDisplay(result.candidates);
    const bestRows = ordered.filter((c) => c.isBest);
    expect(bestRows.length).toBe(2); // Analyzer 判定 2m / 3m 並列最佳
    expect(bestRows.map((c) => c.discard)).toEqual(result.bestDiscards);
    // 並列最佳＝同 shanten 同 ukeire，全部位於列表最前端
    expect(ordered.slice(0, bestRows.length).every((c) => c.isBest)).toBe(true);
  });
});

describe('Test L / M — 聽牌與 0 可摸胡牌張的顯示語意', () => {
  it('postDiscardShanten = 0 → label「聽牌」，胡牌張 resultingShanten 全為 -1', () => {
    const result = analyzeSimulatorHandFromIds(ids('223m456p55s'), null, 2);
    const c = result.candidates.find((x) => x.discard === tileIndexOf('2m'))!;
    expect(shantenLabel(c.postDiscardShanten)).toBe('聽牌');
    for (const e of c.effectiveDraws) expect(e.resultingShanten).toBe(-1);
  });

  it('structurally 聽牌但可摸胡牌張 0：仍顯示聽牌、枚數 0（不改判非聽牌）', () => {
    // 打 2m 後聽 1m/4m；Known 把 1m×4 + 4m×4 全遮掉
    const result = analyzeSimulatorHandFromIds(ids('223m456p55s'), ids('1111m4444m'), 2);
    const c = result.candidates.find((x) => x.discard === tileIndexOf('2m'))!;
    expect(c.postDiscardShanten).toBe(0); // 仍是聽牌（結構）
    expect(c.effectiveDraws).toHaveLength(0);
    expect(c.totalUkeireCopies).toBe(0);
    expect(shantenLabel(c.postDiscardShanten)).toBe('聽牌');
  });
});

describe('Reducer 其他保護', () => {
  it('MAX_HAND_TILES = 17', () => {
    expect(MAX_HAND_TILES).toBe(17);
  });
  it('analyzeFailed 設定 error、清除 result', () => {
    const s = simulatorPageReducer(INITIAL_SIM_STATE, {
      type: 'analyzeFailed',
      message: '測試錯誤',
    });
    expect(s.error).toBe('測試錯誤');
    expect(s.result).toBeNull();
  });
});
