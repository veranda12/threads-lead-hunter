# Aturan bisnis

## Freshness

- Jendela fresh: 6 jam sejak `postedAt`. Batas inklusif: tepat 6 jam masih fresh, 6 jam + 1 ms sudah tidak.
- Cutoff dihitung dari waktu server saat eksekusi berjalan (`serverNow - 6 jam`), bukan dari jadwal cron. Run yang terlambat 17 menit memakai cutoff yang juga bergeser 17 menit.
- Discovery otomatis membuang: timestamp tidak valid, timestamp tanpa zona waktu, timestamp lebih dari 2 menit di masa depan, dan postingan lebih dari 6 jam. Yang dibuang hanya dicatat sebagai `DiscoveryRunItem` (ID + alasan).
- Format Threads `2023-10-17T05:42:03+0000` (tanpa titik dua di offset) didukung.
- Import manual boleh lebih lama dari 6 jam (freshness EXPIRED) atau tanpa waktu (UNKNOWN). Waktu yang diisi manual diartikan WIB dan ditandai "(manual)".
- Freshness tidak mengubah status CRM. Lead berstatus Negosiasi tetap Negosiasi walau postingannya sudah lama; hanya keluar dari daftar Fresh.

## Kualifikasi

| Skor | Prioritas |
|---|---|
| 80-100 | Tinggi |
| 60-79 | Sedang |
| 40-59 | Rendah |
| 0-39 | Abaikan |

Guard setelah output AI (`src/lib/ai/guards.ts`):

- Intent selain SERVICE_REQUEST / VENDOR_RECOMMENDATION / PRICE_INQUIRY / PARTNER_SEARCH: `isServiceRequest = false`, skor maksimal 39. Lowongan kerja tidak pernah jadi lead berkualitas.
- Confidence di bawah 0,5: skor maksimal 59.
- Indikasi prompt injection (dari model atau regex): red flag + skor maksimal 59.
- Budget hanya `STATED_BY_AUTHOR` bila kutipan bukti benar-benar ada di teks postingan. Selain itu dikosongkan.
- `estimatedService` harus slug dari katalog aktif.

## Draft DM

- Dibuat otomatis hanya bila skor ≥ `minLeadScoreForDrafts` (default 60) dan `isServiceRequest`.
- Tiga tone: santai, profesional, konsultatif. Pembuka yang sering dipakai dikirim sebagai daftar larangan.
- Validasi: tanpa em/en dash (dibersihkan otomatis), maksimal satu tanda tanya, panjang wajar, angka Rupiah harus ada di konfigurasi harga, tanpa klaim testimoni. Pelanggaran memicu satu kali perbaikan, lalu ditampilkan sebagai catatan "Perlu dicek".
- Aplikasi tidak pernah mengirim DM. "Tandai sudah saya kirim" hanya mencatat.

## Harga

- Sumber harga satu-satunya: tabel `Service` + `PricingPlan`.
- Plan tanpa nominal, plan nonaktif, dan Custom quotation dianggap belum berharga: AI dan UI memakai frasa "menyesuaikan kebutuhan dan scope".
- Untuk kategori enterprise atau kompleksitas tinggi, UI menampilkan catatan "harga indikatif, diskusikan scope".
- Nilai pipeline di Analitik = jumlah harga minimum terkonfigurasi untuk lead Terkualifikasi/Proposal/Negosiasi; lead tanpa harga tidak dihitung dan jumlahnya disebutkan.

## CRM

Transisi yang diizinkan ada di `src/lib/leads/crm.ts`. Setiap perubahan status, catatan, draft, follow-up, dan analisis tercatat di `LeadActivity`. Lead yang dihubungi tidak dihapus oleh proses freshness; penghapusan hanya lewat retensi yang Anda tetapkan atau permintaan penghapusan data.

## Biaya

- Pre-filter heuristik sebelum Claude. Yang tidak lolos tidak dikirim ke AI.
- Analisis dilewati bila `contentHash` + `promptVersion` sama dengan analisis terakhir.
- Postingan API yang sudah lewat 6 jam dan belum dianalisis tidak dianalisis lagi.
- Budget token harian (reset 00.00 WIB). Bila habis, kandidat disimpan dengan status `BUDGET_EXCEEDED` dan diproses run berikutnya.
- Batas per run: postingan, analisis, keyword, halaman per keyword.
