import {
  HONOR_START,
  TILE_TYPES,
  type Counts,
  handKey,
  idsFromCounts,
  isTenpai,
  tileIdOf,
  toNotation,
  type TileId,
} from '../engine';
import { type Mode, requiredMeldsFor } from '../game/modes';
import {
  GENERATOR_VERSION,
  MODE_SUIT_RULE,
  type GeneratorConfig,
} from './config';
import { createRng, shuffleInPlace, type Rng } from './rng';
import { generateWinningHand, tenpaiSeedsFromWinningHand, type TenpaiSeed } from './seeds';
import { expandSeed } from './reverseSearch';
import { evaluateCandidate } from './evaluate';
import { scoreQuality, type QualityBreakdown } from './quality';
import { scoreDifficultyRaw } from './difficulty';
import { deriveTags } from './tags';
import { isoFingerprint, translationFingerprint } from './fingerprint';
import { selectDiverse } from './select';

/**
 * Generator Pipeline（PART H–AA）：
 *
 *   Winning Hands → Tenpai Seeds → B/X/A Reverse Search → Hard Filters
 *   → Engine 分析（唯一答案權威）→ Quality / Difficulty / Tags / Fingerprints
 *   → Quality Threshold → Diversity Selection
 *
 * Generator 只產生 Candidate，Engine 決定答案；
 * bestDiscards / bestUkeire 僅為 cached metadata。
 */

export type DifficultyTier = 'EASY' | 'MEDIUM' | 'HARD' | 'VERY_HARD';

export interface GeneratedQuestionData {
  mode: Mode;
  tiles: TileId[];
  notation: string;
  key: string;
  iso: string;
  translation: string;
  suitCount: number;

  quality: number;
  qualityBreakdown: QualityBreakdown;
  penaltyDetails: Record<string, number>;

  difficultyRaw: number;
  difficultyTier: DifficultyTier;

  structureTags: string[];
  decisionTags: string[];
  primaryStructureArchetype: string;

  /** Cached metadata（引擎永遠是 truth）。 */
  bestDiscards: TileId[];
  bestUkeire: number;
  bestKinds: number;
}

export interface ModeGenerationStats {
  mode: Mode;
  rawWinningHands: number;
  rawSeeds: number;
  candidatesEmitted: number;
  exactDuplicatesSkipped: number;
  suitRuleRejected: number;
  immediateTenpaiRejected: number;
  engineAnalyzed: number;
  lowUkeireRejected: number;
  /** 四張同牌且該牌屬於引擎最佳打牌 → 淘汰（暗槓決策未建模）。 */
  quadBestDiscardRejected: number;
  weakSuitRejected: number;
  hardFilterPassed: number;
  qualityThresholdPassed: number;
  thresholdConfigured: number;
  thresholdUsed: number;
  isoDuplicatesRemoved: number;
  nearDuplicatesDownweighted: number;
  selected: number;
  minSelectedQuality: number;
  avgSelectedQuality: number;
  elapsedMs: number;
}

export interface GenerationProgress {
  mode: Mode;
  phase: 'seeds' | 'search' | 'select';
  poolSize: number;
  analyzed: number;
  target: number;
}

export interface GenerateOptions {
  onProgress?: (p: GenerationProgress) => void;
  /** 每分析 N 個候選讓出 event loop（瀏覽器內使用）。0 = 不讓出。 */
  yieldEvery?: number;
}

const sleep = () => new Promise<void>((r) => setTimeout(r, 0));

function numericSuitCount(counts: Counts): number {
  let n = 0;
  for (let suit = 0; suit < 3; suit++) {
    for (let r = 0; r < 9; r++) {
      if (counts[suit * 9 + r] > 0) {
        n++;
        break;
      }
    }
  }
  return n;
}

function hasHonors(counts: Counts): boolean {
  for (let i = HONOR_START; i < TILE_TYPES; i++) {
    if (counts[i] > 0) return true;
  }
  return false;
}

/** 依 quota 比例建立花色數計畫（deterministic）。 */
function buildSuitCountPlan(mode: Mode, config: GeneratorConfig, rng: Rng): number[] {
  const quota = config.suitCountQuota[mode];
  const total = config.winningHandsPerMode[mode];
  const plan: number[] = [];
  for (const [suitCountStr, fraction] of Object.entries(quota)) {
    const n = Math.round(total * fraction);
    for (let i = 0; i < n; i++) plan.push(Number(suitCountStr));
  }
  while (plan.length < total) plan.push(Number(Object.keys(quota)[0]));
  return shuffleInPlace(rng, plan);
}

function pickSuits(rng: Rng, n: number): number[] {
  const suits = shuffleInPlace(rng, [0, 1, 2]);
  return suits.slice(0, n).sort();
}

export async function generateForMode(
  mode: Mode,
  config: GeneratorConfig,
  existingKeys: ReadonlySet<string>,
  rng: Rng,
  options: GenerateOptions = {},
): Promise<{ selected: GeneratedQuestionData[]; stats: ModeGenerationStats }> {
  const t0 = Date.now();
  const melds = requiredMeldsFor(mode);
  const target = config.targets[mode];
  const rule = MODE_SUIT_RULE[mode];
  const threshold = config.qualityThreshold[mode];
  const { onProgress, yieldEvery = 0 } = options;

  const stats: ModeGenerationStats = {
    mode,
    rawWinningHands: 0,
    rawSeeds: 0,
    candidatesEmitted: 0,
    exactDuplicatesSkipped: 0,
    suitRuleRejected: 0,
    immediateTenpaiRejected: 0,
    engineAnalyzed: 0,
    lowUkeireRejected: 0,
    quadBestDiscardRejected: 0,
    weakSuitRejected: 0,
    hardFilterPassed: 0,
    qualityThresholdPassed: 0,
    thresholdConfigured: threshold,
    thresholdUsed: threshold,
    isoDuplicatesRemoved: 0,
    nearDuplicatesDownweighted: 0,
    selected: 0,
    minSelectedQuality: 0,
    avgSelectedQuality: 0,
    elapsedMs: 0,
  };

  // ---------- Seeds ----------
  onProgress?.({ mode, phase: 'seeds', poolSize: 0, analyzed: 0, target });
  const winningKeys = new Set<string>();
  const seeds: TenpaiSeed[] = [];
  for (const suitCount of buildSuitCountPlan(mode, config, rng)) {
    const suits = pickSuits(rng, suitCount);
    const winning = generateWinningHand(mode, suits, rng);
    if (!winning) continue;
    const wKey = handKey(winning);
    if (winningKeys.has(wKey)) continue;
    winningKeys.add(wKey);
    seeds.push(...tenpaiSeedsFromWinningHand(winning, mode, suits));
  }
  stats.rawWinningHands = winningKeys.size;
  stats.rawSeeds = seeds.length;
  shuffleInPlace(rng, seeds);

  // ---------- Search + 評估 ----------
  const seen = new Set<string>(existingKeys);
  const pool: GeneratedQuestionData[] = [];
  /** 品質略低於門檻的保留區：門檻 fallback 時使用，不需重新搜尋。 */
  const reserve: GeneratedQuestionData[] = [];
  const RESERVE_FLOOR = 55;
  const maxAnalyzed = config.search.maxCandidatesPerMode[mode];
  const poolGoal = Math.ceil(target * config.search.poolMultiple[mode]);
  let pendingYield = 0;

  const handleCandidate = (counts: Counts): boolean => {
    stats.candidatesEmitted++;

    // ---- Hard filters（便宜的先做）----
    const sc = numericSuitCount(counts);
    if (sc < rule.min || sc > rule.max || hasHonors(counts)) {
      stats.suitRuleRejected++;
      return keepGoing();
    }
    const key = handKey(counts);
    if (seen.has(key)) {
      stats.exactDuplicatesSkipped++;
      return keepGoing();
    }
    seen.add(key);

    // 禁止任何第一打後立即聽牌（維持一向聽訓練性質；memoized、便宜）
    if (config.forbidImmediateTenpai) {
      for (let t = 0; t < TILE_TYPES; t++) {
        if (counts[t] === 0) continue;
        counts[t]--;
        const tenpai = isTenpai(counts, melds);
        counts[t]++;
        if (tenpai) {
          stats.immediateTenpaiRejected++;
          return keepGoing();
        }
      }
    }

    // ---- Engine 分析（Truth）----
    stats.engineAnalyzed++;
    const ev = evaluateCandidate(counts, mode, config);
    const best = ev.analysis.options.find((o) => o.isBest)!;

    if (ev.analysis.maxTotal <= 0 || best.totalRemaining < config.minBestUkeire[mode]) {
      stats.lowUkeireRejected++;
      return keepGoing();
    }

    // ---- Quad-Best-Discard exclusion（Generator acceptance rule，非麻將計算規則）----
    // 手牌中某 tile 有 4 張、且該 tile 是引擎判定的最佳打牌之一 → 整題淘汰。
    // 理由：實戰中四張同牌存在「暗槓 vs 打牌」的額外決策，目前遊戲不建模。
    // 注意：必須用引擎真正算出的 bestDiscards 判斷（不是 heuristic），
    // 且只有「quad 牌 ∈ best」才淘汰——手上有四張但最佳打其他牌的題仍合法。
    if (ev.analysis.bestDiscards.some((t) => counts[t] === 4)) {
      stats.quadBestDiscardRejected++;
      return keepGoing();
    }

    // 每個出現的花色都要真正參與（>=2 張且 participation 達標）
    for (let suit = 0; suit < 3; suit++) {
      const st = ev.structure.suits[suit];
      if (st.tileCount === 0) continue;
      if (st.tileCount < 2 || st.participationRate < config.minSuitParticipation) {
        stats.weakSuitRejected++;
        return keepGoing();
      }
    }

    stats.hardFilterPassed++;

    const quality = scoreQuality(ev, config);
    const difficultyRaw = scoreDifficultyRaw(ev, quality.breakdown);
    const tags = deriveTags(ev, quality.breakdown);

    const data: GeneratedQuestionData = {
      mode,
      tiles: idsFromCounts(counts),
      notation: toNotation(counts),
      key,
      iso: isoFingerprint(counts),
      translation: translationFingerprint(counts),
      suitCount: sc,
      quality: Math.round(quality.quality * 10) / 10,
      qualityBreakdown: quality.breakdown,
      penaltyDetails: quality.penaltyDetails,
      difficultyRaw,
      difficultyTier: 'MEDIUM',
      structureTags: tags.structureTags,
      decisionTags: tags.decisionTags,
      primaryStructureArchetype: tags.primaryStructureArchetype,
      bestDiscards: ev.analysis.bestDiscards.map(tileIdOf),
      bestUkeire: ev.analysis.maxTotal,
      bestKinds: best.kinds,
    };

    if (data.quality >= threshold) {
      pool.push(data);
      stats.qualityThresholdPassed++;
    } else if (data.quality >= RESERVE_FLOOR) {
      reserve.push(data);
    }

    return keepGoing();
  };

  const keepGoing = () =>
    stats.engineAnalyzed < maxAnalyzed && pool.length < poolGoal;

  const beams = {
    maxB: config.search.maxB[mode],
    maxX: config.search.maxX[mode],
    maxA: config.search.maxA[mode],
  };
  for (const seed of seeds) {
    if (!keepGoing()) break;
    const emitWrapped = (counts: Counts): boolean => {
      const cont = handleCandidate(counts);
      pendingYield++;
      return cont;
    };
    expandSeed(seed, beams, config, rng, emitWrapped);

    if (yieldEvery > 0 && pendingYield >= yieldEvery) {
      pendingYield = 0;
      onProgress?.({
        mode,
        phase: 'search',
        poolSize: pool.length,
        analyzed: stats.engineAnalyzed,
        target,
      });
      await sleep();
    }
  }

  // ---------- Diversity Selection + Quality threshold fallback（PART BG）----------
  // 若因 iso 同構收斂或高品質題不足導致選不滿 target，
  // 逐步（每次 −5）調低 configurable threshold 補充 reserve 再重選；
  // 絕不加入未通過 hard filter / 引擎驗證的題目。
  onProgress?.({ mode, phase: 'select', poolSize: pool.length, analyzed: stats.engineAnalyzed, target });
  if (yieldEvery > 0) await sleep();

  let effectiveThreshold = threshold;
  reserve.sort((a, b) => b.quality - a.quality);
  let outcome = selectDiverse(pool, mode, config, rng);
  while (
    outcome.selected.length < target &&
    reserve.length > 0 &&
    effectiveThreshold > RESERVE_FLOOR
  ) {
    effectiveThreshold -= 5;
    while (reserve.length > 0 && reserve[0].quality >= effectiveThreshold) {
      pool.push(reserve.shift()!);
    }
    outcome = selectDiverse(pool, mode, config, rng);
  }
  stats.thresholdUsed = effectiveThreshold;
  stats.isoDuplicatesRemoved = outcome.isoDuplicatesRemoved;
  stats.nearDuplicatesDownweighted = outcome.nearDuplicatesDownweighted;
  stats.selected = outcome.selected.length;
  stats.minSelectedQuality =
    outcome.selected.length === 0
      ? 0
      : Math.min(...outcome.selected.map((c) => c.quality));
  stats.avgSelectedQuality =
    outcome.selected.length === 0
      ? 0
      : Math.round(
          (outcome.selected.reduce((s, c) => s + c.quality, 0) / outcome.selected.length) * 10,
        ) / 10;
  stats.elapsedMs = Date.now() - t0;

  return { selected: outcome.selected, stats };
}

export interface GenerationResult {
  generatorVersion: string;
  generationSeed: number;
  configVersion: string;
  generatedAt: number;
  questions: GeneratedQuestionData[];
  stats: ModeGenerationStats[];
}

/** 對所有模式執行生成（deterministic：同 seed/config/code → 同結果）。 */
export async function generateAllModes(
  config: GeneratorConfig,
  existingKeysByMode: ReadonlyMap<Mode, ReadonlySet<string>>,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const questions: GeneratedQuestionData[] = [];
  const stats: ModeGenerationStats[] = [];
  const modes: Mode[] = [8, 11, 14, 17];
  for (const mode of modes) {
    const rng = createRng(config.rngSeed + mode * 7919);
    const { selected, stats: modeStats } = await generateForMode(
      mode,
      config,
      existingKeysByMode.get(mode) ?? new Set(),
      rng,
      options,
    );
    questions.push(...selected);
    stats.push(modeStats);
  }
  return {
    generatorVersion: GENERATOR_VERSION,
    generationSeed: config.rngSeed,
    configVersion: config.configVersion,
    generatedAt: Date.now(),
    questions,
    stats,
  };
}
