# Keamanan

## Yang diimplementasikan

| Kontrol | Implementasi |
|---|---|
| Autentikasi | Satu akun admin. Password scrypt (N=2^15, r=8, p=1, salt 16 byte). Hash dummy untuk email tak dikenal agar waktu respons sama |
| Sesi | Token acak 32 byte di cookie `HttpOnly`, `SameSite=Lax`, `Secure` + prefix `__Host-` di produksi. Database hanya menyimpan SHA-256 token. Kedaluwarsa 7 hari, bisa dicabut dari Pengaturan; ganti password mencabut sesi lain |
| Brute force | Rate limit login per IP (20/15 mnt) dan per email (8/15 mnt) di PostgreSQL; akun dikunci 15 menit setelah 10 kegagalan beruntun |
| Otorisasi server-side | `requireUser()` di setiap halaman, `assertUser()` di setiap Server Action. `proxy.ts` hanya redirect optimistis |
| CSRF | Server Actions memakai pemeriksaan Origin bawaan Next.js + cookie SameSite=Lax. OAuth memakai parameter `state` acak di cookie berumur 10 menit |
| Endpoint scheduler | `Authorization: Bearer CRON_SECRET` (≥ 32 karakter), dibandingkan constant-time; akses tidak sah diaudit |
| Callback Meta | `signed_request` diverifikasi HMAC-SHA256 dengan app secret, rate limited |
| Secret di database | Token Threads dienkripsi AES-256-GCM (`ENCRYPTION_KEY`), tidak pernah dikirim ke browser |
| Input | Semua form divalidasi Zod di server; URL import hanya domain resmi Threads |
| Untrusted content | Postingan dibungkus dan di-escape sebelum ke Claude; guard deterministik setelahnya |
| Audit | `AuditLog` append-only (trigger database menolak UPDATE/DELETE/TRUNCATE): login, perubahan status, harga, pengaturan, integrasi, privasi, akses scheduler ilegal |
| Header | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS di produksi; `poweredByHeader` off |
| Secret env | Tidak ada secret di variabel `NEXT_PUBLIC_*`; modul server memakai `server-only` |

## Yang belum ada (sengaja dicatat)

- Content-Security-Policy belum dipasang (butuh nonce untuk inline script Next.js).
- Belum ada 2FA untuk login admin.
- Rate limit memakai fixed window sederhana, bukan sliding window.

## Rotasi secret

- `CRON_SECRET`: ganti di Vercel dan GitHub secret bersamaan.
- `ENCRYPTION_KEY`: mengganti membuat token tersimpan tidak bisa didekripsi; setelah ganti, klik **Hubungkan ulang akun Threads**.
- Password admin: Pengaturan → Keamanan, atau `npm run db:seed -- --reset-admin-password` dengan `ADMIN_PASSWORD` baru.
