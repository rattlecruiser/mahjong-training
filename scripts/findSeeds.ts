/**
 * 開發工具：搜尋適合作為 demo 題目的手牌。
 *
 * 條件：
 *  - 張數符合模式、每種牌 ≤ 4
 *  - 打出任何一張後都【尚未】聽牌（真正的進張訓練題）
 *  - 最佳打牌的總有效枚數在合理範圍（不會太難也不會全部一樣）
 *  - 打法之間有分數差異（有「選擇」的意義）
 *
 * 執行：npm run seeds
 * 輸出候選題目 notation，人工挑選後貼入 src/questionBank/defaultQuestions.ts。
 */
import {
  MAX_COPIES,
  TILE_TYPES,
  type Counts,
  analyzeHand,
  emptyCounts,
  isTenpai,
  toNotation,
} from '../src/engine';
import { MODES, requiredMeldsFor } from '../src/game/modes';

const rng = mulberry32(20260930);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (n: number) => Math.floor(rng() * n);

/** 隨機完整面子：60% 順子、40% 刻子。回傳 tile index 陣列。 */
function randomMeld(): number[] {
  if (rng() < 0.6) {
    const suit = randInt(3);
    const start = suit * 9 + randInt(7);
    return [start, start + 1, start + 2];
  }
  const t = randInt(TILE_TYPES);
  return [t, t, t];
}

/** 隨機部分塊：搭子（兩面/嵌張）或對子。 */
function randomPartial(): number[] {
  const kind = rng();
  if (kind < 0.42) {
    // 兩面/邊張搭子
    const suit = randInt(3);
    const start = suit * 9 + randInt(8);
    return [start, start + 1];
  }
  if (kind < 0.7) {
    // 嵌張
    const suit = randInt(3);
    const start = suit * 9 + randInt(7);
    return [start, start + 2];
  }
  // 對子（含字牌）
  const t = randInt(TILE_TYPES);
  return [t, t];
}

function randomSingle(): number[] {
  return [randInt(TILE_TYPES)];
}

/** 8 張的「進張區」模板（完整面子之外的部分）。 */
const TAIL_TEMPLATES: (() => number[][])[] = [
  () => [randomPartial(), randomPartial(), randomPartial(), randomPartial()],
  () => [randomPartial(), randomPartial(), randomPartial(), randomSingle(), randomSingle()],
  () => [randomMeld(), randomPartial(), randomPartial(), randomSingle()],
  () => [randomMeld(), randomPartial(), randomSingle(), randomSingle(), randomSingle()],
];

function candidate(mode: number): Counts | null {
  const melds = requiredMeldsFor(mode as 17 | 14 | 11 | 8);
  const counts = emptyCounts();
  const blocks: number[][] = [];
  for (let i = 0; i < melds - 2; i++) blocks.push(randomMeld());
  const tail = TAIL_TEMPLATES[randInt(TAIL_TEMPLATES.length)]();
  blocks.push(...tail);

  let total = 0;
  for (const block of blocks) {
    for (const t of block) {
      counts[t]++;
      total++;
    }
  }
  if (total !== mode) return null;
  for (let i = 0; i < TILE_TYPES; i++) {
    if (counts[i] > MAX_COPIES) return null;
  }
  return counts;
}

interface Found {
  notation: string;
  maxTotal: number;
  bestCount: number;
  optionCount: number;
  distinctTotals: number;
  elapsedMs: number;
}

function evaluate(counts: Counts, mode: number): Found | null {
  const melds = requiredMeldsFor(mode as 17 | 14 | 11 | 8);

  // 打出任何一張後都不能已經聽牌
  for (let t = 0; t < TILE_TYPES; t++) {
    if (counts[t] === 0) continue;
    counts[t]--;
    const tenpai = isTenpai(counts, melds);
    counts[t]++;
    if (tenpai) return null;
  }

  const analysis = analyzeHand([...counts], melds);
  if (analysis.maxTotal < 12 || analysis.maxTotal > 70) return null;
  if (analysis.bestDiscards.length > 3) return null;
  const totals = new Set(analysis.options.map((o) => o.totalRemaining));
  if (totals.size < 3) return null;
  if (analysis.options.length < 5) return null;

  return {
    notation: toNotation(counts),
    maxTotal: analysis.maxTotal,
    bestCount: analysis.bestDiscards.length,
    optionCount: analysis.options.length,
    distinctTotals: totals.size,
    elapsedMs: analysis.elapsedMs,
  };
}

for (const mode of MODES) {
  const found: Found[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (found.length < 10 && attempts < 300_000) {
    attempts++;
    const counts = candidate(mode);
    if (!counts) continue;
    const key = toNotation(counts);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = evaluate(counts, mode);
    if (result) found.push(result);
  }
  console.log(`\n===== ${mode} 張模式（嘗試 ${attempts} 次）=====`);
  for (const f of found) {
    console.log(
      `'${f.notation}',  // best×${f.bestCount} max=${f.maxTotal} options=${f.optionCount} totals=${f.distinctTotals} ${f.elapsedMs.toFixed(1)}ms`,
    );
  }
}
