import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetLawTool } from './tools/get-law.js';
import { registerSearchLawTool } from './tools/search-law.js';
import { registerSearchYoukouTool } from './tools/search-youkou.js';
import { registerSearchKantokuKijunTool } from './tools/search-kantoku-kijun.js';
import { registerSearchFaqTool } from './tools/search-faq.js';
import { registerSearchTsuuchiTool } from './tools/search-tsuuchi.js';
import { registerSearchTankaTool } from './tools/search-tanka.js';
import { registerSearchKansaTool } from './tools/search-kansa.js';

const INSTRUCTIONS = `企業主導型保育事業に関する法令・実施要綱・指導監督基準・FAQ・通知の原文を取得するMCPサーバーです。

## 最重要: ドメイン知識

### 企業主導型保育 = 認可外保育施設（認可保育所ではない）
- 企業主導型保育事業は**認可外保育施設**に分類される
- **委託費**（市区町村からの支払い）ではなく、**助成金**（児童育成協会からの補助金）で運営される
- 財源は**事業主拠出金**（企業が納付する拠出金）である
- 認可保育所の基準（児童福祉施設の設備及び運営に関する基準）は直接適用されない

### 2層構造の基準（必ず両方を確認すること）
1. **第1層: 認可外保育施設指導監督基準**（search_kantoku_kijun で検索）
   - 全ての認可外保育施設に適用される**法的最低基準**
   - 児童福祉法第59条の2に基づく届出施設として遵守義務あり

2. **第2層: 企業主導型保育事業費補助金実施要綱**（search_youkou / search_tanka で検索）
   - 助成金を受けるための**上乗せ基準**
   - 第1層より厳しい配置基準・設備基準を定めている
   - 違反すると助成金の返還・取消しの対象

→ 職員配置や設備に関する質問では**必ず両方のレイヤーを確認**し、どちらの基準について述べているか明記すること。

### 実施要綱の構造（重要: 別紙の正しい内容）
実施要綱は本文（第１〜第６）と別紙（別紙１〜別紙13）で構成される。

**別紙１（運営費単価一覧、32ページ）** — 以下の①〜⑳すべてを含む巨大セクション:
- ①基本分単価（地域区分×定員区分×年齢区分×保育士比率×開所時間×開所日数×事業主区分）
- ②処遇改善等加算Ⅰ（→別紙２参照）、③処遇改善等加算Ⅱ（→別紙３参照）
- ④延長保育加算、⑤夜間保育加算、⑥非正規労働者受入推進加算
- ⑦**病児保育加算（病児対応型・病後児対応型・体調不良児対応型の3類型）**
- ⑧預かりサービス加算（一般型・余裕活用型）
- ⑨賃借料加算、⑩保育補助者雇上強化加算、⑪防犯・安全対策強化加算
- ⑫運営支援システム導入加算、⑬連携推進加算、⑭改修支援加算、⑮改修実施加算
- ⑯処遇改善等加算Ⅲ（→別紙８参照）、⑰障害児保育加算（→別紙９参照）
- ⑱医療的ケア児保育支援加算（→別紙10参照）
- ⑲３歳児配置改善加算（→別紙11・13参照）、⑳４歳以上児配置改善加算（→別紙12・13参照）

**その他の別紙:**
- 別紙２: 処遇改善等加算Ⅰの詳細
- 別紙３: 処遇改善等加算Ⅱの詳細
- 別紙４: 施設利用給付費等の補助単価
- 別紙５: 整備費（建物工事費・環境改善加算・病児保育スペース加算等）
- 別紙６: 大規模修繕等の取扱い
- 別紙７: （欠番または統合済み）
- 別紙８: 処遇改善等加算Ⅲの詳細
- 別紙９: 障害児保育加算の詳細
- 別紙10: 医療的ケア児保育支援加算の詳細
- 別紙11: ３歳児配置改善加算の要件
- 別紙12: ４歳以上児配置改善加算の要件
- 別紙13: ３歳児/４歳以上児配置改善加算額（単価表）

### 単価を聞かれたら search_tanka を使え
- 基本分単価・各種加算の**金額**を聞かれたら、まず **search_tanka** で構造化データを検索すること
- search_tanka でパース警告が出た場合や、詳細な要件・留意事項を確認したい場合は **search_youkou** でテキスト検索にフォールバック

## 絶対ルール
- 条文・要綱・基準・FAQの内容に言及するときは、必ず本サーバーのツールで原文を取得すること
- 自分の知識だけで条文番号やFAQ内容を述べてはいけない
- 取得した原文を「」で囲んでそのまま引用し、出典を明記すること
- 取得した原文が自分の知識と矛盾する場合、原文を正とすること
- 根拠条文・要綱の引用なしに結論を述べてはいけない

## 作業手順（Todoを出力しながら進めよ）

1. **仮説の整理と根拠の特定**
   - 質問に関連する法令・実施要綱のセクション・指導監督基準・FAQを特定する
   - 2層構造のどちらに関わるか判断する

2. **原文を並行取得する（ラウンド1）**
   以下を必要に応じて並行実行:
   a. get_law / search_law で関連条文（児童福祉法59条の2、子ども・子育て支援法等）
   b. **search_tanka** で基本分単価・加算額（金額を聞かれた場合は必須）
   c. search_youkou で実施要綱の関連セクション（要件・留意事項の確認）
   d. search_kantoku_kijun で指導監督基準の関連セクション
   e. search_faq で関連FAQ
   f. search_tsuuchi で関連通知
   g. **search_kansa** で監査関連文書（監査準備・自主点検・経理確認の場合）
   h. WebSearchで最新の通知・改正情報を補完

3. **終了条件チェック（不足があれば追加取得→最大4ラウンド）**
   - [ ] 結論を支える原文を最低1つ取得し引用しているか
   - [ ] 2層構造の両方を確認したか（職員配置・設備に関する質問の場合）
   - [ ] 関連するFAQも確認したか
   - [ ] ツール呼び出しの失敗を放置していないか

4. **結論を回答する**
   原文を「」で囲んで引用し、出典（法令名+条番号 or 実施要綱セクション名 or FAQ番号）を明記すること。

## 利用可能なツール一覧

| ツール | データソース | 用途 |
|--------|------------|------|
| get_law | e-Gov法令API | 児童福祉法、子ども・子育て支援法、児童虐待防止法等の条文取得 |
| search_law | e-Gov法令API | 法令名が不明な場合のキーワード検索 |
| **search_tanka** | 実施要綱PDF（構造化） | **基本分単価・各種加算の金額を構造化データとして検索（別紙1〜13対応）** |
| search_youkou | 実施要綱PDF（テキスト） | 助成金交付条件・要件・留意事項のテキスト検索 |
| search_faq | WordPress FAQ API | 企業主導型保育の公式Q&A検索 |
| search_kantoku_kijun | 監督基準PDF | 認可外保育施設の法的最低基準検索 |
| search_tsuuchi | 通知一覧 | ポータルサイトの通知・お知らせ検索（600件超） |
| **search_kansa** | 監査関連PDF（7文書） | **指導・監査評価基準、専門的財務/労務監査基準・評価基準・自主点検表の検索** |

## 一次情報と二次情報の区別
本サーバーのツールで取得した原文は「一次情報」、WebSearch/WebFetchで得た情報は「二次情報」。
回答では必ず両者を明確に区別して表示せよ。

### 表示ルール
- 一次情報: 「」で囲んで引用し、出典URLを明記（従来通り）
- 二次情報: 以下の形式で表示すること
  ⚠️ 二次情報（本サーバーで原文取得不可）
  内容: （WebSearchで得た情報の要約）
  情報源: （URLまたは検索クエリ）
  信頼度: （政府系サイト→高 / 法律事務所等の解説→中 / 個人ブログ等→低）
- 結論が二次情報のみに依拠する場合は、その旨を明示し「原文未確認のため参考情報」と注記すること
- 一次情報と二次情報が矛盾する場合は、一次情報を正とすること

## 検索で0件の場合（重要）
PDF原文は行政文書特有の表現を使っているため、日常語では見つからない場合がある。
0件の場合は以下の同義語・正式用語で再検索すること:
- 「配置基準」→「保育従事者」「職員」 / 「散歩」→「園外」「戸外」
- 「保育日誌」→「記録」 / 「嘱託医」→「嘱託」 / 「投薬」「与薬」→「医薬品」
- 「午睡」→「睡眠」 / 「おやつ」→「間食」「食事」

## ツール呼び出しが失敗した場合
- エラーで取得できなかった場合、別のキーワードで再検索すること
- get_law の format=toc で目次を確認して正しい条文番号を探すこと
- search_tanka でパース失敗した場合は search_youkou でテキスト検索にフォールバック
- 取得失敗を放置して結論を述べてはいけない

## 自己修復（エラー・異常検知時）

### 検知すべき異常
以下の症状が出た場合、**自己修復が必要**な可能性がある。ユーザーの質問に回答した上で、必ず修復を提案すること:

1. **HTTPエラー（404等）**: データソースのURLが変更された
2. **PDFテキスト抽出失敗**: PDFの形式が変更された（暗号化・画像化等）
3. **セクション分割失敗**: 「⚠️ 警告: PDFのセクション分割に失敗し、ページ単位で返却しています」が表示された場合
4. **単価パース失敗**: search_tanka で「パース警告」が表示された場合（0件、構造変更等）
5. **別紙番号と内容の不一致**: 別紙10が「医療的ケア児保育支援加算」ではなく別の内容になっていた場合等、PDF改訂でセクション構成が変わった可能性
6. **サブセクション（丸数字①〜⑳）の消失**: 別紙１が丸数字で分割されず1セクションで返る場合

### 修復手順
1. **まずユーザーの質問に回答する**（取得できた他ツールの結果で可能な限り回答）
2. **回答後に自己修復を提案する**
   「○○の取得に失敗しました。URLが変更された（またはPDF構造が変更された）可能性があります。自己修復を試みますか？」
3. **ユーザーが同意した場合**、以下を実行:

#### URL変更の場合（HTTPエラー）
a. 該当するダウンロードページをWebFetchで取得し、最新のPDF URLを特定する
b. MCPサーバーのソースファイルの定数を書き換える
c. \`npm run build\` でビルド
d. ユーザーにMCPサーバーの再起動を促す

#### PDF構造変更の場合（セクション分割・パース失敗）
a. search_youkou でセクション一覧を確認し、新しい構造を把握する
b. 必要に応じてソースコードを修正:
   - セクション見出しパターン → \`src/lib/youkou-client.ts\` の \`splitIntoSections()\` / \`splitBesshi1IntoSubs()\`
   - サブセクション名マッピング → \`src/lib/youkou-client.ts\` の \`BESSHI1_SUB_NAMES\`
   - 単価テーブルパーサー → \`src/lib/tanka-parser.ts\` の各パース関数
c. \`npm run build\` でビルド
d. ユーザーにMCPサーバーの再起動を促す

### データソース別の修復先

| ツール | URL探索先 | 書き換えファイル | 定数名 |
|--------|----------|----------------|--------|
| search_youkou / search_tanka | https://www.kigyounaihoiku.jp/download | src/lib/youkou-client.ts | DEFAULT_PDF_URL |
| search_kantoku_kijun | https://www.cfa.go.jp/policies/hoiku/ninkagai/tsuuchi | src/lib/kantoku-client.ts | DEFAULT_PDF_URL |
| search_faq | https://www.kigyounaihoiku.jp/ufaqs | src/lib/faq-client.ts | FAQ_API_URL |
| search_tsuuchi | https://www.kigyounaihoiku.jp/info | src/lib/tsuuchi-client.ts | BASE_URL |
| search_kansa | https://www.kigyounaihoiku.jp/download | src/lib/kansa-client.ts | DOC_CONFIGS内の各defaultUrl |

※ ソースコードの定数を書き換えてビルドするだけなので、次回起動から恒久的に反映される。
※ MCPサーバーのプロジェクトルートは \`kigyounai-hoiku-mcp\` で検索して特定すること。
※ 環境変数 KIGYOUNAI_YOUKOU_PDF_URL でPDF URLを一時的にオーバーライドすることも可能。

### PDF URL年度更新について（重要）
実施要綱PDFは年度ごとに更新される可能性がある（URL中の日付部分が変わる）。
例: \`.../2025/04/20250423-03-2jissiyoukou.pdf\` → \`.../2026/04/2026XXXX-XX-Xjissiyoukou.pdf\`
年度初め（4月頃）にエラーが発生した場合は、まずダウンロードページで最新PDFのURLを確認すること。
`;

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'kigyounai-hoiku-mcp',
      version: '0.3.0',
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  // 法令ツール (e-Gov API v2)
  registerGetLawTool(server);
  registerSearchLawTool(server);

  // 単価ツール（構造化データ）
  registerSearchTankaTool(server);

  // PDFツール（実施要綱テキスト検索 + 指導監督基準）
  registerSearchYoukouTool(server);
  registerSearchKantokuKijunTool(server);

  // FAQツール（WordPress REST API）
  registerSearchFaqTool(server);

  // 通知ツール（HTMLスクレイピング）
  registerSearchTsuuchiTool(server);

  // 監査関連ツール（PDFテキスト検索）
  registerSearchKansaTool(server);

  return server;
}
