import { describe, expect, it } from "vitest";
import { prefilterPost } from "@/lib/discovery/prefilter";

describe("pre-filter", () => {
  it.each([
    "Guys ada yang bisa bikinin website buat bisnis kecil?",
    "Nyari vendor untuk bikin aplikasi inventory.",
    "Butuh programmer freelance untuk project sistem kasir",
    "Ada rekomendasi jasa bikin sistem HRIS?",
    "Looking for someone to build our company website",
    "Berapa biaya bikin ERP custom?",
  ])("meloloskan permintaan jasa: %s", (text) => {
    const res = prefilterPost(text);
    expect(res.pass).toBe(true);
  });

  it("menolak lowongan kerja", () => {
    const res = prefilterPost("Lowongan kerja: kami membuka posisi full time web developer, kirim CV ke HR");
    expect(res.pass).toBe(false);
    expect(res.reason).toMatch(/lowongan/);
  });

  it("menolak developer yang mempromosikan jasanya sendiri", () => {
    expect(prefilterPost("Open jasa pembuatan website company profile, harga mulai 500rb, DM aja!").pass).toBe(false);
  });

  it("menolak spam", () => {
    expect(prefilterPost("Slot gacor hari ini, link di bio, butuh website judi?").pass).toBe(false);
  });

  it("menolak diskusi umum tanpa permintaan", () => {
    expect(prefilterPost("Menurut kalian framework frontend paling enak apa sih").pass).toBe(false);
  });

  it("menolak teks terlalu pendek", () => {
    expect(prefilterPost("web?").pass).toBe(false);
  });

  it("ambang bisa dikonfigurasi", () => {
    const text = "cari aplikasi";
    expect(prefilterPost(text, 0).pass).toBe(true);
    expect(prefilterPost(text, 99).pass).toBe(false);
  });
});

describe("pre-filter: kasus halus", () => {
  it("promosi diri terselubung (slot masih ada, portfolio di bio) tersaring", () => {
    expect(prefilterPost("Alhamdulillah project ERP ketiga bulan ini selesai. Buat yang butuh sistem serupa, slot bulan depan masih ada, cek portfolio di bio.").pass).toBe(false);
  });
  it("mencari aplikasi gratis siap pakai bukan permintaan jasa", () => {
    expect(prefilterPost("Ada yang tau aplikasi kasir gratis yang bisa dipakai offline? Buat warung kecil aja, nggak perlu custom.").pass).toBe(false);
  });
  it("mencari partner teknis dan memilih jasa tetap lolos", () => {
    expect(prefilterPost("Lagi cari partner teknis / CTO buat bangun aplikasi booking lapangan futsal.").pass).toBe(true);
    expect(prefilterPost("mau bikin web katalog buat jualan furniture, enaknya pake jasa siapa ya?").pass).toBe(true);
  });
});
