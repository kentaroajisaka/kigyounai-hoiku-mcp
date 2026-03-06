/**
 * 共通PDFテキスト抽出クライアント
 *
 * pdfjs-dist を使ってPDFをダウンロード→テキスト抽出する。
 * 実施要綱・指導監督基準の両方で共用。
 */

import { ExternalApiError } from './errors.js';

const FETCH_TIMEOUT_MS = 60_000;

/** ページごとのテキスト (1-indexed: pages[0] = 1ページ目) */
export type PageTexts = string[];

/** Single-flight: URLごとに重複ダウンロードを防止 */
const inflightFetches = new Map<string, Promise<PageTexts>>();

/**
 * PDFをダウンロードして全ページのテキストを抽出する (single-flight付き)
 */
export async function fetchPdfTexts(url: string): Promise<PageTexts> {
  const inflight = inflightFetches.get(url);
  if (inflight) return inflight;

  const promise = doFetchPdf(url);
  inflightFetches.set(url, promise);
  try {
    return await promise;
  } finally {
    inflightFetches.delete(url);
  }
}

async function doFetchPdf(url: string): Promise<PageTexts> {
  // ダウンロード
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new ExternalApiError(`PDFダウンロードエラー: HTTP ${res.status} (${url})`);
    }
    buffer = await res.arrayBuffer();
  } catch (e) {
    if (e instanceof ExternalApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError(`PDFダウンロードタイムアウト（${FETCH_TIMEOUT_MS / 1000}秒）`);
    }
    throw new ExternalApiError(
      `PDFダウンロードエラー: ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  return extractTextFromPdf(new Uint8Array(buffer));
}

/**
 * pdfjs-dist でPDFの全ページからテキストを抽出
 */
async function extractTextFromPdf(data: Uint8Array): Promise<PageTexts> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // CMapパス解決（日本語PDF対応）
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const cMapDir = require.resolve('pdfjs-dist/cmaps/Adobe-Japan1-UCS2.bcmap');
  const cMapUrl = cMapDir.replace(/[^/]+$/, '');

  const doc = await pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;

  const pages: PageTexts = [];

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      // テキストアイテムを結合（hasEOLで改行挿入）
      const parts: string[] = [];
      for (const item of content.items) {
        if ('str' in item) {
          const textItem = item as { str: string; hasEOL?: boolean };
          parts.push(textItem.str);
          if (textItem.hasEOL) {
            parts.push('\n');
          }
        }
      }
      const text = parts.join('');

      pages.push(text);
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }

  return pages;
}
