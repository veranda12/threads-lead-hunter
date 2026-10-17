import { ProviderError, type RawPost, type SearchPage, type SearchQuery } from "@/lib/providers/types";

// Klien HTTP untuk Threads Graph API resmi.
// Referensi: https://developers.facebook.com/docs/threads/keyword-search
//   GET /v1.0/keyword_search  (threads_basic + threads_keyword_search)
//   Tanpa approval threads_keyword_search, hasil hanya berisi postingan milik akun sendiri.
//   Kuota: 2.200 query / 24 jam bergulir; query tanpa hasil tidak dihitung.

export const THREADS_GRAPH_BASE = "https://graph.threads.net";
export const THREADS_API_VERSION = "v1.0";
export const THREADS_AUTHORIZE_URL = "https://threads.com/oauth/authorize";
export const THREADS_SCOPES = ["threads_basic", "threads_keyword_search"] as const;

/** Field yang diminta. Sengaja minimal; daftar ini juga yang diungkapkan di Privacy Policy. */
export const THREADS_SEARCH_FIELDS = ["id", "text", "media_type", "permalink", "timestamp", "username", "shortcode"] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type GraphError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };

/** Petakan error Graph API ke status integrasi yang jujur. */
export function mapGraphError(httpStatus: number, body: GraphError | null, retryAfterHeader?: string | null): ProviderError {
  const code = body?.error?.code;
  const message = body?.error?.message?.slice(0, 300) ?? `HTTP ${httpStatus}`;
  const opts = { httpStatus, providerCode: code };
  if (code === 190 || (httpStatus === 401 && code === undefined)) {
    return new ProviderError("TOKEN_EXPIRED", `Access token tidak valid atau kedaluwarsa: ${message}`, opts);
  }
  if (code === 10 || (typeof code === "number" && code >= 200 && code < 300) || httpStatus === 403) {
    return new ProviderError("PERMISSION_REQUIRED", `Izin belum diberikan: ${message}`, opts);
  }
  if (httpStatus === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    const seconds = Number(retryAfterHeader);
    return new ProviderError("RATE_LIMITED", `Rate limit Threads API: ${message}`, {
      ...opts,
      retryable: false,
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60 * 60 * 1000,
    });
  }
  if (httpStatus >= 500 || code === 1 || code === 2) {
    return new ProviderError("PROVIDER_ERROR", `Threads API sedang bermasalah: ${message}`, { ...opts, retryable: true });
  }
  return new ProviderError("PROVIDER_ERROR", `Permintaan ditolak Threads API: ${message}`, opts);
}

function toRawPost(item: Record<string, unknown>): RawPost | null {
  const id = typeof item.id === "string" ? item.id : typeof item.id === "number" ? String(item.id) : null;
  if (!id) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    platform: "threads",
    platformPostId: id,
    shortcode: str(item.shortcode),
    text: str(item.text),
    username: str(item.username),
    permalink: str(item.permalink),
    timestamp: item.timestamp,
    mediaType: str(item.media_type),
    raw: Object.fromEntries(THREADS_SEARCH_FIELDS.filter((f) => f in item).map((f) => [f, item[f]])),
  };
}

export async function threadsGet(
  path: string,
  params: Record<string, string>,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(`${THREADS_GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { method: "GET", signal, headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ProviderError("TIMEOUT", "Permintaan ke Threads API melewati batas waktu", { retryable: true });
    }
    throw new ProviderError("PROVIDER_ERROR", `Gagal menghubungi Threads API: ${(error as Error)?.message ?? "network error"}`, {
      retryable: true,
    });
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || (body && typeof body === "object" && "error" in body)) {
    throw mapGraphError(res.status, body as GraphError, res.headers.get("retry-after"));
  }
  return body;
}

/** Selisih jam yang ditoleransi: `until` dalam jendela ini dianggap "sekarang" dan tidak dikirim. */
export const UNTIL_OMIT_WINDOW_MS = 5 * 60_000;

export async function keywordSearch(
  accessToken: string,
  query: SearchQuery,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; now?: () => number } = {},
): Promise<SearchPage> {
  const params: Record<string, string> = {
    q: query.keyword,
    search_type: "RECENT",
    search_mode: "KEYWORD",
    fields: THREADS_SEARCH_FIELDS.join(","),
    since: String(Math.floor(query.since.getTime() / 1000)),
    limit: String(Math.min(100, Math.max(1, query.limit))),
    access_token: accessToken,
  };
  // `until` opsional dan defaultnya "sekarang" menurut jam Meta. Threads menolak `until` yang
  // melewati jam server mereka, dan jam kita bisa beberapa detik lebih cepat. Jadi `until` hanya
  // dikirim bila memang menunjuk jauh ke masa lalu.
  if (query.until.getTime() < (opts.now?.() ?? Date.now()) - UNTIL_OMIT_WINDOW_MS) {
    params.until = String(Math.floor(query.until.getTime() / 1000));
  }
  if (query.cursor) params.after = query.cursor;

  const body = (await threadsGet(`${THREADS_API_VERSION}/keyword_search`, params, {
    ...opts,
    signal: query.signal,
  })) as { data?: unknown; paging?: { cursors?: { after?: string }; next?: string } } | null;

  if (!body || !Array.isArray(body.data)) {
    throw new ProviderError("PROVIDER_ERROR", "Respons Threads API tidak memiliki field data", { retryable: false });
  }
  const posts = body.data
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(toRawPost)
    .filter((p): p is RawPost => p !== null);
  const after = body.paging?.cursors?.after ?? null;
  const hasMore = Boolean(body.paging?.next) || (after !== null && body.data.length >= query.limit);
  return { posts, nextCursor: hasMore ? after : null, quotaUnits: body.data.length > 0 ? 1 : 0 };
}

// ---------------------------------------------------------------
// OAuth & token lifecycle
// ---------------------------------------------------------------

export function buildAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const url = new URL(THREADS_AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", THREADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForShortLivedToken(
  args: { appId: string; appSecret: string; redirectUri: string; code: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; userId: string }> {
  const form = new URLSearchParams({
    client_id: args.appId,
    client_secret: args.appSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
  });
  const res = await fetchImpl(`${THREADS_GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; user_id?: number | string } & GraphError;
  if (!res.ok || !body?.access_token) throw mapGraphError(res.status, body);
  return { accessToken: body.access_token, userId: String(body.user_id ?? "") };
}

export async function exchangeForLongLivedToken(
  args: { appSecret: string; shortLivedToken: string },
  fetchImpl?: FetchLike,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const body = (await threadsGet(
    "access_token",
    { grant_type: "th_exchange_token", client_secret: args.appSecret, access_token: args.shortLivedToken },
    { fetchImpl },
  )) as { access_token?: string; expires_in?: number };
  if (!body?.access_token) throw new ProviderError("PROVIDER_ERROR", "Tukar long-lived token gagal");
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 60 * 24 * 3600 };
}

/** Long-lived token berlaku 60 hari dan hanya bisa di-refresh bila umurnya >= 24 jam dan belum kedaluwarsa. */
export async function refreshLongLivedToken(token: string, fetchImpl?: FetchLike) {
  const body = (await threadsGet("refresh_access_token", { grant_type: "th_refresh_token", access_token: token }, { fetchImpl })) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body?.access_token) throw new ProviderError("PROVIDER_ERROR", "Refresh token gagal");
  return { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 60 * 24 * 3600 };
}

export async function fetchMe(token: string, fetchImpl?: FetchLike): Promise<{ id: string; username: string | null }> {
  const body = (await threadsGet(`${THREADS_API_VERSION}/me`, { fields: "id,username", access_token: token }, { fetchImpl })) as {
    id?: string;
    username?: string;
  };
  if (!body?.id) throw new ProviderError("PROVIDER_ERROR", "Profil Threads tidak bisa dibaca");
  return { id: body.id, username: body.username ?? null };
}

export const TOKEN_REFRESH_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function tokenNeedsRefresh(issuedAt: Date | null, expiresAt: Date | null, now: Date): boolean {
  if (!issuedAt || !expiresAt) return false;
  if (expiresAt.getTime() <= now.getTime()) return false;
  const oldEnough = now.getTime() - issuedAt.getTime() >= TOKEN_REFRESH_MIN_AGE_MS;
  const nearExpiry = expiresAt.getTime() - now.getTime() <= TOKEN_REFRESH_WINDOW_MS;
  return oldEnough && nearExpiry;
}
