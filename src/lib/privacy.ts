import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { randomToken } from "@/lib/crypto";
import { normalizeUsername, usernameHash } from "@/lib/discovery/normalize";
import { getSetting, type PrivacySettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

const DAY_MS = 24 * 3600_000;

export function newConfirmationCode(): string {
  return `DEL-${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()}`;
}

/** Field privacy yang wajib dilengkapi sebelum halaman kebijakan dipakai untuk App Review. */
export function privacyConfigGaps(p: PrivacySettings): string[] {
  const gaps: string[] = [];
  if (!p.controllerName.trim()) gaps.push("Nama pengelola data");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.contactEmail.trim())) gaps.push("Email kontak privasi");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveDate.trim())) gaps.push("Tanggal berlaku kebijakan");
  if (p.retentionUnqualifiedDays === null) gaps.push("Retensi lead yang tidak relevan");
  if (p.retentionRawPayloadDays === null) gaps.push("Retensi data mentah API");
  if (p.retentionClosedLeadDays === null) gaps.push("Retensi lead yang ditutup");
  if (p.deletionResponseDays === null) gaps.push("Batas waktu respons permintaan penghapusan");
  return gaps;
}

/**
 * Hapus semua lead dari satu penulis Threads dan cegah pengambilan ulang.
 * Riwayat CRM (aktivitas, catatan, draft) ikut terhapus lewat cascade karena berisi konteks postingan.
 */
export async function deleteAuthorData(username: string, reason: string): Promise<number> {
  const normalized = normalizeUsername(username);
  if (!normalized) return 0;
  const result = await db.$transaction(async (tx) => {
    const leads = await tx.lead.findMany({ where: { authorUsername: { equals: normalized, mode: "insensitive" } }, select: { id: true } });
    const ids = leads.map((l) => l.id);
    // Run item menyimpan ID postingan; ikut dihapus agar tidak ada jejak yang tertinggal.
    if (ids.length) await tx.discoveryRunItem.deleteMany({ where: { leadId: { in: ids } } });
    const deleted = await tx.lead.deleteMany({ where: { id: { in: ids } } });
    await tx.suppressedAuthor.upsert({
      where: { usernameHash: usernameHash(normalized) },
      create: { usernameHash: usernameHash(normalized), reason },
      update: { reason },
    });
    return deleted.count;
  });
  return result;
}

export async function suppressAuthor(username: string, reason: string) {
  const hash = usernameHash(username);
  await db.suppressedAuthor.upsert({ where: { usernameHash: hash }, create: { usernameHash: hash, reason }, update: {} });
}

/**
 * Callback Data Deletion dari Meta. user_id dalam signed_request adalah ID pengguna aplikasi
 * (akun Threads yang meng-authorize app ini), bukan penulis postingan yang ditemukan lewat pencarian.
 */
export async function handleMetaDeletion(platformUserId: string, ip: string | null) {
  const account = await db.integrationAccount.findFirst({ where: { provider: "OFFICIAL_THREADS", externalUserId: platformUserId } });
  let deletedLeads = 0;
  const actions: string[] = [];
  if (account) {
    await db.integrationAccount.delete({ where: { id: account.id } });
    actions.push("Token akses dan profil akun Threads terhubung dihapus");
    if (account.username) {
      deletedLeads = await deleteAuthorData(account.username, "meta_data_deletion_callback");
      actions.push(`${deletedLeads} lead dari postingan akun tersebut dihapus`);
    }
  } else {
    actions.push("Tidak ada akun terhubung dengan ID tersebut");
  }
  const request = await db.dataDeletionRequest.create({
    data: {
      confirmationCode: newConfirmationCode(),
      source: "META_CALLBACK",
      status: "COMPLETED",
      platformUserId,
      threadsUsername: account?.username ?? null,
      resolution: actions.join(". "),
      deletedLeads,
      ipAddress: ip,
      processedAt: new Date(),
    },
  });
  await audit({ action: "privacy.meta_deletion_callback", entityType: "DataDeletionRequest", entityId: request.id, ipAddress: ip, metadata: { found: Boolean(account), deletedLeads } });
  return request;
}

export async function createWebDeletionRequest(input: { threadsUsername: string; contactEmail?: string; details?: string; ip: string | null }) {
  const username = normalizeUsername(input.threadsUsername);
  // Penulis langsung masuk daftar suppression agar postingan barunya tidak diambil lagi,
  // sementara penghapusan data lama diproses pengelola dari dashboard.
  await suppressAuthor(username, "web_deletion_request_pending");
  const request = await db.dataDeletionRequest.create({
    data: {
      confirmationCode: newConfirmationCode(),
      source: "WEB_FORM",
      status: "RECEIVED",
      threadsUsername: username,
      contactEmail: input.contactEmail?.trim() || null,
      details: input.details?.trim().slice(0, 2000) || null,
      ipAddress: input.ip,
    },
  });
  await audit({ action: "privacy.deletion_requested", entityType: "DataDeletionRequest", entityId: request.id, ipAddress: input.ip });
  return request;
}

export async function completeDeletionRequest(id: string, actorId: string) {
  const req = await db.dataDeletionRequest.findUniqueOrThrow({ where: { id } });
  if (req.status !== "RECEIVED") throw new Error("Permintaan ini sudah diproses");
  const deleted = req.threadsUsername ? await deleteAuthorData(req.threadsUsername, "web_deletion_request_completed") : 0;
  const updated = await db.dataDeletionRequest.update({
    where: { id },
    data: { status: "COMPLETED", processedAt: new Date(), deletedLeads: deleted, resolution: `${deleted} lead dihapus dan username masuk daftar pengecualian` },
  });
  await audit({ action: "privacy.deletion_completed", actorId, entityType: "DataDeletionRequest", entityId: id, metadata: { deleted } });
  return updated;
}

export async function rejectDeletionRequest(id: string, actorId: string, reason: string) {
  const req = await db.dataDeletionRequest.findUniqueOrThrow({ where: { id } });
  if (req.status !== "RECEIVED") throw new Error("Permintaan ini sudah diproses");
  const updated = await db.dataDeletionRequest.update({
    where: { id },
    data: { status: "REJECTED", processedAt: new Date(), resolution: reason.slice(0, 500) },
  });
  await audit({ action: "privacy.deletion_rejected", actorId, entityType: "DataDeletionRequest", entityId: id, metadata: { reason } });
  return updated;
}

export type RetentionResult = { rawPurged: number; unqualifiedDeleted: number; closedDeleted: number; skipped: string[] };

/** Retensi hanya berjalan untuk periode yang sudah ditetapkan pengelola. Null = tidak ada penghapusan otomatis. */
export async function applyRetention(now: Date): Promise<RetentionResult> {
  const p = await getSetting("privacy");
  const result: RetentionResult = { rawPurged: 0, unqualifiedDeleted: 0, closedDeleted: 0, skipped: [] };

  if (p.retentionRawPayloadDays !== null) {
    const res = await db.lead.updateMany({
      where: { discoveredAt: { lt: new Date(now.getTime() - p.retentionRawPayloadDays * DAY_MS) }, rawPurgedAt: null },
      data: { rawData: Prisma.DbNull, rawPurgedAt: now },
    });
    result.rawPurged = res.count;
  } else result.skipped.push("rawPayload");

  if (p.retentionUnqualifiedDays !== null) {
    const res = await db.lead.deleteMany({
      where: {
        status: "NEW",
        discoveredAt: { lt: new Date(now.getTime() - p.retentionUnqualifiedDays * DAY_MS) },
        OR: [{ analysisStatus: "PREFILTERED_OUT" }, { priority: "IGNORE" }],
      },
    });
    result.unqualifiedDeleted = res.count;
  } else result.skipped.push("unqualified");

  if (p.retentionClosedLeadDays !== null) {
    const res = await db.lead.deleteMany({
      where: { status: { in: ["LOST", "ARCHIVED"] }, lastActivityAt: { lt: new Date(now.getTime() - p.retentionClosedLeadDays * DAY_MS) } },
    });
    result.closedDeleted = res.count;
  } else result.skipped.push("closed");

  if (result.rawPurged || result.unqualifiedDeleted || result.closedDeleted) {
    await audit({ action: "privacy.retention_applied", metadata: { ...result } });
  }
  return result;
}
