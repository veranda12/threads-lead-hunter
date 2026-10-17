import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type AuditEntry = {
  action: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Tulis audit log. Tabel bersifat append-only (dijaga oleh trigger database). */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress ?? null,
        metadata: entry.metadata,
      },
    });
  } catch (error) {
    // Audit tidak boleh menggagalkan aksi utama, tapi kegagalannya harus terlihat di log server.
    console.error("[audit] gagal menulis audit log", entry.action, error);
  }
}
