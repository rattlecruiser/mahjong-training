/**
 * 出題順序：每一局開始時把該模式題庫洗牌一次，依序出題。
 * 同一局內不會重複；重新開始新一局才重新洗題。
 */
export function shuffleQuestions<T>(
  items: readonly T[],
  rng: () => number = Math.random,
): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
