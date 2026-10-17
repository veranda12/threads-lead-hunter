# Setup Threads API dan Meta App Review

Hasil audit dokumentasi resmi (developers.facebook.com/docs/threads, Oktober 2026):

| Hal | Fakta | Dampak di aplikasi |
|---|---|---|
| Endpoint | `GET https://graph.threads.net/v1.0/keyword_search` | `src/lib/providers/threads-api.ts` |
| Permission | `threads_basic` + `threads_keyword_search` | Diminta saat OAuth |
| Tanpa approval | Pencarian hanya mengembalikan postingan milik akun yang login | Discovery otomatis dimatikan (status "Butuh izin") sampai Anda mencentang approval di Pengaturan |
| Parameter | `q`, `search_type` (TOP/RECENT), `search_mode`, `media_type`, `since`, `until`, `limit` (maks 100), `author_username` | Dipakai: `search_type=RECENT`, `since`=cutoff, `until`=sekarang |
| Field | Field media standar; `owner` tidak dikembalikan | Diminta: id, text, media_type, permalink, timestamp, username, shortcode |
| Timestamp | ISO 8601, contoh `2023-10-17T05:42:03+0000` | Parser ketat mendukung `+0000` |
| Pagination | `paging.cursors.after` / `paging.next` | Diikuti sampai batas halaman per keyword |
| Rate limit | 2.200 query per 24 jam bergulir per pengguna; query tanpa hasil tidak dihitung | Budget harian default 1.800, dihitung dari `ApiUsageLog.quotaUnits` |
| Konten sensitif | Keyword sensitif mengembalikan array kosong | Dicatat sebagai hasil kosong |
| Token | Short-lived 1 jam → long-lived 60 hari; refresh bila umur ≥ 24 jam dan belum kedaluwarsa | Ditukar otomatis saat OAuth; di-refresh otomatis 7 hari sebelum kedaluwarsa |

## 1. Buat Meta App

1. Buka https://developers.facebook.com/apps → **Create App** → use case **Access the Threads API**.
2. Di **Use cases → Access the Threads API → Customize**, tambahkan permission `threads_basic` dan `threads_keyword_search`.
3. **App settings → Basic**: catat **Threads App ID** dan **Threads App Secret** → isi `THREADS_APP_ID` dan `THREADS_APP_SECRET` di environment server.
4. Di pengaturan Threads use case, isi URL berikut (salin dari halaman **Pengaturan → Integrasi Threads**, semuanya wajib HTTPS):

| Field Meta | URL |
|---|---|
| Redirect Callback URLs | `https://DOMAIN-ANDA/api/threads/oauth/callback` |
| Uninstall Callback URL | `https://DOMAIN-ANDA/api/threads/uninstall` |
| Delete Callback URL | `https://DOMAIN-ANDA/api/threads/data-deletion` |
| Privacy Policy URL | `https://DOMAIN-ANDA/privacy-policy` |

5. Tambahkan akun Threads Anda sebagai **Threads Tester** (App roles → Roles) lalu terima undangan di Threads (Settings → Account → Website permissions → Invites) selama app masih mode development.

## 2. Hubungkan akun

1. Set `APP_URL` ke domain HTTPS dan `THREADS_REDIRECT_URI` persis sama dengan yang didaftarkan.
2. Login dashboard → **Pengaturan → Integrasi Threads → Hubungkan akun Threads**.
3. Setelah redirect kembali, status menjadi "Butuh izin" sampai approval disetujui. Itu benar: tanpa approval hasil pencarian hanya postingan Anda sendiri.

## 3. App Review untuk `threads_keyword_search`

Siapkan:

- Privacy Policy URL publik (halaman ini sudah ada). Lengkapi **Pengaturan → Privasi**: nama pengelola, email, tanggal berlaku, periode retensi, batas waktu penghapusan. Halaman publik menampilkan bagian yang belum diisi sebagai "belum ditetapkan".
- Data Deletion: callback URL (otomatis) dan instruksi manual di `/data-deletion`.
- Screencast: login → Pengaturan → Hubungkan Threads → Otomasi → Jalankan discovery → Lead → detail lead menunjukkan postingan, analisis, draft DM yang disalin manual. Tunjukkan bahwa tidak ada pengiriman otomatis.
- Penjelasan penggunaan: "Aplikasi internal satu pengguna yang mencari postingan publik terbaru berisi kebutuhan jasa pembuatan website/software, agar pengelola dapat menghubungi penulis secara manual. Tidak ada posting, balasan, atau DM otomatis."

Setelah disetujui: **Pengaturan → Integrasi Threads → centang "Meta sudah menyetujui threads_keyword_search"**. Discovery otomatis aktif pada run berikutnya.

## Status integrasi

| Status | Arti | Tindakan |
|---|---|---|
| Belum dikonfigurasi | App ID/secret kosong atau akun belum dihubungkan | Lengkapi env, hubungkan akun |
| Butuh izin | Approval belum ditandai, atau API menolak (code 10 / 2xx / HTTP 403) | Selesaikan App Review |
| Token kedaluwarsa | Token lewat 60 hari, ditolak (code 190), atau tidak bisa didekripsi | Hubungkan ulang |
| Kena rate limit | HTTP 429 / code 4, 17, 32, 613 | Otomatis berhenti sampai `rateLimitedUntil` |
| Error provider | 5xx atau respons tidak valid | Di-retry otomatis (2x, backoff); cek log run |
| Terhubung | Pencarian terakhir berhasil / siap | - |

## Token expired

Long-lived token di-refresh otomatis di awal setiap run bila sisa umurnya ≤ 7 hari dan umurnya ≥ 24 jam. Jika token sudah terlanjur kedaluwarsa (mis. scheduler mati > 60 hari), refresh tidak mungkin: klik **Hubungkan ulang akun Threads**.
