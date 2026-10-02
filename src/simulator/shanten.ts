import {
  HONOR_START,
  MAX_COPIES,
  TILE_TYPES,
  type TileId,
  countsFromIds,
} from '../engine';

/**
 * ============================================================
 * Simulator Shanten Calculator（NEW Simulator Engine 的一部分）
 * ============================================================
 *
 * 【隔離原則】
 * 這是為未來「牌效模擬器」建立的全新獨立計算器，
 * 不是現有遊戲引擎（src/engine/，LOCKED / VERIFIED / READ-ONLY）
 * 的升級版。現有遊戲不 import 本模組；本模組只唯讀 reuse
 * 引擎的「牌表示 / 34 編碼」等非計算核心的基礎定義
 * （Counts、TileId、HONOR_START…），不呼叫、不修改任何
 * 引擎計算邏輯。測試中才以現有引擎作為 cross-validation oracle。
 *
 * 【Shanten Convention】（數字越小越接近完成；full 與
 * post-discard waiting state 之間不存在 off-by-one）：
 *
 *   -1 = Complete（完整 targetMelds 面子 + 1 對將；只可能出現在
 *        3T+2 張的 full state）
 *    0 = Tenpai（3T+1 張：摸進一張即可完成；
 *        3T+2 張：存在一種打牌使其後為 Tenpai）
 *    s = 還需要 s 次有效進張交換才能聽牌（1-shanten、2-shanten…）
 *
 *   性質：full state 的 shanten == min over 所有打牌後
 *   waiting state 的 shanten（由 property test 驗證）。
 *
 * 【只支援一般形】N melds + 1 pair。無七對、國士、花牌、赤牌。
 * 字牌只能組成刻子 / 對子 / 孤張，永遠不能組順子或任何搭子。
 *
 * 【targetMelds 完全參數化】1–5。不從張數推導：
 *   17/16 張 → targetMelds = 5、14/13 → 4、11/10 → 3、
 *   8/7 → 2、5/4 → 1。合法張數 = 3T+2（full）或 3T+1（waiting）。
 *
 * 【非 greedy】對「目前手牌」做窮舉式遞迴拆解（每個花色列出
 * 所有 (面子, 搭子, 對子) 的 Pareto-optimal 組合，再跨花色合併取
 * 全局最小 shanten），overlapping decomposition（233445567、
 * 22334455…）不會被第一個拆法鎖死。這是 current-hand
 * decomposition，不是 future draw/discard lookahead。
 *
 * 【Pure】deterministic、無副作用、不修改 caller input、
 * 無 UI / 題庫 / GameState / storage 相依。
 */

export const SIMULATOR_COMPLETE = -1;
export const MIN_TARGET_MELDS = 1;
export const MAX_TARGET_MELDS = 5;

/** 一個花色（或字牌區）拆解結果：完成面子 / 搭子 / 對子塊數。 */
interface BlockTriple {
  melds: number;
  tatsu: number;
  pairs: number;
}

/* ------------------------------------------------------------------ */
/*  單一花色 / 字牌區的窮舉拆解（Pareto frontier + 全域 memoization）  */
/* ------------------------------------------------------------------ */

/** memo：key = 區塊 counts 字串 + 是否允許順子。跨呼叫共用（純資料）。 */
const groupMemo = new Map<string, BlockTriple[]>();
const GROUP_MEMO_LIMIT = 200_000;

/** 上限：塊數超過需求永遠沒有幫助（T ≤ 5 → 最多 6 個 block 有意義）。 */
const MAX_USEFUL_MELDS = 5;
const MAX_USEFUL_PARTIALS = 6;

function decomposeGroup(cells: number[], allowRuns: boolean): BlockTriple[] {
  let key = allowRuns ? 'r' : 'h';
  for (let i = 0; i < cells.length; i++) key += cells[i];
  const cached = groupMemo.get(key);
  if (cached) return cached;

  const found = new Set<number>();
  const triples: BlockTriple[] = [];

  const record = (m: number, t: number, p: number) => {
    const id = m * 64 + t * 8 + p;
    if (found.has(id)) return;
    found.add(id);
    triples.push({ melds: m, tatsu: t, pairs: p });
  };

  const n = cells.length;

  const dfs = (start: number, m: number, t: number, p: number) => {
    let i = start;
    while (i < n && cells[i] === 0) i++;
    if (i === n) {
      record(m, t, p);
      return;
    }

    // 1) 刻子
    if (m < MAX_USEFUL_MELDS && cells[i] >= 3) {
      cells[i] -= 3;
      dfs(i, m + 1, t, p);
      cells[i] += 3;
    }

    // 2) 順子（只有數牌；同一 index 可重複取用形成 overlapping runs）
    if (allowRuns && m < MAX_USEFUL_MELDS && i + 2 < n && cells[i + 1] > 0 && cells[i + 2] > 0) {
      cells[i]--;
      cells[i + 1]--;
      cells[i + 2]--;
      dfs(i, m + 1, t, p);
      cells[i]++;
      cells[i + 1]++;
      cells[i + 2]++;
    }

    if (t + p < MAX_USEFUL_PARTIALS) {
      // 3) 對子塊（可能成為將，也可能是刻子素材；由最終公式全局比較）
      if (cells[i] >= 2) {
        cells[i] -= 2;
        dfs(i, m, t, p + 1);
        cells[i] += 2;
      }

      if (allowRuns) {
        // 4) 兩面 / 邊張搭子（字牌永遠不進入此分支）
        if (i + 1 < n && cells[i + 1] > 0) {
          cells[i]--;
          cells[i + 1]--;
          dfs(i, m, t + 1, p);
          cells[i]++;
          cells[i + 1]++;
        }
        // 5) 嵌張搭子
        if (i + 2 < n && cells[i + 2] > 0) {
          cells[i]--;
          cells[i + 2]--;
          dfs(i, m, t + 1, p);
          cells[i]++;
          cells[i + 2]++;
        }
      }
    }

    // 6) 孤張（放棄這一張）
    cells[i]--;
    dfs(i, m, t, p);
    cells[i]++;
  };

  dfs(0, 0, 0, 0);

  // Pareto frontier：分數對 (m, t, p) 各自單調，被支配的組合不可能更好
  const frontier = triples.filter(
    (a) =>
      !triples.some(
        (b) =>
          b !== a &&
          b.melds >= a.melds &&
          b.tatsu >= a.tatsu &&
          b.pairs >= a.pairs &&
          (b.melds > a.melds || b.tatsu > a.tatsu || b.pairs > a.pairs),
      ),
  );

  if (groupMemo.size >= GROUP_MEMO_LIMIT) groupMemo.clear();
  groupMemo.set(key, frontier);
  return frontier;
}

/* ------------------------------------------------------------------ */
/*  Shanten 公式（targetMelds 參數化）                                  */
/* ------------------------------------------------------------------ */

/**
 * 給定全手牌的 (完成面子 m、搭子 t、對子 p) 組合與 targetMelds T：
 *
 *   有頭（p ≥ 1，保留一個對子當將）：
 *     useful = min(p − 1 + t, T − m)      ← 超過需求的搭子不得計入
 *     shanten = 2·(T − m) − useful − 1
 *
 *   無頭：
 *     useful = min(p + t, T − m)
 *     shanten = 2·(T − m) − useful
 *
 * 取兩者較小。完成形（m = T 且有頭）= −1。
 */
function scoreTriple(m: number, t: number, p: number, targetMelds: number): number {
  const need = targetMelds - Math.min(m, targetMelds);
  let best = 2 * need - Math.min(p + t, need); // 無頭
  if (p >= 1) {
    const withHead = 2 * need - Math.min(p - 1 + t, need) - 1;
    if (withHead < best) best = withHead;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * 計算 Simulator Shanten。
 *
 * @param counts      34 格 tile counts（不會被修改）
 * @param targetMelds 目標面子數 1–5（不從張數推導；打牌後的
 *                    intermediate state 仍沿用原 targetMelds）
 * @throws 張數不合法（必須 = 3T+1 或 3T+2）、任一牌 > 4 張、
 *         targetMelds 超出 1–5、counts 長度錯誤時丟出 Error。
 */
export function calculateShanten(
  counts: ArrayLike<number>,
  targetMelds: number,
): number {
  if (!Number.isInteger(targetMelds) || targetMelds < MIN_TARGET_MELDS || targetMelds > MAX_TARGET_MELDS) {
    throw new Error(`targetMelds 必須是 ${MIN_TARGET_MELDS}–${MAX_TARGET_MELDS} 的整數，收到 ${targetMelds}`);
  }
  if (counts.length !== TILE_TYPES) {
    throw new Error(`counts 長度必須是 ${TILE_TYPES}，收到 ${counts.length}`);
  }

  let total = 0;
  for (let i = 0; i < TILE_TYPES; i++) {
    const c = counts[i];
    if (!Number.isInteger(c) || c < 0 || c > MAX_COPIES) {
      throw new Error(`第 ${i} 種牌數量不合法（${c}）：每種牌 0–${MAX_COPIES} 張`);
    }
    total += c;
  }
  const full = targetMelds * 3 + 2;
  if (total !== full && total !== full - 1) {
    throw new Error(
      `張數不合法：targetMelds=${targetMelds} 時手牌必須是 ${full - 1} 或 ${full} 張，收到 ${total}`,
    );
  }

  // 複製 input（保證不修改 caller 資料）
  const work: number[] = [];
  for (let i = 0; i < TILE_TYPES; i++) work.push(counts[i]);

  // 各區 Pareto frontier
  const frontiers: BlockTriple[][] = [
    decomposeGroup(work.slice(0, 9), true),
    decomposeGroup(work.slice(9, 18), true),
    decomposeGroup(work.slice(18, 27), true),
    decomposeGroup(work.slice(HONOR_START, TILE_TYPES), false),
  ];

  // 跨花色合併取全局最小
  let best = Infinity;
  for (const a of frontiers[0]) {
    for (const b of frontiers[1]) {
      for (const c of frontiers[2]) {
        for (const d of frontiers[3]) {
          const s = scoreTriple(
            a.melds + b.melds + c.melds + d.melds,
            a.tatsu + b.tatsu + c.tatsu + d.tatsu,
            a.pairs + b.pairs + c.pairs + d.pairs,
            targetMelds,
          );
          if (s < best) best = s;
        }
      }
    }
  }
  return best;
}

/** 便利版：以 tile id 陣列輸入（'5m'、'1z'…），input 不會被修改。 */
export function calculateShantenFromIds(
  tiles: readonly TileId[],
  targetMelds: number,
): number {
  return calculateShanten(countsFromIds(tiles as TileId[]), targetMelds);
}

/** 測試 / 未來效能調校用：清空 memoization cache（不影響結果）。 */
export function clearSimulatorShantenCache(): void {
  groupMemo.clear();
}
