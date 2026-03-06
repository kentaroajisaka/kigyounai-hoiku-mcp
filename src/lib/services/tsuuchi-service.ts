/**
 * 通知検索サービス
 * kigyounaihoiku.jp のお知らせ一覧をキーワード検索する
 */

import { fetchTsuuchiEntries, getTsuuchiSourceUrl } from '../tsuuchi-client.js';
import { matchKeyword } from '../text-utils.js';
import type { TsuuchiEntry } from '../types.js';

export interface TsuuchiSearchResult {
  keyword: string;
  matchedEntries: TsuuchiEntry[];
  totalEntries: number;
  sourceUrl: string;
}

/**
 * 通知をキーワード検索する
 * スペース区切りでAND検索。0件の場合はOR検索にフォールバック。
 */
export async function searchTsuuchi(params: {
  keyword: string;
  category?: string;
  limit?: number;
}): Promise<TsuuchiSearchResult> {
  let entries = await fetchTsuuchiEntries();
  const limit = Math.min(params.limit ?? 10, 30);
  const keywords = params.keyword.split(/\s+/).filter(k => k.length > 0);

  if (keywords.length === 0) {
    return { keyword: params.keyword, matchedEntries: [], totalEntries: entries.length, sourceUrl: getTsuuchiSourceUrl() };
  }

  // カテゴリフィルタ
  if (params.category) {
    entries = entries.filter(e =>
      e.category?.includes(params.category!) ?? false
    );
  }

  // AND検索
  let matched = entries.filter(e => {
    const haystack = `${e.title} ${e.category ?? ''} ${e.date}`;
    return keywords.every(k => matchKeyword(haystack, k));
  });

  // OR検索フォールバック
  if (matched.length === 0 && keywords.length > 1) {
    const scored = entries
      .map(e => {
        const haystack = `${e.title} ${e.category ?? ''} ${e.date}`;
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
    sourceUrl: getTsuuchiSourceUrl(),
  };
}
