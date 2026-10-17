export type Priority = "HIGH" | "MEDIUM" | "LOW" | "IGNORE";

export const PRIORITY_BANDS: { priority: Priority; min: number; label: string }[] = [
  { priority: "HIGH", min: 80, label: "Prioritas tinggi" },
  { priority: "MEDIUM", min: 60, label: "Prioritas sedang" },
  { priority: "LOW", min: 40, label: "Prioritas rendah" },
  { priority: "IGNORE", min: 0, label: "Abaikan" },
];

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function priorityFromScore(score: number): Priority {
  const s = clampScore(score);
  return PRIORITY_BANDS.find((b) => s >= b.min)!.priority;
}

export function priorityLabel(p: Priority | null | undefined): string {
  if (!p) return "Belum dinilai";
  return PRIORITY_BANDS.find((b) => b.priority === p)!.label;
}

export const INTENT_LABELS: Record<string, string> = {
  SERVICE_REQUEST: "Mencari jasa developer",
  VENDOR_RECOMMENDATION: "Minta rekomendasi vendor",
  PRICE_INQUIRY: "Menanyakan estimasi biaya",
  PARTNER_SEARCH: "Mencari partner proyek",
  JOB_VACANCY: "Lowongan karyawan",
  SELF_PROMOTION: "Developer menawarkan jasa",
  PROMOTION: "Postingan promosi",
  GENERAL_DISCUSSION: "Diskusi umum",
  SPAM: "Spam",
  IRRELEVANT: "Tidak relevan",
};

/** Intent yang dianggap permintaan jasa aktif dan boleh mendapat skor tinggi. */
export const SERVICE_INTENTS = new Set(["SERVICE_REQUEST", "VENDOR_RECOMMENDATION", "PRICE_INQUIRY", "PARTNER_SEARCH"]);
