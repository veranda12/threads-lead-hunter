import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { disconnectThreads } from "@/lib/providers/threads-integration";
import { audit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";

/** Uninstall (deauthorize) callback: pengguna mencabut akses app di Threads. Token dihapus. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = await consumeRateLimit(`meta:uninstall:${ip ?? "unknown"}`, 30, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  if (!env.threadsAppSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  let signed = "";
  try {
    signed = String((await req.formData()).get("signed_request") ?? "");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const payload = parseSignedRequest(signed, env.threadsAppSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  const account = await db.integrationAccount.findFirst({ where: { provider: "OFFICIAL_THREADS", externalUserId: payload.user_id } });
  if (account) await disconnectThreads(undefined, "Akses dicabut pengguna di Threads (uninstall callback)");
  await audit({ action: "threads.uninstall_callback", ipAddress: ip, metadata: { matched: Boolean(account) } });
  return NextResponse.json({ success: true });
}
