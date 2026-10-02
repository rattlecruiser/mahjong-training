/**
 * 引擎共用的 memoization cache。
 *
 * 所有 cache 的 key 都來自 handKey()（canonical、與順序無關），
 * 因此同一手牌不論來源為何都只會計算一次。
 * 使用簡單的「滿了就清空」策略避免無上限成長。
 */

export class BoundedCache<V> {
  private map = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries) this.map.clear();
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

/** 單一花色（9 格）能否完全拆成面子。 */
export const suitMeldCache = new BoundedCache<boolean>(200_000);

/** 完整手牌胡牌判定。 */
export const winCache = new BoundedCache<boolean>(400_000);

/** 聽牌判定。 */
export const tenpaiCache = new BoundedCache<boolean>(400_000);

export function clearEngineCaches(): void {
  suitMeldCache.clear();
  winCache.clear();
  tenpaiCache.clear();
}
