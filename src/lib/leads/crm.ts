export const LEAD_STATUSES = [
  "NEW",
  "REVIEWED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Baru",
  REVIEWED: "Sudah ditinjau",
  CONTACTED: "Sudah dihubungi",
  REPLIED: "Membalas",
  QUALIFIED: "Terkualifikasi",
  PROPOSAL_SENT: "Proposal terkirim",
  NEGOTIATION: "Negosiasi",
  WON: "Deal",
  LOST: "Tidak jadi",
  ARCHIVED: "Diarsipkan",
};

/** Status yang sudah melibatkan percakapan dengan prospek. Freshness tidak boleh menyembunyikannya. */
export const ENGAGED_STATUSES: LeadStatus[] = ["CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON"];

// Transisi yang diizinkan. Mundur satu langkah diizinkan untuk koreksi input,
// LOST dan ARCHIVED bisa dibuka kembali, WON hanya bisa diarsipkan atau dikoreksi ke NEGOTIATION.
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["REVIEWED", "CONTACTED", "ARCHIVED", "LOST"],
  REVIEWED: ["NEW", "CONTACTED", "ARCHIVED", "LOST"],
  CONTACTED: ["REVIEWED", "REPLIED", "LOST", "ARCHIVED"],
  REPLIED: ["CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "LOST", "ARCHIVED"],
  QUALIFIED: ["REPLIED", "PROPOSAL_SENT", "NEGOTIATION", "LOST", "ARCHIVED"],
  PROPOSAL_SENT: ["QUALIFIED", "NEGOTIATION", "WON", "LOST", "ARCHIVED"],
  NEGOTIATION: ["PROPOSAL_SENT", "WON", "LOST", "ARCHIVED"],
  WON: ["NEGOTIATION", "ARCHIVED"],
  LOST: ["NEW", "REVIEWED", "CONTACTED", "ARCHIVED"],
  ARCHIVED: ["NEW", "REVIEWED", "CONTACTED"],
};

export function allowedTransitions(from: LeadStatus): LeadStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

export function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transisi status ${STATUS_LABELS[from]} ke ${STATUS_LABELS[to]} tidak diizinkan`);
  }
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/** Kolom pipeline untuk tampilan Kanban (ARCHIVED tidak ditampilkan sebagai kolom). */
export const PIPELINE_COLUMNS: LeadStatus[] = [
  "NEW",
  "REVIEWED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];
