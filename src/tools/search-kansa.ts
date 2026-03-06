import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchKansa } from '../lib/services/kansa-service.js';
import { truncateAtBoundary } from '../lib/text-utils.js';

export function registerSearchKansaTool(server: McpServer) {
  server.tool(
    'search_kansa',
    '企業主導型保育事業の監査関連文書（指導・監査評価基準、専門的財務監査基準、専門的労務監査基準等）をキーワード検索する。監査準備、自主点検、帳簿・書類の確認等に使用。doc_type未指定時は全7文書を横断検索する。',
    {
      keyword: z.string().trim().min(1).describe(
        '検索キーワード。スペース区切りでAND検索。例: "帳簿", "労働時間", "経理区分", "改善報告"'
      ),
      doc_type: z.enum([
        'sidou_hyouka',
        'zaimu_kijun',
        'zaimu_hyouka',
        'zaimu_shiryou',
        'roumu_kijun',
        'roumu_hyouka',
        'roumu_jisyutenken',
      ]).optional().describe(
        '文書種別フィルタ（省略時は全文書横断検索）。sidou_hyouka=指導・監査評価基準, zaimu_kijun=専門的財務監査基準, zaimu_hyouka=専門的財務監査評価基準, zaimu_shiryou=財務監査資料一覧, roumu_kijun=専門的労務監査基準, roumu_hyouka=専門的労務監査評価基準, roumu_jisyutenken=労務監査自主点検表'
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        '結果件数上限（デフォルト5、最大10）'
      ),
    },
    async (args) => {
      try {
        const result = await searchKansa({
          keyword: args.keyword,
          docType: args.doc_type,
          limit: args.limit,
        });

        if (result.matchedSections.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `「${args.keyword}」に一致する監査関連セクションが見つかりませんでした。\n\n検索対象: ${result.docLabel}（全${result.totalSections}セクション）\n\nヒント: 別のキーワードで再検索するか、doc_typeを指定して特定文書のみ検索してください。`,
            }],
          };
        }

        const lines = result.matchedSections.map((s, i) => {
          const text = truncateAtBoundary(s.text, 1500);
          return `## ${i + 1}. ${s.sectionTitle}（${s.pageRange}）\n\n${text}`;
        });

        const isFallback = result.matchedSections.some(s => /^ページ \d+$/.test(s.sectionTitle));
        const fallbackWarning = isFallback
          ? '\n\n⚠️ 警告: PDFのセクション分割に失敗し、ページ単位で返却しています。PDF構造が変更された可能性があります。'
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# 監査関連文書検索結果: 「${args.keyword}」\n\n検索対象: ${result.docLabel}（全${result.totalSections}セクション中、${result.matchedSections.length}件マッチ）${fallbackWarning}\n\n${lines.join('\n\n---\n\n')}\n\n---\n出典：${result.docLabel}\nURL: ${result.sourceUrl}`,
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
