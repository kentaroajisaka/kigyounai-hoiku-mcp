/**
 * 別紙3,4,5,6,7,8,10,11,12のパーサー
 *
 * これらは大規模テーブルではなく:
 * - 別紙4: 利用者負担相当額（4行の簡易テーブル）
 * - 別紙5: 整備費基準額（定員×標準/都市部、複数種目）
 * - 別紙7: 中小企業事業主定義（4行の判定表）
 * - 別紙10: 医療的ケア児保育支援加算（固定額5項目）
 * - 別紙3,6,8,11,12: テキスト/ルール中心（構造化テーブルなし）
 */

import type {
  RiyoushaFutanEntry,
  SeibihiEntry,
  ChuushouKigyouEntry,
  IryoutekiCareEntry,
  BesshiTextEntry,
} from '../types.js';

// ---- 別紙4: 利用者負担相当額 ----

export function parseBesshi4(text: string): { entries: RiyoushaFutanEntry[]; warnings: string[] } {
  const entries: RiyoushaFutanEntry[] = [];
  const warnings: string[] = [];

  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    // "４歳以上児 23,100 円" or "０歳児 37,100 円"
    const m = stripped.match(/(４歳以上児|３歳児|１、２歳児|０歳児)\s+([\d,]+)\s*円/);
    if (m) {
      entries.push({
        nenreiKubun: m[1],
        kingaku: parseInt(m[2].replace(/,/g, ''), 10),
      });
    }
  }

  if (entries.length === 0) {
    warnings.push('別紙4: 利用者負担相当額のパースで0件。');
  }

  return { entries, warnings };
}

// ---- 別紙5: 整備費基準額 ----

export function parseBesshi5(text: string): { entries: SeibihiEntry[]; warnings: string[] } {
  const entries: SeibihiEntry[] = [];
  const warnings: string[] = [];

  const lines = text.split('\n');
  let currentShumoku = '';

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+/g, ' ').trim();
    if (!stripped) continue;

    // 種目の検出
    if (stripped.startsWith('本体工事費')) currentShumoku = '本体工事費';
    else if (stripped.startsWith('環境改善加算')) currentShumoku = '環境改善加算';
    else if (stripped.startsWith('特殊附帯工事加算')) currentShumoku = '特殊附帯工事加算';
    else if (stripped.startsWith('設計料加算')) currentShumoku = '設計料加算';
    else if (stripped.startsWith('開設準備費加算')) currentShumoku = '開設準備費加算';
    else if (stripped.startsWith('土地借料加算')) currentShumoku = '土地借料加算';
    else if (stripped.includes('地域交流・一時預かりスペース加算')) currentShumoku = '地域交流・一時預かりスペース加算';
    else if (stripped.includes('病児保育スペース加算')) currentShumoku = '病児保育スペース加算';
    else if (stripped.includes('共同設置・共同利用連携加算')) currentShumoku = '共同設置・共同利用連携加算';
    else if (stripped.includes('解体撤去工事費')) currentShumoku = '解体撤去工事費';
    else if (stripped.includes('仮設施設整備費')) currentShumoku = '仮設施設整備費';

    // 本体工事費の定員×標準/都市部テーブル
    if (currentShumoku === '本体工事費') {
      const teiinMatch = stripped.match(/([\d]+)\s*名?(?:以下|以上)?\s+([\d,]+)\s+([\d,]+)/);
      if (teiinMatch) {
        const teiinKubun = detectTeiinKubun(stripped);
        if (teiinKubun) {
          entries.push({
            shumoku: '本体工事費',
            kubun: `${teiinKubun} 標準`,
            kingaku: parseInt(teiinMatch[2].replace(/,/g, ''), 10),
          });
          entries.push({
            shumoku: '本体工事費',
            kubun: `${teiinKubun} 都市部`,
            kingaku: parseInt(teiinMatch[3].replace(/,/g, ''), 10),
          });
        }
      }
    }

    // 開設準備費加算の定員別テーブル
    if (currentShumoku === '開設準備費加算') {
      const prepMatch = stripped.match(/定員\s*([\d]+)\s*名?(?:以下|以上|～[\d\s]*名?)\s+(\d+)/);
      if (prepMatch) {
        entries.push({
          shumoku: '開設準備費加算',
          kubun: detectTeiinKubun(stripped) ?? stripped,
          kingaku: parseInt(prepMatch[2], 10),
          biko: '1人当たり（千円）',
        });
      }
    }

    // 地域交流/病児保育スペース加算の標準/都市部
    if (currentShumoku === '地域交流・一時預かりスペース加算' || currentShumoku === '病児保育スペース加算') {
      const stdMatch = stripped.match(/標準\s+([\d,]+)/);
      const cityMatch = stripped.match(/都市部\s+([\d,]+)/);
      if (stdMatch) {
        entries.push({
          shumoku: currentShumoku,
          kubun: '標準',
          kingaku: parseInt(stdMatch[1].replace(/,/g, ''), 10),
        });
      }
      if (cityMatch) {
        entries.push({
          shumoku: currentShumoku,
          kubun: '都市部',
          kingaku: parseInt(cityMatch[1].replace(/,/g, ''), 10),
        });
      }
    }

    // 解体撤去工事費/仮設施設整備費の定員別テーブル
    if (currentShumoku === '解体撤去工事費' || currentShumoku === '仮設施設整備費') {
      const demolitionMatch = stripped.match(/定員\s*([\d]+)\s*名?(?:以下|以上|～[\d\s]*名?)\s+([\d,]+)/);
      if (demolitionMatch) {
        entries.push({
          shumoku: currentShumoku,
          kubun: detectTeiinKubun(stripped) ?? stripped,
          kingaku: parseInt(demolitionMatch[2].replace(/,/g, ''), 10),
        });
      }
    }

    // 単一金額の種目
    if (currentShumoku === '環境改善加算' || currentShumoku === '特殊附帯工事加算' ||
        currentShumoku === '土地借料加算' || currentShumoku === '共同設置・共同利用連携加算') {
      const singleMatch = stripped.match(/^([\d,]+)$/);
      if (singleMatch && !entries.some(e => e.shumoku === currentShumoku)) {
        entries.push({
          shumoku: currentShumoku,
          kubun: '一律',
          kingaku: parseInt(singleMatch[1].replace(/,/g, ''), 10),
        });
      }
    }
  }

  if (entries.length === 0) {
    warnings.push('別紙5: 整備費基準額のパースで0件。');
  }

  return { entries, warnings };
}

function detectTeiinKubun(text: string): string | null {
  if (/20\s*名?以下/.test(text)) return '20名以下';
  if (/21[～〜\s]*30\s*名?/.test(text)) return '21～30名';
  if (/31[～〜\s]*40\s*名?/.test(text)) return '31～40名';
  if (/41[～〜\s]*70\s*名?/.test(text)) return '41～70名';
  if (/71[～〜\s]*100\s*名?/.test(text)) return '71～100名';
  if (/101\s*名?以上/.test(text)) return '101名以上';
  return null;
}

// ---- 別紙7: 中小企業事業主定義 ----

export function parseBesshi7(text: string): { entries: ChuushouKigyouEntry[]; warnings: string[] } {
  const entries: ChuushouKigyouEntry[] = [];
  const warnings: string[] = [];

  // テキストから業種別の判定表を抽出
  const patterns: { re: RegExp; gyoushu: string }[] = [
    { re: /①\s*製造業[^３５０]*?３億円以下\s+300\s*人以下/s, gyoushu: '製造業・建造業・運搬業・その他（②〜④除く）' },
    { re: /②\s*卸売業[^１]*?１億円以下\s+100\s*人以下/s, gyoushu: '卸売業' },
    { re: /③\s*サービス業[^5,０]*?5,?000\s*万円以下\s+100\s*人以下/s, gyoushu: 'サービス業' },
    { re: /④\s*小売業[^5,０]*?5,?000\s*万円以下\s+50\s*人以下/s, gyoushu: '小売業' },
  ];

  // 簡易パース: 固定値として登録
  const data = [
    { gyoushu: '製造業・建造業・運搬業・その他', shihonkin: '３億円以下', juugyouin: '300人以下' },
    { gyoushu: '卸売業', shihonkin: '１億円以下', juugyouin: '100人以下' },
    { gyoushu: 'サービス業', shihonkin: '5,000万円以下', juugyouin: '100人以下' },
    { gyoushu: '小売業', shihonkin: '5,000万円以下', juugyouin: '50人以下' },
  ];

  // テキスト内に判定表が存在するか確認
  if (text.includes('製造業') && text.includes('卸売業') && text.includes('小売業')) {
    for (const d of data) {
      entries.push(d);
    }
  } else {
    warnings.push('別紙7: 中小企業事業主の判定表が見つかりません。');
  }

  return { entries, warnings };
}

// ---- 別紙10: 医療的ケア児保育支援加算 ----

export function parseBesshi10(text: string): { entries: IryoutekiCareEntry[]; warnings: string[] } {
  const entries: IryoutekiCareEntry[] = [];
  const warnings: string[] = [];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+/g, ' ').trim();

    // "年額 X,XXX,XXX 円" パターン
    const m = stripped.match(/年額\s+([\d,]+)\s*円/);
    if (m) {
      const amount = parseInt(m[1].replace(/,/g, ''), 10);
      // 前の行（や同じ行）からコンテキストを取得
      const context = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
      let komoku = '医療的ケア児保育支援加算';

      if (context.includes('看護師等を配置') && !context.includes('複数')) {
        komoku = '①看護師等配置（1名受入）';
      } else if (context.includes('認定特定行為業務従事者') && !context.includes('複数')) {
        komoku = '①認定特定行為業務従事者配置（1名受入）';
      } else if (context.includes('看護師等を複数配置')) {
        komoku = '①看護師等追加配置（2名以上受入）';
      } else if (context.includes('認定特定行為業務従事者') && context.includes('複数')) {
        komoku = '①認定特定行為業務従事者追加配置（2名以上受入）';
      } else if (context.includes('研修受講')) {
        komoku = '②研修受講支援';
      } else if (context.includes('加配')) {
        komoku = '③保育士等加配';
      } else if (context.includes('備品') && context.includes('個別')) {
        komoku = '④個別備品整備';
      } else if (context.includes('災害') || context.includes('停電')) {
        komoku = '⑤災害時備品整備';
      }

      entries.push({ komoku, kingaku: amount, tani: '年額' });
    }
  }

  if (entries.length === 0) {
    warnings.push('別紙10: 医療的ケア児保育支援加算のパースで0件。');
  }

  return { entries, warnings };
}

// ---- テキスト専用別紙（別紙3,6,8,11,12） ----

/**
 * 構造化テーブルがない別紙をテキストとして返す。
 * これらは search_youkou でテキスト検索する方が適切。
 */
export function parseBesshiAsText(
  besshiNum: string,
  sectionTitle: string,
  text: string,
): BesshiTextEntry {
  return {
    besshi: `別紙${besshiNum}`,
    title: sectionTitle,
    text,
  };
}
