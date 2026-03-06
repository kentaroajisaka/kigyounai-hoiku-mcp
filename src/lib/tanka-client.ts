/**
 * 単価データクライアント
 *
 * 実施要綱PDFから構造化単価データを抽出・キャッシュする。
 * youkou-client.ts のセクション分割結果を入力として使う。
 */

import { tankaDataCache } from './cache.js';
import { fetchYoukouSections, getYoukouSourceUrl } from './youkou-client.js';
import { parseAllBesshi, type TankaParseResult } from './tanka-parser.js';

const CACHE_KEY = 'tanka_parsed';

/** Single-flight */
let inflightParse: Promise<TankaParseResult> | null = null;

/**
 * 構造化単価データを取得（キャッシュ付き・single-flight）
 */
export async function fetchTankaData(): Promise<TankaParseResult> {
  const cached = tankaDataCache.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached) as TankaParseResult;
  }

  if (inflightParse) return inflightParse;

  inflightParse = doParse();
  try {
    return await inflightParse;
  } finally {
    inflightParse = null;
  }
}

async function doParse(): Promise<TankaParseResult> {
  const sections = await fetchYoukouSections();

  // 別紙１のサブセクション（「別紙１ ①基本分単価」等）を抽出
  const besshi1Sections = sections
    .filter(s => s.sectionTitle.startsWith('別紙１'))
    .map(s => ({ title: s.sectionTitle, text: s.text }));

  // 別紙2〜13を抽出
  const otherBesshiSections: { besshiNum: string; title: string; text: string }[] = [];
  for (const s of sections) {
    // 「別紙２」「別紙 10」等にマッチ
    const m = s.sectionTitle.match(/^別紙\s*([２３４５６７８９]|[2-9]|1[0-3])$/);
    if (m) {
      // 全角数字→半角
      const num = m[1]
        .replace(/２/g, '2').replace(/３/g, '3').replace(/４/g, '4')
        .replace(/５/g, '5').replace(/６/g, '6').replace(/７/g, '7')
        .replace(/８/g, '8').replace(/９/g, '9');
      otherBesshiSections.push({
        besshiNum: num,
        title: s.sectionTitle,
        text: s.text,
      });
    }
  }

  if (besshi1Sections.length === 0) {
    return {
      kihon: [],
      kasan: [],
      shoguKaizen: [],
      riyoushaFutan: [],
      seibihi: [],
      chuushouKigyou: [],
      shogaiji: [],
      iryoutekiCare: [],
      haichiKaizen: [],
      besshiTexts: [],
      warnings: ['別紙１のサブセクションが見つかりません。実施要綱PDFの構造が変更された可能性があります。'],
    };
  }

  const result = parseAllBesshi(besshi1Sections, otherBesshiSections);
  tankaDataCache.set(CACHE_KEY, JSON.stringify(result));
  return result;
}

/**
 * 単価データの出典URL
 */
export function getTankaSourceUrl(): string {
  return getYoukouSourceUrl();
}
