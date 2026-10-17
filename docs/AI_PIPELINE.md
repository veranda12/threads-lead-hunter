# Pipeline AI

Provider dipilih di **Pengaturan → AI**: Claude API atau Ollama lokal. Alur, schema, dan guard sama untuk keduanya. Untuk Ollama lihat [LOCAL_AI.md](LOCAL_AI.md).

## Alur bertahap (versi saat ini)

```
postingan
  └─ 1. Pre-filter heuristik (tanpa AI, instan)            -> PREFILTERED_OUT, tidak pernah ke model
       └─ 2. Classifier awal, model kecil (opsional, Ollama) -> berhenti di sini bila bukan permintaan jasa
            │    schema mini: intent, isServiceRequest, relevance, confidence, reason
            └─ 3. SATU panggilan model utama                  -> klasifikasi + skor + 3 draft DM (JSON terstruktur)
                 └─ 4. Guard deterministik; draft disimpan hanya bila permintaan jasa dan skor >= ambang
                      └─ 5. (bila perlu) satu panggilan perbaikan khusus draft yang melanggar aturan
```

- Schema gabungan: `combinedOutputSchema` = `analysisOutputSchema` + `drafts`. Model diminta mengisi `drafts: []` bila bukan permintaan jasa atau skor di bawah ambang; keputusan akhir tetap di guard (draft dari postingan yang dinilai guard tidak layak dibuang).
- Classifier awal diatur di **Pengaturan → AI → Classifier awal Ollama** (kosong = nonaktif). Lead yang berhenti di tahap ini tersimpan dengan `LeadAnalysis.stage = "TRIAGE"`, skor maksimal 39, dan bisa dianalisis ulang manual dengan model utama.
- `num_ctx` per panggilan: triage 2048, analisis + draft 6144. Konteks lebih kecil = KV cache lebih kecil = lebih banyak layer muat di GPU.
- Benchmark lokal: `npm run eval:local-ai` (data sintetis berlabel di `tests/fixtures/eval-posts.json`, tidak menyentuh database).

## Alur (rincian tiap tahap)

1. **Pre-filter** (`src/lib/discovery/prefilter.ts`): skor heuristik dari sinyal permintaan (cari, butuh, rekomendasi, berapa biaya, looking for) dan sinyal domain (website, aplikasi, ERP, POS, developer), dikurangi sinyal negatif (lowongan, promosi jasa sendiri, spam). Butuh kedua jenis sinyal. Ambang default 35, bisa diubah. Import manual selalu dikirim ke AI.
2. **Analisis** (`analyzeLead`): `client.messages.parse()` + `zodOutputFormat(analysisOutputSchema)`. Output divalidasi Zod; bila gagal parse, terpotong (`max_tokens`), atau ditolak (`refusal`), lead ditandai `FAILED` dengan pesan error.
3. **Guard** (`applyAnalysisGuards`): lihat BUSINESS_RULES.md.
4. **Draft DM** (`generateDrafts`): output `{ drafts: [{ tone, body }] }`, sanitasi em dash, validasi, satu kali perbaikan.

Setiap analisis menyimpan `modelVersion` (ID model dari respons API), `promptVersion`, `contentHash`, token input/output, serta catatan guard.

## Prompt injection

- Teks postingan dibungkus `<untrusted_post>`; tag penutup di dalam teks dihapus (`escapeUntrusted`) sehingga postingan tidak bisa "keluar" dari blok data.
- System prompt menyatakan isi tag adalah data pihak ketiga dan meminta `promptInjectionDetected`.
- Regex deteksi di sisi kode sebagai lapis kedua. Bila terdeteksi: red flag dan skor dibatasi 59.
- Model tidak punya tool dan tidak punya akses ke data internal; hanya katalog layanan dan profil Anda yang ada di prompt.

## Konfigurasi Anthropic API

1. Buat API key di https://console.anthropic.com → **API Keys**.
2. Isi `ANTHROPIC_API_KEY` di environment server (Vercel → Project → Settings → Environment Variables). Jangan pernah di variabel `NEXT_PUBLIC_*`.
3. Pilih model di **Pengaturan → AI**: Claude Opus 5 (default), Sonnet 5, atau Haiku 4.5. Untuk klasifikasi volume tinggi, Sonnet 5 atau Haiku 4.5 jauh lebih murah; ukur dulu kualitasnya pada lead Anda.
4. `effort: "low"` dipakai untuk model yang mendukung, karena klasifikasi dan DM pendek tidak butuh reasoning panjang.

## Memantau biaya

- **Ringkasan** dan **Otomasi**: token hari ini vs budget, estimasi biaya hari ini.
- `ApiUsageLog`: setiap panggilan dengan token input/output/cache dan `costMicroUsd` (estimasi dari tarif di `src/lib/ai/pricing.ts`; tagihan resmi tetap di Anthropic Console).
- Query cepat:

```sql
SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Jakarta') AS hari,
       model, count(*), sum("inputTokens") AS input, sum("outputTokens") AS output,
       round(sum("costMicroUsd") / 1e6, 4) AS usd
FROM "ApiUsageLog" WHERE provider = 'ANTHROPIC'
GROUP BY 1, 2 ORDER BY 1 DESC;
```

- Pasang juga batas pengeluaran (spend limit) di Anthropic Console sebagai pengaman di luar aplikasi.

## Refusal fallback

Server-side refusal fallback Anthropic tidak diaktifkan karena model bisa diganti ke Haiku/Sonnet dari dashboard dan konten yang dianalisis adalah postingan bisnis biasa. Bila model menolak, lead ditandai gagal dengan alasan yang jelas dan bisa dianalisis ulang manual.
