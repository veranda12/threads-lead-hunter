import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { handleMetaDeletion } from "@/lib/privacy";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Data Deletion Request Callback (Meta App Dashboard > Threads > Settings > Delete callback URL).
 * Meta mengirim POST form-urlencoded berisi signed_request. Respons wajib JSON { url, confirmation_code }.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = await consumeRateLimit(`meta:deletion:${ip ?? "unknown"}`, 30, 3600);
  if (!limit.allowed) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  if (!env.threadsAppSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let signed = "";
  try {
    const form = await req.formData();
    signed = String(form.get("signed_request") ?? "");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const payload = parseSignedRequest(signed, env.threadsAppSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  const request = await handleMetaDeletion(payload.user_id, ip);
  return NextResponse.json({
    url: `${env.appUrl}/data-deletion/status?code=${encodeURIComponent(request.confirmationCode)}`,
    confirmation_code: request.confirmationCode,
  });
}
