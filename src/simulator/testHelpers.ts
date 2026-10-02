/**
 * Simulator 測試專用輔助（deterministic，獨立於 game generator）。
 * 非 *.test.ts：不會被 test runner 當成測試套件。
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 隨機合法手牌（張數固定，每種 ≤4）。 */
export function randomHand(rng: () => number, size: number): number[] {
  const hand = new Array<number>(34).fill(0);
  let placed = 0;
  while (placed < size) {
    const tile = Math.floor(rng() * 34);
    if (hand[tile] >= 4) continue;
    hand[tile]++;
    placed++;
  }
  return hand;
}

/** 隨機合法完成牌：targetMelds 面子 + 1 對（含字牌刻子）。 */
export function randomCompleteHand(rng: () => number, targetMelds: number): number[] {
  for (;;) {
    const hand = new Array<number>(34).fill(0);
    let ok = true;
    const pairTile = Math.floor(rng() * 34);
    hand[pairTile] += 2;
    for (let m = 0; m < targetMelds && ok; m++) {
      if (rng() < 0.6) {
        const suit = Math.floor(rng() * 3);
        const start = suit * 9 + Math.floor(rng() * 7);
        if (hand[start] < 4 && hand[start + 1] < 4 && hand[start + 2] < 4) {
          hand[start]++;
          hand[start + 1]++;
          hand[start + 2]++;
        } else ok = false;
      } else {
        const tile = Math.floor(rng() * 34);
        if (hand[tile] + 3 <= 4) hand[tile] += 3;
        else ok = false;
      }
    }
    if (ok) return hand;
  }
}

/** 由完成牌突變（交換 0–4 張）產生手牌；full=false 時再移除一張。 */
export function randomMutatedHand(
  rng: () => number,
  targetMelds: number,
  full: boolean,
): number[] {
  const hand = randomCompleteHand(rng, targetMelds);
  const swaps = Math.floor(rng() * 5);
  for (let s = 0; s < swaps; s++) {
    const present: number[] = [];
    for (let i = 0; i < 34; i++) if (hand[i] > 0) present.push(i);
    const out = present[Math.floor(rng() * present.length)];
    let tries = 0;
    for (;;) {
      const inn = Math.floor(rng() * 34);
      if (hand[inn] < 4) {
        hand[out]--;
        hand[inn]++;
        break;
      }
      if (++tries > 50) break;
    }
  }
  if (!full) {
    const present: number[] = [];
    for (let i = 0; i < 34; i++) if (hand[i] > 0) present.push(i);
    hand[present[Math.floor(rng() * present.length)]]--;
  }
  return hand;
}
