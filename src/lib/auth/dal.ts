import "server-only";
import { redirect } from "next/navigation";
import { readSession, type SessionUser } from "@/lib/auth/session";

/**
 * Data Access Layer: setiap Server Component, Server Action, dan Route Handler yang
 * menyentuh data internal wajib memanggil salah satu fungsi ini. Proxy hanya optimistic check.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect("/login");
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Untuk Server Actions / Route Handlers: lempar error, jangan redirect. */
export async function assertUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) throw new UnauthorizedError();
  return user;
}
