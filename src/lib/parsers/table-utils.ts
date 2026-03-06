/**
 * 別紙2/9/13共通のテーブルパースユーティリティ
 *
 * これらの別紙は共通の6列構造を持つ:
 * 地域区分 | 定員区分 | 年齢区分 | 保育士100% | 75% | 50% | 100% | 75% | 50%
 * 前半3列と後半3列はそれぞれ週6日・週7日（or 加算・処遇改善Ⅰ）
 */

/** 6列テーブルの1行 */
export interface SixColumnRow {
  chiiki: string;
  teiin: string;
  nenrei: string;
  col1: number;
  col2: number;
  col3: number;
  col4: number;
  col5: number;
  col6: number;
}

/**
 * テキストブロックから6列テーブルの行をパースする。
 * 別紙2/9/13で共用。
 */
export function parseSixColumnRows(blockText: string, hasTeiin: boolean): SixColumnRow[] {
  const rows: SixColumnRow[] = [];
  const rawLines = blockText.split('\n');

  // 前処理1: +/＋ アーティファクトを除去
  // PDFのOCRで行またがりの表セルに + や ＋ が出現する
  // パターンA: "+"/"＋" のみの行 → 削除
  // パターンB: "３歳児 12,100 10,620 9,140 ＋ 340 310 260" → インライン＋を削除
  const cleaned: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === '+' || trimmed === '＋') continue;
    // インラインの +/＋ を削除（数字の間にあるもの）
    cleaned.push(rawLines[i].replace(/\s*[+＋]\s*/g, ' '));
  }

  // 前処理2: 数値のみの行を前の行に結合
  // パターンA: "乳児" → "80,230 71,090 61,950" → "2,400 2,140 1,890" (3+3で6数値)
  // パターンB: "３歳児 8,010 7,100 6,190" → "240 210 180" (3+3で6数値)
  const joined: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const trimmed = cleaned[i].trim();
    const nextTrimmed = (i + 1 < cleaned.length) ? cleaned[i + 1].trim() : '';
    const isNumsOnly = (s: string) => /^[\d,]+(\s+[\d,]+)*\s*$/.test(s);

    if (isNumsOnly(nextTrimmed) && nextTrimmed) {
      // 現在行が年齢区分のみ or 年齢区分+3数値 → 次の数値行を結合
      const hasNenrei = /(４歳以上児|３歳児|１、２歳児|乳児)/.test(trimmed);
      if (hasNenrei) {
        let combined = trimmed + ' ' + nextTrimmed;
        i++;
        // さらに次の行も数値のみなら結合（3+3+... パターン）
        while (i + 1 < cleaned.length && isNumsOnly(cleaned[i + 1].trim()) && cleaned[i + 1].trim()) {
          combined += ' ' + cleaned[i + 1].trim();
          i++;
        }
        joined.push(combined);
        continue;
      }
    }
    joined.push(cleaned[i]);
  }

  // 前処理3: 定員区分が2行に分割されるケースを結合
  const lines: string[] = [];
  for (let i = 0; i < joined.length; i++) {
    const trimmed = joined[i].trim();
    if (i + 1 < joined.length && joined[i + 1].trim().match(/^[～〜]\s*\d+\s*人/)) {
      lines.push(trimmed + ' ' + joined[i + 1].trim());
      i++;
    } else {
      lines.push(trimmed);
    }
  }

  let currentChiiki = '';
  let currentTeiin = hasTeiin ? '' : '全定員共通';

  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    if (!stripped) continue;

    // 地域区分の検出
    const chiikiMatch = stripped.match(/(20|16|15|12|10|6|3)\/100\s*地域/);
    if (chiikiMatch) {
      currentChiiki = `${chiikiMatch[1]}/100地域`;
    }
    if (stripped.includes('その他地域')) {
      currentChiiki = 'その他地域';
    }

    // 定員区分の検出
    if (hasTeiin) {
      const teiinMatch = stripped.match(/(\d+)\s*人\s*[～〜]\s*(\d+)\s*人/);
      const teiinOpenMatch = stripped.match(/(\d+)\s*人\s*[～〜]\s*$/);
      if (teiinMatch) {
        currentTeiin = `${teiinMatch[1]}人～${teiinMatch[2]}人`;
      } else if (teiinOpenMatch) {
        currentTeiin = `${teiinOpenMatch[1]}人～`;
      }
    }

    // 全定員共通の検出
    if (stripped.includes('全定員共通')) {
      currentTeiin = '全定員共通';
    }

    // 年齢区分 + 6数値の検出
    const rowMatch = stripped.match(
      /(?:その他地域\s+)?(?:全定員共通\s+)?(４歳以上児|３歳児|１、２歳児|乳児)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/,
    );
    if (rowMatch && currentChiiki && currentTeiin) {
      const nums = [rowMatch[2], rowMatch[3], rowMatch[4], rowMatch[5], rowMatch[6], rowMatch[7]]
        .map(n => parseInt(n.replace(/,/g, ''), 10));

      rows.push({
        chiiki: currentChiiki,
        teiin: currentTeiin,
        nenrei: rowMatch[1],
        col1: nums[0],
        col2: nums[1],
        col3: nums[2],
        col4: nums[3],
        col5: nums[4],
        col6: nums[5],
      });
    }
  }

  return rows;
}

/**
 * テキストからブロック（11時間/13時間）を分割する。
 * 別紙2/9/13共通: 事業主区分なし、11h/13h の2ブロック。
 */
export interface TimeBlock {
  kaishoJikan: string;
  text: string;
}

export function splitTimeBlocks(text: string): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  const lines = text.split('\n');

  interface BlockMark {
    lineIndex: number;
    jikan: string;
  }
  const marks: BlockMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+/g, ' ').trim();
    // 「（１日 XX 時間開所の事業所の場合）」パターン
    const m = stripped.match(/（\s*１日\s*(\d+)\s*時間開所の事業所の場合\s*）/);
    if (m) {
      marks.push({ lineIndex: i, jikan: m[1] });
    }
  }

  for (let i = 0; i < marks.length; i++) {
    const startLine = marks[i].lineIndex;
    const endLine = i + 1 < marks.length ? marks[i + 1].lineIndex : lines.length;
    blocks.push({
      kaishoJikan: `${marks[i].jikan}時間`,
      text: lines.slice(startLine, endLine).join('\n'),
    });
  }

  return blocks;
}

/**
 * ブロック内テキストから週6日/週7日のサブブロックを分割する。
 * 別紙9/13では1ブロック内に週6日と週7日のテーブルが連続している。
 */
export interface NissuBlock {
  nissu: string;
  text: string;
}

export function splitNissuBlocks(text: string): NissuBlock[] {
  const blocks: NissuBlock[] = [];
  const lines = text.split('\n');

  interface BlockMark {
    lineIndex: number;
    nissu: string;
  }
  const marks: BlockMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+/g, ' ').trim();
    if (stripped.includes('週 6 日開所の場合') || stripped.includes('週6日開所の場合')) {
      marks.push({ lineIndex: i, nissu: '週6日' });
    } else if (stripped.includes('週 7 日開所の場合') || stripped.includes('週7日開所の場合')) {
      marks.push({ lineIndex: i, nissu: '週7日' });
    }
  }

  for (let i = 0; i < marks.length; i++) {
    const startLine = marks[i].lineIndex;
    const endLine = i + 1 < marks.length ? marks[i + 1].lineIndex : lines.length;
    blocks.push({
      nissu: marks[i].nissu,
      text: lines.slice(startLine, endLine).join('\n'),
    });
  }

  return blocks;
}
