/**
 * 単価パーサー ファサード
 *
 * 別紙1〜13の個別パーサーを統合して呼び出す。
 * 個別パーサーは parsers/ ディレクトリに配置。
 */

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
} from './types.js';

import {
  parseBesshi1Sections,
  parseBesshi2,
  parseBesshi4,
  parseBesshi5,
  parseBesshi7,
  parseBesshi9,
  parseBesshi10,
  parseBesshi13,
  parseBesshiAsText,
} from './parsers/index.js';

/** 全別紙のパース結果 */
export interface TankaParseResult {
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
  warnings: string[];
}

/** 別紙1のサブセクション（互換性のためエクスポート） */
export { parseBesshi1Sections };

export interface BesshiSection {
  title: string;
  text: string;
}

/**
 * 全別紙をパースする。
 */
export function parseAllBesshi(
  besshi1Sections: BesshiSection[],
  otherSections: { besshiNum: string; title: string; text: string }[],
): TankaParseResult {
  const warnings: string[] = [];

  // 別紙1
  const b1 = parseBesshi1Sections(besshi1Sections);
  warnings.push(...b1.warnings);

  // 初期化
  let shoguKaizen: ShoguKaizenEntry[] = [];
  let riyoushaFutan: RiyoushaFutanEntry[] = [];
  let seibihi: SeibihiEntry[] = [];
  let chuushouKigyou: ChuushouKigyouEntry[] = [];
  let shogaiji: ShogaijiEntry[] = [];
  let iryoutekiCare: IryoutekiCareEntry[] = [];
  let haichiKaizen: HaichiKaizenEntry[] = [];
  const besshiTexts: BesshiTextEntry[] = [];

  for (const sec of otherSections) {
    try {
      switch (sec.besshiNum) {
        case '2':
        case '２': {
          const r = parseBesshi2(sec.text);
          shoguKaizen = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '4':
        case '４': {
          const r = parseBesshi4(sec.text);
          riyoushaFutan = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '5':
        case '５': {
          const r = parseBesshi5(sec.text);
          seibihi = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '7':
        case '７': {
          const r = parseBesshi7(sec.text);
          chuushouKigyou = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '9':
        case '９': {
          const r = parseBesshi9(sec.text);
          shogaiji = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '10': {
          const r = parseBesshi10(sec.text);
          iryoutekiCare = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        case '13': {
          const r = parseBesshi13(sec.text);
          haichiKaizen = r.entries;
          warnings.push(...r.warnings);
          break;
        }
        default: {
          // 別紙3,6,8,11,12: テキストとして保持
          besshiTexts.push(parseBesshiAsText(sec.besshiNum, sec.title, sec.text));
          break;
        }
      }
    } catch (e) {
      warnings.push(`別紙${sec.besshiNum} のパースに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    kihon: b1.kihon,
    kasan: b1.kasan,
    shoguKaizen,
    riyoushaFutan,
    seibihi,
    chuushouKigyou,
    shogaiji,
    iryoutekiCare,
    haichiKaizen,
    besshiTexts,
    warnings,
  };
}
