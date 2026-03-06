/**
 * FAQ検索サービス
 * WordPress REST APIから取得したFAQをキーワード検索する
 */

import { fetchFaqEntries, getFaqSourceUrl } from '../faq-client.js';
import { matchKeyword } from '../text-utils.js';
import type { FaqEntry } from '../types.js';

export interface FaqSearchResult {
  keyword: string;
  matchedEntries: FaqEntry[];
  totalEntries: number;
  sourceUrl: string;
}

/**
 * FAQをキーワード検索する
 * スペース区切りでAND検索。0件の場合はOR検索にフォールバック。
 */
export async function searchFaq(params: {
  keyword: string;
  category?: string;
  limit?: number;
}): Promise<FaqSearchResult> {
  let entries = await fetchFaqEntries();
  const limit = Math.min(params.limit ?? 5, 20);
  const keywords = params.keyword.split(/\s+/).filter(k => k.length > 0);

  if (keywords.length === 0) {
    return { keyword: params.keyword, matchedEntries: [], totalEntries: entries.length, sourceUrl: getFaqSourceUrl() };
  }

  // カテゴリフィルタ
  if (params.category) {
    entries = entries.filter(e =>
      e.category.includes(params.category!)
    );
  }

  // AND検索
  let matched = entries.filter(e => {
    const haystack = `${e.question} ${e.answer} ${e.category}`;
    return keywords.every(k => matchKeyword(haystack, k));
  });

  // OR検索フォールバック
  if (matched.length === 0 && keywords.length > 1) {
    const scored = entries
      .map(e => {
        const haystack = `${e.question} ${e.answer} ${e.category}`;
        const score = keywords.filter(k => matchKeyword(haystack, k)).length;
        return { entry: e, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    matched = scored.map(s => s.entry);
  }

  return {
    keyword: params.keyword,
    matchedEntries: matched.slice(0, limit),
    totalEntries: entries.length,
    sourceUrl: getFaqSourceUrl(),
  };
}
