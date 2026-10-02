import { beforeEach, describe, expect, it } from 'vitest';
import {
  allFeedbackCounts,
  feedbackCountsFor,
  getRating,
  removeFeedbackForQuestion,
  resetFeedbackForTests,
  setRating,
} from './feedback';
import {
  activeQuestionsForMode,
  loadBank,
  resetBankForTests,
} from './storage';
import { resetAuthForTests } from '../auth/roles';

describe('★ / 🗑 回饋', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    resetBankForTests();
    resetAuthForTests();
  });

  it('unique constraint：同一 (userId, questionId) 最多一筆 rating', () => {
    setRating('u1', 'q1', 'STAR');
    setRating('u1', 'q1', 'STAR');
    expect(feedbackCountsFor('q1')).toEqual({ star: 1, trash: 0 });
  });

  it('STAR / TRASH 互斥：STAR → TRASH 會取消 STAR', () => {
    setRating('u1', 'q1', 'STAR');
    setRating('u1', 'q1', 'TRASH');
    expect(getRating('u1', 'q1')).toBe('TRASH');
    expect(feedbackCountsFor('q1')).toEqual({ star: 0, trash: 1 });
  });

  it('取消 rating（NONE）', () => {
    setRating('u1', 'q1', 'TRASH');
    setRating('u1', 'q1', null);
    expect(getRating('u1', 'q1')).toBeNull();
    expect(feedbackCountsFor('q1')).toEqual({ star: 0, trash: 0 });
  });

  it('不同 user 的回饋各自獨立、aggregate 正確', () => {
    setRating('u1', 'q1', 'STAR');
    setRating('u2', 'q1', 'STAR');
    setRating('u3', 'q1', 'TRASH');
    setRating('u1', 'q2', 'TRASH');
    expect(feedbackCountsFor('q1')).toEqual({ star: 2, trash: 1 });
    expect(allFeedbackCounts().get('q2')).toEqual({ star: 0, trash: 1 });
  });

  it('玩家 Trash 絕不刪除 / 停用題目（即使大量 Trash）', () => {
    const question = activeQuestionsForMode(8)[0];
    for (let u = 0; u < 100; u++) {
      setRating(`user-${u}`, question.id, 'TRASH');
    }
    expect(feedbackCountsFor(question.id).trash).toBe(100);
    // 題目仍在、仍為 ACTIVE、仍會被正常抽題
    const after = loadBank().questions.find((q) => q.id === question.id);
    expect(after).toBeDefined();
    expect(after!.status).toBe('ACTIVE');
    expect(activeQuestionsForMode(8).some((q) => q.id === question.id)).toBe(true);
  });

  it('removeFeedbackForQuestion 只清理該題', () => {
    setRating('u1', 'q1', 'STAR');
    setRating('u1', 'q2', 'STAR');
    removeFeedbackForQuestion('q1');
    expect(feedbackCountsFor('q1')).toEqual({ star: 0, trash: 0 });
    expect(feedbackCountsFor('q2')).toEqual({ star: 1, trash: 0 });
  });
});
