import type { AnalysisOutput } from "@/lib/ai/schemas";
import { clampScore, priorityFromScore, SERVICE_INTENTS, type Priority } from "@/lib/leads/scoring";
import { normalizeText } from "@/lib/discovery/normalize";
import { formatRupiah, UNPRICED_PHRASE } from "@/lib/pricing/format";

// Guard deterministik setelah output Claude. AI boleh salah; aturan bisnis tidak.

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /abaikan (semua )?(instruksi|perintah|aturan)/i,
  /\bsystem prompt\b/i,
  /you are now\b/i,
  /kamu sekarang adalah/i,
  /(set|give|beri|berikan) (the )?(lead ?score|skor)/i,
  /\b(api[_ ]?key|secret|password|token)\b.*\b(show|print|tampilkan|kirim|reveal)\b/i,
  /<\/?(system|assistant|untrusted_post|instructions?)>/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export type GuardedAnalysis = Omit<AnalysisOutput, "leadScore" | "confidence"> & {
  leadScore: number;
  confidence: number;
  priority: Priority;
  guardNotes: string[];
};

function looselyContains(haystack: string, needle: string): boolean {
  const norm = (s: string) => normalizeText(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const n = norm(needle);
  return n.length >= 2 && norm(haystack).includes(n);
}

export function applyAnalysisGuards(
  output: AnalysisOutput,
  ctx: { postText: string; serviceSlugs: string[] },
): GuardedAnalysis {
  const notes: string[] = [];
  let score = clampScore(output.leadScore);
  let confidence = Number.isFinite(output.confidence) ? Math.max(0, Math.min(1, output.confidence)) : 0;
  if (confidence !== output.confidence) notes.push("confidence di-clamp ke rentang 0-1");
  if (score !== output.leadScore) notes.push("leadScore di-clamp ke rentang 0-100");

  let isServiceRequest = output.isServiceRequest;
  const redFlags = [...output.redFlags].map((f) => f.slice(0, 200)).slice(0, 8);

  // Budget hanya boleh berasal dari kata-kata penulis yang benar-benar ada di postingan.
  let budgetType = output.budgetType;
  let possibleBudget = output.possibleBudget?.trim() || null;
  let budgetEvidence = output.budgetEvidence?.trim() || null;
  if (budgetType === "STATED_BY_AUTHOR") {
    if (!budgetEvidence || !looselyContains(ctx.postText, budgetEvidence)) {
      notes.push("Budget dibuang: kutipan bukti tidak ditemukan di teks postingan");
      budgetType = "NOT_MENTIONED";
      possibleBudget = null;
      budgetEvidence = null;
    }
  } else {
    possibleBudget = null;
    budgetEvidence = null;
  }

  let estimatedService = output.estimatedService;
  if (estimatedService && !ctx.serviceSlugs.includes(estimatedService)) {
    notes.push(`estimatedService "${estimatedService}" tidak ada di katalog`);
    estimatedService = null;
  }

  if (!SERVICE_INTENTS.has(output.intent)) {
    if (isServiceRequest) notes.push(`isServiceRequest dipaksa false untuk intent ${output.intent}`);
    isServiceRequest = false;
  }
  if (!isServiceRequest && score > 39) {
    notes.push("Skor dibatasi 39 karena bukan permintaan jasa");
    score = 39;
  }
  if (confidence < 0.5 && score > 59) {
    notes.push("Skor dibatasi 59 karena confidence rendah (postingan ambigu)");
    score = 59;
  }

  const injected = output.promptInjectionDetected || detectPromptInjection(ctx.postText);
  if (injected) {
    redFlags.unshift("Postingan berisi teks yang mencoba memberi instruksi ke sistem");
    if (score > 59) {
      notes.push("Skor dibatasi 59 karena indikasi prompt injection");
      score = 59;
    }
    confidence = Math.min(confidence, 0.6);
  }

  return {
    ...output,
    isServiceRequest,
    confidence,
    leadScore: score,
    priority: priorityFromScore(score),
    budgetType,
    possibleBudget,
    budgetEvidence,
    estimatedService,
    redFlags,
    promptInjectionDetected: injected,
    qualificationReason: output.qualificationReason.slice(0, 1000),
    recommendedApproach: output.recommendedApproach.slice(0, 1000),
    nextQuestion: output.nextQuestion?.slice(0, 300) ?? null,
    guardNotes: notes,
  };
}

// ---------------------------------------------------------------
// DM draft guards
// ---------------------------------------------------------------

/** Ganti em dash / en dash yang dilarang di DM. */
export function sanitizeDraft(body: string): string {
  return body
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/\s*–\s*/g, " - ")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const RUPIAH_PATTERN = /\b(?:rp\.?\s?)(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s?(rb|ribu|k|jt|juta))?/gi;

function parseRupiahMention(digits: string, suffix?: string): number {
  const n = Number(digits.replace(/[.,]/g, ""));
  const s = suffix?.toLowerCase();
  if (s === "rb" || s === "ribu" || s === "k") return n * 1000;
  if (s === "jt" || s === "juta") return n * 1_000_000;
  return n;
}

// Istilah domain/teknologi. Setiap istilah yang muncul dalam klaim "saya pernah ..." wajib ada di pengalaman profil.
// Disusun per konsep agar sinonim (kasir = POS, gudang = inventory) dihitung sama.
const DOMAIN_TERMS: { concept: string; pattern: RegExp }[] = [
  { concept: "website", pattern: /\b(website|web|landing ?page|company profile|compro|situs)\b/i },
  { concept: "ecommerce", pattern: /\b(e-?commerce|toko online|marketplace)\b/i },
  { concept: "mobile", pattern: /\b(mobile|android|ios|flutter|aplikasi hp)\b/i },
  { concept: "inventory", pattern: /\b(inventory|inventori|gudang|warehouse|stok)\b/i },
  { concept: "pos", pattern: /\b(pos|kasir|point of sale)\b/i },
  { concept: "accounting", pattern: /\b(accounting|akuntansi|pembukuan)\b/i },
  { concept: "finance", pattern: /\b(keuangan|finansial|financial|pembiayaan|batch processing)\b/i },
  { concept: "payment", pattern: /\b(payment|pembayaran|gateway|qris|virtual account)\b/i },
  { concept: "erp", pattern: /\b(erp)\b/i },
  { concept: "hris", pattern: /\b(hris|payroll|penggajian|absensi|kepegawaian)\b/i },
  { concept: "crm", pattern: /\b(crm)\b/i },
  { concept: "booking", pattern: /\b(booking|reservasi)\b/i },
  { concept: "koperasi", pattern: /\b(koperasi|simpan pinjam)\b/i },
  { concept: "logistics", pattern: /\b(logistik|logistics|freight|ekspedisi|procurement)\b/i },
  { concept: "laravel", pattern: /\b(laravel|php)\b/i },
  { concept: "wordpress", pattern: /\b(wordpress)\b/i },
  { concept: "java", pattern: /\b(java|spring)\b/i },
  { concept: "nextjs", pattern: /\b(next\.?js|react)\b/i },
  { concept: "integration", pattern: /\b(integrasi|integration|mengintegrasikan|api)\b/i },
];

function conceptsIn(text: string): Set<string> {
  return new Set(DOMAIN_TERMS.filter((t) => t.pattern.test(text)).map((t) => t.concept));
}

// Penanda klaim tentang diri pengirim. "pernah"/"pengalaman" = klaim pengalaman (harus ada di daftar pengalaman);
// "biasa/sering mengerjakan" = klaim keahlian (boleh dari keahlian atau pengalaman).
const EXPERIENCE_MARKER = /\b(?:saya (?:sudah )?pernah|(?:memiliki |punya )?pengalaman(?: saya)?|berpengalaman)\b([^.,!?;\n]*)/gi;
const SKILL_MARKER = /\bsaya (?:biasa|sering|terbiasa) (?:mengerjakan|menangani|membuat|bikin|membangun)\b([^.,!?;\n]*)/gi;

/**
 * Klaim tentang diri pengirim harus bisa dirujuk ke profil: setiap konsep domain dalam klausa klaim
 * wajib ada di profil. Klaim "saya pernah ..." tanpa konsep domain apa pun (mis. "pernah menangani
 * proyek serupa") dianggap tidak bisa dibuktikan.
 */
export function unsupportedExperienceClaims(body: string, experiences: string[], skills: string[] = []): string[] {
  const expConcepts = conceptsIn(experiences.join(" \n "));
  const skillConcepts = new Set([...expConcepts, ...conceptsIn(skills.join(" \n "))]);
  // Keahlian yang secara langsung mencakup jenis pekerjaan tertentu.
  if (skillConcepts.has("nextjs")) skillConcepts.add("website");
  if (skillConcepts.has("java")) skillConcepts.add("integration");
  const bad: string[] = [];
  for (const m of body.matchAll(EXPERIENCE_MARKER)) {
    const clause = `${m[0]}`.trim();
    const concepts = conceptsIn(m[1]);
    if (concepts.size === 0) {
      if (/pernah/i.test(m[0]) && m[1].trim().length > 0) bad.push(clause);
      continue;
    }
    if ([...concepts].some((c) => !expConcepts.has(c))) bad.push(clause);
  }
  for (const m of body.matchAll(SKILL_MARKER)) {
    const concepts = conceptsIn(m[1]);
    if ([...concepts].some((c) => !skillConcepts.has(c))) bad.push(m[0].trim());
  }
  return bad;
}

export function validateDraft(body: string, ctx: { allowedPrices: number[]; maxLength?: number; experiences?: string[]; skills?: string[] }): string[] {
  const issues: string[] = [];
  const maxLength = ctx.maxLength ?? 900;
  if (/[—―–]/.test(body)) issues.push("Mengandung em dash");
  const questions = (body.match(/\?/g) ?? []).length;
  if (questions > 1) issues.push(`Berisi ${questions} pertanyaan (maksimal satu)`);
  if (body.length > maxLength) issues.push(`Terlalu panjang (${body.length} karakter)`);
  if (body.trim().length < 40) issues.push("Terlalu pendek");
  for (const m of body.matchAll(RUPIAH_PATTERN)) {
    const amount = parseRupiahMention(m[1], m[2]);
    if (!ctx.allowedPrices.includes(amount)) {
      issues.push(`Menyebut harga ${formatRupiah(amount)} yang tidak ada di konfigurasi`);
    }
  }
  if (/\b(testimoni|klien kami yang puas|sudah dipercaya \d+)/i.test(body)) issues.push("Berpotensi mengarang testimoni");
  // Pengirim adalah freelancer perorangan; "kami" menyiratkan tim/perusahaan yang tidak ada.
  if (/\b(kami|tim kami)\b/i.test(body)) issues.push('Memakai "kami"; pengirim perorangan, gunakan "saya"');
  if (/\b(gratis|free|diskon|discount|garansi|promo)\b/i.test(body)) issues.push("Menjanjikan penawaran (gratis/diskon/garansi) yang tidak ada di konfigurasi");
  if (/\b(menurut|berdasarkan) analisis\b/i.test(body)) issues.push("Menyebut analisis internal kepada calon klien");
  if (ctx.experiences) {
    for (const claim of unsupportedExperienceClaims(body, ctx.experiences, ctx.skills)) {
      issues.push(`Klaim pengalaman/keahlian tidak ada di profil: "${claim.slice(0, 90)}"`);
    }
  }
  return issues;
}

export { UNPRICED_PHRASE };

/**
 * Keputusan lolos triage. Diteruskan ke model utama bila classifier menilai ini permintaan jasa,
 * atau classifier sendiri ragu (confidence rendah) tapi relevansinya cukup. Intent non-jasa yang
 * yakin (lowongan, promosi, spam) berhenti di sini walau relevansinya tinggi.
 */
export function triagePasses(t: { intent: string; isServiceRequest: boolean; relevance: number; confidence: number }, minRelevance: number): boolean {
  if (t.isServiceRequest || SERVICE_INTENTS.has(t.intent)) return true;
  return t.confidence < 0.6 && clampScore(t.relevance) >= minRelevance;
}
