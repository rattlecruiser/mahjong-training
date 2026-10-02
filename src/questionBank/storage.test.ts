import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeQuestionsForMode,
  addManualQuestions,
  adminBankCounts,
  bankCounts,
  deleteQuestionPermanently,
  loadBank,
  questionsForMode,
  resetBankForTests,
  setQuestionStatus,
} from './storage';
import { resetAuthForTests, setRole } from '../auth/roles';
import { resetFeedbackForTests, setRating, feedbackCountsFor } from './feedback';
import { ids } from '../testing/hands';

// node 環境沒有 localStorage，storage 走 in-memory fallback，
// 邏輯（migration、去重、權限、狀態）與瀏覽器版完全相同。

describe('題庫儲存（schema v2）', () => {
  beforeEach(() => {
    resetBankForTests();
    resetAuthForTests();
    resetFeedbackForTests();
  });

  it('第一次載入放入第一階段內建題（MANUAL / ACTIVE），schema v2 + meta', () => {
    const bank = loadBank();
    expect(bank.version).toBe(2);
    expect(bank.meta.questionBankInitialized).toBe(false);
    expect(bank.questions.length).toBeGreaterThan(0);
    for (const q of bank.questions) {
      expect(q.source).toBe('MANUAL');
      expect(q.status).toBe('ACTIVE');
    }
  });

  it('ADMIN 新增題目：自動排序、產生 canonical key、source = MANUAL', () => {
    setRole('ADMIN');
    const before = questionsForMode(8).length;
    const added = addManualQuestions([{ mode: 8, tiles: ids('11z78p55p34m') }]);
    expect(added).toHaveLength(1);
    expect(added[0].tiles).toEqual(['3m', '4m', '5p', '5p', '7p', '8p', '1z', '1z']);
    expect(added[0].source).toBe('MANUAL');
    expect(questionsForMode(8)).toHaveLength(before + 1);
  });

  it('相同牌組（不同順序）不會重複加入', () => {
    setRole('ADMIN');
    addManualQuestions([{ mode: 8, tiles: ids('23m5599p11z') }]);
    const before = questionsForMode(8).length;
    const added = addManualQuestions([{ mode: 8, tiles: ids('99p55p11z23m') }]);
    expect(added).toHaveLength(0);
    expect(questionsForMode(8)).toHaveLength(before);
  });

  it('停用 / 啟用：DISABLED 不出現在正常遊戲抽題，但保留於題庫', () => {
    setRole('ADMIN');
    const [q] = addManualQuestions([{ mode: 8, tiles: ids('23m5599p22z') }]);
    setQuestionStatus(q.id, 'DISABLED');

    expect(activeQuestionsForMode(8).some((x) => x.id === q.id)).toBe(false);
    expect(questionsForMode(8).some((x) => x.id === q.id)).toBe(true);
    expect(bankCounts()[8]).toBe(adminBankCounts()[8].active);

    setQuestionStatus(q.id, 'ACTIVE');
    expect(activeQuestionsForMode(8).some((x) => x.id === q.id)).toBe(true);
  });

  it('永久刪除：移除題目並清理其回饋（referential integrity）', () => {
    setRole('ADMIN');
    const [q] = addManualQuestions([{ mode: 8, tiles: ids('23m5599p33z') }]);
    setRating('user-1', q.id, 'STAR');
    expect(feedbackCountsFor(q.id).star).toBe(1);

    deleteQuestionPermanently(q.id);
    expect(questionsForMode(8).some((x) => x.id === q.id)).toBe(false);
    expect(feedbackCountsFor(q.id)).toEqual({ star: 0, trash: 0 });
  });
});
