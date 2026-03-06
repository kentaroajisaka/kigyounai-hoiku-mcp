/**
 * 通知一覧クライアント
 *
 * kigyounaihoiku.jp の「お知らせ」ページをスクレイピングして
 * 通知一覧を取得する。ページネーション対応（デフォルト全ページ取得、空ページで自動停止）。
 */

import { tsuuchiDataCache } from './cache.js';
import { ExternalApiError } from './errors.js';
import type { TsuuchiEntry } from './types.js';

const BASE_URL = 'https://www.kigyounaihoiku.jp/info';
const SOURCE_URL = BASE_URL;
const CACHE_KEY = 'tsuuchi_entries';
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PAGES = 100; // 実質上限なし（空ページで自動停止）

/** Single-flight */
let inflightFetch: Promise<TsuuchiEntry[]> | null = null;

/**
 * 通知一覧を取得（キャッシュ付き）
 */
export async function fetchTsuuchiEntries(maxPages?: number): Promise<TsuuchiEntry[]> {
  const cached = tsuuchiDataCache.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as TsuuchiEntry[];
  }

  if (inflightFetch) return inflightFetch;

  inflightFetch = doFetchTsuuchi(maxPages ?? DEFAULT_MAX_PAGES);
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

/**
 * 通知出典URL
 */
export function getTsuuchiSourceUrl(): string {
  return SOURCE_URL;
}

async function doFetchTsuuchi(maxPages: number): Promise<TsuuchiEntry[]> {
  const allEntries: TsuuchiEntry[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      // 最初のページでエラーの場合はリスロー（サイト自体にアクセスできない）
      if (page === 1) throw e;
      // 2ページ目以降はページネーション終了とみなす
      break;
    }

    const entries = parseInfoPage(html);
    if (entries.length === 0) break;

    allEntries.push(...entries);
  }

  if (allEntries.length > 0) {
    tsuuchiDataCache.set(CACHE_KEY, JSON.stringify(allEntries));
  }

  return allEntries;
}

/**
 * お知らせページHTMLから通知エントリを抽出
 *
 * パターン:
 *   <a class="c-news__link" href="URL">
 *     <time datetime="YYYY-MM-DD">...</time>
 *     <div class="c-news__cat"><span>カテゴリ</span></div>
 *     <div class="c-news__text">タイトル</div>
 *   </a>
 */
function parseInfoPage(html: string): TsuuchiEntry[] {
  const entries: TsuuchiEntry[] = [];

  // 各通知アイテムを抽出（属性順序やクラス追加に対応）
  const itemRegex = /<a\s+[^>]*class="[^"]*c-news__link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a\s+[^>]*href="([^"]+)"[^>]*class="[^"]*c-news__link[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null) {
    // class→href or href→class の両パターンに対応
    const url = match[1] ?? match[3];
    const inner = match[2] ?? match[4];

    // 日付
    const dateMatch = inner.match(/<time\s+datetime="([^"]+)"/);
    const date = dateMatch?.[1] ?? '';

    // カテゴリ (c-news__tags > c-tag)
    const catMatch = inner.match(/c-tag[^>]*>([^<]+)<\/span>/);
    const category = catMatch?.[1]?.trim() ?? '';

    // タイトル
    const titleMatch = inner.match(/c-news__text[^>]*>([^<]+)/);
    const title = decodeEntities(titleMatch?.[1]?.trim() ?? '');

    if (title && url) {
      entries.push({
        title,
        date,
        url,
        category: category || undefined,
        source: 'kigyounaihoiku',
      });
    }
  }

  return entries;
}

/** HTMLエンティティをデコード */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new ExternalApiError(`通知ページ取得エラー: HTTP ${res.status} (${url})`);
    }
    return await res.text();
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('通知ページ取得タイムアウト');
    }
    throw new ExternalApiError(
      `通知ページ取得エラー: ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
