import {
  MAX_COPIES,
  sortTiles,
  tileIdOf,
  tileIndexOf,
  type TileId,
} from '../engine';
import type { SimulatorAnalysis, SimulatorDiscardCandidate } from '../simulator';

/**
 * 牌效模擬器頁面的純邏輯層（Phase 3）。
 *
 * 這裡沒有任何麻將數學：沒有 shanten / ukeire / best ranking 的重新
 * 實作。只有：input 準備（加牌/移牌/上限判斷）、5/8/11/14/17 →
 * targetMelds 的薄 mapping（input context）、以及把 Analyzer 輸出
 * 轉成中文 label 的顯示函式。答案永遠來自 src/simulator/analyzer。
 */

/** 可分析的完整手牌張數 → targetMelds（薄 mapping，非數學重算）。 */
export const VALID_HAND_COUNTS: ReadonlyMap<number, number> = new Map([
  [5, 1],
  [8, 2],
  [11, 3],
  [14, 4],
  [17, 5],
]);

export const MAX_HAND_TILES = 17;

export function targetMeldsForHandCount(count: number): number | null {
  return VALID_HAND_COUNTS.get(count) ?? null;
}

/** Analyzer 的 shanten 數字 → 中文 label（不重新計算）。 */
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function shantenLabel(shanten: number): string {
  if (shanten === -1) return '已完成';
  if (shanten === 0) return '聽牌';
  if (shanten >= 1 && shanten <= 9) return `${CN_NUM[shanten]}向聽`;
  return `${shanten} 向聽`;
}

/* ---------------- 頁面狀態（pure reducer，方便單元測試） ---------------- */

export interface SimulatorPageState {
  hand: TileId[];
  known: TileId[];
  result: SimulatorAnalysis | null;
  error: string | null;
}

export const INITIAL_SIM_STATE: SimulatorPageState = {
  hand: [],
  known: [],
  result: null,
  error: null,
};

export type SimulatorPageAction =
  | { type: 'addHand'; tile: TileId }
  | { type: 'removeHand'; pos: number }
  | { type: 'addKnown'; tile: TileId }
  | { type: 'removeKnown'; pos: number }
  | { type: 'clearHand' }
  | { type: 'clearKnown' }
  | { type: 'analyzed'; result: SimulatorAnalysis }
  | { type: 'analyzeFailed'; message: string };

/** 同一種牌在 Hand + Known 的合計張數。 */
export function combinedCount(state: SimulatorPageState, tile: TileId): number {
  const same = (id: TileId) => id === tile;
  return state.hand.filter(same).length + state.known.filter(same).length;
}

/** Hand palette：手牌未滿 17 且該牌 Hand+Known 未達 4。 */
export function canAddToHand(state: SimulatorPageState, tile: TileId): boolean {
  return state.hand.length < MAX_HAND_TILES && combinedCount(state, tile) < MAX_COPIES;
}

/** Known palette：該牌 Hand+Known 未達 4。 */
export function canAddToKnown(state: SimulatorPageState, tile: TileId): boolean {
  return combinedCount(state, tile) < MAX_COPIES;
}

/** 只有 5/8/11/14/17 張可以開始分析（物理上限由加入時已擋）。 */
export function canAnalyze(state: SimulatorPageState): boolean {
  return targetMeldsForHandCount(state.hand.length) !== null;
}

function sortedInsert(tiles: TileId[], tile: TileId): TileId[] {
  return sortTiles([...tiles, tile].map(tileIndexOf)).map(tileIdOf);
}

/**
 * 任何 Hand / Known 的修改（加、移、清空）都會清除舊分析結果與錯誤，
 * 避免顯示過期的 Remaining / Ukeire（V1：直接清除，重新按開始分析）。
 */
export function simulatorPageReducer(
  state: SimulatorPageState,
  action: SimulatorPageAction,
): SimulatorPageState {
  switch (action.type) {
    case 'addHand':
      if (!canAddToHand(state, action.tile)) return state;
      return {
        ...state,
        hand: sortedInsert(state.hand, action.tile),
        result: null,
        error: null,
      };
    case 'removeHand': {
      if (action.pos < 0 || action.pos >= state.hand.length) return state;
      const hand = state.hand.filter((_, i) => i !== action.pos);
      return { ...state, hand, result: null, error: null };
    }
    case 'addKnown':
      if (!canAddToKnown(state, action.tile)) return state;
      return {
        ...state,
        known: sortedInsert(state.known, action.tile),
        result: null,
        error: null,
      };
    case 'removeKnown': {
      if (action.pos < 0 || action.pos >= state.known.length) return state;
      const known = state.known.filter((_, i) => i !== action.pos);
      return { ...state, known, result: null, error: null };
    }
    case 'clearHand':
      return { ...state, hand: [], result: null, error: null };
    case 'clearKnown':
      return { ...state, known: [], result: null, error: null };
    case 'analyzed':
      return { ...state, result: action.result, error: null };
    case 'analyzeFailed':
      return { ...state, result: null, error: action.message };
  }
}

/**
 * 顯示排序（純 presentation sorting，stable）：
 *   1. postDiscardShanten 越低 → 越前面
 *   2. 相同 shanten → totalUkeireCopies 越高 → 越前面
 *   3. 兩項完全相同 → 維持原本 Analyzer candidate order
 *
 * 只重新「排列」Analyzer 給的 candidate 物件：絕不重新計算
 * isBest / bestDiscards，不引入第三排序鍵（effectiveTileTypeCount、
 * 牌面大小、花色皆不參與排序）。最佳打法（min shanten + max ukeire）
 * 因此自然排在最上方。
 */
export function orderCandidatesForDisplay(
  candidates: readonly SimulatorDiscardCandidate[],
): SimulatorDiscardCandidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        a.candidate.postDiscardShanten - b.candidate.postDiscardShanten ||
        b.candidate.totalUkeireCopies - a.candidate.totalUkeireCopies ||
        a.index - b.index, // 明確保證 stable：完全平手時維持原 Analyzer 順序
    )
    .map((entry) => entry.candidate);
}
