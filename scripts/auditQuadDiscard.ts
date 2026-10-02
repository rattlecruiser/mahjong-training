/**
 * PART 1 audit：掃描正式題庫（generatedBank.v1.json + 內建 demo 題），
 * 找出「手牌中某 tile 有 4 張、且該 tile 屬於引擎最佳打牌」的無效題。
 *
 * 答案一律用現有 Engine 即時計算（analyzeHand），不使用 cached metadata。
 * 執行：npx tsx scripts/auditQuadDiscard.ts
 */
import bankData from '../src/questionBank/generatedBank.v1.json';
import type { GenerationResult } from '../src/generator/generate';
import { DEFAULT_QUESTION_NOTATIONS } from '../src/questionBank/defaultQuestions';
import { parseHandText } from '../src/questionBank/parser';
import {
  analyzeHand,
  countsFromIds,
  tileIdOf,
  toNotation,
} from '../src/engine';
import { MODES, type Mode, requiredMeldsFor } from '../src/game/modes';

const data = bankData as unknown as GenerationResult;

interface Invalid {
  source: 'GENERATED' | 'DEFAULT';
  mode: Mode;
  index: number; // generated: JSON index（= 匯入 id g1-{mode}-{index} 的 index）；default: notations index
  notation: string;
  key: string;
  quadTiles: string[];
  bestDiscards: string[];
}

const invalids: Invalid[] = [];
const counts: Record<Mode, { total: number; invalid: number }> = {
  8: { total: 0, invalid: 0 },
  11: { total: 0, invalid: 0 },
  14: { total: 0, invalid: 0 },
  17: { total: 0, invalid: 0 },
};

function checkHand(
  tiles: readonly string[],
  mode: Mode,
): { quadBest: string[]; best: string[]; key: string } {
  const c = countsFromIds(tiles);
  const analysis = analyzeHand(c, requiredMeldsFor(mode));
  const quadBest = analysis.bestDiscards.filter((t) => c[t] === 4).map(tileIdOf);
  return {
    quadBest,
    best: analysis.bestDiscards.map(tileIdOf),
    key: toNotation(c),
  };
}

// ---- 生成題庫（1500 題）----
data.questions.forEach((q, index) => {
  counts[q.mode].total++;
  const r = checkHand(q.tiles, q.mode);
  if (r.quadBest.length > 0) {
    counts[q.mode].invalid++;
    invalids.push({
      source: 'GENERATED',
      mode: q.mode,
      index,
      notation: q.notation,
      key: q.key,
      quadTiles: r.quadBest,
      bestDiscards: r.best,
    });
  }
});

// ---- 內建 demo 題（25 題）----
for (const mode of MODES) {
  DEFAULT_QUESTION_NOTATIONS[mode].forEach((notation, index) => {
    counts[mode].total++;
    const parsed = parseHandText(notation);
    if (!parsed.ok) throw new Error(`default 題解析失敗：${notation}`);
    const r = checkHand(parsed.tiles, mode);
    if (r.quadBest.length > 0) {
      counts[mode].invalid++;
      invalids.push({
        source: 'DEFAULT',
        mode,
        index,
        notation,
        key: r.key,
        quadTiles: r.quadBest,
        bestDiscards: r.best,
      });
    }
  });
}

console.log('=== Quad-Best-Discard audit ===');
for (const mode of [8, 11, 14, 17] as Mode[]) {
  console.log(`${mode} 張：total=${counts[mode].total} invalid=${counts[mode].invalid}`);
}
console.log(`TOTAL invalid: ${invalids.length}`);
for (const inv of invalids) {
  console.log(
    `[${inv.source}] mode=${inv.mode} index=${inv.index} ${inv.notation}` +
      ` quad+best=${inv.quadTiles.join(',')} best=${inv.bestDiscards.join(',')}`,
  );
}

// 供後續 script 使用
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/quad-audit.json', JSON.stringify(invalids, null, 2));
console.log('written /tmp/quad-audit.json');
