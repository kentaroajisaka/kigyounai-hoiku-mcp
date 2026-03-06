import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchTsuuchi } from '../lib/services/tsuuchi-service.js';

export function registerSearchTsuuchiTool(server: McpServer) {
  server.tool(
    'search_tsuuchi',
    '企業主導型保育事業の通知・お知らせ一覧をキーワード検索する。助成決定、指導監査、セミナー、システム更新等の通知を検索できる。',
    {
      keyword: z.string().trim().min(1).describe(
        '検索キーワード。スペース区切りでAND検索。例: "指導監査", "無償化", "助成決定", "様式"'
      ),
      category: z.string().optional().describe(
        'カテゴリで絞り込み（部分一致）。例: "セミナー", "助成決定", "通知・様式", "指導・監査", "重要"'
      ),
      limit: z.number().int().min(1).max(30).optional().describe(
        '結果件数上限（デフォルト10、最大30）'
      ),
    },
    async (args) => {
      try {
        const result = await searchTsuuchi({
          keyword: args.keyword,
          category: args.category,
          limit: args.limit,
        });

        if (result.matchedEntries.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `「${args.keyword}」に一致する通知が見つかりませんでした。キーワードを変えて再検索してください。\n\n全${result.totalEntries}件中、0件マッチ。`,
            }],
          };
        }

        const lines = result.matchedEntries.map((e, i) =>
          `${i + 1}. **${e.title}**\n   日付: ${e.date}${e.category ? ` | カテゴリ: ${e.category}` : ''}\n   URL: ${e.url}`
        );

        return {
          content: [{
            type: 'text' as const,
            text: `# 通知検索結果: 「${args.keyword}」\n\n全${result.totalEntries}件中、${result.matchedEntries.length}件マッチ\n\n${lines.join('\n\n')}\n\n---\n出典：企業主導型保育事業ポータルサイト お知らせ\nURL: ${result.sourceUrl}`,
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
