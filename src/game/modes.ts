/**
 * 四種遊戲模式。模式名稱＝題目實際顯示的手牌張數。
 *
 *   17 張 → 5 面子 + 1 對將
 *   14 張 → 4 面子 + 1 對將
 *   11 張 → 3 面子 + 1 對將
 *    8 張 → 2 面子 + 1 對將
 *
 * 引擎完全參數化（requiredMelds），四種模式共用同一套演算法。
 */
export const MODES = [17, 14, 11, 8] as const;

export type Mode = (typeof MODES)[number];

export function requiredMeldsFor(mode: Mode): number {
  return (mode - 2) / 3;
}

export interface ModeInfo {
  mode: Mode;
  melds: number;
  label: string;
  formula: string;
}

export const MODE_INFO: ModeInfo[] = MODES.map((mode) => ({
  mode,
  melds: requiredMeldsFor(mode),
  label: `${mode} 張`,
  formula: `${requiredMeldsFor(mode)} 面子 + 1 對將`,
}));

export function isMode(value: number): value is Mode {
  return (MODES as readonly number[]).includes(value);
}
