import { safeEqual } from "@/lib/crypto";

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || null;
}

/** Validasi "Authorization: Bearer <secret>" dengan perbandingan constant-time. */
export function hasValidBearer(req: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return Boolean(m && safeEqual(m[1].trim(), secret));
}

/** CSRF untuk Route Handler yang memakai cookie: Origin harus sama dengan APP_URL atau host request. */
export function isSameOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.origin === new URL(appUrl).origin || (host !== null && o.host === host);
  } catch {
    return false;
  }
}
