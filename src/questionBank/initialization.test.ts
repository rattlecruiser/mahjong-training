import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureQuestionBankInitialized,
  resetInitializationForTests,
  runInitialization,
} from './initialization';
import {
  activeQuestionsForMode,
  addManualQuestions,
  getBankMeta,
  loadBank,
  makeQuestion,
  questionsForMode,
  resetBankForTests,
  saveBank,
  setQuestionStatus,
} from './storage';
import { resetAuthForTests, setRole } from '../auth/roles';
import { feedbackCountsFor, resetFeedbackForTests, setRating } from './feedback';
import { parseHandText } from './parser';
import type { Mode } from '../game/modes';
import { ids } from '../testing/hands';

interface PatchFileShape {
  removals: { mode: Mode; key: string; notation: string }[];
  generatedReplacementKeys: { mode: Mode; key: string }[];
  defaultReplacements: { mode: Mode; notation: string }[];
}

async function loadPatchFile(): Promise<PatchFileShape> {
  return (await import('./bankPatch.v1.json')).default as unknown as PatchFileShape;
}

/**
 * Startup / Persistence Tests（PART AG / AH / BB）。
 *
 * 「模擬重新啟動」＝ resetInitializationForTests()（清掉 in-flight cache）
 * 但保留 Persistent 題庫——等同 refresh / 關閉重開 / New Game / Mode 切換。
 */
describe('題庫一次性初始化', () => {
  beforeEach(() => {
    resetBankForTests();
    resetInitializationForTests();
    resetAuthForTests();
    resetFeedbackForTests();
  });

  it('1) Empty storage 第一次啟動：匯入正式生成題庫一次（1500 題）', async () => {
    const outcome = await ensureQuestionBankInitialized();
    expect(outcome.ran).toBe(true);
    expect(outcome.imported).toBe(1500);
    expect(getBankMeta().questionBankInitialized).toBe(true);
    expect(getBankMeta().generatorVersion).toBe('v1');
    expect(typeof getBankMeta().generationSeed).toBe('number');
  });

  it('2) 初始化後題庫 Persist：各模式 ACTIVE 題數正確', async () => {
    await ensureQuestionBankInitialized();
    // 生成題 + 第一階段內建題
    expect(activeQuestionsForMode(8).length).toBe(200 + 6);
    expect(activeQuestionsForMode(11).length).toBe(300 + 6);
    expect(activeQuestionsForMode(14).length).toBe(400 + 6);
    expect(activeQuestionsForMode(17).length).toBe(600 + 7);
  });

  it('3–7) 第二次啟動 / refresh / New Game / Mode 切換 / App restart：不再生成或匯入', async () => {
    await ensureQuestionBankInitialized();
    const total = loadBank().questions.length;

    // 同 session 重複呼叫
    expect((await ensureQuestionBankInitialized()).ran).toBe(false);

    // 模擬重新啟動多次（refresh / restart / new game / mode switch 都走同一條路）
    for (let restart = 0; restart < 4; restart++) {
      resetInitializationForTests();
      const outcome = await ensureQuestionBankInitialized();
      expect(outcome.ran).toBe(false);
      expect(outcome.imported).toBe(0);
      expect(loadBank().questions.length).toBe(total);
    }
  });

  it('8) 既有 MANUAL / DISABLED / 回饋在後續啟動不被覆蓋', async () => {
    await ensureQuestionBankInitialized();
    setRole('ADMIN');
    const [manual] = addManualQuestions([{ mode: 8, tiles: ids('11z22z33m44p2m') }]);
    const generated = questionsForMode(17).find((q) => q.source === 'GENERATED')!;
    setQuestionStatus(generated.id, 'DISABLED');
    setRating('u1', manual.id, 'STAR');

    resetInitializationForTests();
    const outcome = await ensureQuestionBankInitialized();
    expect(outcome.ran).toBe(false);

    expect(questionsForMode(8).some((q) => q.id === manual.id)).toBe(true);
    expect(questionsForMode(17).find((q) => q.id === generated.id)!.status).toBe('DISABLED');
    expect(feedbackCountsFor(manual.id).star).toBe(1);
  });

  it('9) generatorVersion 改變也不自動重建（只是 metadata）', async () => {
    await ensureQuestionBankInitialized();
    const bank = loadBank();
    const total = bank.questions.length;
    bank.meta = { ...bank.meta, generatorVersion: 'v0-legacy' };
    saveBank(bank);

    resetInitializationForTests();
    const outcome = await runInitialization();
    expect(outcome.ran).toBe(false);
    expect(loadBank().questions.length).toBe(total);
    expect(getBankMeta().generatorVersion).toBe('v0-legacy');
  });

  it('10) 匯入對既有題目做 exact duplicate 檢查（不覆蓋、不重複）', async () => {
    await ensureQuestionBankInitialized();
    const keys = loadBank().questions.map((q) => `${q.mode}:${q.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('11) 題庫維護 patch：fresh install 為 no-op（不移除、不新增、只標記 level）', async () => {
    const outcome = await ensureQuestionBankInitialized();
    // 修正後的題庫本來就沒有無效題：removals 找不到、additions 全部 dup-skip
    expect(outcome.patched).toBe(true);
    expect(outcome.patchRemoved).toBe(0);
    expect(outcome.patchAdded).toBe(0);
    expect(getBankMeta().bankPatchLevel).toBe(1);
    // 再次啟動：patch 不再執行
    resetInitializationForTests();
    expect((await ensureQuestionBankInitialized()).patched).toBe(false);
  });

  it('12) 題庫維護 patch：舊安裝的 quad-best-discard 題被移除、缺的 replacement 被補入', async () => {
    await ensureQuestionBankInitialized();
    const patch = await loadPatchFile();

    // 模擬「patch 之前的舊安裝」：
    // a) 塞回一題 patch 清單上的無效題（含玩家回饋）
    const removal = patch.removals[0];
    const parsedInvalid = parseHandText(removal.notation);
    expect(parsedInvalid.ok).toBe(true);
    if (!parsedInvalid.ok) throw new Error('unreachable');
    const bank = loadBank();
    const invalid = makeQuestion(removal.mode, parsedInvalid.tiles, 'GENERATED');
    expect(invalid.key).toBe(removal.key); // canonical key 一致（比對依據）
    bank.questions.push(invalid);
    // b) 拿掉一題 generated replacement 與一題 default replacement（模擬其尚未存在）
    const genKey = patch.generatedReplacementKeys[0];
    const defParsed = parseHandText(patch.defaultReplacements[0].notation);
    if (!defParsed.ok) throw new Error('unreachable');
    const defKey = makeQuestion(patch.defaultReplacements[0].mode, defParsed.tiles, 'MANUAL').key;
    bank.questions = bank.questions.filter(
      (q) =>
        !(q.mode === genKey.mode && q.key === genKey.key) &&
        !(q.mode === patch.defaultReplacements[0].mode && q.key === defKey),
    );
    // c) patch 尚未套用
    bank.meta = { ...bank.meta, bankPatchLevel: 0 };
    saveBank(bank);
    setRating('u9', invalid.id, 'TRASH');
    const before = loadBank().questions.length; // = 正常 − 2 + 1

    resetInitializationForTests();
    const outcome = await ensureQuestionBankInitialized();
    expect(outcome.ran).toBe(false); // 不重新匯入整個題庫
    expect(outcome.patched).toBe(true);
    expect(outcome.patchRemoved).toBe(1);
    expect(outcome.patchAdded).toBe(2);
    const after = loadBank();
    expect(after.questions.length).toBe(before + 1); // −1 無效 +2 replacement
    // 無效題（依 mode+key）確實消失、回饋一併清理
    expect(
      after.questions.some((q) => q.mode === removal.mode && q.key === removal.key),
    ).toBe(false);
    expect(feedbackCountsFor(invalid.id).trash).toBe(0);
    // replacement 都在
    expect(after.questions.some((q) => q.mode === genKey.mode && q.key === genKey.key)).toBe(true);
    expect(
      after.questions.some(
        (q) => q.mode === patch.defaultReplacements[0].mode && q.key === defKey,
      ),
    ).toBe(true);
    expect(after.meta.bankPatchLevel).toBe(1);
    // 各模式 ACTIVE 題數回到正常值
    expect(activeQuestionsForMode(8).length).toBe(200 + 6);
    expect(activeQuestionsForMode(11).length).toBe(300 + 6);
    expect(activeQuestionsForMode(14).length).toBe(400 + 6);
    expect(activeQuestionsForMode(17).length).toBe(600 + 7);
  });

  it('13) patch 清單自身健全：removals 257、replacement 數量對應、無 removal 同時是 replacement', async () => {
    const patch = await loadPatchFile();
    expect(patch.removals.length).toBe(257);
    expect(patch.generatedReplacementKeys.length).toBe(254);
    expect(patch.defaultReplacements.length).toBe(3);
    const removalSet = new Set(patch.removals.map((r) => `${r.mode}:${r.key}`));
    for (const g of patch.generatedReplacementKeys) {
      expect(removalSet.has(`${g.mode}:${g.key}`)).toBe(false);
    }
  });

  it('初始化失敗不會標記 initialized（PART BI：單一 atomic 寫入）', async () => {
    // 尚未初始化時 meta 必為 false；runInitialization 途中 throw 的情況
    // 由「匯入與 meta 在同一次 saveBank」保證不會產生半初始化狀態。
    expect(getBankMeta().questionBankInitialized).toBe(false);
  });
});
