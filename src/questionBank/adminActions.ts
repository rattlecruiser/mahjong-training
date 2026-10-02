import { requireAdmin } from '../auth/roles';
import {
  DEFAULT_GENERATOR_CONFIG,
  type GenerationProgress,
  type GeneratorConfig,
  generateAllModes,
} from '../generator';
import { MODES, type Mode } from '../game/modes';
import { appendQuestionsInternal, loadBank, saveBank } from './storage';
import { removeFeedbackForQuestion } from './feedback';
import { runInitialization, storedQuestionFromGenerated } from './initialization';

/**
 * ADMIN 專用題庫動作（PART AI）。
 *
 * - Initial Generation 之後，一般 USER 永遠不能觸發 Generator
 *  （requireAdmin 統一擋下）。
 * - Admin 手動執行 Generator 預設為 ADD / APPEND，不是 OVERWRITE：
 *   新題照樣經過 engine validate、duplicate check、fingerprint、
 *   quality、diversity（generateAllModes pipeline 內建）再加入。
 * - REBUILD 是另一個明確動作（UI 需二次確認）。
 */

export interface AppendGenerationSummary {
  requested: Record<Mode, number>;
  added: number;
  generated: number;
  seedUsed: number;
  elapsedMs: number;
}

export async function adminGenerateAppend(
  perMode: Partial<Record<Mode, number>>,
  onProgress?: (p: GenerationProgress) => void,
): Promise<AppendGenerationSummary> {
  requireAdmin('執行 Generator');
  const t0 = Date.now();

  const config: GeneratorConfig = structuredClone(DEFAULT_GENERATOR_CONFIG);
  // Append 批次使用時間 seed（記錄於回傳值；正式初始題庫的 seed 在 bank meta）
  config.rngSeed = (Date.now() % 2147483647) | 1;
  const requested = { 8: 0, 11: 0, 14: 0, 17: 0 } as Record<Mode, number>;
  for (const mode of MODES) requested[mode] = Math.max(0, perMode[mode] ?? 0);
  config.targets = requested;

  // 瀏覽器內執行：依目標題數縮小搜尋預算
  for (const mode of MODES) {
    const target = requested[mode];
    config.winningHandsPerMode[mode] = target === 0 ? 0 : Math.max(80, target * 12);
    config.search.maxCandidatesPerMode[mode] =
      target === 0 ? 0 : Math.max(300, target * 130);
  }

  const bank = loadBank();
  const existingKeys = new Map<Mode, Set<string>>();
  for (const mode of MODES) {
    existingKeys.set(
      mode,
      new Set(bank.questions.filter((q) => q.mode === mode).map((q) => q.key)),
    );
  }

  const result = await generateAllModes(config, existingKeys, {
    onProgress,
    yieldEvery: 25,
  });

  const now = Date.now();
  const stored = result.questions.map((g, i) =>
    storedQuestionFromGenerated(g, `g1a-${now}-${i}`, result.generatorVersion, now),
  );
  const added = appendQuestionsInternal(stored);

  return {
    requested,
    added,
    generated: result.questions.length,
    seedUsed: config.rngSeed,
    elapsedMs: Date.now() - t0,
  };
}

export interface RebuildSummary {
  removedGenerated: number;
  imported: number;
}

/**
 * ADMIN 明確 REBUILD（UI 必須二次確認）：
 * 刪除所有 GENERATED 題目（連同其回饋），重新匯入內建 v1 正式生成題庫。
 * MANUAL 題目與其回饋、DISABLED 狀態完全保留。
 */
export async function adminRebuildGeneratedBank(): Promise<RebuildSummary> {
  requireAdmin('重建生成題庫');
  const bank = loadBank();
  const generated = bank.questions.filter((q) => q.source === 'GENERATED');
  for (const q of generated) removeFeedbackForQuestion(q.id);
  bank.questions = bank.questions.filter((q) => q.source !== 'GENERATED');
  bank.meta = { ...bank.meta, questionBankInitialized: false };
  saveBank(bank);
  const outcome = await runInitialization();
  return { removedGenerated: generated.length, imported: outcome.imported };
}
