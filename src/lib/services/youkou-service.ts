/**
 * 実施要綱検索サービス
 * セクション分割済みの実施要綱をキーワード検索する
 */

import { fetchYoukouSections, getYoukouSourceUrl } from '../youkou-client.js';
import { matchKeyword } from '../text-utils.js';
import type { PdfSection } from '../types.js';

export interface YoukouSearchResult {
  keyword: string;
  matchedSections: PdfSection[];
  totalSections: number;
  sourceUrl: string;
  /** セクション一覧（section指定なしでkeywordも空の場合に使用） */
  sectionList?: string[];
}

export interface YoukouSearchParams {
  keyword: string;
  limit?: number;
  /** セクション名フィルタ（前方一致）。例: "別紙１", "第３" */
  section?: string;
  /** 1セクションあたりの最大文字数（デフォルト2000、最大10000） */
  maxChars?: number;
}

/**
 * 実施要綱をキーワード検索する
 * スペース区切りでAND検索。0件の場合はOR検索にフォールバック。
 * section指定時はそのセクション内のみを検索対象にする。
 */
export async function searchYoukou(params: YoukouSearchParams): Promise<YoukouSearchResult> {
  const allSections = await fetchYoukouSections();
  const limit = Math.min(params.limit ?? 5, 10);
  const maxChars = Math.min(Math.max(params.maxChars ?? 2000, 500), 10000);
  const keywords = params.keyword.split(/\s+/).filter(k => k.length > 0);

  // セクションフィルタ（前方一致 or 部分一致）
  let sections = allSections;
  if (params.section) {
    const sectionQuery = normalizeForMatch(params.section);
    sections = allSections.filter(s => {
      const title = normalizeForMatch(s.sectionTitle);
      return title.startsWith(sectionQuery) || title.includes(sectionQuery);
    });
    if (sections.length === 0) {
      return {
        keyword: params.keyword,
        matchedSections: [],
        totalSections: allSections.length,
        sourceUrl: getYoukouSourceUrl(),
        sectionList: allSections.map(s => `${s.sectionTitle}（${s.pageRange}）`),
      };
    }
  }

  // キーワードが空でセクション指定ありの場合 → そのセクション全文を返す
  if (keywords.length === 0) {
    if (params.section && sections.length > 0) {
      const result = sections.slice(0, limit).map(s => ({
        ...s,
        text: s.text.length > maxChars
          ? s.text.substring(0, maxChars).trimEnd() + '\n...(以下省略。残り約' + (s.text.length - maxChars) + '文字。max_chars を増やすか keyword で絞り込んでください)'
          : s.text,
      }));
      return { keyword: params.keyword, matchedSections: result, totalSections: allSections.length, sourceUrl: getYoukouSourceUrl() };
    }
    return {
      keyword: params.keyword,
      matchedSections: [],
      totalSections: allSections.length,
      sourceUrl: getYoukouSourceUrl(),
      sectionList: allSections.map(s => `${s.sectionTitle}（${s.pageRange}）`),
    };
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

  // キーワードマッチ位置周辺のコンテキストを返す
  const contextResults = matched.slice(0, limit).map(s => {
    const contextText = extractContextAroundKeywords(s.text, keywords, maxChars);
    return { ...s, text: contextText };
  });

  return {
    keyword: params.keyword,
    matchedSections: contextResults,
    totalSections: allSections.length,
    sourceUrl: getYoukouSourceUrl(),
  };
}

/**
 * セクション全文からキーワードマッチ位置周辺のテキストを抽出する。
 * テキストが maxChars 以内ならそのまま返す。
 * maxChars を超える場合は、最初のキーワードマッチ位置を中心にコンテキストを返す。
 */
function extractContextAroundKeywords(text: string, keywords: string[], maxChars: number): string {
  if (text.length <= maxChars) return text;

  // 空白除去版で検索位置を特定
  const normalizedText = text.replace(/\s+/g, '');
  let firstMatchPos = -1;

  for (const kw of keywords) {
    const pos = normalizedText.indexOf(kw);
    if (pos !== -1 && (firstMatchPos === -1 || pos < firstMatchPos)) {
      firstMatchPos = pos;
    }
  }

  // 正規化テキストの位置 → 元テキストの位置に変換
  if (firstMatchPos !== -1) {
    let normalizedIdx = 0;
    let originalIdx = 0;
    while (normalizedIdx < firstMatchPos && originalIdx < text.length) {
      if (/\s/.test(text[originalIdx])) {
        originalIdx++;
      } else {
        normalizedIdx++;
        originalIdx++;
      }
    }
    firstMatchPos = originalIdx;
  }

  if (firstMatchPos === -1 || firstMatchPos < maxChars * 0.6) {
    // マッチが前半にある場合 → 先頭から返す
    return text.substring(0, maxChars).trimEnd() + '\n...(以下省略。残り約' + (text.length - maxChars) + '文字)';
  }

  // マッチが後半にある場合 → マッチ位置を中心にコンテキストを返す
  const contextBefore = Math.floor(maxChars * 0.3);
  const start = Math.max(0, firstMatchPos - contextBefore);
  const end = Math.min(text.length, start + maxChars);

  let result = '';
  if (start > 0) {
    result += '...(前略。先頭から約' + start + '文字省略)\n';
  }
  result += text.substring(start, end).trim();
  if (end < text.length) {
    result += '\n...(以下省略。残り約' + (text.length - end) + '文字)';
  }
  return result;
}

/** 全角数字→半角数字、スペース除去して正規化（セクション名マッチ用） */
function normalizeForMatch(s: string): string {
  return s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/\s+/g, '')
    .toLowerCase();
}
