import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Status penghapusan data", robots: { index: false, follow: false } };

const STATUS: Record<string, { id: string; en: string }> = {
  RECEIVED: { id: "Diterima, sedang diproses", en: "Received, in progress" },
  COMPLETED: { id: "Selesai", en: "Completed" },
  REJECTED: { id: "Ditolak", en: "Rejected" },
};

async function Status({ searchParams }: { searchParams: PageProps<"/data-deletion/status">["searchParams"] }) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.trim().toUpperCase().slice(0, 40) : "";
  // Hanya menampilkan status dan ringkasan; tidak membuka username atau email pemohon.
  const req = /^DEL-[A-Z0-9]{6,20}$/.test(code)
    ? await db.dataDeletionRequest.findUnique({ where: { confirmationCode: code }, select: { status: true, createdAt: true, processedAt: true, resolution: true, source: true } })
    : null;

  return (
    <>
      <form method="get" className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="code" className="field-label">
            Kode konfirmasi / Confirmation code
          </label>
          <input id="code" name="code" defaultValue={code} className="input" placeholder="DEL-XXXXXXXXXX" />
        </div>
        <button type="submit" className="btn btn-primary">
          Cek / Check
        </button>
      </form>
      {code ? (
        req ? (
          <dl className="panel mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-sm">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium text-ink">
              {STATUS[req.status].id} / {STATUS[req.status].en}
            </dd>
            <dt className="text-muted">Diterima / Received</dt>
            <dd>{formatDateTime(req.createdAt)}</dd>
            <dt className="text-muted">Diproses / Processed</dt>
            <dd>{formatDateTime(req.processedAt)}</dd>
            {req.resolution ? (
              <>
                <dt className="text-muted">Hasil / Result</dt>
                <dd>{req.resolution}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p role="alert" className="mt-6 text-sm text-danger">
            Kode tidak ditemukan / Code not found.
          </p>
        )
      ) : null}
    </>
  );
}

export default function DeletionStatusPage({ searchParams }: PageProps<"/data-deletion/status">) {
  return (
    <div>
      <h1 className="text-3xl font-semibold text-ink">Status penghapusan data</h1>
      <p className="mt-1 text-lg text-muted">Data deletion status</p>
      <Suspense fallback={<div className="mt-6 h-24" />}>
        <Status searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
