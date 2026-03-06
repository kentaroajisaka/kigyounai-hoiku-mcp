/**
 * PDF セクション分割ユーティリティ
 * 実施要綱・指導監督基準の共通処理
 */

/** ページ区切りマーカー */
export const PAGE_MARKER = '<<PAGE_BREAK>>';

/** 行番号 → ページ番号のマッピングを構築 */
export function buildLineToPageMap(lines: string[], marker: string): number[] {
  const map: number[] = new Array(lines.length);
  let page = 1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === marker) {
      page++;
    }
    map[i] = page;
  }
  return map;
}
