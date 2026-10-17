# Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `DATABASE_URL belum diatur` | `.env` tidak ada / tidak terbaca | Salin `.env.example` ke `.env` |
| `P1001 Can't reach database server` | PostgreSQL mati atau port salah | `docker compose up -d` atau cek service PostgreSQL lokal |
| `npm test` gagal di global setup | `TEST_DATABASE_URL` kosong atau database test belum ada | Buat database `threads_lead_hunter_test`; test menolak memakai database utama |
| Login selalu "Email atau password salah" | Akun belum dibuat | `npm run db:seed` dengan `ADMIN_EMAIL`/`ADMIN_PASSWORD`; reset: `npm run db:seed -- --reset-admin-password` |
| "Terlalu banyak percobaan" | Rate limit login | Tunggu 15 menit, atau hapus baris `RateLimitBucket` dengan key `login:*` |
| Status Threads "Belum dikonfigurasi" | App ID/secret kosong atau akun belum dihubungkan | Lihat THREADS_API_SETUP.md |
| Status "Butuh izin" | Approval `threads_keyword_search` belum ditandai atau API menolak | Selesaikan App Review, lalu centang approval di Pengaturan |
| Status "Token kedaluwarsa" | Token > 60 hari, dicabut, atau `ENCRYPTION_KEY` berubah | Pengaturan → Hubungkan ulang akun Threads |
| OAuth kembali dengan "State OAuth tidak cocok" | Cookie state hilang (beda domain/HTTP vs HTTPS) atau lewat 10 menit | Pastikan `APP_URL` dan `THREADS_REDIRECT_URI` memakai domain yang sama dengan yang Anda buka |
| Meta: "redirect_uri mismatch" | URL tidak persis sama | Samakan `THREADS_REDIRECT_URI` dengan Redirect Callback URL di Meta |
| Run "Dilewati, run lain aktif" terus | Proses mati saat memegang lock | Lock kedaluwarsa otomatis (timeout run + 60 dtk). Darurat: `DELETE FROM "JobLock" WHERE name='discovery'` |
| Run "Dilewati, belum lewat interval" | Scheduler dipanggil lebih rapat dari interval minimum | Normal. Turunkan interval di Pengaturan bila perlu |
| Lead menumpuk "Pending, API key belum ada" | `ANTHROPIC_API_KEY` kosong | Isi key; run berikutnya memprosesnya |
| "Pending, budget AI habis" | Budget token harian tercapai | Naikkan budget atau tunggu reset 00.00 WIB |
| Analisis gagal "Output model tidak sesuai schema" | Respons model tidak valid | Klik Analisis ulang; bila berulang, cek model di Pengaturan |
| GitHub Action 401 | `CRON_SECRET` beda antara GitHub dan Vercel | Samakan |
| GitHub Action tidak jalan | Workflow terjadwal dinonaktifkan setelah 60 hari tanpa aktivitas repo | Aktifkan lagi di tab Actions |
| Function timeout di Vercel | Run terlalu panjang | Kurangi keyword/analisis per run atau pakai worker (SCHEDULER.md) |
| `/privacy-policy` menampilkan "belum ditetapkan" | Pengaturan privasi belum lengkap | Lengkapi Pengaturan → Privasi |
