/**
 * 正式題庫生成 script（offline Node，PART AB / BF）。
 *
 * 執行：npm run generate
 * 產出：src/questionBank/generatedBank.v1.json（正式生成題庫，App 首次啟動匯入）
 *
 * Generator 只產生 candidate；每一題的答案（bestDiscards / bestUkeire）
 * 都由現有引擎計算，寫檔前再全部重新驗證一次（PART AW）。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_GENERATOR_CONFIG,
  MODE_SUIT_RULE,
  generateAllModes,
  type GeneratedQuestionData,
  type ModeGenerationStats,
} from '../src/generator';
import {
  HONOR_START,
  MAX_COPIES,
  TILE_TYPES,
  analyzeHand,
  countsFromIds,
  tileIdOf,
} from '../src/engine';
import { MODES, type Mode, requiredMeldsFor } from '../src/game/modes';
import { DEFAULT_QUESTION_NOTATIONS } from '../src/questionBank/defaultQuestions';
import { parseHandText } from '../src/questionBank/parser';
import { handKey } from '../src/engine';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '../src/questionBank/generatedBank.v1.json');

async function main() {
  const config = DEFAULT_GENERATOR_CONFIG;

  // 既有（第一階段內建）題庫：生成時 exact-duplicate 排除（PART BJ）
  const existingKeysByMode = new Map<Mode, Set<string>>();
  for (const mode of MODES) {
    const keys = new Set<string>();
    for (const notation of DEFAULT_QUESTION_NOTATIONS[mode]) {
      const parsed = parseHandText(notation);
      if (parsed.ok) keys.add(handKey(countsFromIds(parsed.tiles)));
    }
    existingKeysByMode.set(mode, keys);
  }

  const t0 = Date.now();
  let lastLog = 0;
  const result = await generateAllModes(config, existingKeysByMode, {
    onProgress: (p) => {
      const now = Date.now();
      if (now - lastLog > 5000 || p.phase !== 'search') {
        lastLog = now;
        console.log(
          `[${((now - t0) / 1000).toFixed(0)}s] mode=${p.mode} phase=${p.phase} pool=${p.poolSize} analyzed=${p.analyzed}`,
        );
      }
    },
    yieldEvery: 500,
  });

  // ---------- 寫檔前完整重新驗證（PART AW）----------
  const errors: string[] = [];
  const keySeen = new Set<string>();
  for (const q of result.questions) {
    const counts = countsFromIds(q.tiles);
    const melds = requiredMeldsFor(q.mode);
    if (q.tiles.length !== q.mode) errors.push(`${q.notation}: 張數錯誤`);
    for (let i = 0; i < TILE_TYPES; i++) {
      if (counts[i] > MAX_COPIES) errors.push(`${q.notation}: >4 copies`);
    }
    for (let i = HONOR_START; i < TILE_TYPES; i++) {
      if (counts[i] > 0) errors.push(`${q.notation}: 含字牌`);
    }
    let suits = 0;
    for (let s = 0; s < 3; s++) {
      for (let r = 0; r < 9; r++) {
        if (counts[s * 9 + r] > 0) {
          suits++;
          break;
        }
      }
    }
    const rule = MODE_SUIT_RULE[q.mode];
    if (suits < rule.min || suits > rule.max) {
      errors.push(`${q.notation}: 花色數 ${suits} 違反 ${q.mode} 張規則`);
    }
    const key = handKey(counts);
    if (keySeen.has(key)) errors.push(`${q.notation}: exact duplicate`);
    keySeen.add(key);
    if (existingKeysByMode.get(q.mode)!.has(key)) {
      errors.push(`${q.notation}: 與既有題庫重複`);
    }
    // 引擎重新驗證 cached answer
    const analysis = analyzeHand(counts, melds);
    const best = analysis.bestDiscards.map(tileIdOf).join(',');
    if (best !== q.bestDiscards.join(',') || analysis.maxTotal !== q.bestUkeire) {
      errors.push(`${q.notation}: cached answer 與引擎不符`);
    }
  }
  if (errors.length > 0) {
    console.error(`❌ 驗證失敗 ${errors.length} 項：`);
    for (const e of errors.slice(0, 20)) console.error('  ' + e);
    process.exit(1);
  }

  writeFileSync(OUT_PATH, JSON.stringify(result));
  console.log(`\n✓ 已寫入 ${OUT_PATH}（${result.questions.length} 題）\n`);

  // ---------- PART BF 統計報告 ----------
  printReport(result.questions, result.stats);
  console.log(`總耗時：${((Date.now() - t0) / 1000 / 60).toFixed(1)} 分鐘`);
}

function printReport(questions: GeneratedQuestionData[], stats: ModeGenerationStats[]) {
  console.log('===== Generator 統計報告（PART BF）=====\n');
  for (const s of stats) {
    console.log(`--- ${s.mode} 張模式 ---`);
    console.log(
      `  winning hands: ${s.rawWinningHands}  tenpai seeds: ${s.rawSeeds}  candidates emitted: ${s.candidatesEmitted}`,
    );
    console.log(
      `  exact dup skip: ${s.exactDuplicatesSkipped}  suit-rule reject: ${s.suitRuleRejected}  immediate-tenpai reject: ${s.immediateTenpaiRejected}`,
    );
    console.log(
      `  engine analyzed: ${s.engineAnalyzed}  low-ukeire: ${s.lowUkeireRejected}  weak-suit: ${s.weakSuitRejected}  hard-filter pass: ${s.hardFilterPassed}`,
    );
    console.log(
      `  quality pass: ${s.qualityThresholdPassed}（threshold ${s.thresholdConfigured} → 實際使用 ${s.thresholdUsed}）`,
    );
    console.log(
      `  iso-dup removed: ${s.isoDuplicatesRemoved}  near-dup downweighted: ${s.nearDuplicatesDownweighted}`,
    );
    console.log(
      `  selected: ${s.selected}  avg quality: ${s.avgSelectedQuality}  min quality: ${s.minSelectedQuality}  elapsed: ${(s.elapsedMs / 1000).toFixed(0)}s`,
    );

    const qs = questions.filter((q) => q.mode === s.mode);
    const dist = (get: (q: GeneratedQuestionData) => string) => {
      const map = new Map<string, number>();
      for (const q of qs) map.set(get(q), (map.get(get(q)) ?? 0) + 1);
      return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
    };
    console.log(`  quality 分佈: ${dist((q) => String(Math.floor(q.quality / 5) * 5))}`);
    console.log(`  difficulty tier: ${dist((q) => q.difficultyTier)}`);
    console.log(`  suit count: ${dist((q) => `${q.suitCount}色`)}`);
    console.log(`  primary archetype: ${dist((q) => q.primaryStructureArchetype)}`);
    const tagDist = new Map<string, number>();
    for (const q of qs) for (const t of q.structureTags) tagDist.set(t, (tagDist.get(t) ?? 0) + 1);
    console.log(
      `  structure tags: ${[...tagDist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`,
    );
    const decDist = new Map<string, number>();
    for (const q of qs) for (const t of q.decisionTags) decDist.set(t, (decDist.get(t) ?? 0) + 1);
    console.log(
      `  decision tags: ${[...decDist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`,
    );
    const tied = qs.filter((q) => q.bestDiscards.length > 1).length;
    console.log(
      `  unique best: ${(((qs.length - tied) / qs.length) * 100).toFixed(1)}%  tied best: ${((tied / qs.length) * 100).toFixed(1)}%`,
    );
    // 隨機樣本（人工檢查用）
    console.log('  樣本:');
    const step = Math.max(1, Math.floor(qs.length / 5));
    for (let i = 0; i < qs.length; i += step) {
      const q = qs[i];
      console.log(
        `    ${q.notation}  best=${q.bestDiscards.join('/')}(${q.bestUkeire}張) q=${q.quality} ${q.difficultyTier} [${q.structureTags.slice(0, 3).join(',')}]`,
      );
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
