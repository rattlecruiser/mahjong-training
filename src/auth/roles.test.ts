import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLocalUserId,
  getRole,
  isAdmin,
  requireAdmin,
  resetAuthForTests,
  setRole,
} from './roles';
import {
  addManualQuestions,
  deleteQuestionPermanently,
  resetBankForTests,
  setQuestionStatus,
} from '../questionBank/storage';
import { ids } from '../testing/hands';

describe('USER / ADMIN 權限', () => {
  beforeEach(() => {
    resetAuthForTests();
    resetBankForTests();
  });

  it('預設角色為 USER', () => {
    expect(getRole()).toBe('USER');
    expect(isAdmin()).toBe(false);
  });

  it('requireAdmin 擋下 USER', () => {
    expect(() => requireAdmin('測試動作')).toThrow(/管理者權限/);
    setRole('ADMIN');
    expect(() => requireAdmin('測試動作')).not.toThrow();
  });

  it('USER 不能新增 / 停用 / 刪除題目（統一權限層）', () => {
    expect(() => addManualQuestions([{ mode: 8, tiles: ids('23m5599p11z') }])).toThrow(
      /管理者權限/,
    );
    expect(() => setQuestionStatus('any-id', 'DISABLED')).toThrow(/管理者權限/);
    expect(() => deleteQuestionPermanently('any-id')).toThrow(/管理者權限/);
  });

  it('ADMIN 可以執行管理動作', () => {
    setRole('ADMIN');
    const added = addManualQuestions([{ mode: 8, tiles: ids('23m5599p11z') }]);
    expect(added).toHaveLength(1);
    expect(() => setQuestionStatus(added[0].id, 'DISABLED')).not.toThrow();
  });

  it('localUserId 穩定：同一環境重複取得同一 id', () => {
    const first = getLocalUserId();
    expect(first.length).toBeGreaterThan(8);
    expect(getLocalUserId()).toBe(first);
  });
});
