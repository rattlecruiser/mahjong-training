import { MAX_COPIES, TILE_TYPES, type TileIndex } from './tiles';
import type { Counts } from './hand';
import { isTenpai } from './tenpai';

/** 一種有效進張與其剩餘枚數。 */
export interface UkeireEntry {
  tile: TileIndex;
  /** 剩餘枚數 = 4 - 原始題目中該牌張數（原始題目所有牌都視為已知）。 */
  remaining: number;
}

/**
 * 計算「第一次打牌之後」的所有有效進張。
 *
 * 定義（本遊戲的核心規則）：
 *
 *   第一次打牌 → 下一巡摸一張 X → 再打一張 → 進入聽牌
 *
 * 打牌後若摸入 X，只要存在【至少一種】第二次打牌使手牌符合 isTenpai()，
 * X 就是一張有效進張。
 *
 * 剩餘枚數以原始題目（第一次打牌前的完整手牌）為準：4 - 原始張數。
 * 已被打出的牌仍視為已知牌，不會加回未知牌。剩餘 0 枚的牌不列入。
 *
 * @param afterDiscard   第一次打牌後的手牌（requiredMelds*3+1 張）
 * @param requiredMelds  該模式需要的面子數（17→5、14→4、11→3、8→2）
 * @param originalCounts 原始題目手牌（requiredMelds*3+2 張）
 */
export function effectiveDraws(
  afterDiscard: Counts,
  requiredMelds: number,
  originalCounts: Counts,
): UkeireEntry[] {
  const result: UkeireEntry[] = [];

  // 若第一次打牌後已經聽牌：摸入任何牌 X 後把 X 打回去即可回到聽牌，
  // 因此所有剩餘枚數 > 0 的牌都是有效進張。
  const alreadyTenpai = isTenpai(afterDiscard, requiredMelds);

  for (let x = 0; x < TILE_TYPES; x++) {
    const remaining = MAX_COPIES - originalCounts[x];
    if (remaining <= 0) continue; // 實際上已無此牌可摸

    if (alreadyTenpai) {
      result.push({ tile: x, remaining });
      continue;
    }

    afterDiscard[x]++;
    let ok = false;
    for (let d = 0; d < TILE_TYPES && !ok; d++) {
      if (afterDiscard[d] === 0) continue;
      afterDiscard[d]--;
      if (isTenpai(afterDiscard, requiredMelds)) ok = true;
      afterDiscard[d]++;
    }
    afterDiscard[x]--;

    if (ok) result.push({ tile: x, remaining });
  }

  return result;
}
