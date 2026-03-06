/**
 * 実施要綱PDFクライアント
 *
 * 企業主導型保育事業費補助金実施要綱PDFをダウンロードし、
 * セクション単位（第1〜第N）に分割してキャッシュする。
 */

import { youkouDataCache } from './cache.js';
import { fetchPdfTexts } from './pdf-client.js';
import { ExternalApiError } from './errors.js';
import { PAGE_MARKER, buildLineToPageMap } from './pdf-section-utils.js';
import type { PdfSection } from './types.js';

const DEFAULT_PDF_URL =
  'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/04/20250423-03-2jissiyoukou.pdf';

const SOURCE_URL = 'https://www.kigyounaihoiku.jp/download';
const CACHE_KEY = 'youkou_sections';

/** Single-flight */
let inflightFetch: Promise<PdfSection[]> | null = null;

/**
 * 実施要綱のセクション一覧を取得（キャッシュ付き・single-flight）
 */
export async function fetchYoukouSections(): Promise<PdfSection[]> {
  const cached = youkouDataCache.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as PdfSection[];
  }

  if (inflightFetch) return inflightFetch;

  inflightFetch = doFetchYoukou();
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

async function doFetchYoukou(): Promise<PdfSection[]> {
  const pdfUrl = process.env.KIGYOUNAI_YOUKOU_PDF_URL ?? DEFAULT_PDF_URL;
  const pages = await fetchPdfTexts(pdfUrl);

  if (pages.length === 0) {
    throw new ExternalApiError('実施要綱PDFのテキスト抽出に失敗しました。');
  }

  const sections = splitIntoSections(pages);
  youkouDataCache.set(CACHE_KEY, JSON.stringify(sections));
  return sections;
}

/**
 * 実施要綱の出典URL
 */
export function getYoukouSourceUrl(): string {
  return SOURCE_URL;
}

/** 別紙１サブセクション名マッピング（丸数字→加算名） */
const BESSHI1_SUB_NAMES: Record<string, string> = {
  '①': '基本分単価',
  '②': '処遇改善等加算Ⅰ',
  '③': '処遇改善等加算Ⅱ',
  '④': '延長保育加算',
  '⑤': '夜間保育加算',
  '⑥': '非正規労働者受入推進加算',
  '⑦': '病児保育加算',
  '⑧': '預かりサービス加算',
  '⑨': '賃借料加算',
  '⑩': '保育補助者雇上強化加算',
  '⑪': '防犯・安全対策強化加算',
  '⑫': '運営支援システム導入加算',
  '⑬': '連携推進加算',
  '⑭': '改修支援加算',
  '⑮': '改修実施加算',
  '⑯': '処遇改善等加算Ⅲ',
  '⑰': '障害児保育加算',
  '⑱': '医療的ケア児保育支援加算',
  '⑲': '３歳児配置改善加算',
  '⑳': '４歳以上児配置改善加算',
};

/**
 * ページテキストをセクション単位に分割
 *
 * 全ページをページ区切り付きで結合してから、行頭の「第N セクション名」パターンで分割する。
 * 別紙１は巨大（32ページ）なので、丸数字見出し（①〜⑳）でサブセクションに分割する。
 */
function splitIntoSections(pages: string[]): PdfSection[] {
  // ページ境界マーカー付きで結合
  const fullText = pages.join(`\n${PAGE_MARKER}\n`);
  const lines = fullText.split('\n');

  // セクション見出しパターン:
  // - 「第１ 事業の目的」 (全角数字+空白+タイトル)
  // - 「（別紙１）」「（別紙 10）」等 (括弧付きの別紙見出し)
  const sectionHeaderRe = /^(第[１２３４５６７８９０\d]+)\s+([^\d０-９（(\s]{2}[^\n]{0,28})/;
  const appendixHeaderRe = /^（(別紙[\s１２３４５６７８９０\d]+)）/;

  interface SectionMark {
    title: string;
    lineIndex: number;
  }

  const marks: SectionMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === PAGE_MARKER) continue;

    const sm = trimmed.match(sectionHeaderRe);
    const am = trimmed.match(appendixHeaderRe);
    if (sm) {
      marks.push({
        title: `${sm[1]} ${sm[2] ?? ''}`.trim(),
        lineIndex: i,
      });
    } else if (am) {
      marks.push({
        title: am[1].trim(),
        lineIndex: i,
      });
    }
  }

  if (marks.length === 0) {
    console.error('[kigyounai-hoiku-mcp] 警告: 実施要綱PDFのセクション見出しが検出できませんでした。PDF構造が変更された可能性があります。ページ単位で返却します。');
    return pages.map((text, i) => ({
      sectionTitle: `ページ ${i + 1}`,
      text: text.trim(),
      pageRange: `p.${i + 1}`,
    }));
  }

  // 行番号→ページ番号マッピング
  const lineToPage = buildLineToPageMap(lines, PAGE_MARKER);

  const sections: PdfSection[] = [];

  // marks[0] より前のテキストがあれば「前文」として追加
  if (marks[0].lineIndex > 0) {
    const text = lines.slice(0, marks[0].lineIndex)
      .filter(l => l !== PAGE_MARKER)
      .join('\n').trim();
    if (text) {
      const sp = lineToPage[0];
      const ep = lineToPage[marks[0].lineIndex - 1];
      sections.push({
        sectionTitle: '表紙・前文',
        text,
        pageRange: sp === ep ? `p.${sp}` : `p.${sp}-${ep}`,
      });
    }
  }

  // 各セクション
  for (let m = 0; m < marks.length; m++) {
    const startLine = marks[m].lineIndex;
    const endLine = m + 1 < marks.length ? marks[m + 1].lineIndex : lines.length;
    const sectionLines = lines.slice(startLine, endLine);
    const sp = lineToPage[startLine];
    const ep = lineToPage[Math.min(endLine - 1, lines.length - 1)];

    // 別紙１はサブセクションに分割
    if (/^別紙[１1\s]*$/.test(marks[m].title.replace(/\s/g, ''))) {
      const subSections = splitBesshi1IntoSubs(sectionLines, startLine, lineToPage);
      if (subSections.length > 0) {
        sections.push(...subSections);
        continue;
      }
    }

    const text = sectionLines
      .filter(l => l !== PAGE_MARKER)
      .join('\n').trim();
    sections.push({
      sectionTitle: marks[m].title,
      text,
      pageRange: sp === ep ? `p.${sp}` : `p.${sp}-${ep}`,
    });
  }

  return sections;
}

/**
 * 別紙１を丸数字見出し（①〜⑳）でサブセクションに分割する。
 * 別紙１は32ページもあり、基本分単価・延長保育・夜間保育・病児保育等すべての
 * 運営費加算の単価表を含むため、サブセクション分割しないとAIが目的の加算に到達できない。
 */
function splitBesshi1IntoSubs(
  sectionLines: string[],
  globalStartLine: number,
  lineToPage: number[],
): PdfSection[] {
  // 丸数字パターン: 行頭の①〜⑳ + 加算名
  const circledNumRe = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/;

  interface SubMark {
    circledNum: string;
    localLineIndex: number;
  }

  const subMarks: SubMark[] = [];
  const seenNums = new Set<string>();

  for (let i = 0; i < sectionLines.length; i++) {
    const trimmed = sectionLines[i].trim();
    if (!trimmed || trimmed === PAGE_MARKER) continue;
    const m = trimmed.match(circledNumRe);
    // BESSHI1_SUB_NAMES に登録済みの丸数字のみ、かつ各丸数字は最初の出現のみ使う
    if (m && m[1] in BESSHI1_SUB_NAMES && !seenNums.has(m[1])) {
      seenNums.add(m[1]);
      subMarks.push({ circledNum: m[1], localLineIndex: i });
    }
  }

  if (subMarks.length === 0) return [];

  const results: PdfSection[] = [];

  for (let s = 0; s < subMarks.length; s++) {
    const startLocal = s === 0 ? 0 : subMarks[s].localLineIndex;
    const endLocal = s + 1 < subMarks.length ? subMarks[s + 1].localLineIndex : sectionLines.length;
    const text = sectionLines.slice(startLocal, endLocal)
      .filter(l => l !== PAGE_MARKER)
      .join('\n').trim();

    const globalStart = globalStartLine + startLocal;
    const globalEnd = globalStartLine + Math.min(endLocal - 1, sectionLines.length - 1);
    const sp = lineToPage[globalStart];
    const ep = lineToPage[globalEnd];

    const subName = BESSHI1_SUB_NAMES[subMarks[s].circledNum] ?? '';
    const title = `別紙１ ${subMarks[s].circledNum}${subName}`;

    results.push({
      sectionTitle: title,
      text,
      pageRange: sp === ep ? `p.${sp}` : `p.${sp}-${ep}`,
    });
  }

  return results;
}
