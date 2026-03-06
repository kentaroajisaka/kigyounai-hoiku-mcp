/**
 * 指導監督基準検索サービス
 * セクション分割済みの認可外保育施設指導監督基準をキーワード検索する
 */

import { fetchKantokuSections, getKantokuSourceUrl } from '../kantoku-client.js';
import { matchKeyword } from '../text-utils.js';
import type { PdfSection } from '../types.js';

export interface KantokuSearchResult {
  keyword: string;
  matchedSections: PdfSection[];
  totalSections: number;
  sourceUrl: string;
}

/**
 * 指導監督基準をキーワード検索する
 * スペース区切りでAND検索。0件の場合はOR検索にフォールバック。
 */
export async function searchKantoku(params: {
  keyword: string;
  limit?: number;
}): Promise<KantokuSearchResult> {
  const sections = await fetchKantokuSections();
  const limit = Math.min(params.limit ?? 5, 10);
  const keywords = params.keyword.split(/\s+/).filter(k => k.length > 0);

  if (keywords.length === 0) {
    return { keyword: params.keyword, matchedSections: [], totalSections: sections.length, sourceUrl: getKantokuSourceUrl() };
  }

  // AND検索
  let matched = sections.filter(s => {
    const haystack = `${s.sectionTitle} ${s.text}`;
    return keywords.every(k => matchKeyword(haystack, k));
  });

  // AND検索で0件ならOR検索にフォールバック（スコア順）
  if (matched.length === 0 && keywords.length > 1) {
    const scored = sections
      .map(s => {
        const haystack = `${s.sectionTitle} ${s.text}`;
        const score = keywords.filter(k => matchKeyword(haystack, k)).length;
        return { section: s, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    matched = scored.map(s => s.section);
  }

  return {
    keyword: params.keyword,
    matchedSections: matched.slice(0, limit),
    totalSections: sections.length,
    sourceUrl: getKantokuSourceUrl(),
  };
}
