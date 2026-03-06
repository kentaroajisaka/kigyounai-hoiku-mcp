/**
 * 別紙13パーサー: ３歳児配置改善加算額および４歳以上児配置改善加算額
 *
 * 構造: 別紙9とほぼ同じ。11h/13h の2ブロック、各ブロック内に週6日/週7日のサブテーブル。
 * 6列（加算×3率 + 処遇改善Ⅰ×3率）。
 * 地域区分×年齢区分（３歳児 or ４歳以上児のみ）、全定員共通。
 */

import type { HaichiKaizenEntry } from '../types.js';
import { parseSixColumnRows, splitTimeBlocks, splitNissuBlocks } from './table-utils.js';

export function parseBesshi13(text: string): { entries: HaichiKaizenEntry[]; warnings: string[] } {
  const entries: HaichiKaizenEntry[] = [];
  const warnings: string[] = [];

  // テーブル部分を検出
  const tableStart = text.indexOf('配置改善加算額');
  if (tableStart === -1) {
    warnings.push('別紙13: 「配置改善加算額」テーブルが見つかりません。');
    return { entries, warnings };
  }

  const tableText = text.substring(tableStart);
  const timeBlocks = splitTimeBlocks(tableText);

  if (timeBlocks.length === 0) {
    warnings.push('別紙13: 開所時間ブロックが検出できません。');
    return { entries, warnings };
  }

  for (const timeBlock of timeBlocks) {
    const nissuBlocks = splitNissuBlocks(timeBlock.text);

    for (const nissuBlock of nissuBlocks) {
      const rows = parseSixColumnRows(nissuBlock.text, false);
      for (const row of rows) {
        entries.push({
          chiikiKubun: row.chiiki,
          nenreiKubun: row.nenrei,
          kaishoJikan: timeBlock.kaishoJikan,
          kaishoNissu: nissuBlock.nissu,
          hoikushi100: row.col1,
          hoikushi75: row.col2,
          hoikushi50: row.col3,
          shoguKaizen100: row.col4,
          shoguKaizen75: row.col5,
          shoguKaizen50: row.col6,
        });
      }
    }
  }

  if (entries.length === 0) {
    warnings.push('別紙13: パース結果が0件。PDF構造が変更された可能性があります。');
  }

  return { entries, warnings };
}
