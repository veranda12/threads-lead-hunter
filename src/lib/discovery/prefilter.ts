import { normalizeText } from "@/lib/discovery/normalize";

// Pre-filter heuristik sebelum Claude API. Tujuannya membuang yang jelas tidak relevan
// (lowongan, promosi jasa sendiri, spam) dengan biaya nol. Keputusan akhir tetap di AI.

type Signal = { pattern: RegExp; weight: number; label: string };

const REQUEST_SIGNALS: Signal[] = [
  { pattern: /\b(cari|nyari|mencari|lagi cari|lg cari)\b/, weight: 22, label: "mencari" },
  { pattern: /\b(butuh|perlu|membutuhkan|butuhin|need|needed|looking for|seeking)\b/, weight: 22, label: "butuh" },
  { pattern: /\b(ada yang bisa|ada yg bisa|siapa yang bisa|siapa yg bisa|bisa bikinin|bisa buatin|bikinin|buatin)\b/, weight: 24, label: "minta dibuatkan" },
  { pattern: /\b(rekomendasi|rekomen|recommend|saran|referensi|recommendation)\b/, weight: 18, label: "rekomendasi" },
  { pattern: /\b(berapa (biaya|harga|budget|ongkos)|kisaran (harga|biaya)|estimasi (biaya|harga)|how much)\b/, weight: 22, label: "tanya biaya" },
  { pattern: /\b(hire|hiring a|outsource|vendor|software house|freelancer?|jasa)\b/, weight: 12, label: "jasa/vendor" },
  { pattern: /\b(pake|pakai|enaknya) jasa\b|\bjasa siapa\b/, weight: 14, label: "memilih jasa" },
  { pattern: /\b(cari|nyari|mencari|butuh) (partner|co-?founder|cto)\b|\bpartner teknis\b/, weight: 18, label: "cari partner teknis" },
  { pattern: /\?/, weight: 6, label: "pertanyaan" },
];

const DOMAIN_SIGNALS: Signal[] = [
  { pattern: /\b(website|web|landing ?page|company profile|compro|toko online|e-?commerce|katalog)\b/, weight: 18, label: "website" },
  { pattern: /\b(aplikasi|app|apps|sistem|system|software|platform|dashboard)\b/, weight: 14, label: "aplikasi" },
  { pattern: /\b(erp|hris|payroll|pos|kasir|inventory|inventori|gudang|warehouse|accounting|akuntansi|crm|procurement|koperasi|simpan pinjam)\b/, weight: 20, label: "enterprise" },
  { pattern: /\b(developer|programmer|dev|engineer|coder|web developer|fullstack|backend|frontend)\b/, weight: 12, label: "developer" },
  { pattern: /\b(api|payment gateway|integrasi|integration|spring boot|next\.?js|react|database)\b/, weight: 10, label: "teknis" },
];

const NEGATIVE_SIGNALS: Signal[] = [
  { pattern: /\b(lowongan|loker|we are hiring|we're hiring|kami membuka|dibuka lowongan|full ?time|kirim cv|send (your )?cv|apply now|gaji|salary)\b/, weight: -40, label: "lowongan kerja" },
  { pattern: /\b(menerima jasa|terima jasa|open order|open jasa|jasa kami|kami menyediakan|melayani pembuatan|order sekarang|hubungi kami|slot terbatas|harga mulai|promo|diskon)\b/, weight: -45, label: "promosi jasa" },
  { pattern: /\b(dm (aja|for|me)|cek bio|link (di|in) bio|portfolio saya|klien saya)\b/, weight: -25, label: "self-promotion" },
  { pattern: /\bslot (bulan|minggu) (depan|ini)\b|\bslot (masih|tersisa)\b|\bportfolio di bio\b|\bbuat yang butuh\b/, weight: -40, label: "menawarkan slot jasa" },
  { pattern: /\b(aplikasi|app|software|tools?) (yang )?(gratis|gratisan|free)\b|\bnggak perlu custom\b|\btidak perlu custom\b/, weight: -35, label: "cari tools gratis siap pakai" },
  { pattern: /\b(giveaway|judi|slot gacor|togel|pinjol|crypto pump|airdrop)\b/, weight: -80, label: "spam" },
];

export type PrefilterResult = {
  score: number;
  pass: boolean;
  reason: string;
  matched: string[];
};

export function prefilterPost(rawText: string, threshold = 35): PrefilterResult {
  const text = normalizeText(rawText).toLowerCase();
  if (text.length < 12) {
    return { score: 0, pass: false, reason: "Teks terlalu pendek untuk dianalisis", matched: [] };
  }
  const matched: string[] = [];
  let request = 0;
  let domain = 0;
  let negative = 0;
  for (const s of REQUEST_SIGNALS) if (s.pattern.test(text)) { request += s.weight; matched.push(s.label); }
  for (const s of DOMAIN_SIGNALS) if (s.pattern.test(text)) { domain += s.weight; matched.push(s.label); }
  for (const s of NEGATIVE_SIGNALS) if (s.pattern.test(text)) { negative += s.weight; matched.push(`-${s.label}`); }

  // Butuh sinyal permintaan DAN sinyal domain; salah satu saja belum cukup.
  const base = Math.min(request, 50) + Math.min(domain, 45);
  const score = Math.max(0, Math.min(100, (request > 0 && domain > 0 ? base : Math.min(base, 25)) + negative));
  const pass = score >= threshold;

  let reason: string;
  if (negative <= -40 && !pass) reason = `Terindikasi ${matched.filter((m) => m.startsWith("-")).map((m) => m.slice(1)).join(", ")}`;
  else if (request === 0) reason = "Tidak ada sinyal permintaan jasa";
  else if (domain === 0) reason = "Tidak menyebut kebutuhan website atau software";
  else reason = pass ? "Lolos pre-filter" : "Sinyal terlalu lemah";

  return { score, pass, reason, matched };
}
