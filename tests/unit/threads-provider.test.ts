import { describe, expect, it } from "vitest";
import { keywordSearch, mapGraphError, tokenNeedsRefresh, buildAuthorizeUrl } from "@/lib/providers/threads-api";
import { evaluateThreadsHealth, OfficialThreadsProvider, type ThreadsIntegrationState } from "@/lib/providers/official";
import { ProviderError } from "@/lib/providers/types";

const NOW = new Date("2026-10-17T12:00:00Z");
const query = { keyword: "cari jasa website", since: new Date(NOW.getTime() - 6 * 3600_000), until: NOW, limit: 2 };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("mapGraphError", () => {
  it("code 190 -> token expired", () => expect(mapGraphError(400, { error: { code: 190, message: "expired" } }).code).toBe("TOKEN_EXPIRED"));
  it("code 10 -> permission required", () => expect(mapGraphError(400, { error: { code: 10, message: "perm" } }).code).toBe("PERMISSION_REQUIRED"));
  it("HTTP 429 / code 4 -> rate limited, tidak di-retry, membawa retry-after", () => {
    const e = mapGraphError(429, { error: { code: 4 } }, "120");
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.retryable).toBe(false);
    expect(e.options.retryAfterMs).toBe(120_000);
  });
  it("5xx -> provider error yang bisa di-retry", () => {
    const e = mapGraphError(503, null);
    expect(e.code).toBe("PROVIDER_ERROR");
    expect(e.retryable).toBe(true);
  });
});

describe("keywordSearch", () => {
  it("mengirim search_type RECENT, since/until, dan membaca cursor pagination", async () => {
    let calledUrl = "";
    const res = await keywordSearch("tok", query, {
      fetchImpl: async (url) => {
        calledUrl = url;
        return jsonResponse({
          data: [
            { id: "1", text: "butuh web", username: "a", timestamp: "2026-10-17T11:00:00+0000", permalink: "https://www.threads.com/@a/post/X1" },
            { id: "2", text: "cari dev", username: "b", timestamp: "2026-10-17T10:00:00+0000" },
          ],
          paging: { cursors: { before: "B", after: "AFTER1" }, next: "https://graph.threads.net/next" },
        });
      },
    });
    const u = new URL(calledUrl);
    expect(u.pathname).toBe("/v1.0/keyword_search");
    expect(u.searchParams.get("search_type")).toBe("RECENT");
    expect(u.searchParams.get("since")).toBe(String(Math.floor(query.since.getTime() / 1000)));
    expect(u.searchParams.get("fields")).toContain("timestamp");
    expect(res.posts).toHaveLength(2);
    expect(res.nextCursor).toBe("AFTER1");
    expect(res.quotaUnits).toBe(1);
  });

  it("hasil kosong tidak memakai kuota dan tidak punya halaman berikutnya", async () => {
    const res = await keywordSearch("tok", query, { fetchImpl: async () => jsonResponse({ data: [], paging: {} }) });
    expect(res).toEqual({ posts: [], nextCursor: null, quotaUnits: 0 });
  });

  it("error Graph API dipetakan ke ProviderError", async () => {
    await expect(keywordSearch("tok", query, { fetchImpl: async () => jsonResponse({ error: { code: 190, message: "Session expired" } }, 400) })).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
  });

  it("timeout API menghasilkan error TIMEOUT yang retryable", async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
      });
    const err = await keywordSearch("tok", query, { fetchImpl: hang, timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
  });

  it("respons tanpa data dianggap error provider", async () => {
    await expect(keywordSearch("tok", query, { fetchImpl: async () => jsonResponse({ foo: 1 }) })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("status integrasi jujur", () => {
  const ok: ThreadsIntegrationState = {
    appConfigured: true,
    hasToken: true,
    tokenExpiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
    keywordSearchApproved: true,
    rateLimitedUntil: null,
    lastStoredStatus: "CONNECTED",
    lastStoredMessage: null,
  };
  it.each([
    [{ appConfigured: false }, "NOT_CONFIGURED"],
    [{ hasToken: false }, "NOT_CONFIGURED"],
    [{ tokenExpiresAt: new Date(NOW.getTime() - 1) }, "TOKEN_EXPIRED"],
    [{ lastStoredStatus: "TOKEN_EXPIRED" }, "TOKEN_EXPIRED"],
    [{ keywordSearchApproved: false }, "PERMISSION_REQUIRED"],
    [{ rateLimitedUntil: new Date(NOW.getTime() + 60_000) }, "RATE_LIMITED"],
    [{ lastStoredStatus: "PROVIDER_ERROR" }, "PROVIDER_ERROR"],
    [{}, "CONNECTED"],
  ])("%o -> %s", (patch, status) => {
    expect(evaluateThreadsHealth({ ...ok, ...patch } as ThreadsIntegrationState, NOW).status).toBe(status);
  });

  it("provider menolak mencari tanpa approval threads_keyword_search", async () => {
    let called = false;
    const p = new OfficialThreadsProvider({
      state: { ...ok, keywordSearchApproved: false },
      accessToken: "tok",
      now: () => NOW,
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ data: [] });
      },
    });
    await expect(p.search(query)).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
    expect(called).toBe(false);
  });
});

describe("token lifecycle", () => {
  it("refresh hanya bila umur >= 24 jam dan mendekati kedaluwarsa", () => {
    const issued = new Date(NOW.getTime() - 55 * 86_400_000);
    const expires = new Date(NOW.getTime() + 5 * 86_400_000);
    expect(tokenNeedsRefresh(issued, expires, NOW)).toBe(true);
    expect(tokenNeedsRefresh(new Date(NOW.getTime() - 3600_000), expires, NOW)).toBe(false);
    expect(tokenNeedsRefresh(issued, new Date(NOW.getTime() - 1), NOW)).toBe(false);
    expect(tokenNeedsRefresh(issued, new Date(NOW.getTime() + 30 * 86_400_000), NOW)).toBe(false);
  });
  it("authorize URL meminta scope yang dibutuhkan dan state", () => {
    const u = new URL(buildAuthorizeUrl("123", "https://x.test/cb", "st"));
    expect(u.searchParams.get("scope")).toBe("threads_basic,threads_keyword_search");
    expect(u.searchParams.get("state")).toBe("st");
  });
});
