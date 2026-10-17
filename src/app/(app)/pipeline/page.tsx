import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getPipeline, getServiceMap } from "@/lib/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import { PriorityBadge, SourceBadge, StatusBadge } from "@/components/lead-badges";
import { allowedTransitions, isLeadStatus, PIPELINE_COLUMNS, STATUS_LABELS, type LeadStatus } from "@/lib/leads/crm";
import { formatDateTime, formatRelative } from "@/lib/time";
import type { Priority } from "@/lib/leads/scoring";
import { QuickStatus } from "./quick-status";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  await requireUser();
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "kanban";
  const statusFilter = typeof sp.status === "string" && isLeadStatus(sp.status) ? sp.status : null;
  const includeArchived = sp.archived === "1" || statusFilter === "ARCHIVED";
  const [leads, services] = await Promise.all([getPipeline(includeArchived), getServiceMap()]);
  const now = new Date();
  const filtered = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;

  const tabs = (
    <div className="flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="tablist" aria-label="Tampilan pipeline">
      <Link role="tab" aria-selected={view === "kanban"} href="/pipeline" className={`rounded px-3 py-1.5 ${view === "kanban" ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"}`}>
        Kanban
      </Link>
      <Link role="tab" aria-selected={view === "table"} href="/pipeline?view=table" className={`rounded px-3 py-1.5 ${view === "table" ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink"}`}>
        Tabel
      </Link>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Status penjualan terpisah dari freshness. Lead yang sedang dinegosiasikan tetap di sini walau postingannya sudah lama."
        actions={tabs}
      />

      {leads.length === 0 ? (
        <EmptyState title="Pipeline masih kosong" reason="Lead dengan skor 40 ke atas atau yang sudah Anda tindak lanjuti akan muncul di sini." action={{ href: "/leads", label: "Lihat lead fresh" }} />
      ) : view === "kanban" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="grid auto-cols-[260px] grid-flow-col gap-3">
            {PIPELINE_COLUMNS.map((col) => {
              const items = leads.filter((l) => l.status === col);
              return (
                <section key={col} aria-label={STATUS_LABELS[col]} className="flex min-h-40 flex-col rounded-lg bg-sunken/70 p-2">
                  <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm font-semibold text-ink">
                    {STATUS_LABELS[col]}
                    <span className="tabular text-xs font-normal text-muted">{items.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {items.slice(0, 60).map((l) => (
                      <li key={l.id} className="relative rounded-md border border-line bg-surface p-3 hover:border-line-strong">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">@{l.authorUsername ?? "?"}</span>
                          <PriorityBadge priority={l.priority as Priority | null} score={l.leadScore} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-ink-2">{l.text}</p>
                        {l.estimatedService ? <p className="mt-1 truncate text-xs text-muted">{services.get(l.estimatedService)?.name ?? l.estimatedService}</p> : null}
                        <p className="mt-1 text-xs text-faint">
                          {l.nextFollowUpAt ? (
                            <span className={l.nextFollowUpAt < now ? "text-clay" : ""}>Follow-up {formatDateTime(l.nextFollowUpAt)}</span>
                          ) : (
                            `Aktivitas ${formatRelative(l.lastActivityAt, now)}`
                          )}
                        </p>
                        <SourceBadge source={l.source} />
                        <div className="mt-2">
                          <QuickStatus
                            leadId={l.id}
                            label={`@${l.authorUsername ?? l.id}`}
                            options={allowedTransitions(l.status as LeadStatus).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                          />
                        </div>
                        <Link href={`/leads/${l.id}`} className="absolute inset-0" aria-label={`Buka @${l.authorUsername ?? l.id}`} />
                      </li>
                    ))}
                    {items.length > 60 ? <li className="px-1 text-xs text-muted">+{items.length - 60} lainnya, lihat tampilan tabel</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="view" value="table" />
            <div>
              <label htmlFor="status" className="field-label">
                Status
              </label>
              <select id="status" name="status" defaultValue={statusFilter ?? ""} className="input">
                <option value="">Semua aktif</option>
                {[...PIPELINE_COLUMNS, "ARCHIVED" as const].map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">
              Terapkan
            </button>
          </form>
          <div className="panel overflow-x-auto">
            <table className="table-base min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">Penulis</th>
                  <th scope="col">Status</th>
                  <th scope="col">Skor</th>
                  <th scope="col">Layanan</th>
                  <th scope="col">Follow-up</th>
                  <th scope="col">Aktivitas terakhir</th>
                  <th scope="col">Dihubungi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-canvas">
                    <td>
                      <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:underline">
                        @{l.authorUsername ?? "?"}
                      </Link>
                      <p className="line-clamp-1 max-w-xs text-xs text-muted">{l.text}</p>
                    </td>
                    <td>
                      <StatusBadge status={l.status as LeadStatus} />
                    </td>
                    <td>
                      <PriorityBadge priority={l.priority as Priority | null} score={l.leadScore} />
                    </td>
                    <td className="text-ink-2">{l.estimatedService ? (services.get(l.estimatedService)?.name ?? l.estimatedService) : "-"}</td>
                    <td className={l.nextFollowUpAt && l.nextFollowUpAt < now ? "text-clay" : "text-ink-2"}>{formatDateTime(l.nextFollowUpAt)}</td>
                    <td className="text-ink-2">{formatRelative(l.lastActivityAt, now)}</td>
                    <td className="text-ink-2">{formatDateTime(l.contactedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? <p className="p-4 text-sm text-muted">Tidak ada lead dengan status ini.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
