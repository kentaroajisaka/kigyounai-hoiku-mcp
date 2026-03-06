/**
 * 監査関連PDFクライアント
 *
 * 指導・監査評価基準、専門的財務監査基準、専門的労務監査基準等の
 * 監査関連PDFをダウンロードし、セクション単位に分割してキャッシュする。
 * doc_type指定で対象PDFのみ遅延ロードする。
 */

import { kansaDataCache } from './cache.js';
import { fetchPdfTexts } from './pdf-client.js';
import { ExternalApiError } from './errors.js';
import { PAGE_MARKER, buildLineToPageMap } from './pdf-section-utils.js';
import type { PdfSection } from './types.js';

/** 監査文書種別 */
export type KansaDocType =
  | 'sidou_hyouka'      // 指導・監査評価基準
  | 'zaimu_kijun'       // 専門的財務監査基準
  | 'zaimu_hyouka'      // 専門的財務監査評価基準
  | 'zaimu_shiryou'     // 財務監査資料一覧
  | 'roumu_kijun'       // 専門的労務監査基準
  | 'roumu_hyouka'      // 専門的労務監査評価基準
  | 'roumu_jisyutenken'; // 労務監査自主点検表

interface KansaDocConfig {
  label: string;
  defaultUrl: string;
  envVar: string;
  sourceUrl: string;
}

const DOC_CONFIGS: Record<KansaDocType, KansaDocConfig> = {
  sidou_hyouka: {
    label: '指導・監査評価基準',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/03/20250314-01-05kansahyoukakijun.pdf',
    envVar: 'KIGYOUNAI_KANSA_SIDOU_HYOUKA_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/download',
  },
  zaimu_kijun: {
    label: '専門的財務監査基準',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250520-01-zaimukansa03-kansakijyun.pdf',
    envVar: 'KIGYOUNAI_KANSA_ZAIMU_KIJUN_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
  zaimu_hyouka: {
    label: '専門的財務監査評価基準',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250520-01-zaimukansa05-hyoukakizyun.pdf',
    envVar: 'KIGYOUNAI_KANSA_ZAIMU_HYOUKA_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
  zaimu_shiryou: {
    label: '財務監査資料一覧',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250520-01-zaimukansa07-kanasiryouitiran.pdf',
    envVar: 'KIGYOUNAI_KANSA_ZAIMU_SHIRYOU_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
  roumu_kijun: {
    label: '専門的労務監査基準',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250513-01-roumukansa02-kansakijyun.pdf',
    envVar: 'KIGYOUNAI_KANSA_ROUMU_KIJUN_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
  roumu_hyouka: {
    label: '専門的労務監査評価基準',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250513-01-roumukansa03-hyoukakijyun.pdf',
    envVar: 'KIGYOUNAI_KANSA_ROUMU_HYOUKA_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
  roumu_jisyutenken: {
    label: '労務監査自主点検表',
    defaultUrl: 'https://www.kigyounaihoiku.jp/wp-content/uploads/2025/05/20250513-01-roumukansa04-jisyutenken.pdf',
    envVar: 'KIGYOUNAI_KANSA_ROUMU_JISYUTENKEN_URL',
    sourceUrl: 'https://www.kigyounaihoiku.jp/info/20230605-01-r5zaimukansa',
  },
};

/** Single-flight: doc_typeごとに重複フェッチ防止 */
const inflightFetches = new Map<KansaDocType, Promise<PdfSection[]>>();

/**
 * 指定doc_typeの監査PDFセクション一覧を取得（キャッシュ付き・single-flight）
 */
export async function fetchKansaSections(docType: KansaDocType): Promise<PdfSection[]> {
  const cacheKey = `kansa_${docType}`;
  const cached = kansaDataCache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PdfSection[];
  }

  const inflight = inflightFetches.get(docType);
  if (inflight) return inflight;

  const promise = doFetchKansa(docType);
  inflightFetches.set(docType, promise);
  try {
    return await promise;
  } finally {
    inflightFetches.delete(docType);
  }
}

async function doFetchKansa(docType: KansaDocType): Promise<PdfSection[]> {
  const config = DOC_CONFIGS[docType];
  const pdfUrl = process.env[config.envVar] ?? config.defaultUrl;
  const pages = await fetchPdfTexts(pdfUrl);

  if (pages.length === 0) {
    throw new ExternalApiError(`${config.label}PDFのテキスト抽出に失敗しました。`);
  }

  const sections = splitIntoSections(pages, docType);
  const cacheKey = `kansa_${docType}`;
  kansaDataCache.set(cacheKey, JSON.stringify(sections));
  return sections;
}

/**
 * 監査文書のラベル・出典URLを取得
 */
export function getKansaDocLabel(docType: KansaDocType): string {
  return DOC_CONFIGS[docType].label;
}

export function getKansaSourceUrl(docType: KansaDocType): string {
  return DOC_CONFIGS[docType].sourceUrl;
}

/**
 * 利用可能なdoc_typeの一覧を返す
 */
export function listKansaDocTypes(): { docType: KansaDocType; label: string }[] {
  return (Object.entries(DOC_CONFIGS) as [KansaDocType, KansaDocConfig][]).map(
    ([docType, config]) => ({ docType, label: config.label }),
  );
}

/**
 * ページテキストをセクション単位に分割
 *
 * 監査関連PDFは2種類:
 * - テキスト文書（zaimu_kijun, roumu_kijun）: 「第N タイトル」パターンで分割
 * - 表形式文書（*_hyouka, sidou_hyouka, *_shiryou, *_jisyutenken）: ページ単位で分割
 *   ※表形式PDFのテキスト抽出ではセル内容が断片化するため、セクション見出し検出が不安定
 */
function splitIntoSections(pages: string[], docType: KansaDocType): PdfSection[] {
  // 表形式文書はページ単位で分割（セクション検出が不安定なため）
  const tableDocTypes: KansaDocType[] = [
    'sidou_hyouka', 'zaimu_hyouka', 'roumu_hyouka',
    'zaimu_shiryou', 'roumu_jisyutenken',
  ];
  if (tableDocTypes.includes(docType)) {
    return pages.map((text, i) => ({
      sectionTitle: `ページ ${i + 1}`,
      text: text.trim(),
      pageRange: `p.${i + 1}`,
    }));
  }

  // テキスト文書: セクション見出しで分割
  const fullText = pages.join(`\n${PAGE_MARKER}\n`);
  const lines = fullText.split('\n');
  const marks = detectSectionMarks(lines);

  if (marks.length === 0) {
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

interface SectionMark {
  title: string;
  lineIndex: number;
}

/**
 * テキスト文書（zaimu_kijun, roumu_kijun）のセクション見出しを検出
 */
function detectSectionMarks(lines: string[]): SectionMark[] {
  const marks: SectionMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === PAGE_MARKER) continue;

    const collapsed = trimmed.replace(/\s+/g, ' ');

    // 「第N タイトル」パターン（2文字以上の漢字タイトル）
    const secMatch = collapsed.match(
      /^(第[１２３４５６７８９０\d]+)\s+([^\d０-９（(\s]{2}[^\n]{0,28})$/
    );
    if (secMatch) {
      marks.push({ title: `${secMatch[1]} ${secMatch[2]}`, lineIndex: i });
    }
  }

  return marks;
}
