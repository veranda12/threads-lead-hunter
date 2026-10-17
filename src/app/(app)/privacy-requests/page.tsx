import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/client/buttons";
import { formatDateTime, formatRelative } from "@/lib/time";
import { completeRequestAction, rejectRequestAction } from "./actions";

export const metadata: Metadata = { title: "Permintaan privasi" };

export default async function PrivacyRequestsPage() {
  await requireUser();
  const now = new Date();
  const [requests, privacy, suppressed] = await Promise.all([
    db.dataDeletionRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
    getSetting("privacy"),
    db.suppressedAuthor.count(),
  ]);
  const usernames = requests.filter((r) => r.status === "RECEIVED" && r.threadsUsername).map((r) => r.threadsUsername!);
  const counts = usernames.length
    ? await db.lead.groupBy({ by: ["authorUsername"], where: { authorUsername: { in: usernames } }, _count: { _all: true } })
    : [];
  const countBy = new Map(counts.map((c) => [c.authorUsername, c._count._all]));
  const open = requests.filter((r) => r.status === "RECEIVED").length;

  return (
    <div>
      <PageHeader
        title="Permintaan privasi"
        description={
          <>
            Permintaan dari formulir publik <Link href="/data-deletion" className="link">/data-deletion</Link> dan callback penghapusan dari Meta. {suppressed} username ada di daftar
            pengecualian.{" "}
            {privacy.deletionResponseDays ? `Target proses ${privacy.deletionResponseDays} hari.` : "Batas waktu proses belum ditetapkan di Pengaturan > Privasi."}
          </>
        }
      />
      {requests.length === 0 ? (
        <EmptyState title="Belum ada permintaan" reason="Permintaan penghapusan data akan muncul di sini. Username pemohon otomatis dikecualikan dari discovery sejak permintaan masuk." />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{open} menunggu diproses</p>
          <ul className="panel divide-y divide-line">
            {requests.map((r) => {
              const overdue = r.status === "RECEIVED" && privacy.deletionResponseDays !== null && now.getTime() - r.createdAt.getTime() > privacy.deletionResponseDays * 86_400_000;
              return (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs text-ink">{r.confirmationCode}</code>
                    <Badge tone={r.status === "COMPLETED" ? "pine" : r.status === "REJECTED" ? "neutral" : overdue ? "clay" : "ochre"}>
                      {r.status === "COMPLETED" ? "Selesai" : r.status === "REJECTED" ? "Ditolak" : overdue ? "Lewat batas waktu" : "Menunggu"}
                    </Badge>
                    <Badge>{r.source === "META_CALLBACK" ? "Callback Meta" : "Formulir web"}</Badge>
                    <span className="text-xs text-faint">
                      {formatDateTime(r.createdAt)} ({formatRelative(r.createdAt, now)})
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-sm text-ink-2">
                    {r.threadsUsername ? <p>Username: @{r.threadsUsername}{r.status === "RECEIVED" ? `, ${countBy.get(r.threadsUsername) ?? 0} lead tersimpan` : ""}</p> : null}
                    {r.platformUserId ? <p>Threads user ID: {r.platformUserId}</p> : null}
                    {r.contactEmail ? (
                      <p>
                        Kontak: <a href={`mailto:${r.contactEmail}`} className="link">{r.contactEmail}</a>
                      </p>
                    ) : null}
                    {r.details ? <p className="whitespace-pre-line text-muted">&ldquo;{r.details}&rdquo;</p> : null}
                    {r.resolution ? <p className="text-muted">Hasil: {r.resolution}</p> : null}
                  </div>
                  {r.status === "RECEIVED" ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <form action={completeRequestAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmSubmit className="btn btn-primary btn-sm" confirmText="Yakin hapus semua datanya?">
                          Hapus data dan tandai selesai
                        </ConfirmSubmit>
                      </form>
                      <form action={rejectRequestAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <label className="sr-only" htmlFor={`reason-${r.id}`}>
                          Alasan penolakan
                        </label>
                        <input id={`reason-${r.id}`} name="reason" className="input w-64" placeholder="Alasan penolakan (wajib jelas)" />
                        <ConfirmSubmit confirmText="Tolak permintaan?">Tolak</ConfirmSubmit>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
