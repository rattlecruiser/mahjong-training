import type { TileId } from '../engine';
import type { Mode } from '../game/modes';
import type { DifficultyTier } from '../generator/generate';

/**
 * 題庫 schema v2。
 *
 * 題庫只保存題目手牌與 metadata，不保存人工答案——
 * 最佳打牌永遠由引擎即時計算；bestDiscards / bestUkeire 只是
 * cached metadata（顯示、排序用），引擎永遠是答案 truth。
 */

export type QuestionSource = 'GENERATED' | 'MANUAL';
export type QuestionStatus = 'ACTIVE' | 'DISABLED';

export interface QualityBreakdownStored {
  competition: number;
  deceptiveness: number;
  structural: number;
  compoundComplexity: number;
  ukeireRichness: number;
  penalties: number;
}

export interface QuestionMetadata {
  qualityScore: number;
  qualityBreakdown: QualityBreakdownStored;
  penaltyDetails?: Record<string, number>;
  difficultyRaw: number;
  difficultyTier: DifficultyTier;
  structureTags: string[];
  decisionTags: string[];
  primaryStructureArchetype: string;
  /** Cached（引擎是 truth）。 */
  bestDiscards: TileId[];
  bestUkeire: number;
  bestKinds: number;
  structuralFingerprint: { iso: string; translation: string };
  generatorVersion: string;
}

export interface StoredQuestion {
  id: string;
  mode: Mode;
  /** 排序後的牌（萬→筒→索→字）。 */
  tiles: TileId[];
  /** canonical key（忽略輸入順序），用於重複題目判定。 */
  key: string;
  source: QuestionSource;
  status: QuestionStatus;
  createdAt: number;
  updatedAt: number;
  /** MANUAL 題目可能沒有（或只有部分）metadata。 */
  meta?: QuestionMetadata;
}

/** 題庫初始化 metadata（PART AG）。 */
export interface BankMeta {
  questionBankInitialized: boolean;
  generatorVersion?: string;
  generatedAt?: number;
  generationSeed?: number;
  generationConfigVersion?: string;
  /**
   * 已套用的題庫維護 patch level（一次性、idempotent）。
   * patch 1：quad-best-discard cleanup——移除「手牌四張同牌且該牌
   * 屬於引擎最佳打牌」的題目並補入等量 replacement（題數不變）。
   */
  bankPatchLevel?: number;
}

export interface BankData {
  version: 2;
  questions: StoredQuestion[];
  meta: BankMeta;
}

export const BANK_SCHEMA_VERSION = 2 as const;

/* ---------- v1（第一階段）schema，migration 用 ---------- */

export interface StoredQuestionV1 {
  id: string;
  mode: Mode;
  tiles: TileId[];
  key: string;
  createdAt: number;
}

export interface BankDataV1 {
  version: 1;
  questions: StoredQuestionV1[];
}
