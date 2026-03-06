/**
 * 単価検索サービス
 * 構造化単価データに対して条件検索を行う
 */

import { fetchTankaData, getTankaSourceUrl } from '../tanka-client.js';
import type {
  KihonTankaEntry,
  KasanTankaEntry,
  ShoguKaizenEntry,
  RiyoushaFutanEntry,
  SeibihiEntry,
  ChuushouKigyouEntry,
  ShogaijiEntry,
  IryoutekiCareEntry,
  HaichiKaizenEntry,
  BesshiTextEntry,
} from '../types.js';

export interface TankaSearchParams {
  /** 検索種別: kihon=基本分単価, kasan=加算, all=両方 */
  type?: 'kihon' | 'kasan' | 'all';
  /** 別紙番号フィルタ (例: "2", "9", "13") — 指定すると該当別紙のデータのみ返す */
  besshi?: string;
  /** 地域区分フィルタ */
  chiikiKubun?: string;
  /** 定員区分フィルタ — 数値のみ指定時は該当する定員区分を自動判定 */
  teiinKubun?: string;
  /** 年齢区分フィルタ */
  nenreiKubun?: string;
  /** 加算名キーワード */
  kasanKeyword?: string;
  /** 結果件数上限 */
  limit?: number;
}

export interface TankaSearchResult {
  kihon: KihonTankaEntry[];
  kasan: KasanTankaEntry[];
  shoguKaizen: ShoguKaizenEntry[];
  riyoushaFutan: RiyoushaFutanEntry[];
  seibihi: SeibihiEntry[];
  chuushouKigyou: ChuushouKigyouEntry[];
  shogaiji: ShogaijiEntry[];
  iryoutekiCare: IryoutekiCareEntry[];
  haichiKaizen: HaichiKaizenEntry[];
  besshiTexts: BesshiTextEntry[];
  totalKihon: number;
  totalKasan: number;
  warnings: string[];
  sourceUrl: string;
}

/**
 * 構造化単価データを条件検索する
 */
export async function searchTanka(params: TankaSearchParams): Promise<TankaSearchResult> {
  const data = await fetchTankaData();
  const limit = Math.min(params.limit ?? 50, 2000);
  const searchType = params.type ?? 'all';
  const besshi = params.besshi?.replace(/[別紙\s]/g, '');

  let kihonResults: KihonTankaEntry[] = [];
  let kasanResults: KasanTankaEntry[] = [];
  let shoguKaizenResults: ShoguKaizenEntry[] = [];
  let riyoushaFutanResults: RiyoushaFutanEntry[] = [];
  let seibihiResults: SeibihiEntry[] = [];
  let chuushouKigyouResults: ChuushouKigyouEntry[] = [];
  let shogaijiResults: ShogaijiEntry[] = [];
  let iryoutekiCareResults: IryoutekiCareEntry[] = [];
  let haichiKaizenResults: HaichiKaizenEntry[] = [];
  let besshiTextResults: BesshiTextEntry[] = [];

  // 別紙番号指定時はそのデータのみ返す
  if (besshi) {
    switch (besshi) {
      case '1':
        kihonResults = filterKihon(data.kihon, params);
        kasanResults = filterKasan(data.kasan, params);
        break;
      case '2':
        shoguKaizenResults = filterShoguKaizen(data.shoguKaizen, params);
        break;
      case '4':
        riyoushaFutanResults = filterRiyoushaFutan(data.riyoushaFutan, params);
        break;
      case '5':
        seibihiResults = data.seibihi;
        break;
      case '7':
        chuushouKigyouResults = data.chuushouKigyou;
        break;
      case '9':
        shogaijiResults = filterShogaiji(data.shogaiji, params);
        break;
      case '10':
        iryoutekiCareResults = data.iryoutekiCare;
        break;
      case '13':
        haichiKaizenResults = filterHaichiKaizen(data.haichiKaizen, params);
        break;
      default:
        // テキスト別紙を返す
        besshiTextResults = data.besshiTexts.filter(t => t.besshi === `別紙${besshi}`);
        break;
    }
  } else {
    // 別紙指定なし: type に応じて検索
    if (searchType === 'kihon' || searchType === 'all') {
      kihonResults = filterKihon(data.kihon, params);
    }
    if (searchType === 'kasan' || searchType === 'all') {
      kasanResults = filterKasan(data.kasan, params);
    }
  }

  return {
    kihon: kihonResults.slice(0, limit),
    kasan: kasanResults.slice(0, limit),
    shoguKaizen: shoguKaizenResults.slice(0, limit),
    riyoushaFutan: riyoushaFutanResults,
    seibihi: seibihiResults,
    chuushouKigyou: chuushouKigyouResults,
    shogaiji: shogaijiResults.slice(0, limit),
    iryoutekiCare: iryoutekiCareResults,
    haichiKaizen: haichiKaizenResults.slice(0, limit),
    besshiTexts: besshiTextResults,
    totalKihon: kihonResults.length,
    totalKasan: kasanResults.length,
    warnings: data.warnings,
    sourceUrl: getTankaSourceUrl(),
  };
}

// ---- フィルタ関数 ----

function filterKihon(entries: KihonTankaEntry[], params: TankaSearchParams): KihonTankaEntry[] {
  return entries.filter(e => {
    if (params.chiikiKubun && !matchFuzzy(e.chiikiKubun, params.chiikiKubun)) return false;
    if (params.teiinKubun && !matchTeiin(e.teiinKubun, params.teiinKubun)) return false;
    if (params.nenreiKubun && !matchFuzzy(e.nenreiKubun, params.nenreiKubun)) return false;
    return true;
  });
}

function filterKasan(entries: KasanTankaEntry[], params: TankaSearchParams): KasanTankaEntry[] {
  return entries.filter(e => {
    if (params.kasanKeyword) {
      const keywords = params.kasanKeyword.split(/\s+/).filter(k => k);
      const haystack = normalizeForSearch(`${e.kasanName} ${e.kubun} ${e.biko ?? ''}`);
      if (!keywords.every(k => haystack.includes(normalizeForSearch(k)))) return false;
    }
    return true;
  });
}

function filterShoguKaizen(entries: ShoguKaizenEntry[], params: TankaSearchParams): ShoguKaizenEntry[] {
  return entries.filter(e => {
    if (params.chiikiKubun && !matchFuzzy(e.chiikiKubun, params.chiikiKubun)) return false;
    if (params.teiinKubun && !matchTeiin(e.teiinKubun, params.teiinKubun)) return false;
    if (params.nenreiKubun && !matchFuzzy(e.nenreiKubun, params.nenreiKubun)) return false;
    return true;
  });
}

function filterRiyoushaFutan(entries: RiyoushaFutanEntry[], params: TankaSearchParams): RiyoushaFutanEntry[] {
  return entries.filter(e => {
    if (params.nenreiKubun && !matchFuzzy(e.nenreiKubun, params.nenreiKubun)) return false;
    return true;
  });
}

function filterShogaiji(entries: ShogaijiEntry[], params: TankaSearchParams): ShogaijiEntry[] {
  return entries.filter(e => {
    if (params.chiikiKubun && !matchFuzzy(e.chiikiKubun, params.chiikiKubun)) return false;
    if (params.nenreiKubun && !matchFuzzy(e.nenreiKubun, params.nenreiKubun)) return false;
    return true;
  });
}

function filterHaichiKaizen(entries: HaichiKaizenEntry[], params: TankaSearchParams): HaichiKaizenEntry[] {
  return entries.filter(e => {
    if (params.chiikiKubun && !matchFuzzy(e.chiikiKubun, params.chiikiKubun)) return false;
    if (params.nenreiKubun && !matchFuzzy(e.nenreiKubun, params.nenreiKubun)) return false;
    return true;
  });
}

// ---- ユーティリティ ----

function normalizeForSearch(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
}

function matchFuzzy(value: string, query: string): boolean {
  const normalize = (s: string) =>
    s.replace(/\s+/g, '').replace(/[０-９]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30),
    );
  const nv = normalize(value);
  const nq = normalize(query);
  if (nv.includes(nq)) return true;
  if (nv.length <= 6 && nq.includes(nv)) return true;
  return false;
}

function matchTeiin(teiinKubun: string, query: string): boolean {
  if (matchFuzzy(teiinKubun, query)) return true;

  const num = parseInt(query.replace(/[人名]/g, ''), 10);
  if (isNaN(num)) return false;

  const rangeMatch = teiinKubun.match(/(\d+)人[～〜](\d+)人/);
  if (rangeMatch) {
    const [, min, max] = rangeMatch;
    return num >= parseInt(min) && num <= parseInt(max);
  }

  const openMatch = teiinKubun.match(/(\d+)人[～〜]$/);
  if (openMatch) {
    return num >= parseInt(openMatch[1]);
  }

  return false;
}
