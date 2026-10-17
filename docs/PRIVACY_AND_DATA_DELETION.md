# Privasi dan penanganan penghapusan data

## URL publik (tanpa login, HTTP 200)

| URL | Isi |
|---|---|
| `/privacy-policy` | Kebijakan privasi Bahasa Indonesia (default) |
| `/privacy-policy?lang=en` | Versi Inggris |
| `/data-deletion` | Formulir permintaan penghapusan + instruksi |
| `/data-deletion/status?code=DEL-...` | Cek status dengan kode konfirmasi |
| `POST /api/threads/data-deletion` | Data Deletion Callback Meta (`signed_request`) |
| `POST /api/threads/uninstall` | Uninstall/deauthorize callback Meta |

Isi kebijakan dibangun dari kode dan pengaturan aktual: daftar field Threads diambil dari konstanta `THREADS_SEARCH_FIELDS` yang benar-benar diminta ke API, dan nilai retensi, kontak, serta tanggal berlaku dari **Pengaturan → Privasi**. Nilai yang belum diisi tampil sebagai "belum ditetapkan oleh pengelola".

## Yang wajib Anda lengkapi sebelum App Review

Pengaturan → Privasi:

1. Nama pengelola data
2. Email kontak privasi
3. Tanggal berlaku
4. Retensi lead tidak relevan (hari)
5. Retensi data mentah API (hari)
6. Retensi lead Tidak jadi / Diarsipkan (hari)
7. Batas waktu memproses permintaan hapus (hari)

Aplikasi tidak memilihkan angka retensi. Sampai diisi, tidak ada penghapusan otomatis untuk kategori itu dan kebijakan menyatakannya apa adanya.

## Alur permintaan dari formulir web (penulis postingan)

1. Pemohon mengisi username Threads (+ email/keterangan opsional). Rate limit 5 per jam per IP, honeypot anti-bot.
2. Sistem langsung:
   - menyimpan `DataDeletionRequest` status `RECEIVED` dengan kode `DEL-XXXXXXXXXX`,
   - memasukkan hash SHA-256 username ke `SuppressedAuthor` sehingga postingan baru dari username itu tidak lagi disimpan (discovery maupun import manual),
   - menulis audit log.
3. Pemohon mendapat kode dan link status.
4. Pengelola membuka **Permintaan privasi** di dashboard. Setiap permintaan menampilkan jumlah lead tersimpan untuk username tersebut dan peringatan bila lewat batas waktu.
5. **Hapus data dan tandai selesai**: menghapus semua lead dari username itu beserta analisis, catatan, draft, aktivitas (cascade), dan `DiscoveryRunItem` yang menunjuk lead tersebut. Status `COMPLETED`, hasil tercatat, audit log ditulis.
6. **Tolak** hanya dengan alasan tertulis (mis. permintaan jelas bukan dari pemilik akun dan tidak dapat diverifikasi). Alasan tampil di halaman status.
7. Bila pemohon mengisi email, kabari hasilnya secara manual dari email kontak privasi (aplikasi tidak mengirim email).

Catatan verifikasi: penghapusan hanya menghapus data dari CRM internal Anda; risiko penyalahgunaan (orang lain meminta hapus username tertentu) hanya membuat lead itu hilang dari daftar Anda. Karena itu default-nya diproses, bukan ditolak.

## Alur callback Meta (pengguna aplikasi)

Callback ini dipanggil Meta saat **akun yang meng-authorize app** (yaitu akun Threads pengelola yang terhubung) menghapus app dan meminta penghapusan data.

1. Meta mengirim `POST` form-urlencoded berisi `signed_request`.
2. Signature diverifikasi dengan `THREADS_APP_SECRET`. Gagal → HTTP 400.
3. Bila `user_id` cocok dengan akun terhubung: baris `IntegrationAccount` (termasuk token terenkripsi) dihapus, lalu semua lead yang ditulis username akun itu dihapus dan username di-suppress.
4. `DataDeletionRequest` dibuat langsung berstatus `COMPLETED`.
5. Respons JSON sesuai format Meta:

```json
{ "url": "https://domain-anda/data-deletion/status?code=DEL-XXXXXXXXXX", "confirmation_code": "DEL-XXXXXXXXXX" }
```

Uninstall callback hanya mencabut koneksi (token dihapus, status integrasi "Belum dikonfigurasi").

## Retensi otomatis

Berjalan di akhir setiap discovery run (`applyRetention`), hanya untuk periode yang ditetapkan:

| Setting | Yang dihapus |
|---|---|
| Lead tidak relevan | Lead status Baru yang tidak lolos pre-filter atau berprioritas Abaikan, lebih tua dari N hari sejak ditemukan |
| Data mentah API | Kolom `rawData` dikosongkan (`rawPurgedAt` diisi); teks dan riwayat tetap |
| Lead ditutup | Lead Tidak jadi / Diarsipkan tanpa aktivitas N hari. Lead Deal tidak pernah dihapus otomatis |

Setiap retensi yang menghapus sesuatu ditulis ke audit log.
