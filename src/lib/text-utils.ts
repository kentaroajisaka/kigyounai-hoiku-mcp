/**
 * テキスト検索ユーティリティ
 * PDF・FAQ・通知の検索で共通して使用するマッチング関数
 */

/**
 * haystackに対してキーワードがマッチするか判定する。
 * PDFテキスト抽出で空白が挿入される問題（例: 「嘱 託」→「嘱託」）に対応するため、
 * 通常マッチ失敗時は空白除去したhaystackで再マッチを試みる。
 */
export function matchKeyword(haystack: string, keyword: string): boolean {
  if (haystack.includes(keyword)) return true;
  return haystack.replace(/\s+/g, '').includes(keyword);
}

/**
 * テキストを指定文字数付近で文境界（。や改行）で切り詰める。
 * 文中で途切れることを防ぎ、LLMが正確に引用できるようにする。
 */
export function truncateAtBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // maxLen以内で最後の句点または改行を探す
  const slice = text.substring(0, maxLen);
  const lastPeriod = slice.lastIndexOf('。');
  const lastNewline = slice.lastIndexOf('\n');
  const cutAt = Math.max(lastPeriod + 1, lastNewline + 1);
  // 句点も改行も見つからない場合はmaxLenで切る
  const truncated = cutAt > maxLen * 0.5 ? text.substring(0, cutAt) : slice;
  return truncated.trimEnd() + '\n...(以下省略)';
}
