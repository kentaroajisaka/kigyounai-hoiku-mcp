/**
 * 別紙1パーサー
 * 既存の tanka-parser.ts から移動。
 * 基本分単価（①）と各種加算（②〜⑳）をパースする。
 */

import type { KihonTankaEntry, KasanTankaEntry } from '../types.js';

export interface Besshi1Result {
  kihon: KihonTankaEntry[];
  kasan: KasanTankaEntry[];
  warnings: string[];
}

/**
 * 別紙１の全テキストから構造化単価データをパースする。
 * サブセクション分割済みのテキスト配列を受け取る。
 */
export function parseBesshi1Sections(
  sections: { title: string; text: string }[],
): Besshi1Result {
  const kihon: KihonTankaEntry[] = [];
  const kasan: KasanTankaEntry[] = [];
  const warnings: string[] = [];

  for (const sec of sections) {
    try {
      if (sec.title.includes('①') && sec.title.includes('基本分単価')) {
        kihon.push(...parseKihonTanka(sec.text));
      } else if (sec.title.includes('②') || sec.title.includes('③')) {
        kasan.push(...parseFixedKasan(sec.title, sec.text));
      } else if (sec.title.includes('④') && sec.title.includes('延長保育')) {
        kasan.push(...parseEnchoHoiku(sec.text));
      } else if (sec.title.includes('⑤') && sec.title.includes('夜間保育')) {
        kasan.push(...parseYakanHoiku(sec.text));
      } else if (sec.title.includes('⑥') && sec.title.includes('非正規')) {
        kasan.push(...parseHiseikiRoudousha(sec.text));
      } else if (sec.title.includes('⑦') && sec.title.includes('病児保育')) {
        kasan.push(...parseByoujiHoiku(sec.text));
      } else if (sec.title.includes('⑧') && sec.title.includes('預かり')) {
        kasan.push(...parseAzukariService(sec.text));
      } else if (sec.title.includes('⑨') && sec.title.includes('賃借料')) {
        kasan.push(...parseChinshakuryo(sec.text));
      } else {
        kasan.push(...parseFixedKasan(sec.title, sec.text));
      }
    } catch (e) {
      warnings.push(`${sec.title} のパースに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (kihon.length === 0) {
    warnings.push('基本分単価のパースで0件。PDF構造が変更された可能性があります。');
  }

  return { kihon, kasan, warnings };
}

// ---- 基本分単価パーサー ----

const CHIIKI_KUBUNS = [
  '20/100地域', '16/100地域', '15/100地域', '12/100地域',
  '10/100地域', '6/100地域', '3/100地域', 'その他地域',
];

const TEIIN_KUBUNS = [
  '6人～12人', '13人～19人', '20人～30人', '31人～40人',
  '41人～50人', '51人～60人', '61人～',
];

const NENREI_KUBUNS = ['４歳以上児', '３歳児', '１、２歳児', '乳児'];

function parseKihonTanka(text: string): KihonTankaEntry[] {
  const entries: KihonTankaEntry[] = [];
  const blocks = splitKihonBlocks(text);

  for (const block of blocks) {
    const rows = parseKihonTableRows(block.text);
    for (const row of rows) {
      entries.push({
        chiikiKubun: row.chiiki,
        teiinKubun: row.teiin,
        nenreiKubun: row.nenrei,
        kaishoJikan: block.kaishoJikan,
        kaishoNissu: row.nissu,
        jigyounushiKubun: block.jigyounushi,
        hoikushi100: row.h100,
        hoikushi75: row.h75,
        hoikushi50: row.h50,
      });
    }
  }

  return entries;
}

interface KihonBlock {
  jigyounushi: string;
  kaishoJikan: string;
  text: string;
}

function splitKihonBlocks(text: string): KihonBlock[] {
  const blocks: KihonBlock[] = [];
  const lines = text.split('\n');

  interface BlockMark {
    lineIndex: number;
    jikan: string;
    jigyounushi: string;
  }
  const marks: BlockMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+/g, ' ').trim();
    const m = stripped.match(/（１日\s*(\d+)\s*時間開所の事業所（中小企業事業主/);
    if (m) {
      const jikan = m[1];
      const nearbyText = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
      const jigyounushi = nearbyText.includes('以外') ? '中小企業事業主以外' : '中小企業事業主';
      marks.push({ lineIndex: i, jikan, jigyounushi });
    }
  }

  for (let i = 0; i < marks.length; i++) {
    const startLine = marks[i].lineIndex;
    const endLine = i + 1 < marks.length ? marks[i + 1].lineIndex : lines.length;
    blocks.push({
      jigyounushi: marks[i].jigyounushi,
      kaishoJikan: `${marks[i].jikan}時間`,
      text: lines.slice(startLine, endLine).join('\n'),
    });
  }

  return blocks;
}

interface KihonRow {
  chiiki: string;
  teiin: string;
  nenrei: string;
  nissu: string;
  h100: number;
  h75: number;
  h50: number;
}

function parseKihonTableRows(blockText: string): KihonRow[] {
  const rows: KihonRow[] = [];
  const rawLines = blockText.split('\n');

  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (i + 1 < rawLines.length && rawLines[i + 1].trim().match(/^[～〜]\s*\d+\s*人/)) {
      lines.push(trimmed + ' ' + rawLines[i + 1].trim());
      i++;
    } else {
      lines.push(trimmed);
    }
  }

  let currentChiiki = '';
  let currentTeiin = '';

  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    if (!stripped) continue;

    const chiikiMatch = stripped.match(/(20|16|15|12|10|6|3)\/100\s*地域/);
    if (chiikiMatch) {
      currentChiiki = `${chiikiMatch[1]}/100地域`;
    }
    if (stripped.includes('その他地域')) {
      currentChiiki = 'その他地域';
    }

    const teiinMatch = stripped.match(/(\d+)\s*人\s*[～〜]\s*(\d+)\s*人/);
    const teiinOpenMatch = stripped.match(/(\d+)\s*人\s*[～〜]\s*$/);
    if (teiinMatch) {
      currentTeiin = `${teiinMatch[1]}人～${teiinMatch[2]}人`;
    } else if (teiinOpenMatch) {
      currentTeiin = `${teiinOpenMatch[1]}人～`;
    }

    const rowMatch = stripped.match(
      /(?:その他地域\s+)?(４歳以上児|３歳児|１、２歳児|乳児)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/,
    );
    if (rowMatch && currentChiiki && currentTeiin) {
      const nums = [rowMatch[2], rowMatch[3], rowMatch[4], rowMatch[5], rowMatch[6], rowMatch[7]]
        .map(n => parseInt(n.replace(/,/g, ''), 10));

      rows.push({
        chiiki: currentChiiki,
        teiin: currentTeiin,
        nenrei: rowMatch[1],
        nissu: '週6日',
        h100: nums[0],
        h75: nums[1],
        h50: nums[2],
      });
      rows.push({
        chiiki: currentChiiki,
        teiin: currentTeiin,
        nenrei: rowMatch[1],
        nissu: '週7日',
        h100: nums[3],
        h75: nums[4],
        h50: nums[5],
      });
    }
  }

  return rows;
}

// ---- 延長保育加算パーサー ----

function parseEnchoHoiku(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    const m = stripped.match(
      /(\d+[～〜]\d+\s*時間)\s+([\d,]+)\s*円\s+([\d,]+)\s*円\s+([\d,]+)\s*円/,
    );
    if (m) {
      const kubun = m[1].replace(/\s/g, '');
      entries.push(
        { kasanName: '延長保育加算', kubun, kingaku: parseInt(m[2].replace(/,/g, ''), 10), tani: '月額', biko: '中小企業事業主' },
        { kasanName: '延長保育加算', kubun, kingaku: parseInt(m[3].replace(/,/g, ''), 10), tani: '月額', biko: '中小企業事業主以外' },
      );
      continue;
    }
    const single = stripped.match(
      /(\d+[～〜]\d+\s*時間)\s+([\d,]+)\s*円/,
    );
    if (single) {
      const amount = parseInt(single[2].replace(/,/g, ''), 10);
      if (amount > 100000) {
        entries.push({
          kasanName: '延長保育加算',
          kubun: single[1].replace(/\s/g, ''),
          kingaku: amount,
          tani: '年額',
        });
      }
    }
  }
  return entries;
}

// ---- 夜間保育加算パーサー ----

function parseYakanHoiku(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];
  const lines = text.split('\n');
  let currentTeiin = '';
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    const teiinMatch = stripped.match(/([\d～\s]+人)/);
    if (teiinMatch) {
      currentTeiin = teiinMatch[1].replace(/\s/g, '');
    }
    const m = stripped.match(/(3\s*歳以上児|3\s*歳未満児)\s+([\d,]+)\s*円/);
    if (m && currentTeiin) {
      entries.push({
        kasanName: '夜間保育加算',
        kubun: `${currentTeiin}・${m[1].replace(/\s/g, '')}`,
        kingaku: parseInt(m[2].replace(/,/g, ''), 10),
        tani: '月額',
      });
    }
  }
  return entries;
}

// ---- 非正規労働者受入推進加算パーサー ----

function parseHiseikiRoudousha(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    const m = stripped.match(/([\d]+)\s*人(?:\s*以上)?\s+([\d,]+)\s*円/);
    if (m) {
      entries.push({
        kasanName: '非正規労働者受入推進加算',
        kubun: `${m[1]}人`,
        kingaku: parseInt(m[2].replace(/,/g, ''), 10),
        tani: '月額',
      });
    }
  }
  return entries;
}

// ---- 病児保育加算パーサー ----

function parseByoujiHoiku(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];

  const types = [
    { pattern: /ア\s*病児対応型/, name: '病児保育加算（病児対応型）' },
    { pattern: /イ\s*病後児対応型/, name: '病児保育加算（病後児対応型）' },
    { pattern: /ウ\s*体調不良児対応型/, name: '病児保育加算（体調不良児対応型）' },
  ];

  for (let t = 0; t < types.length; t++) {
    const startMatch = text.match(types[t].pattern);
    if (!startMatch) continue;
    const startIdx = startMatch.index!;
    const endIdx = t + 1 < types.length
      ? text.match(types[t + 1].pattern)?.index ?? text.length
      : text.length;
    const block = text.substring(startIdx, endIdx);

    const kihonMatch = block.match(/基本分\s+([\d,]+)\s*円/);
    if (kihonMatch) {
      entries.push({
        kasanName: types[t].name,
        kubun: '基本分',
        kingaku: parseInt(kihonMatch[1].replace(/,/g, ''), 10),
        tani: '年額',
      });
    }

    if (types[t].name.includes('体調不良児')) {
      const singleMatch = block.match(/([\d,]+)\s*円/);
      if (singleMatch && !kihonMatch) {
        entries.push({
          kasanName: types[t].name,
          kubun: '基本分',
          kingaku: parseInt(singleMatch[1].replace(/,/g, ''), 10),
          tani: '年額',
        });
      }
      continue;
    }

    const lines = block.split('\n');
    for (const line of lines) {
      const stripped = line.replace(/\s+/g, ' ').trim();
      const m = stripped.match(
        /([\d,]+)\s*人以上\s*([\d,]+)\s*人未満\s+([\d,]+)\s*円/,
      );
      if (m) {
        entries.push({
          kasanName: types[t].name,
          kubun: `${m[1].replace(/,/g, '')}人以上${m[2].replace(/,/g, '')}人未満`,
          kingaku: parseInt(m[3].replace(/,/g, ''), 10),
          tani: '年額',
          biko: '加算分（年間延べ利用児童数）',
        });
      }
    }
  }

  return entries;
}

// ---- 預かりサービス加算パーサー ----

function parseAzukariService(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];
  const lines = text.split('\n');
  let subType = '一般型';

  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    if (stripped.includes('一般型')) subType = '一般型';
    if (stripped.includes('余裕活用型')) subType = '余裕活用型';
    if (stripped.includes('特別支援児童')) {
      const m = stripped.match(/([\d,]+)\s*円/);
      if (m) {
        entries.push({
          kasanName: `預かりサービス加算（${subType}）`,
          kubun: '特別支援児童加算',
          kingaku: parseInt(m[1].replace(/,/g, ''), 10),
          tani: '日額',
        });
      }
      continue;
    }

    const rangeMatch = stripped.match(
      /([\d,]+)\s*人(?:以上)?\s*([\d,]+)\s*人未満\s+([\d,]+)\s*円/,
    );
    if (rangeMatch) {
      entries.push({
        kasanName: `預かりサービス加算（${subType}）`,
        kubun: `${rangeMatch[1].replace(/,/g, '')}人以上${rangeMatch[2].replace(/,/g, '')}人未満`,
        kingaku: parseInt(rangeMatch[3].replace(/,/g, ''), 10),
        tani: '年額',
      });
      continue;
    }

    if (subType === '余裕活用型') {
      const basicMatch = stripped.match(/基本分\s+([\d,]+)\s*円/);
      if (basicMatch) {
        entries.push({
          kasanName: '預かりサービス加算（余裕活用型）',
          kubun: '基本分',
          kingaku: parseInt(basicMatch[1].replace(/,/g, ''), 10),
          tani: '日額',
        });
      }
    }
  }

  return entries;
}

// ---- 賃借料加算パーサー ----

function parseChinshakuryo(text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    const m = stripped.match(/([\d]+\s*[～〜]\s*[\d]+\s*人|[\d]+\s*人\s*～)\s+([\d,]+)\s*円/);
    if (m) {
      entries.push({
        kasanName: '賃借料加算',
        kubun: m[1].replace(/\s/g, ''),
        kingaku: parseInt(m[2].replace(/,/g, ''), 10),
        tani: '年額',
      });
    }
  }
  return entries;
}

// ---- 固定額加算パーサー（⑩〜⑳） ----

function parseFixedKasan(title: string, text: string): KasanTankaEntry[] {
  const entries: KasanTankaEntry[] = [];

  const titleMatch = title.match(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳](.+)/);
  if (!titleMatch) return entries;
  const kasanName = titleMatch[1].trim();

  if (/別紙\s*[\d１２３４５６７８９０]+\s*の(?:とおり|通り)/.test(text) && text.length < 500) {
    entries.push({
      kasanName,
      kubun: '（別紙参照）',
      kingaku: 0,
      tani: '',
      biko: text.match(/別紙\s*[\d１２３４５６７８９０]+/)?.[0] ?? '',
    });
    return entries;
  }

  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/\s+/g, ' ').trim();
    const m = stripped.match(/([\d,]+)\s*円/);
    if (m) {
      const amount = parseInt(m[1].replace(/,/g, ''), 10);
      if (amount >= 1000) {
        const taniMatch = stripped.match(/(年額|月額|日額)/);
        const kubunMatch = stripped.match(/([\d]+\s*[～〜名]\s*[\d]*\s*[人名]?\s*(?:以下|以上)?)/);
        entries.push({
          kasanName,
          kubun: kubunMatch?.[1]?.replace(/\s/g, '') ?? '一律',
          kingaku: amount,
          tani: taniMatch?.[1] ?? '年額',
        });
      }
    }
  }

  const seen = new Set<string>();
  return entries.filter(e => {
    const key = `${e.kasanName}|${e.kubun}|${e.kingaku}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
