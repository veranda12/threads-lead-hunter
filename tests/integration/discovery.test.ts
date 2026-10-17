import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ingestPost } from "@/lib/discovery/ingest";
import { acquireLock, releaseLock } from "@/lib/discovery/lock";
import { runDiscovery } from "@/lib/discovery/pipeline";
import { ProviderError, type RawPost, type SearchPage, type SearchProvider, type SearchQuery } from "@/lib/providers/types";
import { usernameHash } from "@/lib/discovery/normalize";
import { isoAgo, resetDb } from "./helpers";

const NOW = new Date("2026-10-17T12:00:00Z");
const H = 3600_000;

function post(id: string, text: string, timestamp: unknown, username = "pemilik.usaha"): RawPost {
  return { platform: "threads", platformPostId: id, shortcode: `SC${id}`, text, username, permalink: `https://www.threads.com/@${username}/post/SC${id}`, timestamp, mediaType: "TEXT_POST", raw: { id } };
}

const ctx = { now: NOW, source: "OFFICIAL_THREADS" as const, prefilterThreshold: 35, enforceFreshWindow: true };

class FakeProvider implements SearchProvider {
  readonly kind = "OFFICIAL_THREADS" as const;
  readonly supportsSearch = true;
  calls: SearchQuery[] = [];
  constructor(private readonly pages: (SearchPage | ProviderError)[], private readonly delayMs = 0) {}
  async health() {
    return { status: "CONNECTED" as const, message: "fake" };
  }
  async search(q: SearchQuery): Promise<SearchPage> {
    this.calls.push(q);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const next = this.pages.shift() ?? { posts: [], nextCursor: null, quotaUnits: 0 };
    if (next instanceof ProviderError) throw next;
    return next;
  }
}

async function seedKeywords(n = 2) {
  for (let i = 0; i < n; i++) await db.searchKeyword.create({ data: { phrase: `cari jasa website ${i}`, category: "WEBSITE" } });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ingest: dedup dan validasi", () => {
  it("postingan yang sama tidak menjadi lead duplikat", async () => {
    const p = post("100", "Butuh web developer untuk bikin website toko online, ada rekomendasi?", isoAgo(NOW, H));
    const a = await ingestPost(p, ctx);
    const b = await ingestPost(p, ctx);
    expect(a.outcome).toBe("NEW_LEAD");
    expect(b.outcome).toBe("DUPLICATE");
    expect(await db.lead.count()).toBe(1);
  });

  it("insert bersamaan untuk post yang sama tetap menghasilkan satu lead (constraint unik)", async () => {
    const p = post("101", "Cari vendor aplikasi inventory untuk gudang, ada yang bisa?", isoAgo(NOW, H));
    const results = await Promise.all(Array.from({ length: 5 }, () => ingestPost(p, ctx)));
    expect(results.filter((r) => r.outcome === "NEW_LEAD")).toHaveLength(1);
    expect(results.every((r) => r.outcome === "NEW_LEAD" || r.outcome === "DUPLICATE")).toBe(true);
    expect(await db.lead.count()).toBe(1);
  });

  it("import manual dengan shortcode yang sama dengan hasil API terdeteksi duplikat", async () => {
    await ingestPost(post("102", "Butuh developer untuk aplikasi kasir", isoAgo(NOW, H)), ctx);
    const manual = { ...post("shortcode:SC102", "Butuh developer untuk aplikasi kasir", null), shortcode: "SC102" };
    const res = await ingestPost(manual, { ...ctx, source: "MANUAL_IMPORT", enforceFreshWindow: false });
    expect(res.outcome).toBe("DUPLICATE");
  });

  it("postingan stale, masa depan, dan timestamp invalid tidak disimpan", async () => {
    expect((await ingestPost(post("103", "Butuh website company profile", isoAgo(NOW, 6 * H + 1000)), ctx)).outcome).toBe("STALE");
    expect((await ingestPost(post("104", "Butuh website company profile", new Date(NOW.getTime() + H).toISOString()), ctx)).outcome).toBe("FUTURE_TIMESTAMP");
    expect((await ingestPost(post("105", "Butuh website company profile", "kemarin sore"), ctx)).outcome).toBe("INVALID_TIMESTAMP");
    expect(await db.lead.count()).toBe(0);
  });

  it("konten berubah menandai lead untuk dianalisis ulang, tanpa membuat lead baru", async () => {
    const first = await ingestPost(post("106", "Butuh website untuk usaha laundry", isoAgo(NOW, H)), ctx);
    const second = await ingestPost(post("106", "Butuh website untuk usaha laundry, budget 3 juta", isoAgo(NOW, H)), ctx);
    expect(second.outcome).toBe("UPDATED_CONTENT");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: (first as { leadId: string }).leadId } });
    expect(lead.text).toContain("3 juta");
    expect(lead.analysisStatus).toBe("PENDING");
  });

  it("postingan tidak relevan disimpan sebagai PREFILTERED_OUT, tidak dikirim ke AI", async () => {
    await ingestPost(post("107", "Lowongan kerja full time web developer, kirim CV ke HR kami", isoAgo(NOW, H)), ctx);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.analysisStatus).toBe("PREFILTERED_OUT");
  });

  it("penulis yang meminta penghapusan data tidak diambil lagi", async () => {
    await db.suppressedAuthor.create({ data: { usernameHash: usernameHash("pemilik.usaha"), reason: "test" } });
    expect((await ingestPost(post("108", "Butuh website toko online", isoAgo(NOW, H)), ctx)).outcome).toBe("SUPPRESSED");
  });
});

describe("job lock", () => {
  it("hanya satu holder yang mendapat lock saat bersamaan", async () => {
    const res = await Promise.all(["a", "b", "c", "d"].map((h) => acquireLock("t", h, 60_000)));
    expect(res.filter(Boolean)).toHaveLength(1);
  });
  it("lock kedaluwarsa bisa diambil alih, lock aktif tidak", async () => {
    expect(await acquireLock("t2", "old", 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(await acquireLock("t2", "new", 60_000)).toBe(true);
    expect(await acquireLock("t2", "third", 60_000)).toBe(false);
    await releaseLock("t2", "new");
    expect(await acquireLock("t2", "third", 60_000)).toBe(true);
  });
});

describe("runDiscovery", () => {
  it("menyimpan lead fresh, membuang stale, mengikuti pagination, mencatat statistik", async () => {
    await seedKeywords(1);
    const provider = new FakeProvider([
      {
        posts: [post("200", "Ada yang bisa bikinin website company profile untuk klinik?", isoAgo(NOW, 2 * H)), post("201", "Butuh aplikasi kasir", isoAgo(NOW, 7 * H))],
        nextCursor: "c1",
        quotaUnits: 1,
      },
      { posts: [post("202", "Cari programmer untuk sistem HRIS perusahaan", isoAgo(NOW, H))], nextCursor: null, quotaUnits: 1 },
    ]);
    const s = await runDiscovery({ trigger: "MANUAL", provider, now: () => NOW, skipAi: true });
    expect(s.status).toBe("SUCCEEDED");
    expect(s.counters.postsNew).toBe(2);
    expect(s.counters.postsStale).toBe(1);
    expect(provider.calls[1].cursor).toBe("c1");
    expect(provider.calls[0].since.getTime()).toBe(NOW.getTime() - 6 * H);
    const run = await db.discoveryRun.findUniqueOrThrow({ where: { id: s.runId } });
    expect(run.cutoffAt.toISOString()).toBe("2026-10-17T06:00:00.000Z");
    expect(await db.apiUsageLog.count({ where: { provider: "THREADS", runId: s.runId } })).toBe(2);
    const kw = await db.searchKeyword.findFirstOrThrow();
    expect(kw.lastSearchedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("idempotent: executionId yang sama tidak dijalankan dua kali", async () => {
    await seedKeywords(1);
    const provider = new FakeProvider([]);
    const a = await runDiscovery({ trigger: "SCHEDULER", executionId: "gh-1-1", provider, now: () => NOW, skipAi: true });
    const b = await runDiscovery({ trigger: "SCHEDULER", executionId: "gh-1-1", provider, now: () => NOW, skipAi: true });
    expect(b.idempotentReplay).toBe(true);
    expect(b.runId).toBe(a.runId);
    expect(await db.discoveryRun.count()).toBe(1);
  });

  it("scheduler berjalan bersamaan: satu jalan, sisanya SKIPPED_LOCKED", async () => {
    await seedKeywords(1);
    const mk = () => new FakeProvider([{ posts: [], nextCursor: null, quotaUnits: 0 }], 300);
    const results = await Promise.all([1, 2, 3].map((i) => runDiscovery({ trigger: "MANUAL", executionId: `c-${i}`, provider: mk(), now: () => NOW, skipAi: true })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === "SUCCEEDED")).toHaveLength(1);
    expect(statuses.filter((s) => s === "SKIPPED_LOCKED")).toHaveLength(2);
    expect(await db.jobLock.count()).toBe(0);
  });

  it("rate limit menghentikan pencarian, mencatat status provider, run tetap selesai", async () => {
    await seedKeywords(3);
    const provider = new FakeProvider([new ProviderError("RATE_LIMITED", "Too many calls", { retryAfterMs: 3600_000, httpStatus: 429 })]);
    const s = await runDiscovery({ trigger: "MANUAL", provider, now: () => NOW, skipAi: true });
    expect(s.status).toBe("PARTIAL");
    expect(provider.calls).toHaveLength(1);
    const prov = await db.searchProvider.findUniqueOrThrow({ where: { kind: "OFFICIAL_THREADS" } });
    expect(prov.status).toBe("RATE_LIMITED");
    expect(prov.rateLimitedUntil?.getTime()).toBe(NOW.getTime() + 3600_000);
  });

  it("error provider pada satu keyword tidak menghentikan keyword lain", async () => {
    await seedKeywords(2);
    const provider = new FakeProvider([
      new ProviderError("PROVIDER_ERROR", "bad request", { retryable: false }),
      { posts: [post("300", "Butuh developer website toko online", isoAgo(NOW, H))], nextCursor: null, quotaUnits: 1 },
    ]);
    const s = await runDiscovery({ trigger: "MANUAL", provider, now: () => NOW, skipAi: true });
    expect(s.counters.keywordsSearched).toBe(2);
    expect(s.counters.postsNew).toBe(1);
    expect(s.counters.errorCount).toBe(1);
    expect(await db.searchKeyword.count({ where: { errorCount: 1 } })).toBe(1);
  });

  it("token expired dicatat sebagai status integrasi", async () => {
    await seedKeywords(1);
    await db.integrationAccount.create({ data: { provider: "OFFICIAL_THREADS", status: "CONNECTED", scopes: [] } });
    const provider = new FakeProvider([new ProviderError("TOKEN_EXPIRED", "Session has expired")]);
    await runDiscovery({ trigger: "MANUAL", provider, now: () => NOW, skipAi: true });
    expect((await db.integrationAccount.findFirstOrThrow()).status).toBe("TOKEN_EXPIRED");
  });

  it("hasil kosong tetap run sukses", async () => {
    await seedKeywords(1);
    const s = await runDiscovery({ trigger: "MANUAL", provider: new FakeProvider([]), now: () => NOW, skipAi: true });
    expect(s.status).toBe("SUCCEEDED");
    expect(s.counters.postsFetched).toBe(0);
  });

  it("tanpa ANTHROPIC_API_KEY kandidat ditandai pending, bukan dianalisis palsu", async () => {
    await seedKeywords(1);
    const provider = new FakeProvider([{ posts: [post("400", "Ada yang bisa bikinin website company profile?", isoAgo(NOW, H))], nextCursor: null, quotaUnits: 1 }]);
    const s = await runDiscovery({ trigger: "MANUAL", provider, now: () => NOW });
    expect(s.counters.analyzed).toBe(0);
    expect(s.counters.analysisPending).toBe(1);
    expect((await db.lead.findFirstOrThrow()).analysisStatus).toBe("NOT_CONFIGURED");
    expect(await db.leadAnalysis.count()).toBe(0);
  });

  it("scheduler yang dipanggil sebelum interval minimum dilewati", async () => {
    await seedKeywords(1);
    await runDiscovery({ trigger: "SCHEDULER", executionId: "a", provider: new FakeProvider([]), now: () => NOW, skipAi: true });
    const s = await runDiscovery({ trigger: "SCHEDULER", executionId: "b", provider: new FakeProvider([]), now: () => new Date(NOW.getTime() + 5 * 60_000), skipAi: true });
    expect(s.status).toBe("SKIPPED_INTERVAL");
  });

  it("freshness kedaluwarsa tidak mengubah status CRM", async () => {
    const created = await ingestPost(post("500", "Butuh website toko online", isoAgo(NOW, 5 * H)), ctx);
    const id = (created as { leadId: string }).leadId;
    await db.lead.update({ where: { id }, data: { status: "NEGOTIATION" } });
    const later = new Date(NOW.getTime() + 2 * H);
    await runDiscovery({ trigger: "MANUAL", provider: new FakeProvider([]), now: () => later, skipAi: true });
    const lead = await db.lead.findUniqueOrThrow({ where: { id } });
    expect(lead.freshness).toBe("EXPIRED");
    expect(lead.status).toBe("NEGOTIATION");
  });
});
