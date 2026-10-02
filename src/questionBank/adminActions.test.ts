import { beforeEach, describe, expect, it } from 'vitest';
import { adminGenerateAppend, adminRebuildGeneratedBank } from './adminActions';
import { ensureQuestionBankInitialized, resetInitializationForTests } from './initialization';
import {
  addManualQuestions,
  questionsForMode,
  resetBankForTests,
  setQuestionStatus,
} from './storage';
import { feedbackCountsFor, resetFeedbackForTests, setRating } from './feedback';
import { resetAuthForTests, setRole } from '../auth/roles';
import { HONOR_START, TILE_TYPES, countsFromIds } from '../engine';
import { ids } from '../testing/hands';

describe('Admin 題庫動作', () => {
  beforeEach(() => {
    resetBankForTests();
    resetInitializationForTests();
    resetAuthForTests();
    resetFeedbackForTests();
  });

  it('USER 不能執行 Generator 或 REBUILD', async () => {
    await expect(adminGenerateAppend({ 8: 1 })).rejects.toThrow(/管理者權限/);
    await expect(adminRebuildGeneratedBank()).rejects.toThrow(/管理者權限/);
  });

  it(
    'ADMIN append：新增生成題（不覆蓋既有題庫、無字牌）',
    async () => {
      await ensureQuestionBankInitialized();
      setRole('ADMIN');
      const before = questionsForMode(8).length;
      const result = await adminGenerateAppend({ 8: 2 });
      expect(result.added).toBeGreaterThanOrEqual(1);
      const after = questionsForMode(8);
      expect(after.length).toBe(before + result.added);
      const appended = after.filter((q) => q.id.startsWith('g1a-'));
      for (const q of appended) {
        expect(q.source).toBe('GENERATED');
        const counts = countsFromIds(q.tiles);
        for (let i = HONOR_START; i < TILE_TYPES; i++) expect(counts[i]).toBe(0);
      }
    },
    180_000,
  );

  it(
    'REBUILD：重建 GENERATED，保留 MANUAL 與其回饋',
    async () => {
      await ensureQuestionBankInitialized();
      setRole('ADMIN');
      const [manual] = addManualQuestions([{ mode: 8, tiles: ids('11z22z33m44p2m') }]);
      setRating('u1', manual.id, 'STAR');
      const generated = questionsForMode(17).find((q) => q.source === 'GENERATED')!;
      setRating('u1', generated.id, 'TRASH');
      setQuestionStatus(manual.id, 'DISABLED');

      const result = await adminRebuildGeneratedBank();
      expect(result.removedGenerated).toBeGreaterThanOrEqual(1500);
      expect(result.imported).toBe(1500);

      // MANUAL 保留（含狀態與回饋）；GENERATED 的回饋被清理
      const manualAfter = questionsForMode(8).find((q) => q.id === manual.id);
      expect(manualAfter).toBeDefined();
      expect(manualAfter!.status).toBe('DISABLED');
      expect(feedbackCountsFor(manual.id).star).toBe(1);
      expect(feedbackCountsFor(generated.id)).toEqual({ star: 0, trash: 0 });
    },
    120_000,
  );
});
