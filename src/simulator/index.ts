/**
 * NEW Simulator Engine（未來「牌效模擬器」專用）。
 *
 * 與現有遊戲引擎（src/engine/）完全隔離：
 * - 現有遊戲不 import 本模組，答案永遠由現有引擎決定。
 * - 本模組只唯讀 reuse 引擎的牌表示 / 編碼常數。
 * - 依賴方向：simulator → engine(唯讀基礎定義)；絕不反向。
 *
 * Phase 1：Shanten Calculator（VERIFIED mathematical core）。
 * Phase 2：Known Tiles / Remaining、Ukeire、Best Discard Analyzer。
 * UI / Homepage / Router 屬於 Phase 3，尚未存在。
 */
export {
  SIMULATOR_COMPLETE,
  MIN_TARGET_MELDS,
  MAX_TARGET_MELDS,
  calculateShanten,
  calculateShantenFromIds,
  clearSimulatorShantenCache,
} from './shanten';
export {
  analyzeSimulatorHand,
  analyzeSimulatorHandFromIds,
  computeRemaining,
  type SimulatorAnalysis,
  type SimulatorDiscardCandidate,
  type SimulatorEffectiveDraw,
} from './analyzer';
