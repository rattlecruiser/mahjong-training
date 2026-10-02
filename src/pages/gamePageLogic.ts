import { tileIndexOf, type TileIndex } from '../engine';
import type { StoredQuestion } from '../questionBank/types';

/**
 * 牌效練習模式（Practice Mode）的純邏輯層。
 *
 * 玩家不限時間思考 → 選擇 discard → 以 Existing Game Engine 的
 * analysis.bestDiscards 判定答對/答錯（membership check，唯一
 * 判定來源）→ 顯示 verdict 與全部打牌選擇的牌效分析 →
 * 「返回主畫面」或「下一題」（無限練習）。
 *
 * 這裡沒有：timer / timeout、score、game over / 結算。
 * 也沒有任何麻將數學——bestDiscards 由 GamePage 從引擎的
 * analyzeHand 取得後傳入，reducer 只做 membership check。
 */

export type PracticePhase = 'play' | 'submitting' | 'reveal';

/** 答題判定：唯一來源是引擎 analysis.bestDiscards 的 membership check。 */
export type AnswerVerdict = 'unanswered' | 'correct' | 'wrong';

export interface PracticeState {
  /** 本輪洗牌後的出題序列（同一輪內不重複；走完整輪才重洗）。 */
  queue: StoredQuestion[];
  /** 目前題目在 queue 中的位置。 */
  index: number;
  /** 練習第幾題（從 1 起、只增不減——無題數上限、無結算）。 */
  questionNo: number;
  phase: PracticePhase;
  /** play 階段選取中的手牌位置（尚未確認）。 */
  selectedPos: number | null;
  /** 確認打出的牌（reveal 用「你的選擇」標示）。 */
  chosen: TileIndex | null;
  /** 對錯判定（只影響 feedback presentation，不影響 navigation）。 */
  answerVerdict: AnswerVerdict;
}

export function initPractice(queue: StoredQuestion[]): PracticeState {
  return {
    queue,
    index: 0,
    questionNo: 1,
    phase: 'play',
    selectedPos: null,
    chosen: null,
    answerVerdict: 'unanswered',
  };
}

export function currentQuestion(state: PracticeState): StoredQuestion | null {
  return state.queue[state.index] ?? null;
}

export type PracticeAction =
  | { type: 'select'; pos: number }
  /**
   * 確認打出：bestDiscards 必須是 Existing Game Engine 對本題
   * analyzeHand 輸出的 analysis.bestDiscards（原樣傳入，不重算、
   * 不用其他來源）。判定＝membership check：chosen ∈ bestDiscards
   * → correct，否則 wrong。多個並列 bestDiscards 全部算 correct。
   */
  | { type: 'confirm'; bestDiscards: readonly TileIndex[] }
  | { type: 'revealed' }
  /**
   * 下一題：保持目前 mode；清除選取、verdict 與分析顯示狀態。
   * 走到序列尾端時使用 reshuffled（呼叫端提供的新洗牌序列）
   * 從頭繼續——可以無限練習，永遠不會進入結算。
   */
  | { type: 'next'; reshuffled: StoredQuestion[] };

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'select':
      if (state.phase !== 'play') return state;
      return { ...state, selectedPos: action.pos };
    case 'confirm': {
      if (state.phase !== 'play' || state.selectedPos === null) return state;
      const question = currentQuestion(state);
      if (!question) return state;
      const tile = question.tiles[state.selectedPos];
      if (tile === undefined) return state;
      const chosen = tileIndexOf(tile);
      // 唯一判定來源：引擎 bestDiscards 的 membership check
      //（includes 檢查整個陣列——絕不只看 bestDiscards[0]）
      const answerVerdict: AnswerVerdict = action.bestDiscards.includes(chosen)
        ? 'correct'
        : 'wrong';
      // 鎖定本題互動：submitting（出牌動畫）→ reveal（verdict + 分析）
      return { ...state, phase: 'submitting', chosen, answerVerdict };
    }
    case 'revealed':
      if (state.phase !== 'submitting') return state;
      return { ...state, phase: 'reveal' };
    case 'next': {
      if (state.phase !== 'reveal') return state;
      const wrap = state.index + 1 >= state.queue.length;
      return {
        queue: wrap ? action.reshuffled : state.queue,
        index: wrap ? 0 : state.index + 1,
        questionNo: state.questionNo + 1,
        phase: 'play',
        selectedPos: null,
        chosen: null,
        answerVerdict: 'unanswered',
      };
    }
  }
}
