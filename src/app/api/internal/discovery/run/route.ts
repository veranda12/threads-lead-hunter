import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp, hasValidBearer } from "@/lib/http";
import { runDiscovery } from "@/lib/discovery/pipeline";
import { audit } from "@/lib/audit";

// Vercel: batas eksekusi function. Pipeline sendiri berhenti lebih awal sesuai runTimeoutSeconds.
export const maxDuration = 300;

/**
 * Endpoint scheduler. Hanya bisa dipanggil dengan Authorization: Bearer CRON_SECRET.
 * Header X-Execution-Id dipakai sebagai idempotency key (GitHub: run_id-run_attempt).
 */
export async function POST(req: Request) {
  if (!hasValidBearer(req, env.cronSecret)) {
    await audit({ action: "discovery.unauthorized_call", ipAddress: clientIp(req) });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawId = req.headers.get("x-execution-id")?.trim();
  if (rawId && !/^[A-Za-z0-9._:-]{1,120}$/.test(rawId)) {
    return NextResponse.json({ error: "invalid execution id" }, { status: 400 });
  }
  const trigger = req.headers.get("x-trigger") === "worker" ? "WORKER" : "SCHEDULER";
  try {
    const summary = await runDiscovery({ executionId: rawId ? `gh-${rawId}` : undefined, trigger });
    const status = summary.status === "FAILED" ? 500 : 200;
    return NextResponse.json(summary, { status });
  } catch (error) {
    console.error("[discovery] run gagal", error);
    return NextResponse.json({ error: "run failed", message: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}
