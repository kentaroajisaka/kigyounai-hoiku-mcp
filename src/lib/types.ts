/** e-Gov API v2 のレスポンス型 */

export interface EgovLawSearchResult {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    promulgation_date: string;
  };
  revision_info?: {
    law_title: string;
    law_title_kana?: string;
    abbrev?: string;
  };
  current_revision_info?: {
    law_title: string;
    law_title_kana?: string;
    abbrev?: string;
  };
}

export interface EgovLawData {
  law_info: {
    law_id: string;
    law_type: string;
    law_num: string;
    law_num_era?: string;
    law_num_year?: number;
    law_num_type?: string;
    law_num_num?: string;
    promulgation_date: string;
  };
  law_full_text: EgovNode;
}

export interface EgovNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (EgovNode | string)[];
}

/** FAQ エントリ (WordPress REST API) */

export interface FaqEntry {
  /** FAQ ID (WordPress post ID) */
  id: string;
  /** カテゴリ名 */
  category: string;
  /** 質問テキスト */
  question: string;
  /** 回答テキスト */
  answer: string;
  /** タグ一覧 */
  tags: string[];
  /** 最終更新日 */
  lastUpdated?: string;
  /** URL */
  url: string;
}

/** 実施要綱・指導監督基準のセクション */

export interface PdfSection {
  /** セクション番号/タイトル */
  sectionTitle: string;
  /** テキスト本文 */
  text: string;
  /** ページ範囲 (e.g. "p.5-8") */
  pageRange: string;
}

/** 構造化単価エントリ（基本分単価） */

export interface KihonTankaEntry {
  /** 地域区分 (例: "20/100地域", "その他地域") */
  chiikiKubun: string;
  /** 定員区分 (例: "6人～12人") */
  teiinKubun: string;
  /** 年齢区分 (例: "４歳以上児", "乳児") */
  nenreiKubun: string;
  /** 開所時間 (例: "11時間", "13時間") */
  kaishoJikan: string;
  /** 開所日数 (例: "週6日", "週7日") */
  kaishoNissu: string;
  /** 事業主区分 (例: "中小企業事業主", "中小企業事業主以外") */
  jigyounushiKubun: string;
  /** 保育士比率100%の単価（円） */
  hoikushi100: number;
  /** 保育士比率75%の単価（円） */
  hoikushi75: number;
  /** 保育士比率50%の単価（円） */
  hoikushi50: number;
}

/** 構造化単価エントリ（各種加算） */

export interface KasanTankaEntry {
  /** 加算名 (例: "延長保育加算", "病児保育加算（病児対応型）基本分") */
  kasanName: string;
  /** 区分/条件 (例: "1～2時間", "50人以上100人未満") */
  kubun: string;
  /** 金額（円） */
  kingaku: number;
  /** 単位 (例: "月額", "年額", "日額") */
  tani: string;
  /** 備考 */
  biko?: string;
}

/** 構造化単価エントリ（処遇改善等加算Ⅰ / 別紙2） */

export interface ShoguKaizenEntry {
  /** 地域区分 */
  chiikiKubun: string;
  /** 定員区分 */
  teiinKubun: string;
  /** 年齢区分 */
  nenreiKubun: string;
  /** 開所時間 */
  kaishoJikan: string;
  /** 開所日数 */
  kaishoNissu: string;
  /** 保育士比率100%の加算額（円） */
  hoikushi100: number;
  /** 保育士比率75%の加算額（円） */
  hoikushi75: number;
  /** 保育士比率50%の加算額（円） */
  hoikushi50: number;
}

/** 構造化単価エントリ（利用者負担相当額 / 別紙4） */

export interface RiyoushaFutanEntry {
  /** 年齢区分 */
  nenreiKubun: string;
  /** 利用者負担相当額（円） */
  kingaku: number;
}

/** 構造化単価エントリ（整備費基準額 / 別紙5） */

export interface SeibihiEntry {
  /** 種目（本体工事費、環境改善加算、解体撤去工事費 等） */
  shumoku: string;
  /** 区分（定員区分 or 標準/都市部 等） */
  kubun: string;
  /** 金額（千円） */
  kingaku: number;
  /** 備考 */
  biko?: string;
}

/** 構造化単価エントリ（中小企業事業主定義 / 別紙7） */

export interface ChuushouKigyouEntry {
  /** 業種 */
  gyoushu: string;
  /** 資本金の額又は出資の総額 */
  shihonkin: string;
  /** 常時使用する従業員の数 */
  juugyouin: string;
}

/** 構造化単価エントリ（障害児保育加算 / 別紙9） */

export interface ShogaijiEntry {
  /** 地域区分 */
  chiikiKubun: string;
  /** 年齢区分 */
  nenreiKubun: string;
  /** 開所時間 */
  kaishoJikan: string;
  /** 開所日数 */
  kaishoNissu: string;
  /** 障害児保育加算 保育士比率100%（円） */
  hoikushi100: number;
  /** 障害児保育加算 保育士比率75%（円） */
  hoikushi75: number;
  /** 障害児保育加算 保育士比率50%（円） */
  hoikushi50: number;
  /** 処遇改善等加算Ⅰ 保育士比率100%（円） */
  shoguKaizen100: number;
  /** 処遇改善等加算Ⅰ 保育士比率75%（円） */
  shoguKaizen75: number;
  /** 処遇改善等加算Ⅰ 保育士比率50%（円） */
  shoguKaizen50: number;
}

/** 構造化単価エントリ（医療的ケア児保育支援加算 / 別紙10） */

export interface IryoutekiCareEntry {
  /** 加算項目 */
  komoku: string;
  /** 金額（円） */
  kingaku: number;
  /** 単位 */
  tani: string;
}

/** 構造化単価エントリ（配置改善加算 / 別紙13） */

export interface HaichiKaizenEntry {
  /** 地域区分 */
  chiikiKubun: string;
  /** 年齢区分（３歳児 or ４歳以上児） */
  nenreiKubun: string;
  /** 開所時間 */
  kaishoJikan: string;
  /** 開所日数 */
  kaishoNissu: string;
  /** 配置改善加算額 保育士比率100%（円） */
  hoikushi100: number;
  /** 配置改善加算額 保育士比率75%（円） */
  hoikushi75: number;
  /** 配置改善加算額 保育士比率50%（円） */
  hoikushi50: number;
  /** 処遇改善等加算Ⅰ 保育士比率100%（円） */
  shoguKaizen100: number;
  /** 処遇改善等加算Ⅰ 保育士比率75%（円） */
  shoguKaizen75: number;
  /** 処遇改善等加算Ⅰ 保育士比率50%（円） */
  shoguKaizen50: number;
}

/** 別紙テキストセクション（パースできない別紙のテキスト） */

export interface BesshiTextEntry {
  /** 別紙番号（例: "別紙3", "別紙6"） */
  besshi: string;
  /** セクションタイトル */
  title: string;
  /** テキスト本文 */
  text: string;
}

/** 通知エントリ */

export interface TsuuchiEntry {
  /** タイトル */
  title: string;
  /** 発出日 or 掲載日 */
  date: string;
  /** PDF or HTML のURL */
  url: string;
  /** カテゴリ */
  category?: string;
  /** 出典 */
  source: 'kigyounaihoiku';
}
