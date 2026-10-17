// Benchmark AI lokal: pre-filter, triage per model, dan satu panggilan gabungan 7B.
// Memakai data sintetis tests/fixtures/eval-posts.json; tidak membaca/menulis database.
//   npm run eval:local-ai -- --triage=qwen2.5:1.5b,qwen2.5:3b,qwen2.5:7b --full=qwen2.5:7b --full-samples=3
import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { prefilterPost } from "../src/lib/discovery/prefilter";
import { ollamaStructuredChat } from "../src/lib/ai/ollama";
import { triageOutputSchema, combinedOutputSchema } from "../src/lib/ai/schemas";
import {
  buildTriageSystemPrompt,
  buildTriageUserMessage,
  buildCombinedSystemPrompt,
  buildCombinedUserMessage,
  type CatalogEntry,
} from "../src/lib/ai/prompts";
import { applyAnalysisGuards, sanitizeDraft, triagePasses, validateDraft } from "../src/lib/ai/guards";
import { clampScore } from "../src/lib/leads/scoring";

type Post = { id: string; label: boolean; kind: string; text: string };

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const TRIAGE_MODELS = arg("triage", "qwen2.5:1.5b,qwen2.5:3b,qwen2.5:7b").split(",").filter(Boolean);
const FULL_MODEL = arg("full", "qwen2.5:7b");
const FULL_SAMPLES = Number(arg("full-samples", "3"));
const MIN_RELEVANCE = Number(arg("min-relevance", "40"));

const posts: Post[] = JSON.parse(readFileSync("tests/fixtures/eval-posts.json", "utf8")).posts;

// Katalog dan profil contoh agar prompt gabungan berukuran realistis (sama strukturnya dengan produksi).
const catalog: CatalogEntry[] = [
  { slug: "landing-page", name: "Landing page", category: "WEBSITE", description: null, priceText: "mulai Rp 300.000", priced: true },
  ...["company-profile", "website-katalog", "website-umkm", "ecommerce-custom", "website-booking"].map((slug) => ({ slug, name: slug, category: "WEBSITE", description: null, priceText: "", priced: false })),
  ...["erp", "hris", "payroll", "pos", "inventory", "accounting", "koperasi", "custom-enterprise"].map((slug) => ({ slug, name: slug.toUpperCase(), category: "ENTERPRISE_SOFTWARE", description: null, priceText: "", priced: false })),
  ...["backend-api", "payment-gateway", "api-integration", "maintenance"].map((slug) => ({ slug, name: slug, category: "TECHNICAL_SERVICE", description: null, priceText: "", priced: false })),
];
const profile = {
  displayName: "",
  headline: "Software Engineer dengan pengalaman lebih dari 5 tahun",
  skills: ["Java Spring Boot", "Next.js", "React", "PostgreSQL", "Payment gateway integration", "POS dan accounting"],
  experiences: [
    "Pengembangan sistem keuangan dan batch processing perusahaan pembiayaan dengan cakupan 98 cabang",
    "Pengembangan dan integrasi sistem POS",
    "Pengembangan sistem accounting",
    "Integrasi direct payment gateway",
  ],
  portfolioUrl: "https://www.rencodeinovasi.dpdns.org/",
};

async function gpuSplit(model: string): Promise<string> {
  const res = await fetch(`${BASE}/api/ps`).then((r) => r.json() as Promise<{ models?: { name: string; size: number; size_vram: number }[] }>);
  const m = res.models?.find((x) => x.name === model);
  if (!m) return "tidak termuat";
  const gpu = Math.round((m.size_vram / m.size) * 100);
  return `${gpu}% GPU / ${100 - gpu}% CPU`;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} dtk`;

async function main() {
  const report: Record<string, unknown> = { date: new Date().toISOString(), posts: posts.length };
  console.log(`Benchmark AI lokal, ${posts.length} postingan sintetis (${posts.filter((p) => p.label).length} positif)\n`);

  // 1. Pre-filter tanpa AI
  const pf = posts.map((p) => ({ ...p, pass: prefilterPost(p.text).pass }));
  const pfTp = pf.filter((p) => p.label && p.pass).length;
  const pfTn = pf.filter((p) => !p.label && !p.pass).length;
  console.log("1. Pre-filter (tanpa AI)");
  console.log(`   Positif lolos ${pfTp}/12 (${pct(pfTp, 12)}), negatif tersaring ${pfTn}/12 (${pct(pfTn, 12)})`);
  console.log(`   Positif yang terbuang: ${pf.filter((p) => p.label && !p.pass).map((p) => p.id).join(", ") || "-"}`);
  console.log(`   Negatif yang lolos ke AI: ${pf.filter((p) => !p.label && p.pass).map((p) => p.id).join(", ") || "-"}\n`);
  report.prefilter = { truePositive: pfTp, trueNegative: pfTn, missed: pf.filter((p) => p.label && !p.pass).map((p) => p.id) };

  // 2. Triage per model (semua postingan, untuk menilai model itu sendiri)
  const triageResults: Record<string, unknown>[] = [];
  console.log(`2. Triage (lolos = intent permintaan jasa, atau ragu dengan relevansi >= ${MIN_RELEVANCE})`);
  for (const model of TRIAGE_MODELS) {
    let tp = 0,
      tn = 0,
      failures = 0,
      totalMs = 0;
    const wrong: string[] = [];
    // Panggilan pertama memuat model ke memori; dicatat terpisah.
    const warm = Date.now();
    await ollamaStructuredChat({ baseUrl: BASE, model, system: buildTriageSystemPrompt(), user: buildTriageUserMessage("halo"), schema: triageOutputSchema, maxTokens: 120, numCtx: 2048 }).catch(() => null);
    const loadMs = Date.now() - warm;
    const split = await gpuSplit(model);
    for (const p of posts) {
      const t0 = Date.now();
      try {
        const r = await ollamaStructuredChat({
          baseUrl: BASE,
          model,
          system: buildTriageSystemPrompt(),
          user: buildTriageUserMessage(p.text),
          schema: triageOutputSchema,
          maxTokens: 200,
          numCtx: 2048,
        });
        const pass = triagePasses(r.data, MIN_RELEVANCE);
        if (pass === p.label) {
          if (p.label) tp++;
          else tn++;
        } else wrong.push(`${p.id}(${p.kind}: ${r.data.intent}, rel ${clampScore(r.data.relevance)})`);
      } catch (e) {
        failures++;
        wrong.push(`${p.id}(error: ${(e as Error).message.slice(0, 60)})`);
      }
      totalMs += Date.now() - t0;
    }
    const row = { model, gpu: split, loadMs, avgMs: Math.round(totalMs / posts.length), recall: `${tp}/12`, specificity: `${tn}/12`, accuracy: pct(tp + tn, posts.length), failures, wrong };
    triageResults.push(row);
    console.log(`   ${model}: ${split}, muat ${sec(loadMs)}, rata-rata ${sec(row.avgMs)}/postingan`);
    console.log(`      recall positif ${tp}/12, negatif benar ${tn}/12, akurasi ${row.accuracy}, error ${failures}`);
    if (wrong.length) console.log(`      salah: ${wrong.join("; ")}`);
  }
  report.triage = triageResults;

  // 3. Satu panggilan gabungan (analisis + skor + 3 draft) dengan model utama
  console.log(`\n3. Panggilan gabungan ${FULL_MODEL} (analisis + skor + 3 draft) pada ${FULL_SAMPLES} prospek`);
  const fullRows: Record<string, unknown>[] = [];
  const sys = buildCombinedSystemPrompt(catalog, profile, 60);
  for (const p of posts.filter((x) => x.label).slice(0, FULL_SAMPLES)) {
    const t0 = Date.now();
    try {
      const r = await ollamaStructuredChat({
        baseUrl: BASE,
        model: FULL_MODEL,
        system: sys,
        user: buildCombinedUserMessage({ text: p.text, username: "contoh", postedAtIso: null, matchedKeyword: null, bannedOpenings: [] }),
        schema: combinedOutputSchema,
        maxTokens: 2500,
        numCtx: 6144,
      });
      const ms = Date.now() - t0;
      const g = applyAnalysisGuards(r.data, { postText: p.text, serviceSlugs: catalog.map((c) => c.slug) });
      const drafts = r.data.drafts.map((d) => ({ tone: d.tone, body: sanitizeDraft(d.body) }));
      const issues = drafts.flatMap((d) => validateDraft(d.body, { allowedPrices: [300_000], experiences: profile.experiences, skills: profile.skills }).map((i) => `${d.tone}: ${i}`));
      const row = { id: p.id, ms, input: r.usage.inputTokens, output: r.usage.outputTokens, intent: g.intent, score: g.leadScore, service: g.estimatedService, drafts: drafts.length, issues, sample: drafts[0]?.body };
      fullRows.push(row);
      console.log(`   ${p.id}: ${sec(ms)}, token ${r.usage.inputTokens}/${r.usage.outputTokens}, ${g.intent} skor ${g.leadScore} layanan ${g.estimatedService ?? "-"}, ${drafts.length} draft, ${issues.length} masalah`);
      if (issues.length) console.log(`      ${issues.join("; ")}`);
      if (drafts[0]) console.log(`      contoh: ${drafts[0].body}`);
    } catch (e) {
      fullRows.push({ id: p.id, error: (e as Error).message });
      console.log(`   ${p.id}: gagal, ${(e as Error).message}`);
    }
  }
  console.log(`   Porsi GPU ${FULL_MODEL} (num_ctx 6144): ${await gpuSplit(FULL_MODEL)}`);
  report.full = { model: FULL_MODEL, rows: fullRows };

  mkdirSync("logs", { recursive: true });
  const out = `logs/eval-local-ai-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nHasil lengkap: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
