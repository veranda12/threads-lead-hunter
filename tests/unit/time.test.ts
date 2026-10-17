import { describe, expect, it } from "vitest";
import { checkPostTimestamp, computeCutoff, freshnessOf, parseProviderTimestamp, startOfJakartaDay, jakartaDateKey, FRESHNESS_WINDOW_MS } from "@/lib/time";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const H = 3600_000;

describe("freshness window 6 jam", () => {
  it("postingan tepat 6 jam masih fresh (batas inklusif)", () => {
    const posted = new Date(NOW.getTime() - 6 * H).toISOString();
    const res = checkPostTimestamp(posted, NOW);
    expect(res.ok).toBe(true);
    expect(freshnessOf(new Date(posted), NOW)).toBe("FRESH");
  });

  it("postingan 6 jam lebih 1 detik dibuang sebagai STALE", () => {
    const posted = new Date(NOW.getTime() - 6 * H - 1000).toISOString();
    const res = checkPostTimestamp(posted, NOW);
    expect(res).toMatchObject({ ok: false, reason: "STALE" });
    expect(freshnessOf(new Date(posted), NOW)).toBe("EXPIRED");
  });

  it("timestamp masa depan ditolak", () => {
    const posted = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(checkPostTimestamp(posted, NOW)).toMatchObject({ ok: false, reason: "FUTURE_TIMESTAMP" });
  });

  it("selisih jam kecil (dalam toleransi 2 menit) tidak dianggap masa depan", () => {
    const posted = new Date(NOW.getTime() + 60_000).toISOString();
    const res = checkPostTimestamp(posted, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ageMs).toBe(0);
  });

  it.each([["bukan tanggal"], [""], [null], [undefined], ["2026-02-31T10:00:00Z"], ["2026-10-17 10:00:00"], ["2026-10-17T10:00:00"], ["2026-13-01T00:00:00Z"], [{}], [-5]])(
    "timestamp invalid %p ditolak",
    (raw) => {
      expect(checkPostTimestamp(raw, NOW)).toMatchObject({ ok: false, reason: "INVALID_TIMESTAMP" });
    },
  );

  it("timestamp tanpa zona waktu ditolak karena ambigu", () => {
    expect(parseProviderTimestamp("2026-10-17T10:00:00")).toBeNull();
  });
});

describe("timezone offset", () => {
  it("format Threads API +0000 diparse sebagai UTC", () => {
    expect(parseProviderTimestamp("2026-10-17T05:42:03+0000")?.toISOString()).toBe("2026-10-17T05:42:03.000Z");
  });

  it("offset +07:00 dan +0700 dikonversi ke UTC", () => {
    expect(parseProviderTimestamp("2026-10-17T12:00:00+07:00")?.toISOString()).toBe("2026-10-17T05:00:00.000Z");
    expect(parseProviderTimestamp("2026-10-17T12:00:00+0700")?.toISOString()).toBe("2026-10-17T05:00:00.000Z");
  });

  it("offset negatif dikonversi benar", () => {
    expect(parseProviderTimestamp("2026-10-16T23:30:00-05:00")?.toISOString()).toBe("2026-10-17T04:30:00.000Z");
  });

  it("waktu WIB yang sama dengan UTC 6 jam lalu tetap dihitung dari UTC", () => {
    // 12:00Z = 19:00 WIB. Posting 13:00 WIB = 06:00Z = tepat 6 jam.
    expect(checkPostTimestamp("2026-10-17T13:00:00+07:00", NOW).ok).toBe(true);
    expect(checkPostTimestamp("2026-10-17T12:59:59+07:00", NOW)).toMatchObject({ ok: false, reason: "STALE" });
  });

  it("unix seconds dan milliseconds diterima", () => {
    const sec = Math.floor(NOW.getTime() / 1000) - 60;
    expect(parseProviderTimestamp(sec)?.getTime()).toBe(sec * 1000);
    expect(parseProviderTimestamp(NOW.getTime())?.getTime()).toBe(NOW.getTime());
  });
});

describe("cutoff dari waktu eksekusi aktual", () => {
  it("job yang terlambat menghitung cutoff dari jam eksekusinya sendiri", () => {
    const scheduled = new Date("2026-10-17T12:00:00Z");
    const late = new Date("2026-10-17T12:17:00Z");
    expect(computeCutoff(late).getTime() - computeCutoff(scheduled).getTime()).toBe(17 * 60_000);
    expect(late.getTime() - computeCutoff(late).getTime()).toBe(FRESHNESS_WINDOW_MS);
  });

  it("awal hari Jakarta = 17:00 UTC hari sebelumnya", () => {
    expect(startOfJakartaDay(new Date("2026-10-17T02:00:00Z")).toISOString()).toBe("2026-10-16T17:00:00.000Z");
    expect(jakartaDateKey(new Date("2026-10-16T18:00:00Z"))).toBe("2026-10-17");
  });
});
