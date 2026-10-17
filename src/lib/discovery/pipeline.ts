import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getSetting } from "@/lib/settings";
import { computeCutoff } from "@/lib/time";
import { acquireLock, extendLock, releaseLock } from "@/lib/discovery/lock";
import { ingestPost } from "@/lib/discovery/ingest";
import { planQueryBudget, rotateKeywords } from "@/lib/discovery/budget";
import { withRetry } from "@/lib/retry";
import { ProviderError, type SearchProvider } from "@/lib/providers/types";
import {
  createOfficialProvider,
  ensureProviderRows,
  maybeRefreshThreadsToken,
  recordProviderError,
  recordProviderSuccess,
  threadsQuotaUsed24h,
} from "@/lib/providers/threads-integration";
import { analyzeLead } from "@/lib/leads/service";
import { applyRetention } from "@/lib/privacy";
import { aiRuntime } from "@/lib/ai/client";

export const DISCOVERY_LOCK = "discovery";

type LogEntry = { at: string; level: "info" | "warn" | "error"; message: string };

export type RunSummary = {
  runId: string;
  executionId: string;
  status: string;
  idempotentReplay: boolean;
  counters: Record<string, number>;
  error?: string | null;
};

type Counters = {
  keywordsSearched: number;
  apiRequests: number;
  postsFetched: number;
  postsNew: number;
  postsUpdated: number;
  postsDuplicate: number;
  postsStale: number;
  postsInvalid: number;
  prefilterRejected: number;
  analyzed: number;
  analysisPending: number;
  draftsGenerated: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  errorCount: number;
};

function emptyCounters(): Counters {
  return {
    keywordsSearched: 0,
    apiRequests: 0,
    postsFetched: 0,
    postsNew: 0,
    postsUpdated: 0,
    postsDuplicate: 0,
    postsStale: 0,
    postsInvalid: 0,
    prefilterRejected: 0,
    analyzed: 0,
    analysisPending: 0,
    draftsGenerated: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    errorCount: 0,
  };
}

function summarize(run: { id: string; executionId: string; status: string; error: string | null } & Partial<Counters>, replay: boolean): RunSummary {
  const counters: Record<string, number> = {};
  for (const k of Object.keys(emptyCounters())) counters[k] = Number((run as Record<string, unknown>)[k] ?? 0);
  return { runId: run.id, executionId: run.executionId, status: run.status, idempotentReplay: replay, counters, error: run.error };
}

export type RunOptions = {
  executionId?: string;
  trigger: "SCHEDULER" | "MANUAL" | "WORKER";
  /** Untuk test: injeksi provider dan jam. */
  provider?: SearchProvider;
  now?: () => Date;
  skipAi?: boolean;
};

/**
 * Satu eksekusi discovery. Idempotent per executionId, dilindungi lock database,
 * dan setiap langkah gagal secara terisolasi (satu keyword error tidak menghentikan yang lain).
 */
export async function runDiscovery(opts: RunOptions): Promise<RunSummary> {
  const clock = opts.now ?? (() => new Date());
  const executionId = (opts.executionId ?? `${opts.trigger.toLowerCase()}-${randomUUID()}`).slice(0, 120);

  const prior = await db.discoveryRun.findUnique({ where: { executionId } });
  if (prior) return summarize(prior, true);

  // 1-3. Execution ID, waktu server aktual, cutoff 6 jam dari waktu eksekusi sebenarnya.
  const serverNow = clock();
  const cutoff = computeCutoff(serverNow);
  let run;
  try {
    run = await db.discoveryRun.create({ data: { executionId, trigger: opts.trigger, serverNow, cutoffAt: cutoff, startedAt: serverNow } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.discoveryRun.findUniqueOrThrow({ where: { executionId } });
      return summarize(existing, true);
    }
    throw error;
  }

  const log: LogEntry[] = [];
  const say = (level: LogEntry["level"], message: string) => {
    if (log.length < 300) log.push({ at: clock().toISOString(), level, message });
  };
  const counters = emptyCounters();
  const finish = async (status: Prisma.DiscoveryRunUpdateInput["status"], error: string | null = null) => {
    const updated = await db.discoveryRun.update({
      where: { id: run.id },
      data: { ...counters, status, error, finishedAt: clock(), log: log as unknown as Prisma.InputJsonValue },
    });
    return summarize(updated, false);
  };

  const [discovery, ai, threadsSettings] = await Promise.all([getSetting("discovery"), getSetting("ai"), getSetting("threads")]);

  if (!discovery.enabled) {
    say("info", "Discovery dinonaktifkan di pengaturan");
    return finish("SKIPPED_DISABLED");
  }

  if (opts.trigger === "SCHEDULER") {
    const last = await db.discoveryRun.findFirst({
      where: { id: { not: run.id }, trigger: { not: "LOCAL_AI" }, status: { in: ["SUCCEEDED", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
    });
    if (last && serverNow.getTime() - last.startedAt.getTime() < discovery.minIntervalMinutes * 60_000) {
      say("info", `Run sukses terakhir masih di dalam interval minimum ${discovery.minIntervalMinutes} menit`);
      return finish("SKIPPED_INTERVAL");
    }
  }

  const holder = run.id;
  const ttl = (discovery.runTimeoutSeconds + 60) * 1000;
  if (!(await acquireLock(DISCOVERY_LOCK, holder, ttl))) {
    say("warn", "Eksekusi lain masih berjalan, run ini dilewati");
    return finish("SKIPPED_LOCKED");
  }

  const deadline = serverNow.getTime() + discovery.runTimeoutSeconds * 1000;
  const timeLeft = () => deadline - clock().getTime();

  try {
    await ensureProviderRows();

    // 4-11. Pencarian, pagination, validasi timestamp, dedup, simpan raw.
    const refresh = await maybeRefreshThreadsToken(serverNow);
    if (refresh !== "not_needed") say(refresh === "refreshed" ? "info" : "warn", `Refresh token Threads: ${refresh}`);

    const provider = opts.provider ?? (await createOfficialProvider(serverNow));
    const health = await provider.health();
    say("info", `Status provider ${provider.kind}: ${health.status}. ${health.message}`);

    if (health.status === "CONNECTED" || health.status === "PROVIDER_ERROR") {
      await searchPhase({ provider, runId: run.id, serverNow, cutoff, discovery, threadsSettings, ai, counters, say, timeLeft });
    }

    // 12-15. Analisis kandidat pending (termasuk sisa dari run sebelumnya) dan draft DM.
    if (!opts.skipAi) {
      await analysisPhase({ runId: run.id, cutoff, ai, counters, say, timeLeft });
    }

    // Freshness disimpan untuk filter cepat; tidak pernah mengubah status pipeline CRM.
    const expired = await db.lead.updateMany({ where: { freshness: "FRESH", postedAt: { lt: cutoff } }, data: { freshness: "EXPIRED" } });
    if (expired.count) say("info", `${expired.count} lead keluar dari jendela Fresh`);

    try {
      const retention = await applyRetention(serverNow);
      if (retention.rawPurged || retention.unqualifiedDeleted || retention.closedDeleted) {
        say("info", `Retensi: raw ${retention.rawPurged}, tidak relevan ${retention.unqualifiedDeleted}, ditutup ${retention.closedDeleted}`);
      }
    } catch (error) {
      counters.errorCount += 1;
      say("error", `Retensi gagal: ${(error as Error).message}`);
    }

    return await finish(counters.errorCount > 0 ? "PARTIAL" : "SUCCEEDED");
  } catch (error) {
    counters.errorCount += 1;
    const message = (error as Error)?.message?.slice(0, 1000) ?? "Unknown error";
    say("error", message);
    return await finish("FAILED", message);
  } finally {
    await releaseLock(DISCOVERY_LOCK, holder).catch(() => undefined);
  }
}

type PhaseCtx = {
  runId: string;
  cutoff: Date;
  counters: Counters;
  say: (level: LogEntry["level"], message: string) => void;
  timeLeft: () => number;
  ai: Awaited<ReturnType<typeof getSetting<"ai">>>;
};

async function searchPhase(
  ctx: PhaseCtx & {
    provider: SearchProvider;
    serverNow: Date;
    discovery: Awaited<ReturnType<typeof getSetting<"discovery">>>;
    threadsSettings: Awaited<ReturnType<typeof getSetting<"threads">>>;
  },
) {
  const { provider, discovery, counters, say } = ctx;
  if (!provider.supportsSearch) return;
  const providerRow = await db.searchProvider.findUnique({ where: { kind: provider.kind } });
  const dailyBudget = Math.min(ctx.threadsSettings.dailyQueryBudget, providerRow?.dailyRequestBudget ?? ctx.threadsSettings.dailyQueryBudget);
  const used = await threadsQuotaUsed24h(ctx.serverNow);
  const plan = planQueryBudget({
    dailyBudget,
    usedLast24h: used,
    minIntervalMinutes: discovery.minIntervalMinutes,
    maxKeywordsPerRun: discovery.maxKeywordsPerRun,
    maxPagesPerKeyword: discovery.maxPagesPerKeyword,
  });
  say("info", `Kuota: terpakai ${used}/${dailyBudget} dalam 24 jam, run ini maksimal ${plan.maxQueries} query (${plan.reason})`);
  if (plan.maxQueries === 0) return;

  const keywords = rotateKeywords(await db.searchKeyword.findMany({ where: { enabled: true } }), plan.keywordSlots);
  if (keywords.length === 0) {
    say("warn", "Tidak ada keyword aktif");
    return;
  }

  let queriesLeft = plan.maxQueries;
  let anySuccess = false;

  keywordLoop: for (const keyword of keywords) {
    if (queriesLeft <= 0 || counters.postsFetched >= discovery.maxPostsPerRun) break;
    if (ctx.timeLeft() < 30_000) {
      say("warn", "Waktu run hampir habis, pencarian dihentikan");
      break;
    }
    let cursor: string | null = null;
    let pages = 0;
    let results = 0;
    let keywordError: string | null = null;

    while (pages < discovery.maxPagesPerKeyword && queriesLeft > 0 && counters.postsFetched < discovery.maxPostsPerRun) {
      const started = Date.now();
      try {
        const page = await withRetry(
          () =>
            provider.search({
              keyword: keyword.phrase,
              since: ctx.cutoff,
              until: ctx.serverNow,
              limit: discovery.resultsPerPage,
              cursor,
            }),
          {
            retries: 2,
            baseDelayMs: 750,
            maxDelayMs: 6000,
            isRetryable: (e) => e instanceof ProviderError && e.retryable,
            deadline: Date.now() + Math.max(0, ctx.timeLeft() - 20_000),
            onRetry: (e, attempt, delay) => say("warn", `Retry ${attempt} untuk "${keyword.phrase}" dalam ${delay}ms: ${(e as Error).message}`),
          },
        );
        counters.apiRequests += 1;
        queriesLeft -= 1;
        pages += 1;
        anySuccess = true;
        await db.apiUsageLog.create({
          data: {
            provider: "THREADS",
            operation: "keyword_search",
            runId: ctx.runId,
            statusCode: 200,
            success: true,
            quotaUnits: page.quotaUnits,
            durationMs: Date.now() - started,
          },
        });

        results += page.posts.length;
        for (const post of page.posts) {
          if (counters.postsFetched >= discovery.maxPostsPerRun) break;
          counters.postsFetched += 1;
          const res = await ingestPost(post, {
            now: ctx.serverNow,
            source: "OFFICIAL_THREADS",
            keywordId: keyword.id,
            prefilterThreshold: ctx.ai.prefilterThreshold,
            enforceFreshWindow: true,
          });
          switch (res.outcome) {
            case "NEW_LEAD":
              counters.postsNew += 1;
              if (!res.prefilterPass) counters.prefilterRejected += 1;
              break;
            case "UPDATED_CONTENT":
              counters.postsUpdated += 1;
              break;
            case "DUPLICATE":
              counters.postsDuplicate += 1;
              break;
            case "STALE":
              counters.postsStale += 1;
              break;
            case "INVALID_TIMESTAMP":
            case "FUTURE_TIMESTAMP":
              counters.postsInvalid += 1;
              break;
            case "ERROR":
              counters.errorCount += 1;
              break;
          }
          await db.discoveryRunItem.create({
            data: {
              runId: ctx.runId,
              keywordId: keyword.id,
              platform: post.platform,
              platformPostId: post.platformPostId,
              outcome: res.outcome,
              reason: "reason" in res ? res.reason : null,
              leadId: "leadId" in res ? res.leadId : null,
            },
          });
        }
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      } catch (error) {
        const pe = error instanceof ProviderError ? error : new ProviderError("PROVIDER_ERROR", (error as Error)?.message ?? "Unknown");
        counters.errorCount += 1;
        counters.apiRequests += 1;
        keywordError = pe.message;
        await db.apiUsageLog.create({
          data: {
            provider: "THREADS",
            operation: "keyword_search",
            runId: ctx.runId,
            statusCode: pe.options.httpStatus ?? null,
            success: false,
            error: pe.message.slice(0, 500),
            durationMs: Date.now() - started,
          },
        });
        say("error", `Keyword "${keyword.phrase}": ${pe.message}`);
        await recordProviderError(pe, ctx.serverNow);
        await db.searchKeyword.update({
          where: { id: keyword.id },
          data: { errorCount: { increment: 1 }, lastError: pe.message.slice(0, 300), lastSearchedAt: ctx.serverNow },
        });
        // Token, izin, dan rate limit berlaku untuk semua keyword: hentikan pencarian run ini.
        if (pe.code === "RATE_LIMITED" || pe.code === "TOKEN_EXPIRED" || pe.code === "PERMISSION_REQUIRED" || pe.code === "NOT_CONFIGURED") {
          break keywordLoop;
        }
        break;
      }
    }

    counters.keywordsSearched += 1;
    if (!keywordError) {
      await db.searchKeyword.update({
        where: { id: keyword.id },
        data: { lastSearchedAt: ctx.serverNow, searchCount: { increment: 1 }, totalResults: { increment: results }, lastError: null },
      });
    }
    await extendLock(DISCOVERY_LOCK, ctx.runId, ctx.timeLeft() + 60_000).catch(() => undefined);
  }

  if (anySuccess) await recordProviderSuccess(ctx.serverNow);
}

async function analysisPhase(ctx: PhaseCtx) {
  const { ai, counters, say } = ctx;
  const pendingWhere: Prisma.LeadWhereInput = {
    analysisStatus: { in: ["PENDING", "BUDGET_EXCEEDED", "NOT_CONFIGURED"] },
    // Postingan resmi yang sudah lewat 6 jam tidak dianalisis lagi untuk hemat biaya; import manual tetap.
    OR: [{ source: "MANUAL_IMPORT" }, { postedAt: { gte: ctx.cutoff } }],
  };
  const pendingTotal = await db.lead.count({ where: pendingWhere });
  if (pendingTotal === 0) return;

  const runtime = aiRuntime(ai);
  if (!runtime.available) {
    counters.analysisPending = pendingTotal;
    if (runtime.provider === "ollama") {
      // Bukan kesalahan konfigurasi: kandidat menunggu worker lokal yang menjalankan Ollama.
      say("info", `${pendingTotal} kandidat menunggu worker analisis lokal (${runtime.label})`);
      await db.lead.updateMany({ where: { ...pendingWhere, analysisStatus: "NOT_CONFIGURED" }, data: { analysisStatus: "PENDING", analysisError: null } });
    } else {
      say("warn", `${pendingTotal} kandidat menunggu analisis: ANTHROPIC_API_KEY belum diatur`);
      await db.lead.updateMany({ where: { ...pendingWhere, analysisStatus: "PENDING" }, data: { analysisStatus: "NOT_CONFIGURED" } });
    }
    return;
  }

  const batch = await db.lead.findMany({
    where: pendingWhere,
    orderBy: [{ prefilterScore: "desc" }, { postedAt: "desc" }],
    take: ai.maxAnalysesPerRun,
    select: { id: true },
  });

  let processed = 0;
  for (const { id } of batch) {
    if (ctx.timeLeft() < 20_000) {
      say("warn", "Waktu run hampir habis, sisa analisis ditunda");
      break;
    }
    const res = await analyzeLead(id, { runId: ctx.runId });
    processed += 1;
    if (res.status === "ANALYZED") {
      counters.analyzed += 1;
      counters.aiInputTokens += res.inputTokens;
      counters.aiOutputTokens += res.outputTokens;
      // Draft DM dibuat di dalam analyzeLead (satu panggilan model untuk analisis + draft).
      counters.draftsGenerated += res.draftsCreated;
      if (res.stage === "TRIAGE") say("info", `Lead ${id} berhenti di classifier awal (skor ${res.leadScore})`);
    } else if (res.status === "BUDGET_EXCEEDED") {
      say("warn", `Budget AI harian habis. Kandidat disimpan sebagai pending.`);
      break;
    } else if (res.status === "RETRY_LATER") {
      // Layanan AI sedang tidak bisa dipakai; sisa antrian dicoba lagi di run berikutnya.
      counters.errorCount += 1;
      say("error", `Analisis dihentikan sementara: ${res.error}`);
      break;
    } else if (res.status === "FAILED" || res.status === "NOT_CONFIGURED") {
      counters.errorCount += 1;
      say("error", `Analisis lead ${id} gagal: ${res.error}`);
    }
  }
  const run = await db.apiUsageLog.aggregate({
    where: { runId: ctx.runId, provider: "ANTHROPIC" },
    _sum: { inputTokens: true, outputTokens: true },
  });
  counters.aiInputTokens = run._sum.inputTokens ?? counters.aiInputTokens;
  counters.aiOutputTokens = run._sum.outputTokens ?? counters.aiOutputTokens;
  counters.analysisPending = await db.lead.count({ where: pendingWhere });
  say("info", `Analisis: ${counters.analyzed} selesai dari ${processed} diproses, ${counters.analysisPending} masih pending`);
}

export const ANALYSIS_LOCK = "analysis";

/**
 * Worker analisis lokal: hanya memproses antrian kandidat pending (tanpa pencarian),
 * dipakai saat provider AI adalah Ollama di laptop pengelola. Dicatat sebagai run LOCAL_AI.
 */
export async function runLocalAnalysis(opts: { executionId?: string; now?: () => Date } = {}): Promise<RunSummary> {
  const clock = opts.now ?? (() => new Date());
  const executionId = (opts.executionId ?? `local-ai-${randomUUID()}`).slice(0, 120);
  const prior = await db.discoveryRun.findUnique({ where: { executionId } });
  if (prior) return summarize(prior, true);

  const serverNow = clock();
  const cutoff = computeCutoff(serverNow);
  const run = await db.discoveryRun.create({ data: { executionId, trigger: "LOCAL_AI", serverNow, cutoffAt: cutoff, startedAt: serverNow } });
  const log: LogEntry[] = [];
  const say = (level: LogEntry["level"], message: string) => {
    if (log.length < 300) log.push({ at: clock().toISOString(), level, message });
  };
  const counters = emptyCounters();
  const finish = async (status: Prisma.DiscoveryRunUpdateInput["status"], error: string | null = null) => {
    const updated = await db.discoveryRun.update({
      where: { id: run.id },
      data: { ...counters, status, error, finishedAt: clock(), log: log as unknown as Prisma.InputJsonValue },
    });
    return summarize(updated, false);
  };

  const [ai, discovery] = await Promise.all([getSetting("ai"), getSetting("discovery")]);
  const runtime = aiRuntime(ai);
  if (!runtime.available) {
    say("error", `AI tidak tersedia di mesin ini: ${runtime.reason}`);
    return finish("FAILED", runtime.reason);
  }

  const ttl = (discovery.runTimeoutSeconds + 60) * 1000 * 3;
  if (!(await acquireLock(ANALYSIS_LOCK, run.id, ttl))) {
    say("warn", "Worker analisis lain masih berjalan");
    return finish("SKIPPED_LOCKED");
  }
  // Model lokal lebih lambat dari API; beri jendela waktu 3x batas run biasa.
  const deadline = serverNow.getTime() + discovery.runTimeoutSeconds * 1000 * 3;
  try {
    say("info", `Worker lokal memakai ${runtime.label}`);
    await analysisPhase({ runId: run.id, cutoff, ai, counters, say, timeLeft: () => deadline - clock().getTime() });
    return await finish(counters.errorCount > 0 ? "PARTIAL" : "SUCCEEDED");
  } catch (error) {
    counters.errorCount += 1;
    const message = (error as Error)?.message?.slice(0, 1000) ?? "Unknown error";
    say("error", message);
    return await finish("FAILED", message);
  } finally {
    await releaseLock(ANALYSIS_LOCK, run.id).catch(() => undefined);
  }
}
