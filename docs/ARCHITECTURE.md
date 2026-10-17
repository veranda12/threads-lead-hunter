# Arsitektur

## Ringkas

```
GitHub Actions (cron */30)
   │  POST /api/internal/discovery/run   Authorization: Bearer CRON_SECRET, X-Execution-Id
   ▼
Next.js 16 (Vercel, Node runtime)
   ├─ runDiscovery()  src/lib/discovery/pipeline.ts
   │    ├─ JobLock (PostgreSQL)          satu run aktif
   │    ├─ SearchProvider                OfficialThreadsProvider | ManualPostProvider
   │    ├─ ingestPost()                  validasi timestamp, dedup, pre-filter, simpan
   │    ├─ analyzeLead() / generateDrafts()   Claude API, guard deterministik
   │    └─ retensi + update freshness
   ├─ Dashboard (Server Components + Server Actions)
   └─ Halaman publik: /privacy-policy, /data-deletion, callback Meta
PostgreSQL (Prisma 7, driver adapter pg)
```

## Keputusan teknis

| Keputusan | Alasan |
|---|---|
| Next.js 16 App Router, `cacheComponents` aktif | Default framework ke depan. Data yang tergantung sesi dibaca di dalam `<Suspense>`; shell statis tetap prerender. |
| Server Actions untuk mutasi dashboard | Origin check bawaan Next.js (CSRF), validasi Zod di setiap action, `refresh()` untuk memperbarui UI. |
| Route Handlers hanya untuk integrasi luar | Scheduler, OAuth Threads, callback Meta, health check. |
| Prisma 7 + `@prisma/adapter-pg` | Client ESM baru, koneksi lewat driver `pg`. |
| Sesi di database (bukan JWT) | Bisa dicabut, terlihat di Pengaturan, token cookie hanya disimpan sebagai hash SHA-256. |
| Lock, rate limit, idempotency di PostgreSQL | Aman untuk serverless, tidak bergantung memori proses. |
| Guard deterministik setelah AI | Model boleh salah; aturan bisnis (budget, skor, harga) ditegakkan kode. |

## Struktur folder

```
src/
  app/
    (app)/            dashboard terautentikasi: ringkasan, lead, pipeline, keyword, harga, otomasi, analitik, privasi, pengaturan
    (auth)/login      login + logout
    (public)/         privacy-policy, data-deletion (+status)
    api/              internal/discovery/run, threads/oauth/*, threads/data-deletion, threads/uninstall, health
  components/         UI kit (server) dan komponen client kecil
  lib/
    ai/               client Claude, schema Zod, prompt, guard, tarif
    auth/             sesi dan DAL (requireUser / assertUser)
    discovery/        pipeline, ingest, prefilter, lock, budget kuota, normalisasi
    leads/            scoring, transisi CRM, service analisis/draft
    providers/        SearchProvider: Threads API resmi, manual, status integrasi
    pricing/          format harga dan katalog
    privacy.ts        retensi, penghapusan data, callback Meta
  proxy.ts            optimistic redirect ke /login (validasi sebenarnya di DAL)
prisma/               schema, migration, seed
scripts/              worker discovery, fixture demo
tests/                unit, integration (DB), e2e (Playwright)
```

## SearchProvider

```ts
interface SearchProvider {
  kind: "OFFICIAL_THREADS" | "MANUAL";
  supportsSearch: boolean;
  health(): Promise<{ status; message }>;
  search(q: { keyword; since; until; limit; cursor }): Promise<{ posts; nextCursor; quotaUnits }>;
}
```

- `OfficialThreadsProvider` memanggil `GET /v1.0/keyword_search` dengan `search_type=RECENT`, `since` = cutoff 6 jam, `until` = waktu server. Status dihitung dari keadaan nyata (lihat `evaluateThreadsHealth`), tidak diasumsikan.
- `ManualPostProvider` tidak mencari. Data masuk lewat `parseManualImport` (URL resmi threads.com/threads.net + teks yang ditempel pengguna).

Tidak ada scraping, private API, atau bypass autentikasi.
