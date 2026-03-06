/**
 * 監査関連文書検索サービス
 * 監査関連PDFのセクションをキーワード検索する
 */

import {
  fetchKansaSections,
  getKansaDocLabel,
  getKansaSourceUrl,
  listKansaDocTypes,
  type KansaDocType,
} from '../kansa-client.js';
import { matchKeyword } from '../text-utils.js';
import type { PdfSection } from '../types.js';

export interface KansaSearchParams {
  keyword: string;
  docType?: KansaDocType;
  limit?: number;
}

export interface KansaSearchResult {
  keyword: string;
  docType?: KansaDocType;
  docLabel: string;
  matchedSections: PdfSection[];
  totalSections: number;
  sourceUrl: string;
}

function searchSections(sections: PdfSection[], keywords: string[]): PdfSection[] {
  if (keywords.length === 0) return [];

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

  return matched;
}

/**
 * 監査関連文書をキーワード検索する
 * doc_type指定時はそのPDFのみ、未指定時は全文書を横断検索
 */
export async function searchKansa(params: KansaSearchParams): Promise<KansaSearchResult> {
  const limit = Math.min(params.limit ?? 5, 10);
  const keywords = params.keyword.split(/\s+/).filter(k => k.length > 0);

  if (params.docType) {
    // 特定文書のみ検索
    const sections = await fetchKansaSections(params.docType);
    const matched = searchSections(sections, keywords);
    return {
      keyword: params.keyword,
      docType: params.docType,
      docLabel: getKansaDocLabel(params.docType),
      matchedSections: matched.slice(0, limit),
      totalSections: sections.length,
      sourceUrl: getKansaSourceUrl(params.docType),
    };
  }

  // 全文書横断検索: 全doc_typeを並行フェッチして検索
  const docTypes = listKansaDocTypes();
  const allResults: { section: PdfSection; docType: KansaDocType; score: number }[] = [];
  let totalSections = 0;

  const fetchResults = await Promise.allSettled(
    docTypes.map(async ({ docType }) => {
      const sections = await fetchKansaSections(docType);
      return { docType, sections };
    }),
  );

  for (const result of fetchResults) {
    if (result.status === 'rejected') continue;
    const { docType, sections } = result.value;
    totalSections += sections.length;

    for (const section of sections) {
      const haystack = `${section.sectionTitle} ${section.text}`;
      const matchCount = keywords.filter(k => matchKeyword(haystack, k)).length;
      if (matchCount > 0) {
        // セクションタイトルに文書種別を付与
        const label = getKansaDocLabel(docType);
        allResults.push({
          section: {
            ...section,
            sectionTitle: `【${label}】${section.sectionTitle}`,
          },
          docType,
          score: matchCount,
        });
      }
    }
  }

  // スコア順にソート
  allResults.sort((a, b) => b.score - a.score);

  return {
    keyword: params.keyword,
    docLabel: '全文書横断検索',
    matchedSections: allResults.slice(0, limit).map(r => r.section),
    totalSections,
    sourceUrl: 'https://www.kigyounaihoiku.jp/download',
  };
}
