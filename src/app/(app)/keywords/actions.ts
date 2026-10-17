"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";

export type KeywordState = { ok?: boolean; message?: string } | undefined;

const CATEGORIES = ["WEBSITE", "ENTERPRISE_SOFTWARE", "GENERAL", "TECHNICAL"] as const;

const schema = z.object({
  phrase: z
    .string()
    .trim()
    .min(2, "Keyword minimal 2 karakter")
    .max(100, "Keyword maksimal 100 karakter")
    .transform((s) => s.replace(/\s+/g, " ")),
  category: z.enum(CATEGORIES),
});

export async function addKeywordAction(_prev: KeywordState, formData: FormData): Promise<KeywordState> {
  const user = await assertUser();
  const parsed = schema.safeParse({ phrase: formData.get("phrase"), category: formData.get("category") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const k = await db.searchKeyword.create({ data: parsed.data });
    await audit({ action: "keyword.created", actorId: user.id, entityType: "SearchKeyword", entityId: k.id, metadata: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: "Keyword ini sudah ada" };
    throw e;
  }
  refresh();
  return { ok: true, message: "Keyword ditambahkan" };
}

export async function updateKeywordAction(_prev: KeywordState, formData: FormData): Promise<KeywordState> {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  const parsed = schema.safeParse({ phrase: formData.get("phrase"), category: formData.get("category") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await db.searchKeyword.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: "Keyword ini sudah ada" };
    throw e;
  }
  await audit({ action: "keyword.updated", actorId: user.id, entityType: "SearchKeyword", entityId: id, metadata: parsed.data });
  refresh();
  return { ok: true, message: "Tersimpan" };
}

export async function toggleKeywordAction(formData: FormData) {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  const k = await db.searchKeyword.findUniqueOrThrow({ where: { id } });
  await db.searchKeyword.update({ where: { id }, data: { enabled: !k.enabled } });
  await audit({ action: k.enabled ? "keyword.disabled" : "keyword.enabled", actorId: user.id, entityType: "SearchKeyword", entityId: id });
  refresh();
}

/** Hapus hanya bila belum pernah menghasilkan lead; selain itu nonaktifkan agar statistik tetap utuh. */
export async function deleteKeywordAction(formData: FormData) {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  const used = await db.lead.count({ where: { matchedKeywordId: id } });
  if (used > 0) {
    await db.searchKeyword.update({ where: { id }, data: { enabled: false } });
  } else {
    await db.searchKeyword.delete({ where: { id } });
  }
  await audit({ action: used > 0 ? "keyword.disabled" : "keyword.deleted", actorId: user.id, entityType: "SearchKeyword", entityId: id });
  refresh();
}
