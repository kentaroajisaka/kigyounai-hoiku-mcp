# kigyounai-hoiku-mcp

企業主導型保育事業の法令・実施要綱・指導監督基準・FAQ・通知・単価・監査基準を取得する MCP サーバー。

Claude が企業主導型保育の質問に回答する際、**条文や要綱のハルシネーションを防止**するために、e-Gov法令APIおよび各種公式ソースから原文を取得して裏取りさせます。

## 特徴

- **法令取得** — e-Gov法令API v2 から児童福祉法・子ども・子育て支援法等の条文を取得
- **法令検索** — キーワードで法令を横断検索
- **実施要綱検索** — 企業主導型保育事業費補助金実施要綱（88ページ）をセクション単位で全文検索
- **単価検索** — 基本分単価・各種加算を構造化データとして検索（別紙1〜13対応）
- **指導監督基準** — 認可外保育施設指導監督基準PDFを全文検索
- **FAQ検索** — 企業主導型保育ポータルサイトの公式Q&Aを検索
- **通知検索** — ポータルサイトの通知・お知らせ（600件超）を検索
- **監査基準検索** — 指導・監査評価基準、専門的財務/労務監査基準・自主点検表を検索（7文書）

## MCP ツール

| ツール | データソース | 説明 |
|--------|------------|------|
| `get_law` | e-Gov法令API | 児童福祉法、子ども・子育て支援法等の条文取得 |
| `search_law` | e-Gov法令API | 法令名が不明な場合のキーワード検索 |
| `search_tanka` | 実施要綱PDF（構造化） | 基本分単価・各種加算の金額を構造化データとして検索 |
| `search_youkou` | 実施要綱PDF（テキスト） | 助成金交付条件・要件・留意事項のテキスト検索 |
| `search_kantoku_kijun` | 監督基準PDF | 認可外保育施設の法的最低基準検索 |
| `search_faq` | WordPress REST API | 企業主導型保育のQ&A検索 |
| `search_tsuuchi` | ポータルサイト | 通知・お知らせ一覧検索（600件超） |
| `search_kansa` | 監査関連PDF（7文書） | 指導・監査評価基準、自主点検表の検索 |

## セットアップ

### npx（推奨）

インストール不要。以下の設定をコピペするだけ:

```json
{
  "mcpServers": {
    "kigyounai-hoiku": {
      "command": "npx",
      "args": ["-y", "kigyounai-hoiku-mcp"]
    }
  }
}
```

**Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` に追加

**Claude Code**: `claude mcp add kigyounai-hoiku -- npx -y kigyounai-hoiku-mcp`

### ローカル（ソースから）

```bash
git clone https://github.com/kentaroajisaka/kigyounai-hoiku-mcp.git
cd kigyounai-hoiku-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "kigyounai-hoiku": {
      "command": "node",
      "args": ["/path/to/kigyounai-hoiku-mcp/dist/index.js"]
    }
  }
}
```

## ドメイン知識

### 企業主導型保育 = 認可外保育施設

- 認可保育所**ではない**（認可外保育施設に分類）
- **委託費**（市区町村）ではなく**助成金**（児童育成協会）で運営
- 財源は**事業主拠出金**

### 2層構造の基準

1. **認可外保育施設指導監督基準** — 全ての認可外施設に適用される法的最低基準（`search_kantoku_kijun`）
2. **企業主導型保育事業費補助金実施要綱** — 助成金を受けるための上乗せ基準（`search_youkou` / `search_tanka`）

### 単価の構造（別紙1〜13）

実施要綱の別紙1には20種類の単価・加算が定義されています:

| # | 項目 | search_tanka |
|---|------|-------------|
| ① | 基本分単価（地域区分×定員×年齢×保育士比率×開所時間×開所日数×事業主区分） | `type="kihon"` |
| ②〜③ | 処遇改善等加算Ⅰ・Ⅱ | `besshi="2"`, `besshi="3"` |
| ④〜⑮ | 延長保育・夜間保育・病児保育・賃借料・防犯安全 等の各種加算 | `type="kasan"` |
| ⑯ | 処遇改善等加算Ⅲ | `besshi="8"` |
| ⑰ | 障害児保育加算 | `besshi="9"` |
| ⑱ | 医療的ケア児保育支援加算 | `besshi="10"` |
| ⑲〜⑳ | 3歳児・4歳以上児配置改善加算 | `besshi="13"` |

## 使い方の例

### 基本分単価を調べる

> 「鹿児島市（その他地域）で定員60人の0歳児の基本分単価を教えて」

→ `search_tanka(type="kihon", chiiki_kubun="その他地域", teiin_kubun="60", nenrei_kubun="乳児")`

### 加算の金額を調べる

> 「賃借料加算はいくら？」

→ `search_tanka(type="kasan", kasan_keyword="賃借料")`

### 実施要綱の要件を確認する

> 「病児保育加算の要件を教えて」

→ `search_youkou(keyword="病児保育加算")`

### 指導監督基準を確認する

> 「認可外保育施設の職員配置基準は？」

→ `search_kantoku_kijun(keyword="職員配置")`

### FAQ を検索する

> 「企業枠と地域枠の違いは？」

→ `search_faq(keyword="企業枠 地域枠")`

### 監査準備

> 「自主点検表の人員配置に関する項目を確認したい」

→ `search_kansa(keyword="人員配置")`

## 環境変数（オプション）

| 変数 | 説明 |
|------|------|
| `KIGYOUNAI_YOUKOU_PDF_URL` | 実施要綱PDFのURL（デフォルト: kigyounaihoiku.jp） |
| `KIGYOUNAI_KANTOKU_PDF_URL` | 指導監督基準PDFのURL（デフォルト: cfa.go.jp） |

## 出典

- 法令: [e-Gov法令検索](https://laws.e-gov.go.jp/)（デジタル庁）
- 実施要綱・通知・FAQ: [企業主導型保育事業ポータル](https://www.kigyounaihoiku.jp/)（児童育成協会）
- 指導監督基準: [こども家庭庁](https://www.cfa.go.jp/policies/hoiku/ninkagai/tsuuchi)

## 開発

```bash
npm install
npm run build
npm run dev    # tsx で起動
npm test       # vitest
```

## ライセンス

MIT
