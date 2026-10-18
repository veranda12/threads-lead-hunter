# Meta App Review: `threads_keyword_search`

Materi pengajuan untuk app **Threads Lead Hunter** (Meta app ID `1132869279084907`, Threads app ID `1151840053866613`).

## Prasyarat (cek sebelum mengajukan)

- [x] Use case **Akses Threads API** dengan `threads_basic` dan `threads_keyword_search`
- [x] Redirect, Uninstall, dan Delete callback URL terisi (lihat [THREADS_API_SETUP.md](THREADS_API_SETUP.md))
- [x] Penguji Threads `deni_maulana1` sudah menerima undangan
- [x] OAuth berhasil, panggilan uji `threads_keyword_search` sukses (17 Okt 2026)
- [x] Privacy Policy publik lengkap: https://threads-lead-hunter-five.vercel.app/privacy-policy
- [x] Instruksi penghapusan data: https://threads-lead-hunter-five.vercel.app/data-deletion
- [ ] Kolom **API Calls** untuk `threads_keyword_search` di Meta sudah > 0 (bisa butuh hingga ~24 jam setelah panggilan pertama)
- [x] Screencast direkam: `logs/app-review/threads-lead-hunter-app-review.mp4`
- [x] **App settings → Basic**: Privacy Policy URL, domain, URL penghapusan data, kategori, dan ikon app terisi

## Screencast otomatis

Video sudah direkam otomatis dari aplikasi production dengan Playwright, dengan keterangan bahasa Inggris di setiap adegan: `logs/app-review/threads-lead-hunter-app-review.mp4` (17 Okt 2026, 1:57, H.264 1280x720). Folder `logs/` tidak di-commit.

Rekam ulang (mis. setelah UI berubah):

```bash
npx tsx --conditions=react-server .secrets/screencast-prep.ts post      # ambil postingan penguji via API
npx tsx --conditions=react-server .secrets/screencast-prep.ts session   # sesi sementara 90 menit, tanpa password
npx tsx scripts/record-app-review.ts part-a                             # login, OAuth, keyword search, import
npm run worker:analyze                                                  # analisis di laptop (di luar rekaman)
npx tsx scripts/record-app-review.ts part-b                             # hasil analisis, privacy, penghapusan data
npx tsx --conditions=react-server .secrets/screencast-prep.ts revoke    # cabut sesi sementara
# gabungkan ke MP4: ffmpeg -i part-a.webm -i part-b.webm -filter_complex concat ... (lihat riwayat sesi)
```

Postingan yang diimpor di video adalah postingan penguji sendiri; hapus dulu lead-nya bila merekam ulang (import kedua ditolak sebagai duplikat).

## Naskah screencast (2-3 menit)

Rekam layar browser (mis. Xbox Game Bar `Win+Alt+R`, atau OBS). Gunakan bahasa Inggris untuk keterangan teks/suara agar reviewer mudah memahami. Jangan tampilkan password, App Secret, atau token.

| # | Layar | Yang ditunjukkan | Keterangan (EN) |
|---|---|---|---|
| 1 | `/login` | Login ke dashboard | "Threads Lead Hunter is an internal tool used by a single operator, a freelance software developer." |
| 2 | Pengaturan → Integrasi Threads | Klik **Hubungkan akun Threads**, layar izin Threads, kembali dengan pesan berhasil | "The operator connects their own Threads account with OAuth, granting threads_basic and threads_keyword_search." |
| 3 | Pengaturan → Integrasi Threads → **Uji keyword search** | Ketik keyword (mis. "website"), jalankan, tampilkan hasil | "The app calls the Keyword Search endpoint with search_type=RECENT to find recent public posts where people ask for website or software development help." |
| 4 | Keyword | Daftar keyword (cari jasa website, butuh developer, ...) | "These are the keywords the operator searches for. Searches run at most every 30 minutes within the documented rate limits." |
| 5 | Lead → detail satu lead | Postingan asli, analisis, draft DM, tombol **Salin** dan **Tandai sudah saya kirim** | "Each matching post is shown with a relevance assessment and a suggested reply. The app never sends messages, replies, or posts automatically. The operator reads the original post and decides whether to reach out manually in the Threads app." |
| 6 | `/privacy-policy` dan `/data-deletion` | Scroll singkat | "Our privacy policy explains exactly which fields we store and how anyone can request deletion." |

Catatan untuk langkah 5: sebelum approval, pencarian hanya mengembalikan postingan milik akun penguji, jadi lead yang tampil bisa berasal dari import manual. Sebutkan hal ini di catatan reviewer (lihat di bawah).

## Teks untuk form App Review (tempel apa adanya)

**How will your app use `threads_keyword_search`?**

> Threads Lead Hunter is an internal tool used by one operator, a freelance software engineer in Indonesia who builds websites and custom business software. The app uses the Keyword Search endpoint (search_type=RECENT) with a small set of service-related keywords such as "cari jasa website" and "butuh developer" to find recent public posts in which people say they need a website, an application, or a developer.
>
> For each result the app stores only the post ID, text, author username, permalink, timestamp, media type, and shortcode. Posts older than 6 hours are discarded. The operator reviews each post in a private dashboard together with a relevance score and a suggested reply, and then decides whether to contact the author manually from the Threads app.
>
> The app does not publish, reply, like, follow, or send direct messages, and it does not request any publishing or messaging permission. Searches run at most every 30 minutes and stay within the 2,200 queries per 24 hours limit. Authors can request deletion of their data at https://threads-lead-hunter-five.vercel.app/data-deletion, and the app implements the Data Deletion and Uninstall callbacks.

**Notes for the reviewer**

> Login credentials for the dashboard are provided in the test credentials field. Before this permission is approved, Keyword Search only returns the tester's own posts, so the demo shows a search that returns the tester's own post. After approval the same flow returns recent public posts that match the operator's keywords. The app is single-user and is not offered to the public.

## Akun untuk reviewer

Meta biasanya meminta kredensial agar reviewer bisa membuka dashboard. Jangan berikan akun admin utama: buat akun terpisah atau ganti password sementara selama review, lalu ganti lagi setelah selesai. Cara cepat: jalankan seed dengan `ADMIN_PASSWORD` sementara dan `--reset-admin-password`, kirim kredensial itu lewat kolom khusus di form (bukan di teks deskripsi), lalu reset lagi setelah keputusan keluar.

Status pengajuan 18 Okt 2026: akun reviewer terpisah `meta-reviewer@example.com` dibuat di database production (password acak, tersimpan di `.secrets/reviewer.txt`). Password admin utama tidak diberikan ke Meta.

## Setelah keputusan keluar (disetujui atau ditolak)

Hapus akun reviewer: hapus baris `User` dengan email `meta-reviewer@example.com` (sesinya ikut terhapus lewat relasi), lalu hapus `.secrets/reviewer.txt`.

## Setelah disetujui

1. **Pengaturan → Integrasi Threads**: centang **"Meta sudah menyetujui threads_keyword_search"** lalu Simpan.
2. Run scheduler berikutnya (maks. 30 menit) mulai mencari dengan keyword aktif. Pantau di **Otomasi**.
3. Worker AI lokal (Task Scheduler) menganalisis kandidat yang masuk.
