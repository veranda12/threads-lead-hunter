import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as runPost, GET as runGet } from "@/app/api/internal/discovery/run/route";
import { POST as deletionPost } from "@/app/api/threads/data-deletion/route";
import { createSignedRequest } from "@/lib/meta/signed-request";
import { completeDeletionRequest, createWebDeletionRequest, applyRetention } from "@/lib/privacy";
import { ingestPost } from "@/lib/discovery/ingest";
import { consumeRateLimit } from "@/lib/rate-limit";
import { changeLeadStatus } from "@/lib/leads/service";
import { setSetting, DEFAULT_SETTINGS } from "@/lib/settings";
import { isoAgo, resetDb } from "./helpers";

const NOW = new Date();

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("unauthorized API access", () => {
  it("endpoint discovery menolak tanpa Authorization", async () => {
    const res = await runPost(new Request("https://leads.example.com/api/internal/discovery/run", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(await db.discoveryRun.count()).toBe(0);
  });

  it("endpoint discovery menolak secret yang salah", async () => {
    const res = await runPost(new Request("https://x/api/internal/discovery/run", { method: "POST", headers: { Authorization: "Bearer salah-salah-salah-salah-salah-salah" } }));
    expect(res.status).toBe(401);
  });

  it("GET tidak diizinkan", async () => {
    expect((await runGet()).status).toBe(405);
  });

  it("execution id dengan karakter aneh ditolak", async () => {
    const res = await runPost(
      new Request("https://x/api/internal/discovery/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "X-Execution-Id": "../../etc" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("secret yang benar menjalankan run dan idempotent per execution id", async () => {
    const req = () =>
      new Request("https://x/api/internal/discovery/run", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "X-Execution-Id": "999-1" } });
    const a = await runPost(req());
    const b = await runPost(req());
    expect(a.status).toBe(200);
    const bj = await b.json();
    expect(bj.idempotentReplay).toBe(true);
    expect(bj.executionId).toBe("gh-999-1");
    // Tanpa integrasi Threads, provider berstatus NOT_CONFIGURED dan tidak ada pencarian.
    expect(await db.apiUsageLog.count({ where: { provider: "THREADS" } })).toBe(0);
  });
});

describe("Meta data deletion callback", () => {
  it("signed_request valid menghapus token dan mengembalikan url + confirmation_code", async () => {
    await db.integrationAccount.create({ data: { provider: "OFFICIAL_THREADS", externalUserId: "777", username: "operator", accessTokenEnc: "v1.x.y.z", scopes: [] } });
    await ingestPost(
      { platform: "threads", platformPostId: "1", shortcode: null, text: "butuh website", username: "operator", permalink: null, timestamp: isoAgo(NOW, 1000), mediaType: null, raw: {} },
      { now: NOW, source: "OFFICIAL_THREADS", prefilterThreshold: 35, enforceFreshWindow: true },
    );
    const body = new URLSearchParams({ signed_request: createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "777" }, "test-app-secret") });
    const res = await deletionPost(new Request("https://x/api/threads/data-deletion", { method: "POST", body }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.confirmation_code).toMatch(/^DEL-/);
    expect(json.url).toBe(`https://leads.example.com/data-deletion/status?code=${json.confirmation_code}`);
    expect(await db.integrationAccount.count()).toBe(0);
    expect(await db.lead.count()).toBe(0);
    expect((await db.dataDeletionRequest.findFirstOrThrow()).status).toBe("COMPLETED");
  });

  it("signed_request palsu ditolak", async () => {
    const body = new URLSearchParams({ signed_request: createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, "bukan-secret") });
    const res = await deletionPost(new Request("https://x/api/threads/data-deletion", { method: "POST", body }));
    expect(res.status).toBe(400);
  });
});

describe("permintaan penghapusan dari formulir", () => {
  it("username langsung di-suppress, lalu penghapusan menghapus lead dan run item", async () => {
    const ctx = { now: NOW, source: "OFFICIAL_THREADS" as const, prefilterThreshold: 35, enforceFreshWindow: true };
    const res = await ingestPost(
      { platform: "threads", platformPostId: "55", shortcode: null, text: "Butuh website toko", username: "Penulis_A", permalink: null, timestamp: isoAgo(NOW, 1000), mediaType: null, raw: {} },
      ctx,
    );
    const leadId = (res as { leadId: string }).leadId;
    const run = await db.discoveryRun.create({ data: { executionId: "r", trigger: "MANUAL", serverNow: NOW, cutoffAt: NOW } });
    await db.discoveryRunItem.create({ data: { runId: run.id, platform: "threads", platformPostId: "55", outcome: "NEW_LEAD", leadId } });

    const req = await createWebDeletionRequest({ threadsUsername: "@penulis_a", ip: null });
    const again = await ingestPost(
      { platform: "threads", platformPostId: "56", shortcode: null, text: "Butuh website lagi", username: "penulis_a", permalink: null, timestamp: isoAgo(NOW, 1000), mediaType: null, raw: {} },
      ctx,
    );
    expect(again.outcome).toBe("SUPPRESSED");

    const done = await completeDeletionRequest(req.id, "admin");
    expect(done.deletedLeads).toBe(1);
    expect(await db.lead.count()).toBe(0);
    expect(await db.discoveryRunItem.count()).toBe(0);
  });
});

describe("retensi", () => {
  it("tidak menghapus apa pun bila periode belum ditetapkan", async () => {
    const r = await applyRetention(NOW);
    expect(r.skipped).toEqual(["rawPayload", "unqualified", "closed"]);
  });

  it("menghapus lead tidak relevan yang lewat periode, tapi tidak menyentuh lead aktif", async () => {
    await setSetting("privacy", { ...DEFAULT_SETTINGS.privacy, retentionUnqualifiedDays: 7, retentionRawPayloadDays: 3 });
    const old = new Date(NOW.getTime() - 10 * 86_400_000);
    const mk = (id: string, data: object) =>
      db.lead.create({ data: { platformPostId: id, source: "OFFICIAL_THREADS", text: "x", contentHash: id, discoveredAt: old, rawData: { a: 1 }, ...data } });
    await mk("a", { analysisStatus: "PREFILTERED_OUT" });
    await mk("b", { analysisStatus: "PREFILTERED_OUT", status: "CONTACTED" });
    const r = await applyRetention(NOW);
    expect(r.unqualifiedDeleted).toBe(1);
    // Purge raw berjalan lebih dulu untuk semua lead yang lewat periode, termasuk yang lalu dihapus.
    expect(r.rawPurged).toBe(2);
    const kept = await db.lead.findFirstOrThrow();
    expect(kept.status).toBe("CONTACTED");
    expect(kept.rawData).toBeNull();
  });
});

describe("rate limiting", () => {
  it("menolak setelah melewati batas dalam window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await consumeRateLimit("t:key", 3, 60)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("CRM", () => {
  it("perubahan status tercatat di activity timeline dan transisi invalid ditolak", async () => {
    const lead = await db.lead.create({ data: { platformPostId: "z", source: "MANUAL_IMPORT", text: "x", contentHash: "z" } });
    await changeLeadStatus(lead.id, "CONTACTED", "admin");
    const act = await db.leadActivity.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(act).toMatchObject({ fromStatus: "NEW", toStatus: "CONTACTED", type: "CONTACTED" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactedAt).not.toBeNull();
    await expect(changeLeadStatus(lead.id, "WON", "admin")).rejects.toThrow(/tidak diizinkan/);
  });

  it("audit log tidak bisa diubah atau dihapus", async () => {
    const row = await db.auditLog.create({ data: { action: "test.immutable" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "x" } })).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});
