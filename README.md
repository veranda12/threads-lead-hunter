# Threads Lead Hunter

Dashboard internal untuk menemukan postingan Threads terbaru dari orang yang butuh jasa website atau software, menilainya dengan Claude, dan menyiapkan draft DM yang Anda kirim sendiri. Satu pengguna, data nyata dari database, tanpa pengiriman pesan otomatis.

## Status fitur

| Bagian | Status |
|---|---|
| Login, sesi, rate limit login, audit log append-only | Berfungsi |
| Import postingan manual (URL + teks) | Berfungsi tanpa credential eksternal |
| Freshness 6 jam, dedup, pre-filter, pipeline discovery, lock, idempotency, retry | Berfungsi, teruji |
| Threads Keyword Search (API resmi) | Kode siap. Butuh Meta App, OAuth, dan approval `threads_keyword_search` |
| Analisis lead + 3 draft DM | Dua provider: Claude API (butuh `ANTHROPIC_API_KEY`) atau Ollama lokal lewat worker di laptop ([LOCAL_AI.md](docs/LOCAL_AI.md)) |
| CRM: status, Kanban/tabel, catatan, follow-up, timeline | Berfungsi |
| Harga layanan, keyword, pengaturan, analitik | Berfungsi |
| Privacy Policy publik, formulir hapus data, callback Meta | Berfungsi. Isian pengelola perlu dilengkapi |
| Scheduler GitHub Actions | Workflow siap. Butuh secret `APP_URL` dan `CRON_SECRET` |

## Menjalankan lokal

Prasyarat: Node.js 20.19+ (CI memakai 22), npm, PostgreSQL 15+ (lokal atau `docker compose up -d`).

```bash
npm install
cp .env.example .env          # isi DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ENCRYPTION_KEY, CRON_SECRET
npm run db:deploy             # terapkan migration
npm run db:seed               # katalog layanan, 21 keyword awal, akun admin
npm run dev                   # http://localhost:3000
```

Membuat secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```

Database test terpisah dipakai oleh `npm test` (`TEST_DATABASE_URL`). Docker Compose membuat keduanya otomatis.

## Script

| Perintah | Fungsi |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest: unit + integration (PostgreSQL test DB) |
| `npm run test:e2e` | Playwright smoke test terhadap build produksi (`npm run build` dulu) |
| `npm run db:migrate` | Buat migration baru saat schema berubah |
| `npm run db:deploy` | Terapkan migration (lokal/produksi) |
| `npm run db:seed` | Seed idempotent. `-- --reset-admin-password` untuk reset password admin |
| `npm run worker:discovery` | Jalankan satu discovery run langsung (tanpa HTTP) |
| `npm run worker:analyze` | Worker AI lokal: analisis kandidat pending dengan Ollama (env dari `.secrets/worker.env`) |
| `DEMO_MODE=true npm run demo:seed` / `npm run demo:clear` | Fixture demo bertanda `DEMO_FIXTURE`, hanya lokal |

## Dokumentasi

- [Arsitektur](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Aturan bisnis](docs/BUSINESS_RULES.md)
- [Setup Threads API dan Meta App Review](docs/THREADS_API_SETUP.md)
- [Materi pengajuan App Review](docs/APP_REVIEW.md)
- [Pipeline AI](docs/AI_PIPELINE.md)
- [AI lokal dengan Ollama](docs/LOCAL_AI.md)
- [Scheduler](docs/SCHEDULER.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Keamanan](docs/SECURITY.md)
- [Privasi dan penghapusan data](docs/PRIVACY_AND_DATA_DELETION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
