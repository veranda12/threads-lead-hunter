# Scheduler

## Alur satu eksekusi

1. GitHub Actions (`.github/workflows/discovery.yml`, cron `*/30 * * * *`) memanggil `POST /api/internal/discovery/run` dengan `Authorization: Bearer CRON_SECRET` dan `X-Execution-Id: <run_id>-<run_attempt>`.
2. Endpoint memvalidasi secret (constant-time) dan format execution ID.
3. `runDiscovery`:
   1. Bila `executionId` sudah ada → kembalikan hasil lama (idempotent). Retry curl dan re-run job tidak menggandakan kerja.
   2. Catat `serverNow` dan `cutoffAt = serverNow - 6 jam`.
   3. Discovery dinonaktifkan → `SKIPPED_DISABLED`. Run sukses terakhir masih dalam interval minimum → `SKIPPED_INTERVAL`.
   4. Ambil lock `discovery` (TTL = timeout run + 60 dtk). Gagal → `SKIPPED_LOCKED`.
   5. Refresh token Threads bila perlu, cek status provider.
   6. Rencanakan kuota (`planQueryBudget`), rotasi keyword (yang paling lama tidak dicari lebih dulu), cari dengan pagination, retry 2x untuk error retryable.
   7. Ingest setiap postingan: validasi timestamp, dedup, pre-filter, simpan.
   8. Analisis kandidat pending (termasuk sisa run sebelumnya) sampai batas per run, budget token, atau waktu habis; buat draft untuk lead berkualitas.
   9. Tandai freshness EXPIRED, jalankan retensi (bila periode ditetapkan).
   10. Simpan counter + log, lepas lock. Status `SUCCEEDED`, `PARTIAL` (ada error terisolasi), atau `FAILED`.

## Setup GitHub Actions

1. Push repository ke GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - `APP_URL`: `https://domain-anda` (tanpa slash di akhir)
   - `CRON_SECRET`: sama persis dengan env di Vercel
3. **Actions** → aktifkan workflow bila diminta. Uji dengan **Run workflow** (workflow_dispatch).
4. Cek hasilnya di dashboard **Otomasi**.

Catatan: jadwal cron GitHub bisa terlambat beberapa menit dan workflow terjadwal dinonaktifkan GitHub setelah 60 hari tanpa aktivitas repository. Halaman Otomasi menampilkan peringatan bila tidak ada run scheduler dalam 90 menit.

## Konfigurasi (Pengaturan → Scheduler)

| Setting | Default | Fungsi |
|---|---|---|
| Interval minimum | 25 menit | Panggilan scheduler yang terlalu rapat dilewati |
| Maks keyword per run | 12 | Dibatasi lagi oleh jatah kuota per run |
| Maks halaman per keyword | 2 | Pagination |
| Hasil per halaman | 50 | Maks API 100 |
| Maks postingan per run | 200 | |
| Batas waktu run | 240 dtk | Pipeline berhenti mencari/menganalisis saat mendekati batas |

## Worker terpisah

Bila run sering mendekati batas `maxDuration` Vercel (300 dtk), jalankan pipeline di runner GitHub: `.github/workflows/discovery-worker.yml` (butuh secret `DATABASE_URL`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `THREADS_APP_ID`, `THREADS_APP_SECRET`, `APP_URL`). Lock dan idempotency tetap sama karena semuanya di database. Secara lokal: `npm run worker:discovery`.

## Manual run

Tombol **Jalankan discovery sekarang** di halaman Otomasi (dibatasi 6 kali per jam).
