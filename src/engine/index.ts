/**
 * 台灣麻將訓練引擎——對 UI 的唯一出入口。
 *
 * 引擎完全獨立於 UI / 題庫 / rendering，只處理：
 * 牌表示、胡牌、聽牌、有效進張、最佳打牌分析。
 */
export * from './tiles';
export * from './hand';
export * from './winning';
export * from './tenpai';
export * from './ukeire';
export * from './analyzeDiscard';
export { clearEngineCaches } from './cache';
