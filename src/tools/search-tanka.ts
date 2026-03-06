import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchTanka } from '../lib/services/tanka-service.js';
import type {
  KihonTankaEntry,
  KasanTankaEntry,
  ShoguKaizenEntry,
  ShogaijiEntry,
  HaichiKaizenEntry,
  SeibihiEntry,
  RiyoushaFutanEntry,
  ChuushouKigyouEntry,
  IryoutekiCareEntry,
  BesshiTextEntry,
} from '../lib/types.js';

export function registerSearchTankaTool(server: McpServer) {
  server.tool(
    'search_tanka',
    `企業主導型保育事業の運営費単価を構造化データとして検索する。実施要綱の別紙1〜13をパースした構造化データから、条件に合致する単価を返す。

## besshi パラメータで別紙を指定して検索
- besshi="1" → 基本分単価 + 各種加算（従来の検索）
- besshi="2" → 処遇改善等加算Ⅰ定員別加算額
- besshi="4" → 利用者負担相当額（基本分単価から控除する額）
- besshi="5" → 整備費基準額（本体工事費・各種加算）
- besshi="7" → 中小企業事業主の定義（業種別判定表）
- besshi="9" → 障害児保育加算額（+ 処遇改善等加算Ⅰ）
- besshi="10" → 医療的ケア児保育支援加算
- besshi="13" → ３歳児/４歳以上児配置改善加算額（+ 処遇改善等加算Ⅰ）
- besshi="3","6","8","11","12" → テキスト全文（構造化テーブルなし）

## besshi未指定時（従来互換）
type="kihon" → 基本分単価、type="kasan" → 各種加算、type="all" → 両方

## フィルタ
- chiiki_kubun: 地域区分（"その他地域","20/100"等）
- teiin_kubun: 定員区分（"19"で自動判定 → 13人～19人）
- nenrei_kubun: 年齢区分（"乳児","３歳児"等）
- kasan_keyword: 加算名キーワード（type="kasan"時）`,
    {
      besshi: z.string().trim().optional().describe(
        '別紙番号（"1"〜"13"）。指定すると該当別紙のデータのみ返す'
      ),
      type: z.enum(['kihon', 'kasan', 'all']).optional().describe(
        '検索種別（besshi未指定時）。kihon=基本分単価, kasan=各種加算, all=両方'
      ),
      chiiki_kubun: z.string().trim().optional().describe(
        '地域区分フィルタ'
      ),
      teiin_kubun: z.string().trim().optional().describe(
        '定員区分フィルタ。数値（例: "19"）で自動判定'
      ),
      nenrei_kubun: z.string().trim().optional().describe(
        '年齢区分フィルタ'
      ),
      kasan_keyword: z.string().trim().optional().describe(
        '加算名キーワード（スペース区切りAND検索）'
      ),
      limit: z.number().int().min(1).max(500).optional().describe(
        '結果件数上限（デフォルト50、最大500）'
      ),
    },
    async (args) => {
      try {
        const result = await searchTanka({
          besshi: args.besshi,
          type: args.type,
          chiikiKubun: args.chiiki_kubun,
          teiinKubun: args.teiin_kubun,
          nenreiKubun: args.nenrei_kubun,
          kasanKeyword: args.kasan_keyword,
          limit: args.limit,
        });

        const parts: string[] = [];

        if (result.warnings.length > 0) {
          parts.push('⚠️ パース警告:\n' + result.warnings.map(w => `- ${w}`).join('\n'));
        }

        // 基本分単価
        if (result.kihon.length > 0) {
          parts.push(`## 基本分単価（${result.totalKihon}件中${result.kihon.length}件表示）\n`);
          parts.push(formatKihonTable(result.kihon));
        }

        // 加算
        if (result.kasan.length > 0) {
          parts.push(`## 各種加算（${result.totalKasan}件中${result.kasan.length}件表示）\n`);
          parts.push(formatKasanTable(result.kasan));
        }

        // 処遇改善等加算Ⅰ（別紙2）
        if (result.shoguKaizen.length > 0) {
          parts.push(`## 処遇改善等加算Ⅰ定員別加算額（別紙2）— ${result.shoguKaizen.length}件\n`);
          parts.push(formatShoguKaizenTable(result.shoguKaizen));
        }

        // 利用者負担相当額（別紙4）
        if (result.riyoushaFutan.length > 0) {
          parts.push(`## 利用者負担相当額（別紙4）\n`);
          parts.push(formatRiyoushaFutanTable(result.riyoushaFutan));
        }

        // 整備費（別紙5）
        if (result.seibihi.length > 0) {
          parts.push(`## 整備費基準額（別紙5）\n`);
          parts.push(formatSeibihiTable(result.seibihi));
        }

        // 中小企業事業主定義（別紙7）
        if (result.chuushouKigyou.length > 0) {
          parts.push(`## 中小企業事業主の定義（別紙7）\n`);
          parts.push(formatChuushouKigyouTable(result.chuushouKigyou));
        }

        // 障害児保育加算（別紙9）
        if (result.shogaiji.length > 0) {
          parts.push(`## 障害児保育加算額（別紙9）— ${result.shogaiji.length}件\n`);
          parts.push(formatShogaijiTable(result.shogaiji));
        }

        // 医療的ケア児（別紙10）
        if (result.iryoutekiCare.length > 0) {
          parts.push(`## 医療的ケア児保育支援加算（別紙10）\n`);
          parts.push(formatIryoutekiCareTable(result.iryoutekiCare));
        }

        // 配置改善加算（別紙13）
        if (result.haichiKaizen.length > 0) {
          parts.push(`## 配置改善加算額（別紙13）— ${result.haichiKaizen.length}件\n`);
          parts.push(formatHaichiKaizenTable(result.haichiKaizen));
        }

        // テキスト別紙
        if (result.besshiTexts.length > 0) {
          for (const bt of result.besshiTexts) {
            parts.push(`## ${bt.besshi}（${bt.title}）\n`);
            parts.push(bt.text.substring(0, 3000));
            if (bt.text.length > 3000) {
              parts.push(`\n... (${bt.text.length}文字中、最初の3000文字を表示。search_youkou でキーワード検索可)`);
            }
          }
        }

        // 結果なし
        if (parts.length === 0 || (parts.length === 1 && parts[0].startsWith('⚠️'))) {
          const hints: string[] = [];
          if (args.besshi) {
            hints.push(`別紙${args.besshi} のデータが見つかりませんでした。`);
          }
          hints.push('search_youkou でテキスト検索にフォールバックしてください。');
          parts.push(hints.join('\n'));
        }

        parts.push(`\n---\n出典：企業主導型保育事業費補助金実施要綱\nURL: ${result.sourceUrl}`);

        return {
          content: [{
            type: 'text' as const,
            text: parts.join('\n\n'),
          }],
        };
      } catch (error) {
        const errName = error instanceof Error ? error.constructor.name : 'Error';
        return {
          content: [{
            type: 'text' as const,
            text: `エラー [${errName}]: ${error instanceof Error ? error.message : String(error)}\n\n⚠️ 単価データのパースに失敗しました。search_youkou でテキスト検索にフォールバックしてください。`,
          }],
          isError: true,
        };
      }
    },
  );
}

// ---- フォーマッタ ----

function formatKihonTable(entries: KihonTankaEntry[]): string {
  const lines: string[] = [];
  lines.push('| 地域区分 | 定員区分 | 年齢区分 | 事業主区分 | 開所時間 | 開所日数 | 保育士100% | 保育士75% | 保育士50% |');
  lines.push('|----------|----------|----------|------------|----------|----------|------------|-----------|-----------|');
  for (const e of entries) {
    lines.push(
      `| ${e.chiikiKubun} | ${e.teiinKubun} | ${e.nenreiKubun} | ${e.jigyounushiKubun} | ${e.kaishoJikan} | ${e.kaishoNissu} | ${e.hoikushi100.toLocaleString()}円 | ${e.hoikushi75.toLocaleString()}円 | ${e.hoikushi50.toLocaleString()}円 |`,
    );
  }
  return lines.join('\n');
}

function formatKasanTable(entries: KasanTankaEntry[]): string {
  const lines: string[] = [];
  lines.push('| 加算名 | 区分/条件 | 金額 | 単位 | 備考 |');
  lines.push('|--------|----------|------|------|------|');
  for (const e of entries) {
    lines.push(
      `| ${e.kasanName} | ${e.kubun} | ${e.kingaku.toLocaleString()}円 | ${e.tani} | ${e.biko ?? ''} |`,
    );
  }
  return lines.join('\n');
}

function formatShoguKaizenTable(entries: ShoguKaizenEntry[]): string {
  const lines: string[] = [];
  lines.push('| 地域区分 | 定員区分 | 年齢区分 | 開所時間 | 開所日数 | 保育士100% | 保育士75% | 保育士50% |');
  lines.push('|----------|----------|----------|----------|----------|------------|-----------|-----------|');
  for (const e of entries) {
    lines.push(
      `| ${e.chiikiKubun} | ${e.teiinKubun} | ${e.nenreiKubun} | ${e.kaishoJikan} | ${e.kaishoNissu} | ${e.hoikushi100.toLocaleString()}円 | ${e.hoikushi75.toLocaleString()}円 | ${e.hoikushi50.toLocaleString()}円 |`,
    );
  }
  return lines.join('\n');
}

function formatRiyoushaFutanTable(entries: RiyoushaFutanEntry[]): string {
  const lines: string[] = [];
  lines.push('| 年齢区分 | 利用者負担相当額 |');
  lines.push('|----------|-----------------|');
  for (const e of entries) {
    lines.push(`| ${e.nenreiKubun} | ${e.kingaku.toLocaleString()}円 |`);
  }
  return lines.join('\n');
}

function formatSeibihiTable(entries: SeibihiEntry[]): string {
  const lines: string[] = [];
  lines.push('| 種目 | 区分 | 金額（千円） | 備考 |');
  lines.push('|------|------|-------------|------|');
  for (const e of entries) {
    lines.push(`| ${e.shumoku} | ${e.kubun} | ${e.kingaku.toLocaleString()} | ${e.biko ?? ''} |`);
  }
  return lines.join('\n');
}

function formatChuushouKigyouTable(entries: ChuushouKigyouEntry[]): string {
  const lines: string[] = [];
  lines.push('| 業種 | 資本金の額又は出資の総額 | 常時使用する従業員の数 |');
  lines.push('|------|------------------------|---------------------|');
  for (const e of entries) {
    lines.push(`| ${e.gyoushu} | ${e.shihonkin} | ${e.juugyouin} |`);
  }
  lines.push('\n※ いずれかを満たせば中小企業事業主に該当');
  return lines.join('\n');
}

function formatShogaijiTable(entries: ShogaijiEntry[]): string {
  const lines: string[] = [];
  lines.push('| 地域区分 | 年齢区分 | 開所時間 | 開所日数 | 加算100% | 加算75% | 加算50% | 処遇改善100% | 処遇改善75% | 処遇改善50% |');
  lines.push('|----------|----------|----------|----------|---------|---------|---------|-------------|------------|------------|');
  for (const e of entries) {
    lines.push(
      `| ${e.chiikiKubun} | ${e.nenreiKubun} | ${e.kaishoJikan} | ${e.kaishoNissu} | ${e.hoikushi100.toLocaleString()}円 | ${e.hoikushi75.toLocaleString()}円 | ${e.hoikushi50.toLocaleString()}円 | ${e.shoguKaizen100.toLocaleString()}円 | ${e.shoguKaizen75.toLocaleString()}円 | ${e.shoguKaizen50.toLocaleString()}円 |`,
    );
  }
  return lines.join('\n');
}

function formatIryoutekiCareTable(entries: IryoutekiCareEntry[]): string {
  const lines: string[] = [];
  lines.push('| 加算項目 | 金額 | 単位 |');
  lines.push('|----------|------|------|');
  for (const e of entries) {
    lines.push(`| ${e.komoku} | ${e.kingaku.toLocaleString()}円 | ${e.tani} |`);
  }
  return lines.join('\n');
}

function formatHaichiKaizenTable(entries: HaichiKaizenEntry[]): string {
  const lines: string[] = [];
  lines.push('| 地域区分 | 年齢区分 | 開所時間 | 開所日数 | 加算100% | 加算75% | 加算50% | 処遇改善100% | 処遇改善75% | 処遇改善50% |');
  lines.push('|----------|----------|----------|----------|---------|---------|---------|-------------|------------|------------|');
  for (const e of entries) {
    lines.push(
      `| ${e.chiikiKubun} | ${e.nenreiKubun} | ${e.kaishoJikan} | ${e.kaishoNissu} | ${e.hoikushi100.toLocaleString()}円 | ${e.hoikushi75.toLocaleString()}円 | ${e.hoikushi50.toLocaleString()}円 | ${e.shoguKaizen100.toLocaleString()}円 | ${e.shoguKaizen75.toLocaleString()}円 | ${e.shoguKaizen50.toLocaleString()}円 |`,
    );
  }
  return lines.join('\n');
}
