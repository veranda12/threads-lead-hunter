import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { readSession } from "@/lib/auth/session";
import { safeEqual } from "@/lib/crypto";
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, fetchMe } from "@/lib/providers/threads-api";
import { storeThreadsToken } from "@/lib/providers/threads-integration";
import { audit } from "@/lib/audit";

const STATE_COOKIE = "tlh_threads_oauth_state";

function back(message: string) {
  return NextResponse.redirect(new URL(`/settings?threads=${encodeURIComponent(message)}#integrasi`, env.appUrl));
}

export async function GET(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.redirect(new URL("/login", env.appUrl));

  const params = req.nextUrl.searchParams;
  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/threads/oauth" });

  if (params.get("error")) {
    return back(params.get("error_description")?.slice(0, 200) ?? "Otorisasi dibatalkan");
  }
  const state = params.get("state") ?? "";
  if (!expectedState || !safeEqual(state, expectedState)) {
    await audit({ action: "threads.oauth_state_mismatch", actorId: user.id });
    return back("State OAuth tidak cocok, ulangi koneksi");
  }
  // Threads menambahkan "#_" pada code di beberapa redirect; buang bila ada.
  const code = (params.get("code") ?? "").replace(/#_$/, "");
  if (!code || !env.threadsAppId || !env.threadsAppSecret) return back("Kode otorisasi tidak ada");

  try {
    const short = await exchangeCodeForShortLivedToken({
      appId: env.threadsAppId,
      appSecret: env.threadsAppSecret,
      redirectUri: env.threadsRedirectUri,
      code,
    });
    const long = await exchangeForLongLivedToken({ appSecret: env.threadsAppSecret, shortLivedToken: short.accessToken });
    const me = await fetchMe(long.accessToken);
    await storeThreadsToken({
      accessToken: long.accessToken,
      expiresInSeconds: long.expiresInSeconds,
      externalUserId: me.id || short.userId,
      username: me.username,
      actorId: user.id,
    });
    return back("connected");
  } catch (error) {
    await audit({ action: "threads.oauth_failed", actorId: user.id, metadata: { message: (error as Error).message.slice(0, 300) } });
    return back((error as Error).message.slice(0, 200));
  }
}
