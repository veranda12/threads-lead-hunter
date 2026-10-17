# AI lokal dengan Ollama

Alternatif Claude API tanpa biaya API: model open-weight berjalan di laptop pengelola lewat Ollama.

## Arsitektur

```
Vercel (setiap 30 menit)                     Laptop pengelola (setiap 30 menit, Task Scheduler)
  discovery: cari, validasi, pre-filter          npm run worker:analyze
  simpan kandidat -> status PENDING  ── Neon ──>   ambil PENDING, panggil Ollama (localhost:11434)
  (tidak memanggil AI)                             simpan analisis + draft DM -> dashboard
```

- Vercel tidak bisa menjangkau `localhost` laptop Anda, jadi analisis dijalankan oleh worker lokal.
- Ollama dianggap tersedia hanya di proses yang punya `OLLAMA_BASE_URL`. Vercel tidak mengisinya, sehingga kandidat dibiarkan PENDING (bukan "API key belum ada").
- Jangan membuka Ollama ke internet (ngrok/Cloudflare Tunnel): Ollama tidak punya autentikasi.
- Lead hanya dianalisis saat laptop menyala. Kandidat API yang sudah lewat 6 jam tidak dianalisis lagi (aturan freshness yang sama dengan Claude).

## Instalasi (drive D)

Drive C hampir penuh, jadi aplikasi dan model ditaruh di D.

```powershell
# 1. Lokasi model (sebelum Ollama pertama kali jalan)
setx OLLAMA_MODELS "D:\Ollama\models"

# 2. Install aplikasi ke D (installer resmi dari https://ollama.com/download)
D:\Ollama\installer\OllamaSetup.exe /DIR="D:\Ollama"

# 3. Tutup Ollama dari system tray, buka lagi, lalu di terminal BARU:
ollama pull qwen2.5:7b
ollama list
```

Model yang cocok untuk laptop ini (GTX 1650 Max-Q 4 GB VRAM, RAM 16 GB):

| Model | Ukuran | Catatan |
|---|---|---|
| `qwen2.5:7b` (default) | ~4,7 GB | Kualitas bahasa Indonesia dan JSON lebih baik, sebagian jalan di CPU |
| `qwen2.5:3b` | ~1,9 GB | Muat penuh di GPU, lebih cepat, kualitas draft lebih rendah |

Ganti model di **Pengaturan → AI → Model Ollama** (harus sudah di-pull).

### GPU atau CPU?

Diperiksa dengan `ollama ps` dan log server (17 Okt 2026). GTX 1650 Max-Q terdeteksi lewat CUDA, VRAM yang bisa dipakai ~3,3 GB.

| Model | Porsi | Catatan |
|---|---|---|
| `qwen2.5:7b` | 42-45% GPU, 55-58% CPU | Hanya 11 dari 29 layer muat di GPU; menurunkan `num_ctx` 8192 -> 6144 hanya menambah ~3% |
| `qwen2.5:3b` | 100% GPU | |
| `qwen2.5:1.5b` | 100% GPU | |

### Benchmark alur bertahap (`npm run eval:local-ai`, 24 postingan sintetis berlabel)

| Tahap | Hasil |
|---|---|
| Pre-filter tanpa AI | 24/24 benar. Optimistis: pola di-tuning setelah melihat set ini |
| Triage `qwen2.5:1.5b` | 1,0 dtk/postingan, prospek 12/12, non-prospek 3/12. Tidak layak sebagai penyaring |
| Triage `qwen2.5:3b` (dipakai) | 1,4 dtk/postingan, prospek 12/12, non-prospek 9/12, akurasi 88% |
| Triage `qwen2.5:7b` | 9,0 dtk/postingan, prospek 12/12, non-prospek 11/12, akurasi 96% |
| Gabungan 7B (analisis + skor + 3 draft) | 67-146 dtk per prospek, dibanding 189 dtk dengan dua panggilan terpisah |

Uji alur produksi utuh pada database lokal: prospek layak butuh 150-225 dtk (triage 11 dtk + gabungan ~140 dtk + perbaikan draft ~65 dtk bila ada pelanggaran). Non-prospek yang lolos pre-filter berhenti di triage 3B dalam hitungan detik.

Temuan penting: `qwen2.5:7b` konsisten mengarang pengalaman di draft ("saya memiliki pengalaman mengembangkan sistem inventory/HRIS", "biasa mengerjakan HRIS") walau dilarang di prompt. Guard `unsupportedExperienceClaims` sekarang memeriksa semua penanda klaim (pernah, pengalaman, berpengalaman, biasa/sering mengerjakan) terhadap konsep domain di profil; draft yang tetap melanggar setelah satu kali perbaikan disimpan dengan tanda "Perlu dicek", tidak dianggap bersih.

### Hasil uji awal (17 Okt 2026, `qwen2.5:7b`, dua panggilan terpisah)

| Langkah | Token input / output | Waktu |
|---|---|---|
| Analisis lead | 2.023 / 249 | 142 detik |
| 3 draft DM | 866 / 245 | 47 detik |

Klasifikasi akurat (intent, kategori, skor 85, layanan `pos`, budget tidak dikarang). Draft DM awalnya memakai "kami" dan menjanjikan "konsultasi gratis"; prompt dan guard sudah diperketat (wajib "saya", sebut satu pengalaman relevan, tanpa penawaran di luar data harga). Sekitar 3 menit per lead termasuk draft, jadi satu run worker (batas 12 menit) memproses sekitar 4 lead; sisanya lanjut di run berikutnya.

## Konfigurasi worker

`.secrets/worker.env` (tidak di-commit, tidak di-upload ke Vercel):

```
DATABASE_URL=<DATABASE_URL Neon produksi, versi pooled>
OLLAMA_BASE_URL="http://localhost:11434"
```

Pilih provider: **Pengaturan → AI → Provider AI = Ollama lokal**.

Uji manual:

```bash
npm run worker:analyze
```

## Jadwal otomatis (Windows Task Scheduler)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\register-analysis-task.ps1             # daftar, tiap 30 menit
powershell -ExecutionPolicy Bypass -File scripts\windows\register-analysis-task.ps1 -Remove     # hapus
```

Task berjalan hanya saat Anda login, tanpa hak admin. Log ada di `logs/worker-analyze.log`. Status terakhir juga terlihat di dashboard **Otomasi** (pemicu "Worker AI lokal") dan di **Ringkasan**; dashboard memberi peringatan bila worker tidak jalan lebih dari 90 menit.

## Perilaku saat error

| Kondisi | Hasil |
|---|---|
| Ollama mati / tidak bisa dihubungi | Lead tetap PENDING dengan pesan error, batch berhenti, dicoba lagi run berikutnya |
| Model belum di-pull | Sama seperti di atas, pesan berisi perintah `ollama pull ...` |
| Timeout (default 5 menit per panggilan) | Sama seperti di atas |
| JSON tidak valid / tidak sesuai schema | Lead ditandai gagal untuk lead itu saja; bisa dianalisis ulang manual |
| Dua worker jalan bersamaan | Lock `analysis`, worker kedua dicatat "Dilewati, run lain aktif" |

Guard deterministik (budget harus ada kutipannya, batas skor untuk non-permintaan jasa dan confidence rendah, deteksi prompt injection, validasi harga dan em dash di DM) tetap berlaku untuk model apa pun.

## Privasi

Saat provider = Ollama, halaman `/privacy-policy` otomatis menyatakan bahwa analisis dilakukan di perangkat pengelola dan teks postingan tidak dikirim ke penyedia AI pihak ketiga. Pemakaian token dicatat di `ApiUsageLog` dengan provider `OLLAMA` dan biaya 0.
