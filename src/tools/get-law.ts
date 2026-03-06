import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getLawArticle, getLawToc } from '../lib/services/law-service.js';
import { normalizeArticleNum } from '../lib/egov-parser.js';
import { truncateAtBoundary } from '../lib/text-utils.js';

const MAX_TOC_LENGTH = 8000;

export function registerGetLawTool(server: McpServer) {
  server.tool(
    'get_law',
    '企業主導型保育に関連する法令から特定の条文を取得する。e-Gov法令API v2を使用。略称にも対応（児福法→児童福祉法、子支法→子ども・子育て支援法、虐待防止法→児童虐待防止法 等）。',
    {
      law_name: z.string().min(1).describe(
        '法令名または略称。例: "児童福祉法", "子ども・子育て支援法", "児童虐待の防止等に関する法律", "児福法", "子支法", "虐待防止法", "消防法", "建築基準法", "労働安全衛生法"'
      ),
      article: z.string().min(1).optional().describe(
        '条文番号。例: "59の2", "6の3", "第59条"。format="toc"の場合は不要'
      ),
      paragraph: z.number().int().min(1).optional().describe(
        '項番号（省略時は条文全体）。例: 1, 2'
      ),
      item: z.number().int().min(1).optional().describe(
        '号番号（省略時は項全体）。例: 1, 2'
      ),
      format: z.enum(['markdown', 'toc']).optional().describe(
        '出力形式。"markdown"=条文全文（デフォルト）, "toc"=目次のみ（トークン節約）'
      ),
    },
    async (args) => {
      try {
        if (args.format === 'toc') {
          const result = await getLawToc({ lawName: args.law_name });
          const toc = truncateAtBoundary(result.toc, MAX_TOC_LENGTH);
          return {
            content: [{
              type: 'text' as const,
              text: `# ${result.lawTitle} — 目次\n\n${toc}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
            }],
          };
        }

        if (!args.article) {
          return {
            content: [{
              type: 'text' as const,
              text: 'エラー: format="toc"以外では article は必須です。',
            }],
            isError: true,
          };
        }

        if (args.item !== undefined && args.paragraph === undefined) {
          return {
            content: [{
              type: 'text' as const,
              text: 'エラー: item（号）を指定する場合は paragraph（項）も指定してください。',
            }],
            isError: true,
          };
        }

        const result = await getLawArticle({
          lawName: args.law_name,
          article: args.article,
          paragraph: args.paragraph,
          item: args.item,
        });

        const normalized = normalizeArticleNum(args.article);
        const articleDisplay = normalized.replace(/_/g, 'の');
        const paraDisplay = args.paragraph ? `第${args.paragraph}項` : '';
        const itemDisplay = args.item ? `第${args.item}号` : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# ${result.lawTitle} 第${articleDisplay}条${paraDisplay}${itemDisplay}\n${result.articleCaption ? `（${result.articleCaption}）\n` : ''}\n${result.text}\n\n---\n出典：e-Gov法令検索（デジタル庁）\nURL: ${result.egovUrl}`,
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
