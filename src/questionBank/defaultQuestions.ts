import type { Mode } from '../game/modes';

/**
 * 預設 demo 題庫（development / demo 用）。
 *
 * 每一題都經過引擎完整驗證（見 src/questionBank/defaultQuestions.test.ts）：
 * - 張數正確、無第 5 張同牌
 * - 打出任何一張後都【尚未】聽牌（真正的進張訓練題，不是送分題）
 * - 存在有效進張（maxTotal > 0），且打法之間有分數差異
 *
 * 這些題目由 scripts/findSeeds.ts（npm run seeds）搜尋產生後挑選，
 * 其中 8 張模式第一題另經手算驗證（見 src/engine/ukeire.test.ts）。
 *
 * Quad-Best-Discard cleanup（scripts/replaceQuadInvalid.ts）：
 * 原 3 題「手牌四張同牌且該牌屬於引擎最佳打牌」的題目
 *（577899m66689999p444s / 2333m3445688889p / 134678m555p56666s）
 * 已替換為 Generator 產生並通過全部驗證（含新 quad 排除規則）的題目；
 * 既有安裝由題庫維護 patch（bankPatch.v1.json）同步替換。
 */
export const DEFAULT_QUESTION_NOTATIONS: Record<Mode, string[]> = {
  17: [
    '67m99p67789s11144455z',
    '3m123456p344567899s4z',
    '34466888m444556p333s',
    '4789m244678p6667s111z',
    '223m2225677779p6778s',
    '345m234777p1367789s7z',
    '456678m47888p556789s',
  ],
  14: [
    '12m12368p5557789s',
    '56677899m6688p35s',
    '12345567789p12s4z',
    '557777899p44577s',
    '9m13555789p12334s',
    '778888999m67p455s',
  ],
  11: [
    '6789m125667p7z',
    '79m11134p4566s',
    '224556m234s26z',
    '23479m23457s1z',
    '457m12345s333z',
    '13479m456777p',
  ],
  8: [
    // 手算驗證範例：最佳打牌為 五筒 / 八筒 / 東（三者並列），總有效進張 16 張
    '23m5578p11z',
    '34m24p7s222z',
    '135m23457p',
    '346678m67p',
    '668m345s37z',
    '59m567p44s5z',
  ],
};
