import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchFaq } from '../lib/services/faq-service.js';
import { truncateAtBoundary } from '../lib/text-utils.js';

export function registerSearchFaqTool(server: McpServer) {
  server.tool(
    'search_faq',
    '企業主導型保育事業のFAQ（よくある質問）をキーワード検索する。制度・申請・共同利用・公金管理システム等に関する公式Q&Aを検索できる。',
    {
      keyword: z.string().trim().min(1).describe(
        '検索キーワード。スペース区切りでAND検索。例: "共同利用", "利用枠", "保育支援システム", "月次報告"'
      ),
      category: z.string().optional().describe(
        'カテゴリで絞り込み（部分一致）。例: "利用者様向け", "共同利用", "公金管理", "その他"'
      ),
      limit: z.number().int().min(1).max(20).optional().describe(
        '結果件数上限（デフォルト5、最大20）'
      ),
    },
    async (args) => {
      try {
        const result = await searchFaq({
          keyword: args.keyword,
          category: args.category,
          limit: args.limit,
        });

        if (result.matchedEntries.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `「${args.keyword}」に一致するFAQが見つかりませんでした。キーワードを変えて再検索してください。\n\n全${result.totalEntries}件中、0件マッチ。`,
            }],
          };
        }

        const lines = result.matchedEntries.map((e, i) => {
          const answer = truncateAtBoundary(e.answer, 800);
          return `## ${i + 1}. ${e.question}\n\nカテゴリ: ${e.category} | 更新: ${e.lastUpdated ?? '不明'}\n\n${answer}\n\nURL: ${e.url}`;
        });

        return {
          content: [{
            type: 'text' as const,
            text: `# FAQ検索結果: 「${args.keyword}」\n\n全${result.totalEntries}件中、${result.matchedEntries.length}件マッチ\n\n${lines.join('\n\n---\n\n')}\n\n---\n出典：企業主導型保育事業ポータルサイト FAQ\nURL: ${result.sourceUrl}`,
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
