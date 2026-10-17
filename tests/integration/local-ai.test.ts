import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS, setSetting } from "@/lib/settings";
import { runDiscovery, runLocalAnalysis } from "@/lib/discovery/pipeline";
import type { SearchPage, SearchProvider } from "@/lib/providers/types";
import { isoAgo, resetDb } from "./helpers";

const NOW = new Date();

const analysis = {
  intent: "SERVICE_REQUEST",
  category: "WEBSITE",
  isServiceRequest: true,
  confidence: 0.85,
  leadScore: 82,
  urgency: "MEDIUM",
  projectComplexity: "SIMPLE",
  budgetType: "NOT_MENTIONED",
  possibleBudget: null,
  budgetEvidence: null,
  estimatedService: null,
  qualificationReason: "Butuh website company profile untuk klinik",
  recommendedApproach: "Tanyakan jumlah halaman",
  redFlags: [],
  nextQuestion: "Sudah punya domain?",
  promptInjectionDetected: false,
};
const drafts = {
  drafts: [
    { tone: "FRIENDLY", body: "Halo kak, saya lihat kliniknya lagi cari website company profile. Kebetulan saya biasa bikin website bisnis, boleh cerita kebutuhannya?" },
    { tone: "PROFESSIONAL", body: "Halo, saya software engineer yang mengerjakan website bisnis. Untuk company profile klinik, saya bisa bantu dari desain sampai online. Silakan kabari kebutuhannya." },
    { tone: "CONSULTATIVE", body: "Halo kak, untuk website klinik biasanya yang paling dicari pasien itu jadwal dokter dan lokasi. Kalau berkenan, kita bisa ngobrol singkat soal halaman yang dibutuhkan." },
  ],
};

/** Server Ollama palsu: balas sesuai schema yang diminta lewat field format. */
function fakeOllamaReply(body: { format?: { properties?: Record<string, unknown> } }) {
  const props = body.format?.properties ?? {};
  if ("relevance" in props) return triage;
  if ("leadScore" in props && "drafts" in props) return { ...analysis, ...drafts };
  if ("drafts" in props) return drafts;
  return analysis;
}

let triage = { intent: "SERVICE_REQUEST", isServiceRequest: true, relevance: 80, confidence: 0.8, reason: "Cari jasa website" };

class OnePost implements SearchProvider {
  readonly kind = "OFFICIAL_THREADS" as const;
  readonly supportsSearch = true;
  async health() {
    return { status: "CONNECTED" as const, message: "fake" };
  }
  async search(): Promise<SearchPage> {
    return {
      posts: [
        {
          platform: "threads",
          platformPostId: "ol-1",
          shortcode: null,
          text: "Ada yang bisa bikinin website company profile untuk klinik?",
          username: "klinik_sehat",
          permalink: null,
          timestamp: isoAgo(NOW, 3600_000),
          mediaType: null,
          raw: {},
        },
      ],
      nextCursor: null,
      quotaUnits: 1,
    };
  }
}

beforeEach(async () => {
  await resetDb();
  await db.searchKeyword.create({ data: { phrase: "cari jasa website", category: "WEBSITE" } });
  await setSetting("ai", { ...DEFAULT_SETTINGS.ai, provider: "ollama", ollamaModel: "qwen2.5:7b" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.OLLAMA_BASE_URL = "";
});
afterAll(async () => {
  await db.$disconnect();
});

describe("provider Ollama", () => {
  it("di server tanpa OLLAMA_BASE_URL (Vercel), kandidat tetap PENDING untuk worker lokal", async () => {
    const s = await runDiscovery({ trigger: "MANUAL", provider: new OnePost(), now: () => NOW });
    expect(s.counters.postsNew).toBe(1);
    expect(s.counters.analysisPending).toBe(1);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.analysisStatus).toBe("PENDING");
    expect(lead.analysisError).toBeNull();
  });

  it("worker lokal menganalisis dan membuat draft lewat Ollama", async () => {
    await runDiscovery({ trigger: "MANUAL", provider: new OnePost(), now: () => NOW });
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      const body = JSON.parse(String(init?.body));
      const content = JSON.stringify(fakeOllamaReply(body));
      calls.push(body.model);
      return new Response(JSON.stringify({ model: "qwen2.5:7b", message: { content }, done_reason: "stop", prompt_eval_count: 900, eval_count: 200 }));
    });

    const s = await runLocalAnalysis();
    expect(s.status).toBe("SUCCEEDED");
    expect(s.counters.analyzed).toBe(1);
    expect(s.counters.draftsGenerated).toBe(3);
    // Satu panggilan gabungan: analisis + 3 draft sekaligus.
    expect(calls.filter((c) => c.startsWith("http"))).toEqual(["http://ollama.test/api/chat"]);

    const a = await db.leadAnalysis.findFirstOrThrow();
    expect(a.modelVersion).toBe("ollama:qwen2.5:7b");
    expect((await db.lead.findFirstOrThrow()).priority).toBe("HIGH");
    const usage = await db.apiUsageLog.findMany({ where: { provider: "OLLAMA" } });
    expect(usage.length).toBe(1);
    expect(usage[0].operation).toBe("lead_analysis_with_drafts");
    expect(usage.every((u) => u.costMicroUsd === 0)).toBe(true);
    const run = await db.discoveryRun.findUniqueOrThrow({ where: { id: s.runId } });
    expect(run.trigger).toBe("LOCAL_AI");
  });

  it("run LOCAL_AI tidak membuat scheduler berikutnya dilewati karena interval", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: { content: JSON.stringify(analysis) } })));
    await runLocalAnalysis();
    const s = await runDiscovery({ trigger: "SCHEDULER", executionId: "after-local", provider: new OnePost(), now: () => NOW, skipAi: true });
    expect(s.status).toBe("SUCCEEDED");
  });

  it("worker tanpa OLLAMA_BASE_URL gagal dengan alasan jelas", async () => {
    const s = await runLocalAnalysis();
    expect(s.status).toBe("FAILED");
    expect(s.error).toMatch(/worker lokal/);
  });

  it("Ollama mati: lead tetap pending dengan pesan yang jelas, batch berhenti", async () => {
    await runDiscovery({ trigger: "MANUAL", provider: new OnePost(), now: () => NOW });
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("fetch failed")));
    const s = await runLocalAnalysis();
    expect(s.status).toBe("PARTIAL");
    const lead = await db.lead.findFirstOrThrow();
    // Tetap di antrian agar dicoba lagi saat Ollama hidup.
    expect(lead.analysisStatus).toBe('PENDING');
    expect(lead.analysisError).toMatch(/Ollama tidak bisa dihubungi/);
  });
});

describe("triage dua tahap", () => {
  async function setup(triageReply: typeof triage) {
    triage = triageReply;
    await setSetting("ai", { ...DEFAULT_SETTINGS.ai, provider: "ollama", ollamaModel: "qwen2.5:7b", ollamaTriageModel: "qwen2.5:1.5b", triageMinRelevance: 40 });
    await runDiscovery({ trigger: "MANUAL", provider: new OnePost(), now: () => NOW });
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    const models: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      return new Response(JSON.stringify({ model: body.model, message: { content: JSON.stringify(fakeOllamaReply(body)) } }));
    });
    return models;
  }

  it("kandidat tidak relevan berhenti di model kecil, model 7B tidak dipanggil", async () => {
    const models = await setup({ intent: "JOB_VACANCY", isServiceRequest: false, relevance: 10, confidence: 0.9, reason: "Lowongan kerja" });
    const s = await runLocalAnalysis();
    expect(models).toEqual(["qwen2.5:1.5b"]);
    expect(s.counters.draftsGenerated).toBe(0);
    const a = await db.leadAnalysis.findFirstOrThrow();
    expect(a.stage).toBe("TRIAGE");
    expect(a.leadScore).toBeLessThanOrEqual(39);
    expect(a.intent).toBe("JOB_VACANCY");
  });

  it("prospek relevan diteruskan ke 7B untuk analisis + draft dalam satu panggilan", async () => {
    const models = await setup({ intent: "SERVICE_REQUEST", isServiceRequest: true, relevance: 85, confidence: 0.8, reason: "Cari jasa website" });
    const s = await runLocalAnalysis();
    expect(models).toEqual(["qwen2.5:1.5b", "qwen2.5:7b"]);
    expect(s.counters.draftsGenerated).toBe(3);
    const a = await db.leadAnalysis.findFirstOrThrow();
    expect(a.stage).toBe("FULL");
    expect(a.guardNotes[0]).toMatch(/Triage .*diteruskan/);
  });

  it("draft dari model diabaikan bila guard menilai bukan permintaan jasa", async () => {
    await setSetting("ai", { ...DEFAULT_SETTINGS.ai, provider: "ollama", ollamaModel: "qwen2.5:7b" });
    await runDiscovery({ trigger: "MANUAL", provider: new OnePost(), now: () => NOW });
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ message: { content: JSON.stringify({ ...analysis, intent: "JOB_VACANCY", ...drafts }) } })),
    );
    const s = await runLocalAnalysis();
    expect(s.counters.draftsGenerated).toBe(0);
    expect(await db.messageDraft.count()).toBe(0);
  });
});
