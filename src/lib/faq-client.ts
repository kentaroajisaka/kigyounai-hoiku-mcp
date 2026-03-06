/**
 * FAQ クライアント
 *
 * kigyounaihoiku.jp の WordPress REST API (ufaq) から
 * FAQ一覧を取得してキャッシュする。
 */

import { faqDataCache } from './cache.js';
import { ExternalApiError } from './errors.js';
import type { FaqEntry } from './types.js';

const FAQ_API_URL = 'https://www.kigyounaihoiku.jp/wp-json/wp/v2/ufaq?per_page=100';
const CATEGORY_API_URL = 'https://www.kigyounaihoiku.jp/wp-json/wp/v2/ufaq-category?per_page=100';
const SOURCE_URL = 'https://www.kigyounaihoiku.jp/ufaqs';
const CACHE_KEY = 'faq_entries';
const FETCH_TIMEOUT_MS = 30_000;

/** Single-flight */
let inflightFetch: Promise<FaqEntry[]> | null = null;

/**
 * FAQ一覧を取得（キャッシュ付き）
 */
export async function fetchFaqEntries(): Promise<FaqEntry[]> {
  const cached = faqDataCache.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as FaqEntry[];
  }

  if (inflightFetch) return inflightFetch;

  inflightFetch = doFetchFaqs();
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

/**
 * FAQ出典URL
 */
export function getFaqSourceUrl(): string {
  return SOURCE_URL;
}

async function doFetchFaqs(): Promise<FaqEntry[]> {
  // カテゴリとFAQ一覧（1ページ目）を並列取得
  const [categories, firstPage] = await Promise.all([
    fetchJson(CATEGORY_API_URL) as Promise<WpCategory[]>,
    fetchWpPage(FAQ_API_URL),
  ]);

  // 2ページ目以降があれば追加取得
  const allItems: WpFaqItem[] = [...firstPage.items];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    const url = `${FAQ_API_URL}&page=${page}`;
    const { items } = await fetchWpPage(url);
    allItems.push(...items);
  }

  // カテゴリIDマップ
  const catMap = new Map<number, string>();
  for (const c of categories) {
    catMap.set(c.id, c.name);
  }

  const entries: FaqEntry[] = allItems.map(item => ({
    id: String(item.id),
    category: item['ufaq-category']
      .map(id => catMap.get(id) ?? '')
      .filter(Boolean)
      .join(', ') || '未分類',
    question: stripHtml(item.title.rendered),
    answer: extractFaqAnswer(item.content.rendered),
    tags: item['ufaq-tag']
      ? item['ufaq-tag'].map(String)
      : [],
    lastUpdated: item.modified?.split('T')[0],
    url: item.link,
  }));

  faqDataCache.set(CACHE_KEY, JSON.stringify(entries));
  return entries;
}

/** WordPress REST APIのページを取得し、総ページ数もパースする */
async function fetchWpPage(url: string): Promise<{ items: WpFaqItem[]; totalPages: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new ExternalApiError(`FAQ API エラー: HTTP ${res.status} (${url})`);
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
    const items = await res.json() as WpFaqItem[];
    return { items, totalPages };
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('FAQ APIタイムアウト');
    }
    throw new ExternalApiError(
      `FAQ API エラー: ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new ExternalApiError(`FAQ API エラー: HTTP ${res.status} (${url})`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError('FAQ APIタイムアウト');
    }
    throw new ExternalApiError(
      `FAQ API エラー: ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * WordPress FAQ プラグインのcontent HTMLから回答部分だけ抽出
 * ewd-ufaq-faq-post クラスの中身が実際の回答
 */
function extractFaqAnswer(html: string): string {
  // ewd-ufaq-faq-post div の中身を抽出
  const bodyMatch = html.match(/ewd-ufaq-faq-post[^>]*>([\s\S]*?)(?:<\/div>\s*<div class='ewd-ufaq-faq-custom|<\/div>\s*<\/div>\s*<\/div>)/);
  if (bodyMatch) {
    return stripHtml(bodyMatch[1]);
  }
  // フォールバック: excerpt を使うか全体をstrip
  return stripHtml(html);
}

/** HTMLタグを除去してプレーンテキストにする */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// WordPress REST API の型
interface WpCategory {
  id: number;
  name: string;
  count: number;
}

interface WpFaqItem {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  modified: string;
  'ufaq-category': number[];
  'ufaq-tag'?: number[];
}
