import { describe, expect, it } from 'vitest';
import {
  type PracticeState,
  currentQuestion,
  initPractice,
  practiceReducer,
} from './gamePageLogic';
import { makeQuestion } from '../questionBank/storage';
import { ids } from '../testing/hands';
import { analyzeHand, countsFromIds, tileIdOf, tileIndexOf } from '../engine';
import type { StoredQuestion } from '../questionBank/types';

/**
 * 牌效練習模式（Practice Mode + Correct/Wrong）邏輯測試。
 *
 * - 無 timer、無 timeout、無 score、無 game over（保持移除）。
 * - Correct/Wrong 唯一判定來源：Existing Game Engine 的
 *   analysis.bestDiscards（membership check；多個並列答案全算對）。
 */

const q8 = (notation: string): StoredQuestion => makeQuestion(8, ids(notation), 'MANUAL');

const QUEUE = [q8('23m5578p11z'), q8('34m24p7s222z'), q8('135m23457p')];

/** 引擎對目前題目的 bestDiscards（測試也以引擎為唯一 truth）。 */
const bestOf = (s: PracticeState) =>
  analyzeHand(countsFromIds(currentQuestion(s)!.tiles), 2).bestDiscards;

function reveal(state: PracticeState, pos: number): PracticeState {
  let s = practiceReducer(state, { type: 'select', pos });
  s = practiceReducer(s, { type: 'confirm', bestDiscards: bestOf(s) });
  return practiceReducer(s, { type: 'revealed' });
}

describe('Practice Mode — 基本流程', () => {
  it('初始：play 階段、第 1 題、unanswered；沒有 timer/score 狀態欄位', () => {
    const s = initPractice(QUEUE);
    expect(s.phase).toBe('play');
    expect(s.questionNo).toBe(1);
    expect(s.answerVerdict).toBe('unanswered');
    expect(currentQuestion(s)).toBe(QUEUE[0]);
    // 狀態結構裡沒有 elapsed / deadline / score / timedOut / gameOver
    expect(Object.keys(s).sort()).toEqual(
      ['answerVerdict', 'chosen', 'index', 'phase', 'queue', 'questionNo', 'selectedPos'].sort(),
    );
  });

  it('select → confirm → revealed：鎖定本題並記錄你的選擇與 verdict', () => {
    let s = initPractice(QUEUE);
    s = practiceReducer(s, { type: 'select', pos: 2 });
    expect(s.selectedPos).toBe(2);
    s = practiceReducer(s, { type: 'confirm', bestDiscards: bestOf(s) });
    expect(s.phase).toBe('submitting');
    expect(s.chosen).toBe(tileIndexOf(QUEUE[0].tiles[2]));
    s = practiceReducer(s, { type: 'revealed' });
    expect(s.phase).toBe('reveal');
  });

  it('未選牌不能 confirm；reveal 階段鎖定選取互動', () => {
    let s = initPractice(QUEUE);
    expect(practiceReducer(s, { type: 'confirm', bestDiscards: bestOf(s) })).toBe(s);
    s = reveal(s, 0);
    expect(practiceReducer(s, { type: 'select', pos: 3 })).toBe(s);
  });
});

describe('Correct / Wrong 判定 — 唯一來源 analysis.bestDiscards', () => {
  // '23m5578p11z'（排序後 2m 3m 5p 5p 7p 8p 1z 1z）：
  // 引擎最佳 = 5p / 8p / 1z 三個並列（engine regression 已鎖定此結果）
  const HAND = QUEUE[0].tiles;
  const posOf = (id: string) => HAND.indexOf(id);

  it('前置確認：本題有多個並列 bestDiscards（3 個）', () => {
    const best = analyzeHand(countsFromIds(HAND), 2).bestDiscards;
    expect(best.map(tileIdOf)).toEqual(['5p', '8p', '1z']);
  });

  it('Test 1：選 accepted bestDiscard → correct', () => {
    const s = reveal(initPractice(QUEUE), posOf('5p'));
    expect(s.answerVerdict).toBe('correct');
  });

  it('Test 2：選 non-best discard → wrong', () => {
    for (const id of ['2m', '3m', '7p']) {
      const s = reveal(initPractice(QUEUE), posOf(id));
      expect(s.answerVerdict, `打 ${id} 應為 wrong`).toBe('wrong');
    }
  });

  it('Test 3/4：多個並列 bestDiscards 全部算 correct（不是只看 bestDiscards[0]）', () => {
    // 5p = bestDiscards[0]、8p = [1]、1z = [2]（最後一個）——每一個都必須 correct
    for (const id of ['5p', '8p', '1z']) {
      const s = reveal(initPractice(QUEUE), posOf(id));
      expect(s.answerVerdict, `打 ${id} 應為 correct`).toBe('correct');
    }
  });

  it('verdict 只影響 presentation：對錯走完全相同的流程與 state 形狀', () => {
    const viaCorrect = reveal(initPractice(QUEUE), posOf('8p'));
    const viaWrong = reveal(initPractice(QUEUE), posOf('2m'));
    expect(viaCorrect.phase).toBe('reveal');
    expect(viaWrong.phase).toBe('reveal');
    expect(Object.keys(viaCorrect)).toEqual(Object.keys(viaWrong));
    // 沒有 score / gameOver 之類欄位隨對錯出現
    expect('score' in viaWrong).toBe(false);
    expect('gameOver' in viaWrong).toBe(false);
  });
});

describe('Practice Mode — 下一題 / 無限練習', () => {
  it('下一題：清除選取、chosen 與 verdict、保持同一 mode、題號 +1', () => {
    let s = reveal(initPractice(QUEUE), 0); // wrong（2m）
    expect(s.answerVerdict).toBe('wrong');
    s = practiceReducer(s, { type: 'next', reshuffled: QUEUE });
    expect(s.phase).toBe('play');
    expect(s.selectedPos).toBeNull();
    expect(s.chosen).toBeNull();
    expect(s.answerVerdict).toBe('unanswered'); // verdict 不殘留
    expect(s.questionNo).toBe(2);
    expect(s.index).toBe(1);
    expect(s.queue).toBe(QUEUE); // 未到隊尾：同一輪序列不變（mode 不變）
    expect(currentQuestion(s)!.mode).toBe(8);
  });

  it('走完一整輪自動接上重新洗牌的序列——答對答錯都可無限下一題，永不結算', () => {
    let s = initPractice(QUEUE);
    for (let i = 0; i < 20; i++) {
      s = reveal(s, i % 2 === 0 ? 0 : 2); // 交錯答錯（2m）/ 答對（5p）
      expect(['correct', 'wrong']).toContain(s.answerVerdict);
      s = practiceReducer(s, { type: 'next', reshuffled: [...QUEUE].reverse() });
      expect(s.phase).toBe('play'); // 永遠回到可作答狀態，沒有 game over
      expect(currentQuestion(s)).not.toBeNull();
    }
    expect(s.questionNo).toBe(21);
  });

  it('只有 reveal 階段能下一題', () => {
    const s = initPractice(QUEUE);
    expect(practiceReducer(s, { type: 'next', reshuffled: QUEUE })).toBe(s);
  });
});
