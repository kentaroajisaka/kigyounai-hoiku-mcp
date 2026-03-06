import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchYoukou } from '../lib/services/youkou-service.js';

export function registerSearchYoukouTool(server: McpServer) {
  server.tool(
    'search_youkou',
    `企業主導型保育事業費補助金実施要綱（助成金の交付条件を定めた要綱、88ページ）をキーワード検索する。職員配置・設備基準・運営費・整備費・共同利用等の助成金に関する基準はこのツールで検索。これは認可外保育施設指導監督基準（search_kantoku_kijun）の上乗せ基準である。

## 単価表の取得方法（重要）
別紙1（基本分単価）等の大きな単価表は、キーワード検索だけでは特定の地域区分のデータまで到達できない場合がある。
以下の手順で段階的に絞り込むこと:
1. まず keyword で検索して該当セクション名を特定する（例: "基本分単価" → "別紙１"）
2. section パラメータでセクションを指定し、keyword に地域区分や定員区分を指定して絞り込む
   例: section="別紙１", keyword="その他地域 51人", max_chars=5000
3. それでも不足する場合は max_chars を増やす（最大10000）

## 主要な別紙一覧
- 別紙１: 運営費単価一覧（①基本分単価〜⑳４歳以上児配置改善加算の全20項目を含む巨大セクション）
  - ①基本分単価、②処遇改善等加算Ⅰ、③処遇改善等加算Ⅱ、④延長保育加算、⑤夜間保育加算
  - ⑥非正規労働者受入推進加算、⑦病児保育加算（病児対応型・病後児対応型・体調不良児対応型の3類型）
  - ⑧預かりサービス加算、⑨賃借料加算、⑩保育補助者雇上強化加算、⑪防犯・安全対策強化加算
  - ⑫運営支援システム導入加算、⑬連携推進加算、⑭改修支援加算、⑮改修実施加算
  - ⑯処遇改善等加算Ⅲ、⑰障害児保育加算、⑱医療的ケア児保育支援加算、⑲３歳児配置改善加算、⑳４歳以上児配置改善加算
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

## 単価の金額を知りたい場合
基本分単価・各種加算の**金額**が必要な場合は、まず **search_tanka** ツールを使うこと。
search_tanka は構造化データとして単価を返すため、正確かつ高速。
search_youkou は要件・留意事項等のテキスト情報を確認する場合に使う。`,
    {
      keyword: z.string().trim().describe(
        '検索キーワード。スペース区切りでAND検索。section指定時は空文字可（セクション全文取得）。例: "職員配置", "その他地域 51人", "運営費 基準額"'
      ),
      section: z.string().trim().optional().describe(
        'セクション名フィルタ（前方一致/部分一致）。例: "別紙１", "別紙13", "第３". keywordと組み合わせて大きなセクション内を絞り込める'
      ),
      max_chars: z.number().int().min(500).max(10000).optional().describe(
        '1セクションあたりの最大出力文字数（デフォルト2000、最大10000）。大きな単価表を取得する場合は5000〜10000を指定'
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        '結果件数上限（デフォルト5、最大10）'
      ),
    },
    async (args) => {
      try {
        const result = await searchYoukou({
          keyword: args.keyword,
          section: args.section,
          maxChars: args.max_chars,
          limit: args.limit,
        });

        if (result.matchedSections.length === 0) {
          const sectionListHint = result.sectionList
            ? `\n\n利用可能なセクション一覧:\n${result.sectionList.map(s => `- ${s}`).join('\n')}`
            : '';
          const sectionNote = args.section
            ? `\nsection="${args.section}" に一致するセクションが見つかりませんでした。`
            : '';
          return {
            content: [{
              type: 'text' as const,
              text: `「${args.keyword}」に一致する実施要綱セクションが見つかりませんでした。\n\n全${result.totalSections}セクション中、0件マッチ。${sectionNote}\n\nヒント: 行政文書は日常語と異なる表現を使います。同義語で再検索してください（例: 「配置基準」→「職員」、「散歩」→「園外」、「午睡」→「睡眠」）。${sectionListHint}`,
            }],
          };
        }

        const lines = result.matchedSections.map((s, i) => {
          return `## ${i + 1}. ${s.sectionTitle}（${s.pageRange}）\n\n${s.text}`;
        });

        // セクション分割がページ単位にフォールバックしていないか検知
        const isFallback = result.matchedSections.some(s => /^ページ \d+$/.test(s.sectionTitle));
        const fallbackWarning = isFallback
          ? '\n\n⚠️ 警告: PDFのセクション分割に失敗し、ページ単位で返却しています。PDF構造が変更された可能性があります。自己修復の実行を検討してください。'
          : '';

        const sectionFilter = args.section ? ` (section="${args.section}")` : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# 実施要綱検索結果: 「${args.keyword}」${sectionFilter}\n\n全${result.totalSections}セクション中、${result.matchedSections.length}件マッチ${fallbackWarning}\n\n${lines.join('\n\n---\n\n')}\n\n---\n出典：企業主導型保育事業費補助金実施要綱\nURL: ${result.sourceUrl}`,
          }],
        };
      } catch (error) {
        const errName = error instanceof Error ? error.constructor.name : 'Error';
        return {
          content: [{
            type: 'text' as const,
            text: `エラー [${errName}]: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
