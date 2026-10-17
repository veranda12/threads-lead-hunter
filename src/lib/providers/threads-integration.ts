import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { evaluateThreadsHealth, OfficialThreadsProvider, type ThreadsIntegrationState } from "@/lib/providers/official";
import { refreshLongLivedToken, tokenNeedsRefresh } from "@/lib/providers/threads-api";
import { ProviderError, statusFromErrorCode, type ProviderHealth } from "@/lib/providers/types";
import { audit } from "@/lib/audit";

export async function ensureProviderRows() {
  await db.searchProvider.upsert({
    where: { kind: "OFFICIAL_THREADS" },
    create: { kind: "OFFICIAL_THREADS", name: "Threads API resmi" },
    update: {},
  });
  await db.searchProvider.upsert({
    where: { kind: "MANUAL" },
    create: { kind: "MANUAL", name: "Import manual", status: "CONNECTED", statusMessage: "Selalu tersedia", dailyRequestBudget: 0 },
    update: {},
  });
}

export async function loadThreadsState(): Promise<{ state: ThreadsIntegrationState; accessToken: string | null; tokenError: string | null }> {
  const [account, provider, threads] = await Promise.all([
    db.integrationAccount.findUnique({ where: { provider: "OFFICIAL_THREADS" } }),
    db.searchProvider.findUnique({ where: { kind: "OFFICIAL_THREADS" } }),
    getSetting("threads"),
  ]);
  let accessToken: string | null = null;
  let tokenError: string | null = null;
  if (account?.accessTokenEnc) {
    try {
      accessToken = decryptSecret(account.accessTokenEnc);
    } catch {
      tokenError = "Token tersimpan tidak bisa didekripsi (ENCRYPTION_KEY berubah?). Hubungkan ulang akun Threads.";
    }
  }
  return {
    accessToken,
    tokenError,
    state: {
      appConfigured: Boolean(env.threadsAppId && env.threadsAppSecret),
      hasToken: accessToken !== null,
      tokenExpiresAt: account?.tokenExpiresAt ?? null,
      keywordSearchApproved: threads.keywordSearchApproved,
      rateLimitedUntil: provider?.rateLimitedUntil ?? null,
      lastStoredStatus: account?.status ?? null,
      lastStoredMessage: account?.statusMessage ?? null,
    },
  };
}

export async function getThreadsHealth(now = new Date()): Promise<ProviderHealth & { tokenExpiresAt: Date | null; username: string | null }> {
  const [{ state, tokenError }, account] = await Promise.all([
    loadThreadsState(),
    db.integrationAccount.findUnique({ where: { provider: "OFFICIAL_THREADS" } }),
  ]);
  if (tokenError) return { status: "TOKEN_EXPIRED", message: tokenError, tokenExpiresAt: state.tokenExpiresAt, username: account?.username ?? null };
  return { ...evaluateThreadsHealth(state, now), tokenExpiresAt: state.tokenExpiresAt, username: account?.username ?? null };
}

export async function createOfficialProvider(now: Date) {
  const { state, accessToken } = await loadThreadsState();
  return new OfficialThreadsProvider({ state, accessToken, now: () => now });
}

/** Simpan status nyata provider setelah error, agar dashboard menampilkan kondisi sebenarnya. */
export async function recordProviderError(error: ProviderError, now: Date) {
  const status = statusFromErrorCode(error.code);
  await db.searchProvider.update({
    where: { kind: "OFFICIAL_THREADS" },
    data: {
      status,
      statusMessage: error.message.slice(0, 500),
      lastErrorAt: now,
      lastError: error.message.slice(0, 500),
      rateLimitedUntil: error.code === "RATE_LIMITED" ? new Date(now.getTime() + (error.options.retryAfterMs ?? 3600_000)) : undefined,
    },
  });
  if (status === "TOKEN_EXPIRED" || status === "PERMISSION_REQUIRED") {
    await db.integrationAccount.updateMany({
      where: { provider: "OFFICIAL_THREADS" },
      data: { status, statusMessage: error.message.slice(0, 500), lastCheckedAt: now },
    });
  }
}

export async function recordProviderSuccess(now: Date) {
  await db.searchProvider.update({
    where: { kind: "OFFICIAL_THREADS" },
    data: { status: "CONNECTED", statusMessage: "Pencarian terakhir berhasil", lastSuccessAt: now, rateLimitedUntil: null },
  });
  await db.integrationAccount.updateMany({
    where: { provider: "OFFICIAL_THREADS", status: { not: "CONNECTED" } },
    data: { status: "CONNECTED", statusMessage: null, lastCheckedAt: now },
  });
}

export async function storeThreadsToken(args: {
  accessToken: string;
  expiresInSeconds: number;
  externalUserId: string;
  username: string | null;
  actorId?: string;
}) {
  const now = new Date();
  await db.integrationAccount.upsert({
    where: { provider: "OFFICIAL_THREADS" },
    create: {
      provider: "OFFICIAL_THREADS",
      externalUserId: args.externalUserId,
      username: args.username,
      accessTokenEnc: encryptSecret(args.accessToken),
      tokenIssuedAt: now,
      tokenExpiresAt: new Date(now.getTime() + args.expiresInSeconds * 1000),
      scopes: ["threads_basic", "threads_keyword_search"],
      status: "CONNECTED",
      lastCheckedAt: now,
    },
    update: {
      externalUserId: args.externalUserId,
      username: args.username,
      accessTokenEnc: encryptSecret(args.accessToken),
      tokenIssuedAt: now,
      tokenExpiresAt: new Date(now.getTime() + args.expiresInSeconds * 1000),
      status: "CONNECTED",
      statusMessage: null,
      lastCheckedAt: now,
    },
  });
  await db.searchProvider.updateMany({ where: { kind: "OFFICIAL_THREADS" }, data: { status: "CONNECTED", statusMessage: null } });
  await audit({ action: "threads.connected", actorId: args.actorId, entityType: "IntegrationAccount", metadata: { username: args.username } });
}

export async function disconnectThreads(actorId?: string, reason = "Diputus oleh pengguna") {
  await db.integrationAccount.updateMany({
    where: { provider: "OFFICIAL_THREADS" },
    data: { accessTokenEnc: null, tokenExpiresAt: null, tokenIssuedAt: null, status: "NOT_CONFIGURED", statusMessage: reason },
  });
  await db.searchProvider.updateMany({ where: { kind: "OFFICIAL_THREADS" }, data: { status: "NOT_CONFIGURED", statusMessage: reason } });
  await audit({ action: "threads.disconnected", actorId, entityType: "IntegrationAccount", metadata: { reason } });
}

/** Refresh long-lived token bila mendekati kedaluwarsa. Dipanggil di awal setiap discovery run. */
export async function maybeRefreshThreadsToken(now: Date): Promise<"refreshed" | "not_needed" | "failed"> {
  const account = await db.integrationAccount.findUnique({ where: { provider: "OFFICIAL_THREADS" } });
  if (!account?.accessTokenEnc || !tokenNeedsRefresh(account.tokenIssuedAt, account.tokenExpiresAt, now)) return "not_needed";
  try {
    const token = decryptSecret(account.accessTokenEnc);
    const refreshed = await refreshLongLivedToken(token);
    await db.integrationAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encryptSecret(refreshed.accessToken),
        tokenIssuedAt: now,
        tokenExpiresAt: new Date(now.getTime() + refreshed.expiresInSeconds * 1000),
        lastRefreshedAt: now,
        status: "CONNECTED",
        statusMessage: null,
      },
    });
    await audit({ action: "threads.token_refreshed", entityType: "IntegrationAccount", entityId: account.id });
    return "refreshed";
  } catch (error) {
    if (error instanceof ProviderError) await recordProviderError(error, now);
    return "failed";
  }
}

export async function threadsQuotaUsed24h(now: Date): Promise<number> {
  const agg = await db.apiUsageLog.aggregate({
    where: { provider: "THREADS", operation: { in: ["keyword_search", "keyword_search_test"] }, createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
    _sum: { quotaUnits: true },
  });
  return agg._sum.quotaUnits ?? 0;
}
