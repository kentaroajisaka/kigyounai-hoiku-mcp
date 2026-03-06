/**
 * 別紙2パーサー: 処遇改善等加算Ⅰ定員別加算額
 *
 * 構造: 11h/13h の2ブロック。各ブロックは6列テーブル（週6日×3率 + 週7日×3率）。
 * 地域区分×定員区分×年齢区分。事業主区分なし。
 */

import type { ShoguKaizenEntry } from '../types.js';
import { parseSixColumnRows, splitTimeBlocks } from './table-utils.js';

export function parseBesshi2(text: string): { entries: ShoguKaizenEntry[]; warnings: string[] } {
  const entries: ShoguKaizenEntry[] = [];
  const warnings: string[] = [];

  // テーブル部分を検出（「定員別加算額」以降）
  const tableStart = text.indexOf('定員別加算額');
  if (tableStart === -1) {
    warnings.push('別紙2: 「定員別加算額」テーブルが見つかりません。');
    return { entries, warnings };
  }

  const tableText = text.substring(tableStart);
  const blocks = splitTimeBlocks(tableText);

  if (blocks.length === 0) {
    warnings.push('別紙2: 開所時間ブロックが検出できません。');
    return { entries, warnings };
  }

  for (const block of blocks) {
    const rows = parseSixColumnRows(block.text, true);
    for (const row of rows) {
      // 前半3列: 週6日（100%, 75%, 50%）、後半3列: 週7日
      entries.push({
        chiikiKubun: row.chiiki,
        teiinKubun: row.teiin,
        nenreiKubun: row.nenrei,
        kaishoJikan: block.kaishoJikan,
        kaishoNissu: '週6日',
        hoikushi100: row.col1,
        hoikushi75: row.col2,
        hoikushi50: row.col3,
      });
      entries.push({
        chiikiKubun: row.chiiki,
        teiinKubun: row.teiin,
        nenreiKubun: row.nenrei,
        kaishoJikan: block.kaishoJikan,
        kaishoNissu: '週7日',
        hoikushi100: row.col4,
        hoikushi75: row.col5,
        hoikushi50: row.col6,
      });
    }
  }

  if (entries.length === 0) {
    warnings.push('別紙2: パース結果が0件。PDF構造が変更された可能性があります。');
  }

  return { entries, warnings };
}
