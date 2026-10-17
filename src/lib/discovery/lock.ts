import "server-only";
import { db } from "@/lib/db";

/**
 * Lock berbasis baris JobLock. Akuisisi atomik dalam satu statement:
 * insert bila belum ada, atau ambil alih hanya bila lock lama sudah kedaluwarsa.
 * Lock yang kedaluwarsa (proses mati di tengah jalan) otomatis bisa diambil eksekusi berikutnya.
 */
export async function acquireLock(name: string, holderId: string, ttlMs: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ holderId: string }[]>`
    INSERT INTO "JobLock" ("name", "holderId", "acquiredAt", "expiresAt")
    VALUES (${name}, ${holderId}, now(), now() + make_interval(secs => ${ttlMs / 1000}))
    ON CONFLICT ("name") DO UPDATE SET
      "holderId" = EXCLUDED."holderId",
      "acquiredAt" = EXCLUDED."acquiredAt",
      "expiresAt" = EXCLUDED."expiresAt"
    WHERE "JobLock"."expiresAt" < now()
    RETURNING "holderId"
  `;
  return rows.length === 1 && rows[0].holderId === holderId;
}

export async function releaseLock(name: string, holderId: string): Promise<void> {
  await db.jobLock.deleteMany({ where: { name, holderId } });
}

export async function extendLock(name: string, holderId: string, ttlMs: number): Promise<boolean> {
  const res = await db.jobLock.updateMany({
    where: { name, holderId },
    data: { expiresAt: new Date(Date.now() + ttlMs) },
  });
  return res.count === 1;
}
