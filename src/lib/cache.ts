/**
 * シンプルなインメモリTTLキャッシュ（サイズ上限付き）
 */

interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(defaultTtlMs: number, maxEntries: number = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      this.evict();
    }
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private evict(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (now > v.expires) {
        this.cache.delete(k);
      }
    }
    while (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }
}

// キャッシュインスタンス

/** 法令全文キャッシュ: TTL 1時間, 最大100件 */
export const lawDataCache = new TTLCache<string>(60 * 60 * 1000, 100);

/** 法令検索結果キャッシュ: TTL 30分, 最大200件 */
export const lawSearchCache = new TTLCache<string>(30 * 60 * 1000, 200);

/** FAQデータキャッシュ: TTL 24時間, 最大5件 */
export const faqDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 5);

/** 実施要綱データキャッシュ: TTL 24時間, 最大5件 */
export const youkouDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 5);

/** 指導監督基準データキャッシュ: TTL 24時間, 最大5件 */
export const kantokuDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 5);

/** 通知一覧データキャッシュ: TTL 24時間, 最大5件 */
export const tsuuchiDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 5);

/** 単価構造化データキャッシュ: TTL 24時間, 最大5件 */
export const tankaDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 5);

/** 監査関連PDFデータキャッシュ: TTL 24時間, 最大10件（7文書 + 余裕） */
export const kansaDataCache = new TTLCache<string>(24 * 60 * 60 * 1000, 10);
