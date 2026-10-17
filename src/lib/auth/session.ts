import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Perpanjang sesi hanya bila lastSeen sudah lewat dari interval ini, agar tidak menulis DB setiap request.
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function sessionCookieName(): string {
  // Prefix __Host- mewajibkan Secure, Path=/, tanpa Domain: cookie tidak bisa ditimpa subdomain.
  return process.env.NODE_ENV === "production" ? "__Host-tlh_session" : "tlh_session";
}

export type SessionUser = { id: string; email: string; name: string; sessionId: string };

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.userSession.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Validasi sesi di server. Token di cookie hanya dibandingkan dalam bentuk hash. */
export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token || token.length > 200) return null;
  const session = await db.userSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  const now = Date.now();
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => undefined);
  }
  return { ...session.user, sessionId: session.id };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await db.userSession.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(sessionCookieName());
}

export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const res = await db.userSession.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
