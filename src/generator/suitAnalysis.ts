import { HONOR_START, TILE_TYPES, type Counts } from '../engine';

/**
 * 花色結構分析（PART F / G）。
 *
 * 不用「張數 >= N 就算 active suit」這種粗糙判斷；
 * 對每個花色計算結構關係：
 *   同 rank（duplicate）、差 1（強連結）、差 2（嵌張連結）、差 >=3（無直接搭子關係）。
 * duplicate 獨立考慮：55 / 555 即使 unique rank 只有 1 也是結構。
 *
 * 本模組只做結構描述，供 Generator 的 ranking / quality 使用，
 * 完全不影響引擎答案。
 */

export interface SuitStructure {
  /** 0=萬 1=筒 2=索 3=字牌 */
  suit: number;
  tileCount: number;
  uniqueRanks: number;
  /** count>=2 的 rank 數（pair potential）。 */
  pairRanks: number;
  /** count>=3 的 rank 數（triplet potential）。 */
  tripletRanks: number;
  /** 相鄰（差 1）的 present-rank 連結數。 */
  adjacentLinks: number;
  /** 嵌張（差 2）的 present-rank 連結數。 */
  gapLinks: number;
  /** 完整順子窗（r, r+1, r+2 都在）數。 */
  sequenceWindows: number;
  /** 順子窗彼此重疊（共享 rank）的對數。 */
  overlappingWindows: number;
  /** 連通元件（rank 距離 <=2 視為連通）的 tile 數，由大到小。 */
  componentTiles: number[];
  largestComponentTiles: number;
  /** 完全孤立的 tile 數（count==1 且 ±1、±2 皆無）。 */
  isolatedTiles: number;
  /** 參與結構的 tile occurrence 數。 */
  participatingTiles: number;
  /** participatingTiles / tileCount（無牌時 = 1）。 */
  participationRate: number;
}

export interface HandStructure {
  suits: SuitStructure[]; // [萬, 筒, 索, 字]
  /** 有牌的數牌花色數。 */
  numericSuitCount: number;
  honorTiles: number;
  totalTiles: number;
  totalIsolated: number;
  participationRate: number;
  /** 有 >=2 張牌的花色中最低的 participation（含字牌）。 */
  minActiveSuitParticipation: number;
  largestComponentTiles: number;
}

function analyzeNumericSuit(counts: Counts, suit: number): SuitStructure {
  const offset = suit * 9;
  const c = (r: number) => (r >= 1 && r <= 9 ? counts[offset + r - 1] : 0);

  let tileCount = 0;
  let uniqueRanks = 0;
  let pairRanks = 0;
  let tripletRanks = 0;
  for (let r = 1; r <= 9; r++) {
    const n = c(r);
    if (n === 0) continue;
    tileCount += n;
    uniqueRanks++;
    if (n >= 2) pairRanks++;
    if (n >= 3) tripletRanks++;
  }

  let adjacentLinks = 0;
  let gapLinks = 0;
  for (let r = 1; r <= 8; r++) {
    if (c(r) > 0 && c(r + 1) > 0) adjacentLinks++;
  }
  for (let r = 1; r <= 7; r++) {
    if (c(r) > 0 && c(r + 2) > 0) gapLinks++;
  }

  const windows: number[] = [];
  for (let r = 1; r <= 7; r++) {
    if (c(r) > 0 && c(r + 1) > 0 && c(r + 2) > 0) windows.push(r);
  }
  let overlappingWindows = 0;
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (windows[j] - windows[i] <= 2) overlappingWindows++;
    }
  }

  // 連通元件：present ranks，距離 <=2 連通
  const componentTiles: number[] = [];
  let currentTiles = 0;
  let lastRank = -10;
  for (let r = 1; r <= 9; r++) {
    if (c(r) === 0) continue;
    if (r - lastRank <= 2) {
      currentTiles += c(r);
    } else {
      if (currentTiles > 0) componentTiles.push(currentTiles);
      currentTiles = c(r);
    }
    lastRank = r;
  }
  if (currentTiles > 0) componentTiles.push(currentTiles);
  componentTiles.sort((a, b) => b - a);

  // 參與判定：count>=2（duplicate 結構）或 ±1 / ±2 有鄰居
  let participatingTiles = 0;
  let isolatedTiles = 0;
  for (let r = 1; r <= 9; r++) {
    const n = c(r);
    if (n === 0) continue;
    const hasNeighbor = c(r - 1) > 0 || c(r + 1) > 0 || c(r - 2) > 0 || c(r + 2) > 0;
    if (n >= 2 || hasNeighbor) participatingTiles += n;
    else isolatedTiles += n;
  }

  return {
    suit,
    tileCount,
    uniqueRanks,
    pairRanks,
    tripletRanks,
    adjacentLinks,
    gapLinks,
    sequenceWindows: windows.length,
    overlappingWindows,
    componentTiles,
    largestComponentTiles: componentTiles[0] ?? 0,
    isolatedTiles,
    participatingTiles,
    participationRate: tileCount === 0 ? 1 : participatingTiles / tileCount,
  };
}

function analyzeHonors(counts: Counts): SuitStructure {
  let tileCount = 0;
  let uniqueRanks = 0;
  let pairRanks = 0;
  let tripletRanks = 0;
  let participatingTiles = 0;
  let isolatedTiles = 0;
  const componentTiles: number[] = [];
  for (let i = HONOR_START; i < TILE_TYPES; i++) {
    const n = counts[i];
    if (n === 0) continue;
    tileCount += n;
    uniqueRanks++;
    if (n >= 2) pairRanks++;
    if (n >= 3) tripletRanks++;
    // 字牌沒有順子關係：只有 duplicate 算參與
    if (n >= 2) participatingTiles += n;
    else isolatedTiles += n;
    componentTiles.push(n);
  }
  componentTiles.sort((a, b) => b - a);
  return {
    suit: 3,
    tileCount,
    uniqueRanks,
    pairRanks,
    tripletRanks,
    adjacentLinks: 0,
    gapLinks: 0,
    sequenceWindows: 0,
    overlappingWindows: 0,
    componentTiles,
    largestComponentTiles: componentTiles[0] ?? 0,
    isolatedTiles,
    participatingTiles,
    participationRate: tileCount === 0 ? 1 : participatingTiles / tileCount,
  };
}

export function analyzeHandStructure(counts: Counts): HandStructure {
  const suits = [
    analyzeNumericSuit(counts, 0),
    analyzeNumericSuit(counts, 1),
    analyzeNumericSuit(counts, 2),
    analyzeHonors(counts),
  ];

  const numericSuitCount = suits.slice(0, 3).filter((s) => s.tileCount > 0).length;
  const totalTiles = suits.reduce((n, s) => n + s.tileCount, 0);
  const totalIsolated = suits.reduce((n, s) => n + s.isolatedTiles, 0);
  const participating = suits.reduce((n, s) => n + s.participatingTiles, 0);

  const activeSuits = suits.filter((s) => s.tileCount >= 2);
  const minActiveSuitParticipation =
    activeSuits.length === 0
      ? 1
      : Math.min(...activeSuits.map((s) => s.participationRate));

  return {
    suits,
    numericSuitCount,
    honorTiles: suits[3].tileCount,
    totalTiles,
    totalIsolated,
    participationRate: totalTiles === 0 ? 1 : participating / totalTiles,
    minActiveSuitParticipation,
    largestComponentTiles: Math.max(...suits.map((s) => s.largestComponentTiles)),
  };
}

/** 單一 tile 在手牌中的結構關聯（Deceptiveness / B/X/A ranking 用）。 */
export interface TileContext {
  copiesInHand: number;
  hasAdjacent: boolean;
  hasGap: boolean;
  inSequenceWindow: boolean;
  isolated: boolean;
  /** 連結強度粗略分數（越高＝越像應該留的牌）。 */
  connectivity: number;
}

export function tileContext(counts: Counts, tile: number): TileContext {
  const copies = counts[tile];
  if (tile >= HONOR_START) {
    const isolated = copies <= 1;
    return {
      copiesInHand: copies,
      hasAdjacent: false,
      hasGap: false,
      inSequenceWindow: false,
      isolated,
      connectivity: copies >= 3 ? 9 : copies === 2 ? 6 : 0.3,
    };
  }
  const suit = Math.floor(tile / 9);
  const rank = (tile % 9) + 1;
  const c = (r: number) => (r >= 1 && r <= 9 ? counts[suit * 9 + r - 1] : 0);
  const hasAdjacent = c(rank - 1) > 0 || c(rank + 1) > 0;
  const hasGap = c(rank - 2) > 0 || c(rank + 2) > 0;
  let inWindow = false;
  for (let s = rank - 2; s <= rank; s++) {
    if (s >= 1 && s <= 7 && c(s) > 0 && c(s + 1) > 0 && c(s + 2) > 0) inWindow = true;
  }
  const isolated = copies <= 1 && !hasAdjacent && !hasGap;
  const connectivity =
    (copies >= 2 ? 3 + copies : 0) +
    (c(rank - 1) > 0 ? 2.5 : 0) +
    (c(rank + 1) > 0 ? 2.5 : 0) +
    (c(rank - 2) > 0 ? 1.2 : 0) +
    (c(rank + 2) > 0 ? 1.2 : 0) +
    (inWindow ? 1.5 : 0) +
    (isolated ? 0.3 : 0);
  return {
    copiesInHand: copies,
    hasAdjacent,
    hasGap,
    inSequenceWindow: inWindow,
    isolated,
    connectivity,
  };
}
