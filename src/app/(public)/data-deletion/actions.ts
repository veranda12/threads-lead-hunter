"use server";

import { z } from "zod";
import { requestMeta } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createWebDeletionRequest } from "@/lib/privacy";

export type DeletionState =
  | { ok: true; code: string }
  | { ok: false; message?: string; errors?: Record<string, string> }
  | undefined;

const schema = z.object({
  threadsUsername: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@+/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Username Threads hanya berisi huruf, angka, titik, dan garis bawah (maks. 30)")),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Format email tidak valid").max(200)]).optional(),
  details: z.string().trim().max(2000).optional(),
});

export async function submitDeletionRequest(_prev: DeletionState, fd: FormData): Promise<DeletionState> {
  // Honeypot: field tersembunyi yang hanya diisi bot.
  if (String(fd.get("website") ?? "") !== "") return { ok: false, message: "Permintaan tidak dapat diproses." };
  const { ip } = await requestMeta();
  const limit = await consumeRateLimit(`deletion:web:${ip ?? "unknown"}`, 5, 3600);
  if (!limit.allowed) return { ok: false, message: "Terlalu banyak permintaan dari jaringan ini. Coba lagi dalam satu jam / Too many requests, try again in an hour." };

  const parsed = schema.safeParse({
    threadsUsername: fd.get("threadsUsername"),
    contactEmail: fd.get("contactEmail") ?? "",
    details: fd.get("details") ?? "",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }
  const req = await createWebDeletionRequest({ ...parsed.data, contactEmail: parsed.data.contactEmail || undefined, ip });
  return { ok: true, code: req.confirmationCode };
}
