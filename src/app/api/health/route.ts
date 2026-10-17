import { NextResponse } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";

/** Health check publik. Tidak membocorkan konfigurasi, hanya status database. */
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
