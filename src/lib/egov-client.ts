/**
 * e-Gov 法令API v2 クライアント
 * https://laws.e-gov.go.jp/api/2/swagger-ui
 */

import { lawDataCache, lawSearchCache } from './cache.js';
import type { EgovLawSearchResult, EgovLawData } from './types.js';
import { resolveLawName } from './law-registry.js';
import { extractLawTitle } from './egov-parser.js';
import { ExternalApiError, NotFoundError } from './errors.js';

const EGOV_API_BASE = 'https://laws.e-gov.go.jp/api/2';
const MIN_REQUEST_INTERVAL_MS = 200;
const EGOV_FETCH_TIMEOUT_MS = 30_000;

let rateLimitChain = Promise.resolve();

async function rateLimit(): Promise<void> {
  const wait = rateLimitChain.then(
    () => new Promise<void>(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS))
  );
  rateLimitChain = wait;
  await wait;
  // チェーンをリセットしてメモリリークを防止
  if (rateLimitChain === wait) {
    rateLimitChain = Promise.resolve();
  }
}

async function egovFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EGOV_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ExternalApiError(`e-Gov APIタイムアウト（${EGOV_FETCH_TIMEOUT_MS / 1000}秒）`);
    }
    throw new ExternalApiError(`e-Gov API通信エラー: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJsonParse(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ExternalApiError('e-Gov APIのレスポンスが不正なJSONです');
  }
}

/** 法令名を比較用に正規化する（全角/半角・記号・空白を落として緩く比較する） */
function normalizeLawTitle(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s、，,。．・「」『』（）()【】［］\[\]]/g, '')
    .toLowerCase();
}

/**
 * 検索結果が要求された法令名と一致するか確認する。
 * e-Gov のキーワード検索は関連度の低い結果（明治期の太政官布告など）を返すことがあり、
 * 上位1件を盲目的に採用すると、まったく無関係な法令の条文をエラーなしで返してしまう。
 */
function matchesRequestedLaw(
  requestedName: string | undefined,
  result: EgovLawSearchResult
): boolean {
  const title =
    result.current_revision_info?.law_title ?? result.revision_info?.law_title;
  if (!title || !requestedName) return false;
  const a = normalizeLawTitle(requestedName);
  const b = normalizeLawTitle(title);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function fetchLawData(lawNameOrId: string): Promise<{
  data: EgovLawData;
  lawId: string;
  lawTitle: string;
}> {
  let lawId: string;
  const { name, lawId: resolvedId } = resolveLawName(lawNameOrId);

  if (resolvedId) {
    lawId = resolvedId;
  } else if (/^\d{3}[A-Z][A-Z0-9]{11}$/.test(lawNameOrId)) {
    lawId = lawNameOrId;
  } else {
    // e-Gov の検索は完全一致ベースの順位付けを保証しないため、上位5件を取得して
    // タイトルの包含一致で絞る。一致しなければ候補を示してエラーにする。
    const results = await searchLaws(name, 5);
    if (results.length === 0) {
      throw new NotFoundError(`法令が見つかりません: "${name}"`);
    }
    const matched = results.find((r) => matchesRequestedLaw(name, r));
    if (!matched) {
      const previews = results
        .slice(0, 3)
        .map(
          (r) =>
            r.current_revision_info?.law_title ??
            r.revision_info?.law_title ??
            r.law_info.law_id
        )
        .join('; ');
      throw new NotFoundError(
        `法令名 "${name}" に一致する法令が見つかりませんでした。` +
          `e-Gov 検索結果上位: ${previews}. ` +
          `正式名称または law_id を直接指定してください。`
      );
    }
    lawId = matched.law_info.law_id;
  }

  const cached = lawDataCache.get(lawId);
  if (cached) {
    const data = JSON.parse(cached) as EgovLawData;
    return { data, lawId, lawTitle: extractLawTitle(data) };
  }

  await rateLimit();
  const url = `${EGOV_API_BASE}/law_data/${encodeURIComponent(lawId)}`;
  const res = await egovFetch(url);

  if (!res.ok) {
    if (res.status === 404) {
      throw new NotFoundError(`法令が見つかりません (law_id: ${lawId})`);
    }
    throw new ExternalApiError(`e-Gov API エラー: ${res.status} ${res.statusText}`);
  }

  const json = await safeJsonParse(res);
  const data = json as EgovLawData;
  if (!data?.law_full_text?.tag) {
    throw new ExternalApiError('e-Gov APIのレスポンス形式が不正です');
  }

  lawDataCache.set(lawId, JSON.stringify(data));

  return { data, lawId, lawTitle: extractLawTitle(data) };
}

export async function searchLaws(
  keyword: string,
  limit: number = 10,
  lawType?: string
): Promise<EgovLawSearchResult[]> {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const cacheKey = `${keyword}|${clampedLimit}|${lawType ?? ''}`;
  const cached = lawSearchCache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const params = new URLSearchParams({
    keyword,
    limit: String(clampedLimit),
    response_format: 'json',
  });
  if (lawType) {
    params.set('law_type', lawType);
  }

  await rateLimit();
  const url = `${EGOV_API_BASE}/laws?${params}`;
  const res = await egovFetch(url);

  if (!res.ok) {
    throw new ExternalApiError(`e-Gov API 検索エラー: ${res.status} ${res.statusText}`);
  }

  const json = await safeJsonParse(res);
  const rawLaws = (json as Record<string, unknown>).laws;
  const results = (Array.isArray(rawLaws) ? rawLaws : []) as EgovLawSearchResult[];

  lawSearchCache.set(cacheKey, JSON.stringify(results));

  return results;
}

export function getEgovUrl(lawId: string): string {
  return `https://laws.e-gov.go.jp/law/${lawId}`;
}
