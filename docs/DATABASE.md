# Database

PostgreSQL + Prisma 7. Semua kolom waktu `timestamptz(3)` dan disimpan dalam UTC; UI menampilkan Asia/Jakarta (WIB).

## Entitas

| Model | Isi |
|---|---|
| `User`, `UserSession` | Akun admin tunggal; sesi dengan `tokenHash` (SHA-256), kedaluwarsa, revoke |
| `RateLimitBucket` | Fixed-window rate limit (login, manual run, AI manual, formulir publik) |
| `IntegrationAccount` | Akun Threads terhubung; `accessTokenEnc` AES-256-GCM |
| `SearchProvider` | Status provider, budget harian, `rateLimitedUntil`, error terakhir |
| `SearchKeyword` | Keyword, kategori, aktif, statistik (pencarian, hasil, lead, terkualifikasi, error) |
| `DiscoveryRun`, `DiscoveryRunItem` | Satu baris per eksekusi (`executionId` unik), counter, log; item per postingan dan hasilnya |
| `Lead` | Postingan. Unik `(platform, platformPostId)`; `freshness` terpisah dari `status` CRM |
| `LeadAnalysis` | Riwayat analisis, `modelVersion`, `promptVersion`, `contentHash`, `isCurrent` |
| `LeadActivity`, `LeadNote` | Timeline semua perubahan, catatan |
| `MessageDraft`, `MessageDraftRevision` | Satu draft per tone per lead; setiap perubahan = revisi baru (AI atau manual) |
| `Service`, `PricingPlan` | Katalog dan harga (Rupiah, integer, null = belum ditetapkan) |
| `AppSetting` | Pengaturan JSON tervalidasi Zod (discovery, ai, threads, profile, privacy) |
| `AuditLog` | Append-only; trigger menolak UPDATE/DELETE/TRUNCATE |
| `JobLock` | Lock eksekusi discovery dengan `expiresAt` |
| `ApiUsageLog` | Setiap panggilan Threads/Claude: token, estimasi biaya, unit kuota, durasi, error |
| `SuppressedAuthor` | Hash SHA-256 username yang meminta penghapusan |
| `DataDeletionRequest` | Permintaan hapus data (formulir web / callback Meta) dan kode konfirmasi |

## Aturan yang ditegakkan di database

- `Lead @@unique([platform, platformPostId])`: insert bersamaan untuk post yang sama gagal di constraint; aplikasi mengubahnya menjadi `DUPLICATE`.
- `DiscoveryRun.executionId @unique`: idempotency per eksekusi scheduler.
- `MessageDraft @@unique([leadId, tone])`, `MessageDraftRevision @@unique([draftId, revision])`.
- Trigger `audit_log_no_update` dan `audit_log_no_truncate` (migration `audit_log_append_only`).
- Index untuk query yang sering dipakai: `postedAt` (fresh list), `(status, lastActivityAt)` (pipeline), `analysisStatus` (antrian AI), `leadScore`, `discoveredAt`, `authorUsername` (penghapusan data), `nextFollowUpAt`, `(provider, createdAt)` di usage log.

## Migration

```bash
npm run db:migrate -- --name nama_perubahan   # development: buat + terapkan migration
npm run db:deploy                             # produksi / CI: terapkan migration yang ada
```

Jangan memakai `prisma db push` di lingkungan bersama; semua perubahan schema lewat migration di `prisma/migrations`.

## Seed

`npm run db:seed` idempotent: membuat layanan (hanya landing page yang berharga awal Rp300.000), 21 keyword, baris provider, dan akun admin dari `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Seed tidak membuat lead. Seed tidak menimpa harga atau keyword yang sudah Anda ubah.

Fixture demo (`scripts/demo-fixtures.ts`) terpisah, ditolak saat `NODE_ENV=production`, dan setiap barisnya bertanda `source = DEMO_FIXTURE`.
