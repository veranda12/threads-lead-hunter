import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { readSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/providers/threads-api";

const OAUTH_STATE_COOKIE = "tlh_threads_oauth_state";

export async function GET() {
  const user = await readSession();
  if (!user) return NextResponse.redirect(new URL("/login", env.appUrl));
  if (!env.threadsAppId || !env.threadsAppSecret) {
    return NextResponse.redirect(new URL("/settings?threads=THREADS_APP_ID%20belum%20diatur#integrasi", env.appUrl));
  }
  const state = randomToken(24);
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/api/threads/oauth",
    maxAge: 600,
  });
  return NextResponse.redirect(buildAuthorizeUrl(env.threadsAppId, env.threadsRedirectUri, state));
}
