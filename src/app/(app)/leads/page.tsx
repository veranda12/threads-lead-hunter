import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getServiceMap, listLeads, parseLeadFilters } from "@/lib/queries";
import { db } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/leads/crm";
import { CATEGORY_LABELS, LEAD_CATEGORIES } from "@/lib/ai/schemas";

export const metadata: Metadata = { title: "Lead" };

function buildQuery(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v !== undefined && v !== "") params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  await requireUser();
  const sp = await searchParams;
  const filters = parseLeadFilters(sp);
  const now = new Date();
  const [{ rows, total, page, pageSize }, keywords, services] = await Promise.all([
    listLeads(filters, now),
    db.searchKeyword.findMany({ orderBy: { phrase: "asc" }, select: { id: true, phrase: true } }),
    getServiceMap(),
  ]);
  const serverNow = now.toISOString();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current: Record<string, string | undefined> = {
    fresh: filters.fresh ? undefined : "0",
    priority: filters.priority,
    category: filters.category,
    status: filters.status,
    keyword: filters.keyword,
    minScore: filters.minScore?.toString(),
    from: filters.from,
    to: filters.to,
    q: filters.q,
    analysis: filters.analysis,
  };
  const hasFilters = Object.entries(current).some(([k, v]) => v !== undefined && k !== "fresh");

  return (
    <div>
      <PageHeader
        title={filters.fresh ? "Lead fresh" : "Semua lead"}
        description={
          filters.fresh
            ? "Postingan yang diposting dalam 6 jam terakhir, diurutkan dari skor tertinggi. Lead yang lewat 6 jam pindah ke Semua lead tanpa kehilangan status CRM."
            : "Seluruh lead yang tersimpan, terbaru lebih dulu."
        }
        actions={
          <Link href="/leads/import" className="btn btn-primary">
            Import postingan
          </Link>
        }
      />

      <form method="get" className="panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Filter lead">
        <div className="sm:col-span-2 xl:col-span-2">
          <label htmlFor="q" className="field-label">
            Cari teks atau username
          </label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="mis. inventory, @username" />
        </div>
        <div>
          <label htmlFor="fresh" className="field-label">
            Freshness
          </label>
          <select id="fresh" name="fresh" defaultValue={filters.fresh ? "1" : "0"} className="input">
            <option value="1">Fresh saja (6 jam)</option>
            <option value="0">Semua waktu</option>
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="field-label">
            Prioritas
          </label>
          <select id="priority" name="priority" defaultValue={filters.priority ?? ""} className="input">
            <option value="">Semua</option>
            <option value="HIGH">Tinggi (80+)</option>
            <option value="MEDIUM">Sedang (60-79)</option>
            <option value="LOW">Rendah (40-59)</option>
            <option value="IGNORE">Abaikan (0-39)</option>
            <option value="UNSCORED">Belum dinilai</option>
          </select>
        </div>
        <div>
          <label htmlFor="category" className="field-label">
            Kategori
          </label>
          <select id="category" name="category" defaultValue={filters.category ?? ""} className="input">
            <option value="">Semua</option>
            {LEAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="input">
            <option value="">Semua kecuali arsip</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="keyword" className="field-label">
            Keyword
          </label>
          <select id="keyword" name="keyword" defaultValue={filters.keyword ?? ""} className="input">
            <option value="">Semua</option>
            {keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {k.phrase}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="minScore" className="field-label">
            Skor minimal
          </label>
          <input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={filters.minScore} className="input tabular" />
        </div>
        <div>
          <label htmlFor="from" className="field-label">
            Ditemukan dari
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className="input" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            Sampai
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className="input" />
        </div>
        <div>
          <label htmlFor="analysis" className="field-label">
            Pre-filter
          </label>
          <select id="analysis" name="analysis" defaultValue={filters.analysis ?? ""} className="input">
            <option value="">Sembunyikan yang tidak lolos</option>
            <option value="all">Tampilkan semua</option>
            <option value="hidden">Hanya yang tidak lolos</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <button type="submit" className="btn btn-primary">
            Terapkan
          </button>
          {hasFilters ? (
            <Link href={filters.fresh ? "/leads" : "/leads?fresh=0"} className="btn btn-ghost">
              Reset
            </Link>
          ) : null}
        </div>
      </form>

      <p className="mb-2 text-sm text-muted" aria-live="polite">
        {total.toLocaleString("id-ID")} lead{pages > 1 ? `, halaman ${page} dari ${pages}` : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Tidak ada lead yang cocok dengan filter" : filters.fresh ? "Belum ada lead fresh" : "Belum ada lead"}
          reason={
            hasFilters
              ? "Longgarkan filter atau lihat semua waktu."
              : filters.fresh
                ? "Tidak ada postingan relevan dalam 6 jam terakhir. Cek status discovery di halaman Otomasi, atau import postingan manual."
                : "Lead akan muncul setelah discovery berjalan atau setelah Anda mengimpor postingan."
          }
          action={hasFilters ? { href: "/leads?fresh=0", label: "Lihat semua waktu" } : { href: "/leads/import", label: "Import postingan" }}
        />
      ) : (
        <div className="panel overflow-hidden">
          {rows.map((l) => {
            const a = l.analyses[0];
            const svc = a?.estimatedService ? services.get(a.estimatedService) : undefined;
            return (
              <LeadRow
                key={l.id}
                serverNow={serverNow}
                lead={{
                  ...l,
                  keyword: l.matchedKeyword?.phrase ?? null,
                  reason: a?.qualificationReason ?? l.analysisError ?? (l.analysisStatus === "PREFILTERED_OUT" ? `Pre-filter: ${l.prefilterReason}` : null),
                  service: svc ? { name: svc.name, price: svc.price.text } : null,
                  budget: a?.budgetType === "STATED_BY_AUTHOR" ? a.possibleBudget : null,
                  dmPreview: l.drafts[0]?.revisions[0]?.body ?? null,
                }}
              />
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Halaman" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="btn btn-secondary btn-sm" href={`/leads${buildQuery(current, { page: String(page - 1) })}`}>
              Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          {page < pages ? (
            <Link className="btn btn-secondary btn-sm" href={`/leads${buildQuery(current, { page: String(page + 1) })}`}>
              Berikutnya
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
