import { describe, expect, it } from 'vitest';
import { analyzeHand } from './analyzeDiscard';
import { tileIdOf } from './tiles';
import { counts } from '../testing/hands';

/**
 * 引擎行為回歸鎖定（Phase 2）。
 *
 * 以下快照由已驗證正確的引擎（第一階段，67 tests 通過、含手算對照）
 * 對預設題庫全部 26 題計算而得。
 *
 * 【任何使這些測試失敗的改動都改變了麻將答案，一律禁止。】
 * Generator / Admin / UI 只能呼叫引擎，不能改變它的數學行為。
 */

interface Snapshot {
  mode: number;
  hand: string;
  best: string;
  maxTotal: number;
  bestKinds: number;
  options: number;
}

const SNAPSHOTS: Snapshot[] = [
  { mode: 17, hand: '67m99p67789s11144455z', best: '9p,5z', maxTotal: 15, bestKinds: 4, options: 10 },
  { mode: 17, hand: '3m123456p344567899s4z', best: '4z', maxTotal: 36, bestKinds: 11, options: 15 },
  { mode: 17, hand: '577899m66689999p444s', best: '9p', maxTotal: 19, bestKinds: 6, options: 8 },
  { mode: 17, hand: '4789m244678p6667s111z', best: '2p', maxTotal: 37, bestKinds: 11, options: 12 },
  { mode: 17, hand: '223m2225677779p6778s', best: '9p', maxTotal: 33, bestKinds: 10, options: 10 },
  { mode: 17, hand: '345m234777p1367789s7z', best: '7z', maxTotal: 25, bestKinds: 8, options: 14 },
  { mode: 17, hand: '456678m47888p556789s', best: '7p', maxTotal: 37, bestKinds: 11, options: 13 },
  { mode: 14, hand: '12m12368p5557789s', best: '7s', maxTotal: 20, bestKinds: 6, options: 11 },
  { mode: 14, hand: '56677899m6688p35s', best: '6p,8p', maxTotal: 12, bestKinds: 4, options: 9 },
  { mode: 14, hand: '12345567789p12s4z', best: '4z', maxTotal: 32, bestKinds: 11, options: 12 },
  { mode: 14, hand: '2333m3445688889p', best: '8p', maxTotal: 25, bestKinds: 7, options: 8 },
  { mode: 14, hand: '9m13555789p12334s', best: '9m', maxTotal: 29, bestKinds: 9, options: 11 },
  { mode: 14, hand: '134678m555p56666s', best: '1m,6s', maxTotal: 25, bestKinds: 7, options: 9 },
  { mode: 11, hand: '6789m125667p7z', best: '6p', maxTotal: 13, bestKinds: 4, options: 10 },
  { mode: 11, hand: '79m11134p4566s', best: '6s', maxTotal: 24, bestKinds: 7, options: 8 },
  { mode: 11, hand: '224556m234s26z', best: '2z,6z', maxTotal: 21, bestKinds: 7, options: 9 },
  { mode: 11, hand: '23479m23457s1z', best: '1z', maxTotal: 23, bestKinds: 7, options: 11 },
  { mode: 11, hand: '457m12345s333z', best: '7m', maxTotal: 33, bestKinds: 10, options: 9 },
  { mode: 11, hand: '13479m456777p', best: '1m', maxTotal: 24, bestKinds: 7, options: 9 },
  { mode: 8, hand: '23m5578p11z', best: '5p,8p,1z', maxTotal: 16, bestKinds: 4, options: 6 },
  { mode: 8, hand: '34m24p7s222z', best: '7s', maxTotal: 24, bestKinds: 7, options: 6 },
  { mode: 8, hand: '135m23457p', best: '1m,5m', maxTotal: 23, bestKinds: 7, options: 8 },
  { mode: 8, hand: '346678m67p', best: '6m', maxTotal: 28, bestKinds: 8, options: 7 },
  { mode: 8, hand: '668m345s37z', best: '3z,7z', maxTotal: 16, bestKinds: 5, options: 7 },
  { mode: 8, hand: '59m567p44s5z', best: '5z', maxTotal: 28, bestKinds: 8, options: 7 },
];

describe('引擎回歸鎖定（LOCKED：任何失敗代表答案被改變）', () => {
  for (const snap of SNAPSHOTS) {
    it(`${snap.mode} 張 ${snap.hand} → 最佳 ${snap.best}（${snap.maxTotal} 張）`, () => {
      const analysis = analyzeHand(counts(snap.hand), (snap.mode - 2) / 3);
      expect(analysis.bestDiscards.map(tileIdOf).join(',')).toBe(snap.best);
      expect(analysis.maxTotal).toBe(snap.maxTotal);
      expect(analysis.options[0].kinds).toBe(snap.bestKinds);
      expect(analysis.options).toHaveLength(snap.options);
    });
  }
});
