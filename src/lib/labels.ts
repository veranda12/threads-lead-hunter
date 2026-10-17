export const RUN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "Sedang berjalan",
  SUCCEEDED: "Berhasil",
  PARTIAL: "Berhasil sebagian",
  FAILED: "Gagal",
  SKIPPED_LOCKED: "Dilewati, run lain aktif",
  SKIPPED_DISABLED: "Dilewati, discovery nonaktif",
  SKIPPED_INTERVAL: "Dilewati, belum lewat interval",
};

export const RUN_TRIGGER_LABELS: Record<string, string> = {
  SCHEDULER: "Scheduler",
  MANUAL: "Manual",
  WORKER: "Worker",
  LOCAL_AI: "Worker AI lokal",
};

export const KEYWORD_CATEGORY_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  ENTERPRISE_SOFTWARE: "Software enterprise",
  GENERAL: "Umum",
  TECHNICAL: "Teknis",
};

export const ACTIVITY_LABELS: Record<string, string> = {
  DISCOVERED: "Ditemukan",
  IMPORTED: "Diimpor",
  ANALYZED: "Dianalisis",
  STATUS_CHANGED: "Status",
  NOTE_ADDED: "Catatan",
  DRAFT_GENERATED: "Draft",
  DRAFT_EDITED: "Draft diedit",
  DRAFT_FAVORITED: "Favorit",
  CONTACTED: "Dihubungi",
  FOLLOW_UP_SET: "Follow-up",
  CONTENT_UPDATED: "Konten berubah",
};

export const URGENCY_LABELS: Record<string, string> = { HIGH: "Mendesak", MEDIUM: "Sedang", LOW: "Tidak mendesak", UNKNOWN: "Tidak diketahui" };
export const COMPLEXITY_LABELS: Record<string, string> = { SIMPLE: "Sederhana", MODERATE: "Menengah", COMPLEX: "Kompleks", UNKNOWN: "Belum jelas" };
