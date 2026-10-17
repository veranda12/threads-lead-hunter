import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/client/buttons";
import { formatRelative } from "@/lib/time";
import { KEYWORD_CATEGORY_LABELS } from "@/lib/labels";
import { planQueryBudget, rotateKeywords } from "@/lib/discovery/budget";
import { threadsQuotaUsed24h } from "@/lib/providers/threads-integration";
import { deleteKeywordAction, toggleKeywordAction } from "./actions";
import { AddKeywordForm, EditKeyword } from "./keyword-forms";

export const metadata: Metadata = { title: "Keyword" };

export default async function KeywordsPage() {
  await requireUser();
  const now = new Date();
  const [keywords, discovery, threads, used] = await Promise.all([
    db.searchKeyword.findMany({ orderBy: [{ category: "asc" }, { phrase: "asc" }] }),
    getSetting("discovery"),
    getSetting("threads"),
    threadsQuotaUsed24h(now),
  ]);
  const plan = planQueryBudget({
    dailyBudget: threads.dailyQueryBudget,
    usedLast24h: used,
    minIntervalMinutes: discovery.minIntervalMinutes,
    maxKeywordsPerRun: discovery.maxKeywordsPerRun,
    maxPagesPerKeyword: discovery.maxPagesPerKeyword,
  });
  const nextBatch = new Set(rotateKeywords(keywords.filter((k) => k.enabled), plan.keywordSlots).map((k) => k.id));
  const enabled = keywords.filter((k) => k.enabled).length;

  return (
    <div>
      <PageHeader
        title="Keyword"
        description={`${enabled} keyword aktif. Setiap run mencari paling banyak ${plan.keywordSlots} keyword (${plan.reason.toLowerCase()}), dimulai dari yang paling lama tidak dicari.`}
      />
      <div className="mb-6">
        <AddKeywordForm />
      </div>

      {keywords.length === 0 ? (
        <EmptyState title="Belum ada keyword" reason="Tambahkan frasa yang biasa dipakai orang saat mencari jasa, atau jalankan npm run db:seed untuk keyword awal." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th scope="col">Keyword</th>
                <th scope="col">Kategori</th>
                <th scope="col" className="text-right">
                  Pencarian
                </th>
                <th scope="col" className="text-right">
                  Hasil
                </th>
                <th scope="col" className="text-right">
                  Lead
                </th>
                <th scope="col" className="text-right">
                  Terkualifikasi
                </th>
                <th scope="col" className="text-right">
                  Error
                </th>
                <th scope="col">Terakhir dicari</th>
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((k) => (
                <tr key={k.id} className={k.enabled ? "" : "text-faint"}>
                  <td>
                    <span className={`font-medium ${k.enabled ? "text-ink" : "text-faint line-through"}`}>{k.phrase}</span>
                    <div className="mt-0.5 flex gap-1">
                      {!k.enabled ? <Badge>Nonaktif</Badge> : null}
                      {nextBatch.has(k.id) ? <Badge tone="pine">Run berikutnya</Badge> : null}
                    </div>
                    {k.lastError ? <p className="mt-1 max-w-xs truncate text-xs text-danger" title={k.lastError}>{k.lastError}</p> : null}
                  </td>
                  <td className="text-ink-2">{KEYWORD_CATEGORY_LABELS[k.category]}</td>
                  <td className="tabular text-right">{k.searchCount}</td>
                  <td className="tabular text-right">{k.totalResults}</td>
                  <td className="tabular text-right">{k.leadsFound}</td>
                  <td className="tabular text-right">
                    {k.qualifiedLeads}
                    {k.leadsFound > 0 ? <span className="block text-xs text-faint">{Math.round((k.qualifiedLeads / k.leadsFound) * 100)}%</span> : null}
                  </td>
                  <td className={`tabular text-right ${k.errorCount ? "text-danger" : ""}`}>{k.errorCount}</td>
                  <td className="text-ink-2">{k.lastSearchedAt ? formatRelative(k.lastSearchedAt, now) : "Belum pernah"}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1">
                      <EditKeyword id={k.id} phrase={k.phrase} category={k.category} />
                      <form action={toggleKeywordAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          {k.enabled ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </form>
                      <form action={deleteKeywordAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <ConfirmSubmit confirmText={k.leadsFound > 0 ? "Nonaktifkan?" : "Hapus?"}>Hapus</ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Keyword yang sudah menghasilkan lead tidak dihapus permanen, hanya dinonaktifkan, agar statistik dan riwayat lead tetap utuh.</p>
    </div>
  );
}
