// Aturan waktu dan freshness. Semua perhitungan memakai epoch milliseconds (UTC).

export const FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Toleransi selisih jam server vs provider. Timestamp di atas ini dianggap dari masa depan. */
export const FUTURE_SKEW_TOLERANCE_MS = 2 * 60 * 1000;
export const DISPLAY_TIMEZONE = "Asia/Jakarta";

export type Freshness = "FRESH" | "EXPIRED" | "UNKNOWN";

export type TimestampCheck =
  | { ok: true; postedAt: Date; ageMs: number }
  | { ok: false; reason: "INVALID_TIMESTAMP" | "FUTURE_TIMESTAMP" | "STALE"; detail: string; postedAt?: Date };

// ISO 8601 dengan zona eksplisit: Z, +07:00, atau +0700 (format Threads API: 2023-10-17T05:42:03+0000).
const ISO_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parse timestamp dari provider secara ketat. Timestamp tanpa zona waktu ditolak karena
 * maknanya bergantung pada timezone mesin, yang tidak bisa diverifikasi.
 */
export function parseProviderTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Unix detik vs milidetik
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m = ISO_WITH_ZONE.exec(trimmed);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2, 4));
    if (oh > 14 || om > 59) return null;
    offsetMinutes = sign * (oh * 60 + om);
  }
  const ms = frac ? Math.round(Number(`0${frac}`) * 1000) : 0;
  const utc = Date.UTC(Number(y), month - 1, day, hour, minute, second, ms) - offsetMinutes * 60_000;
  const date = new Date(utc);
  // Tolak tanggal yang "meluber" (mis. 31 Februari)
  const check = new Date(Date.UTC(Number(y), month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeCutoff(now: Date, windowMs = FRESHNESS_WINDOW_MS): Date {
  return new Date(now.getTime() - windowMs);
}

/**
 * Validasi timestamp postingan terhadap waktu eksekusi aktual.
 * Batas inklusif: umur tepat 6 jam masih FRESH, 6 jam + 1 ms sudah STALE.
 */
export function checkPostTimestamp(raw: unknown, now: Date, windowMs = FRESHNESS_WINDOW_MS): TimestampCheck {
  const postedAt = parseProviderTimestamp(raw);
  if (!postedAt) {
    return { ok: false, reason: "INVALID_TIMESTAMP", detail: `Timestamp tidak valid: ${String(raw).slice(0, 64)}` };
  }
  const ageMs = now.getTime() - postedAt.getTime();
  if (ageMs < -FUTURE_SKEW_TOLERANCE_MS) {
    return { ok: false, reason: "FUTURE_TIMESTAMP", detail: "Timestamp berada di masa depan", postedAt };
  }
  if (ageMs > windowMs) {
    return { ok: false, reason: "STALE", detail: "Postingan lebih lama dari jendela freshness", postedAt };
  }
  return { ok: true, postedAt, ageMs: Math.max(0, ageMs) };
}

export function freshnessOf(postedAt: Date | null | undefined, now: Date, windowMs = FRESHNESS_WINDOW_MS): Freshness {
  if (!postedAt) return "UNKNOWN";
  const age = now.getTime() - postedAt.getTime();
  if (age < -FUTURE_SKEW_TOLERANCE_MS) return "UNKNOWN";
  return age <= windowMs ? "FRESH" : "EXPIRED";
}

/** Sisa waktu sebelum lead keluar dari jendela Fresh, dalam ms (negatif bila sudah lewat). */
export function freshnessRemainingMs(postedAt: Date, now: Date, windowMs = FRESHNESS_WINDOW_MS): number {
  return postedAt.getTime() + windowMs - now.getTime();
}

const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: DISPLAY_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: DISPLAY_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: DISPLAY_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return `${dateTimeFmt.format(new Date(d))} WIB`;
}
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return dateFmt.format(new Date(d));
}
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return timeFmt.format(new Date(d));
}

export function formatRelative(d: Date | string | null | undefined, now: Date): string {
  if (!d) return "-";
  const diff = now.getTime() - new Date(d).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  let text: string;
  if (min < 1) text = "baru saja";
  else if (min < 60) text = `${min} menit`;
  else if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    text = m ? `${h} jam ${m} menit` : `${h} jam`;
  } else text = `${Math.round(min / (60 * 24))} hari`;
  if (text === "baru saja") return text;
  return future ? `${text} lagi` : `${text} lalu`;
}

export function formatDuration(ms: number): string {
  const abs = Math.max(0, ms);
  const min = Math.floor(abs / 60_000);
  if (min < 60) return `${min} menit`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
}

/** Awal hari kalender Asia/Jakarta (UTC+7, tanpa DST) dalam UTC. */
export function startOfJakartaDay(now: Date): Date {
  const offset = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(startLocal - offset);
}

/** Kunci tanggal YYYY-MM-DD menurut Asia/Jakarta. */
export function jakartaDateKey(d: Date): string {
  const local = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}
