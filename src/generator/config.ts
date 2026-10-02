import type { Mode } from '../game/modes';

/**
 * Generator 全部可調參數集中於此（不散落 magic numbers）。
 *
 * 注意：這裡的任何參數都只影響「產生哪些候選題、選哪些題進題庫」，
 * 絕對不影響麻將引擎的答案計算（引擎是唯一答案權威）。
 */

export const GENERATOR_VERSION = 'v1';
export const GENERATOR_CONFIG_VERSION = 'v1-config-2';

export interface GeneratorConfig {
  configVersion: string;
  /** deterministic RNG seed（保存於題庫 metadata，供重現）。 */
  rngSeed: number;

  /** 每個模式的目標題數。 */
  targets: Record<Mode, number>;

  /**
   * 花色數量 quota（Diversity Target，非 correctness rule）。
   * key = 使用的數牌花色數，value = 目標比例。
   */
  suitCountQuota: Record<Mode, Record<number, number>>;

  /** 品質門檻（0–100）。若無法達到題數可合理調低，需在報告說明。 */
  qualityThreshold: Record<Mode, number>;

  /** 最佳打牌總有效枚數下限（低於此的題目視為無意義進張）。 */
  minBestUkeire: Record<Mode, number>;

  /** 每個模式生成多少個完整胡牌形（seed 來源）。 */
  winningHandsPerMode: Record<Mode, number>;

  /** Beam widths / 搜尋上限（per-mode：單色 8 張空間小，需要更寬的 beam）。 */
  search: {
    /** 每個 Tenpai Seed 保留的 B（加牌）數。 */
    maxB: Record<Mode, number>;
    /** 每個 M 保留的 X（移除）數。 */
    maxX: Record<Mode, number>;
    /** 每個 H 保留的 A（補牌）數。 */
    maxA: Record<Mode, number>;
    /** 每模式最多送引擎分析的候選數（含被 filter 掉的）。 */
    maxCandidatesPerMode: Record<Mode, number>;
    /**
     * 高品質 pool 達到 target 的此倍數即可提前停止搜尋。
     * 單色模式（8 張）因 suit-isomorphic 去重會大幅收斂，需要更大倍數。
     */
    poolMultiple: Record<Mode, number>;
  };

  /** Quality subscore 權重（總和 1）。 */
  qualityWeights: { C: number; D: number; S: number; X: number; U: number };

  /** Soft penalties（扣分點數）。 */
  penalties: {
    obviousIsolatedBest: number;
    excessiveIsolationPerTile: number;
    excessiveIsolationCap: number;
    fakeActiveSuit: number;
    tiedBestPair: number;
    tiedBestMany: number;
    extremeDominance: number;
    structurallyTrivial: number;
  };

  /** 「競爭打法」判定：totalUkeire ≥ best × 此比例。 */
  competitiveRatio: number;

  /** Hard filter：禁止任何第一打後立即聽牌（維持一向聽訓練性質）。 */
  forbidImmediateTenpai: boolean;

  /** 每個花色（有 ≥2 張時）最低 participation，低於視為 fake active suit（hard filter）。 */
  minSuitParticipation: number;

  /** Diversity selection 參數。 */
  diversity: {
    /** 每個 suit-isomorphic fingerprint 最多保留題數。 */
    maxPerIsoFingerprint: number;
    /** translation fingerprint 每重複一次的選題扣分。 */
    translationBasePenalty: number;
    translationRepeatPenalty: number;
    /** 單一 primaryStructureArchetype 佔比上限。 */
    archetypeMaxShare: number;
    /** 花色數 quota 偏差的獎懲。 */
    suitQuotaBonus: number;
    /** 難度分佈平衡獎懲。 */
    difficultySpreadBonus: number;
    /**
     * Near-duplicate similarity（PART Z-3）：候選與【已入選題】的
     * tile Jaccard 相似度超過此門檻開始扣分（線性放大到 penalty 上限）。
     * 抓 translation 指紋抓不到的「差一兩張」近親變體。
     */
    similarityThreshold: number;
    similarityPenalty: number;
  };

  /** 難度 tier 百分位（同模式內）。 */
  difficultyQuota: { easy: number; medium: number; hard: number; veryHard: number };
}

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  configVersion: GENERATOR_CONFIG_VERSION,
  rngSeed: 20261001,

  targets: { 8: 200, 11: 300, 14: 400, 17: 600 },

  suitCountQuota: {
    8: { 1: 1.0 },
    11: { 1: 0.4, 2: 0.6 },
    14: { 2: 0.55, 3: 0.45 },
    17: { 2: 0.4, 3: 0.6 },
  },

  qualityThreshold: { 8: 75, 11: 75, 14: 75, 17: 75 },

  minBestUkeire: { 8: 8, 11: 10, 14: 12, 17: 12 },

  winningHandsPerMode: { 8: 9000, 11: 2500, 14: 2000, 17: 2200 },

  search: {
    maxB: { 8: 9, 11: 5, 14: 5, 17: 5 },
    maxX: { 8: 6, 11: 4, 14: 4, 17: 4 },
    maxA: { 8: 9, 11: 6, 14: 6, 17: 6 },
    maxCandidatesPerMode: { 8: 40000, 11: 14000, 14: 9000, 17: 7500 },
    poolMultiple: { 8: 20, 11: 5, 14: 3.5, 17: 3 },
  },

  qualityWeights: { C: 0.25, D: 0.2, S: 0.2, X: 0.15, U: 0.2 },

  penalties: {
    obviousIsolatedBest: 10,
    excessiveIsolationPerTile: 6,
    excessiveIsolationCap: 18,
    fakeActiveSuit: 12,
    tiedBestPair: 4,
    tiedBestMany: 12,
    extremeDominance: 12,
    structurallyTrivial: 8,
  },

  competitiveRatio: 0.75,

  forbidImmediateTenpai: true,

  minSuitParticipation: 0.5,

  diversity: {
    maxPerIsoFingerprint: 1,
    translationBasePenalty: 14,
    translationRepeatPenalty: 10,
    archetypeMaxShare: 0.3,
    suitQuotaBonus: 8,
    difficultySpreadBonus: 6,
    similarityThreshold: 0.72,
    similarityPenalty: 30,
  },

  difficultyQuota: { easy: 0.2, medium: 0.4, hard: 0.3, veryHard: 0.1 },
};

/** 模式允許的數牌花色數（correctness rule，hard filter）。 */
export const MODE_SUIT_RULE: Record<Mode, { min: number; max: number }> = {
  8: { min: 1, max: 1 },
  11: { min: 1, max: 2 },
  14: { min: 2, max: 3 },
  17: { min: 2, max: 3 },
};
