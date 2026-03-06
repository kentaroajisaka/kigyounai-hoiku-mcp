import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchKantoku } from '../lib/services/kantoku-service.js';
import { truncateAtBoundary } from '../lib/text-utils.js';

export function registerSearchKantokuKijunTool(server: McpServer) {
  server.tool(
    'search_kantoku_kijun',
    '認可外保育施設指導監督基準（全ての認可外保育施設に適用される法的最低基準）をキーワード検索する。保育従事者の資格・配置、設備、保育内容、給食、健康管理等の最低基準はこのツールで検索。企業主導型保育は認可外保育施設であり、この基準が法的ベースラインとなる。',
    {
      keyword: z.string().trim().min(1).describe(
        '検索キーワード。スペース区切りでAND検索。例: "保育に従事する者", "保育室 面積", "給食", "健康診断"'
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        '結果件数上限（デフォルト5、最大10）'
      ),
    },
    async (args) => {
      try {
        const result = await searchKantoku({
          keyword: args.keyword,
          limit: args.limit,
        });

        if (result.matchedSections.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `「${args.keyword}」に一致する指導監督基準セクションが見つかりませんでした。\n\n全${result.totalSections}セクション中、0件マッチ。\n\nヒント: 行政文書は日常語と異なる表現を使います。同義語で再検索してください（例: 「配置基準」→「保育従事者」、「散歩」→「戸外」、「嘱託医」→「嘱託」）。`,
            }],
          };
        }

        const lines = result.matchedSections.map((s, i) => {
          const text = truncateAtBoundary(s.text, 1500);
          return `## ${i + 1}. ${s.sectionTitle}（${s.pageRange}）\n\n${text}`;
        });

        const isFallback = result.matchedSections.some(s => /^ページ \d+$/.test(s.sectionTitle));
        const fallbackWarning = isFallback
          ? '\n\n⚠️ 警告: PDFのセクション分割に失敗し、ページ単位で返却しています。PDF構造が変更された可能性があります。自己修復の実行を検討してください。'
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: `# 指導監督基準検索結果: 「${args.keyword}」\n\n全${result.totalSections}セクション中、${result.matchedSections.length}件マッチ${fallbackWarning}\n\n${lines.join('\n\n---\n\n')}\n\n---\n出典：認可外保育施設指導監督基準（こども家庭庁）\nURL: ${result.sourceUrl}`,
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
