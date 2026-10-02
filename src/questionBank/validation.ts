import {
  MAX_COPIES,
  TILE_TYPES,
  type Counts,
  type TileId,
  analyzeHand,
  countsFromIds,
  handKey,
  tileName,
} from '../engine';
import { type Mode, requiredMeldsFor } from '../game/modes';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** canonical key（合法時），用於重複判定與後續加入題庫。 */
  key: string | null;
  counts: Counts | null;
}

/**
 * 新增題目前的完整驗證：
 *  1. 張數是否符合模式
 *  2. 每種牌是否 ≤ 4（不存在第 5 張同牌）
 *  3. 是否存在非法牌 / 赤五（parser 與 picker 已擋，此處再保險）
 *  4. 是否與該模式已有題目重複（忽略輸入順序）
 */
export function validateQuestionTiles(
  tiles: readonly TileId[],
  mode: Mode,
  existingKeys: ReadonlySet<string>,
): ValidationResult {
  const errors: string[] = [];

  let counts: Counts;
  try {
    counts = countsFromIds(tiles);
  } catch (e) {
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : '存在非法牌'],
      key: null,
      counts: null,
    };
  }

  if (tiles.length !== mode) {
    errors.push(`張數錯誤：${mode} 張模式需要恰好 ${mode} 張，目前 ${tiles.length} 張`);
  }

  for (let i = 0; i < TILE_TYPES; i++) {
    if (counts[i] > MAX_COPIES) {
      errors.push(`「${tileName(i)}」有 ${counts[i]} 張，每種牌最多 4 張`);
    }
  }

  const key = handKey(counts);
  if (errors.length === 0 && existingKeys.has(key)) {
    errors.push('與該模式已有題目重複（相同牌組、僅順序不同也算重複）');
  }

  return { ok: errors.length === 0, errors, key, counts };
}

export interface PrecheckResult {
  ok: boolean;
  /** 不適合作為題目的原因（ok = false 時）。 */
  reason: string | null;
}

/**
 * 引擎預檢：張數/重複之外，確認這道題經過完整牌效分析後
 * 適合作為訓練題目（至少存在有效進張）。
 */
export function precheckQuestion(counts: Counts, mode: Mode): PrecheckResult {
  const analysis = analyzeHand([...counts], requiredMeldsFor(mode));
  if (analysis.maxTotal === 0) {
    return {
      ok: false,
      reason: '此手牌沒有任何有效進張（距離聽牌太遠），任何打法都無差異，不適合作為題目',
    };
  }
  return { ok: true, reason: null };
}
