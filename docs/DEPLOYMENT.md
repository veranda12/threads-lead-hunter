# Deployment

## Deployment aktif

| Item | Nilai |
|---|---|
| Project Vercel | `veranda12s-projects/threads-lead-hunter` |
| Production URL | https://threads-lead-hunter-five.vercel.app |
| Region function | `sin1` (Singapura, `vercel.json`) |
| Database | Neon free (`threads-lead-hunter-db`, ap-southeast-1) via Vercel Marketplace; `DATABASE_URL` diisi otomatis oleh integrasi |
| Env production | `DATABASE_URL` (+ variabel Neon), `ENCRYPTION_KEY`, `CRON_SECRET`, `APP_URL`, `THREADS_REDIRECT_URI` |
| Secret lokal | `.secrets/production.env` (password admin produksi, ENCRYPTION_KEY, CRON_SECRET) dan `.secrets/vercel-production.env.local`; keduanya di-ignore git dan Vercel |

Migration ke Neon memakai URL unpooled:

```bash
DATABASE_URL="<DATABASE_URL_UNPOOLED dari .secrets/vercel-production.env.local>" npm run db:deploy
```

Jangan biarkan hasil `vercel env pull` tersimpan sebagai `.env.local` di root: Next.js memprioritaskan `.env.local`, sehingga `npm run dev` akan memakai database produksi.

## 1. PostgreSQL hosted

Pilih penyedia PostgreSQL terkelola (mis. Neon, Supabase, atau penyedia lain dari Vercel Marketplace). Siapkan dua URL bila penyedia memakai pooler:

- `DATABASE_URL`: URL pooled untuk aplikasi (serverless).
- Untuk migration, pakai URL direct (non-pooler) saat menjalankan `npm run db:deploy`.

Pastikan `sslmode=require` bila diwajibkan penyedia.

## 2. Vercel

1. Import repository di https://vercel.com/new (framework Next.js terdeteksi otomatis; build command `npm run build` sudah menjalankan `prisma generate`).
2. **Settings → Environment Variables** (Production):

| Variabel | Catatan |
|---|---|
| `DATABASE_URL` | URL pooled |
| `APP_URL` | `https://domain-anda` |
| `ENCRYPTION_KEY` | 32 byte base64. Jangan diganti setelah token tersimpan (token lama jadi tidak bisa didekripsi) |
| `CRON_SECRET` | ≥ 32 karakter acak, sama dengan secret GitHub |
| `ANTHROPIC_API_KEY` | Opsional sampai siap |
| `THREADS_APP_ID`, `THREADS_APP_SECRET` | Dari Meta App |
| `THREADS_REDIRECT_URI` | `https://domain-anda/api/threads/oauth/callback` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Hanya dipakai `db:seed`; hapus setelah akun dibuat bila mau |

3. Terapkan migration dan seed ke database produksi dari mesin Anda:

```bash
DATABASE_URL="<direct url produksi>" ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:deploy
DATABASE_URL="<direct url produksi>" ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
```

4. Deploy. Cek `https://domain-anda/api/health` → `{"status":"ok"}` dan `https://domain-anda/privacy-policy` → HTTP 200.
5. `maxDuration` endpoint discovery = 300 dtk (default Vercel Functions saat ini). Biarkan "Batas waktu run" di Pengaturan ≤ 240 dtk.

## 3. GitHub Actions

Lihat [SCHEDULER.md](SCHEDULER.md). Workflow `ci.yml` menjalankan typecheck, lint, test, dan build di setiap push/PR dengan PostgreSQL service.

## 4. Meta

Lihat [THREADS_API_SETUP.md](THREADS_API_SETUP.md). URL yang dimasukkan ke Meta App Dashboard:

- Privacy Policy URL: `https://domain-anda/privacy-policy`
- Data deletion: Delete Callback URL `https://domain-anda/api/threads/data-deletion` (instruksi manual: `https://domain-anda/data-deletion`)
- Uninstall Callback URL: `https://domain-anda/api/threads/uninstall`
- Redirect Callback URL: `https://domain-anda/api/threads/oauth/callback`

## Checklist rilis

- [ ] `npm run typecheck && npm run lint && npm test && npm run build` hijau
- [ ] Migration diterapkan ke produksi
- [ ] Login berhasil, password admin bukan nilai contoh
- [ ] Pengaturan → Privasi lengkap (tidak ada "belum ditetapkan" di /privacy-policy)
- [ ] Workflow scheduler berjalan dan terlihat di Otomasi
- [ ] Tidak ada fixture demo di database produksi (`SELECT count(*) FROM "Lead" WHERE source='DEMO_FIXTURE'` = 0)
