"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession, destroySession, readSession, requestMeta } from "@/lib/auth/session";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

export type LoginState = { error?: string } | undefined;

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

// Hash dummy agar waktu respons sama untuk email yang tidak terdaftar.
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: "Email atau password tidak valid." };
  const { email, password, next } = parsed.data;
  const { ip } = await requestMeta();

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`login:ip:${ip ?? "unknown"}`, 20, 15 * 60),
    consumeRateLimit(`login:email:${email}`, 8, 15 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    await audit({ action: "auth.login_rate_limited", ipAddress: ip, metadata: { email } });
    const wait = Math.ceil(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds) / 60);
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${wait} menit.` };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Akun dikunci sementara karena terlalu banyak percobaan gagal." };
  }
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
    }
    await audit({ action: "auth.login_failed", ipAddress: ip, actorId: user?.id, metadata: { email } });
    return { error: "Email atau password salah." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await resetRateLimit(`login:email:${email}`);
  await createSession(user.id);
  await audit({ action: "auth.login", actorId: user.id, ipAddress: ip });
  redirect(safeNext(next));
}

export async function logoutAction() {
  const user = await readSession();
  await destroySession();
  if (user) await audit({ action: "auth.logout", actorId: user.id });
  redirect("/login");
}
