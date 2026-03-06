/**
 * 認可外保育施設指導監督基準PDFクライアント
 *
 * こども家庭庁の認可外保育施設指導監督基準PDFをダウンロードし、
 * セクション単位に分割してキャッシュする。
 */

import { kantokuDataCache } from './cache.js';
import { fetchPdfTexts } from './pdf-client.js';
import { ExternalApiError } from './errors.js';
import { PAGE_MARKER, buildLineToPageMap } from './pdf-section-utils.js';
import type { PdfSection } from './types.js';

const DEFAULT_PDF_URL =
  'https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/1b9d7664-123f-45d6-aea0-b6fbaf7ff788/f3875af9/20230401_policies_hoiku_ninkagai-tsuuchi_17.pdf';

const SOURCE_URL = 'https://www.cfa.go.jp/policies/hoiku/ninkagai/tsuuchi';
const CACHE_KEY = 'kantoku_sections';

/** Single-flight */
let inflightFetch: Promise<PdfSection[]> | null = null;

/**
 * 指導監督基準のセクション一覧を取得（キャッシュ付き・single-flight）
 */
export async function fetchKantokuSections(): Promise<PdfSection[]> {
  const cached = kantokuDataCache.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as PdfSection[];
  }

  if (inflightFetch) return inflightFetch;

  inflightFetch = doFetchKantoku();
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

async function doFetchKantoku(): Promise<PdfSection[]> {
  const pdfUrl = process.env.KIGYOUNAI_KANTOKU_PDF_URL ?? DEFAULT_PDF_URL;
  const pages = await fetchPdfTexts(pdfUrl);

  if (pages.length === 0) {
    throw new ExternalApiError('指導監督基準PDFのテキスト抽出に失敗しました。');
  }

  const sections = splitIntoSections(pages);
  kantokuDataCache.set(CACHE_KEY, JSON.stringify(sections));
  return sections;
}

/**
 * 指導監督基準の出典URL
 */
export function getKantokuSourceUrl(): string {
  return SOURCE_URL;
}

/**
 * ページテキストをセクション単位に分割
 *
 * このPDFは2部構成:
 * - 前半: 認可外保育施設に対する指導監督の実施について（指針）第１〜第７
 * - 後半: 認可外保育施設指導監督基準 第１〜第９
 * 「第N タイトル」パターンのみで分割する。
 * 数字見出し（「１ ...」）は誤マッチが多いため使用しない。
 */
function splitIntoSections(pages: string[]): PdfSection[] {
  const fullText = pages.join(`\n${PAGE_MARKER}\n`);
  const lines = fullText.split('\n');

  // セクション見出しパターン: 「第N タイトル」のみ
  // ※ 数字見出し（「１ 保育に従事する者...」）は別添内の様式等に誤マッチするため不使用
  // ※ タイトルは2文字以上の連続漢字で始まる必要あり（空白区切り法令テキスト「条 の ３…」を除外）
  const sectionHeaderRe = /^(第[１２３４５６７８９０\d]+)\s+([^\d０-９（(\s]{2}[^\n]{0,28})/;
  // 別添見出し: 「別添」「別添１」等（空白区切りテキスト「別添 保 険 事 故」は除外）
  const appendixHeaderRe = /^〔?別[添紙][１２３４５６７８９０\d]*〕?$/;

  interface SectionMark {
    title: string;
    lineIndex: number;
  }

  const marks: SectionMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === PAGE_MARKER) continue;

    const sm = trimmed.match(sectionHeaderRe);
    if (sm) {
      marks.push({
        title: `${sm[1]} ${sm[2]}`.trim(),
        lineIndex: i,
      });
    } else if (appendixHeaderRe.test(trimmed)) {
      marks.push({
        title: trimmed.replace(/[〔〕]/g, ''),
        lineIndex: i,
      });
    }
  }

  if (marks.length === 0) {
    console.error('[kigyounai-hoiku-mcp] 警告: 指導監督基準PDFのセクション見出しが検出できませんでした。PDF構造が変更された可能性があります。ページ単位で返却します。');
    return pages.map((text, i) => ({
      sectionTitle: `ページ ${i + 1}`,
      text: text.trim(),
      pageRange: `p.${i + 1}`,
    }));
  }

  const lineToPage = buildLineToPageMap(lines, PAGE_MARKER);
  const sections: PdfSection[] = [];

  // 前文
  if (marks[0].lineIndex > 0) {
    const text = lines.slice(0, marks[0].lineIndex)
      .filter(l => l !== PAGE_MARKER)
      .join('\n').trim();
    if (text) {
      const sp = lineToPage[0];
      const ep = lineToPage[marks[0].lineIndex - 1];
      sections.push({
        sectionTitle: '前文',
        text,
        pageRange: sp === ep ? `p.${sp}` : `p.${sp}-${ep}`,
      });
    }
  }

  for (let m = 0; m < marks.length; m++) {
    const startLine = marks[m].lineIndex;
    const endLine = m + 1 < marks.length ? marks[m + 1].lineIndex : lines.length;
    const text = lines.slice(startLine, endLine)
      .filter(l => l !== PAGE_MARKER)
      .join('\n').trim();
    const sp = lineToPage[startLine];
    const ep = lineToPage[Math.min(endLine - 1, lines.length - 1)];
    sections.push({
      sectionTitle: marks[m].title,
      text,
      pageRange: sp === ep ? `p.${sp}` : `p.${sp}-${ep}`,
    });
  }

  return sections;
}


