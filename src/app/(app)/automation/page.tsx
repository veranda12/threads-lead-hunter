import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getAiStatus } from "@/lib/queries";
import { getThreadsHealth, threadsQuotaUsed24h } from "@/lib/providers/threads-integration";
import { tokensUsedToday } from "@/lib/ai/client";
import { Badge, EmptyState, KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { formatDateTime, formatDuration, formatRelative, formatTime } from "@/lib/time";
import { RUN_STATUS_LABELS, RUN_TRIGGER_LABELS } from "@/lib/labels";
import { PROVIDER_STATUS_LABELS } from "@/lib/providers/types";
import { ManualRunButton } from "./run-button";

export const metadata: Metadata = { title: "Otomasi" };

const SCHEDULE_MINUTES = 30;

function statusTone(s: string) {
  return s === "SUCCEEDED" ? "pine" : s === "PARTIAL" ? "ochre" : s === "FAILED" ? "danger" : "neutral";
}

export default async function AutomationPage({ searchParams }: PageProps<"/automation">) {
  await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const [runs, lastScheduler, lock, threadsHealth, providerRow, quotaUsed, threads, ai, discovery, tokens, failures, aiStatus] = await Promise.all([
    db.discoveryRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    db.discoveryRun.findFirst({ where: { trigger: "SCHEDULER" }, orderBy: { startedAt: "desc" } }),
    db.jobLock.findUnique({ where: { name: "discovery" } }),
    getThreadsHealth(now),
    db.searchProvider.findUnique({ where: { kind: "OFFICIAL_THREADS" } }),
    threadsQuotaUsed24h(now),
    getSetting("threads"),
    getSetting("ai"),
    getSetting("discovery"),
    tokensUsedToday(now),
    db.apiUsageLog.findMany({ where: { success: false }, orderBy: { createdAt: "desc" }, take: 15 }),
    getAiStatus(),
  ]);
  const selectedId = typeof sp.run === "string" ? sp.run : runs[0]?.id;
  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const selectedLog = (selected?.log as { at: string; level: string; message: string }[] | null) ?? [];
  const nextExpected = lastScheduler ? new Date(lastScheduler.startedAt.getTime() + SCHEDULE_MINUTES * 60_000) : null;
  const schedulerStale = lastScheduler ? now.getTime() - lastScheduler.startedAt.getTime() > 3 * SCHEDULE_MINUTES * 60_000 : true;
  const lockActive = lock && lock.expiresAt > now;

  return (
    <div>
      <PageHeader
        title="Otomasi"
        description={`Scheduler GitHub Actions memanggil discovery setiap ${SCHEDULE_MINUTES} menit. Setiap run memakai waktu server aktual untuk menghitung batas 6 jam.`}
        actions={<ManualRunButton />}
      />

      {!discovery.enabled ? (
        <div className="mb-6">
          <Notice tone="warn" title="Discovery dinonaktifkan">
            Run dari scheduler akan langsung dilewati. Aktifkan di <Link href="/settings#scheduler" className="link">Pengaturan</Link>.
          </Notice>
        </div>
      ) : schedulerStale ? (
        <div className="mb-6">
          <Notice tone="warn" title={lastScheduler ? "Scheduler tidak terlihat aktif" : "Belum ada run dari scheduler"}>
            {lastScheduler
              ? `Run scheduler terakhir ${formatRelative(lastScheduler.startedAt, now)}. Cek tab Actions di GitHub dan secret CRON_SECRET serta APP_URL.`
              : "Aktifkan workflow .github/workflows/discovery.yml dan isi secret APP_URL serta CRON_SECRET di repository. Lihat docs/SCHEDULER.md."}
          </Notice>
        </div>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="sched-h" className="panel p-4">
          <h2 id="sched-h" className="mb-3 text-sm font-semibold">
            Scheduler
          </h2>
          <KeyValue
            items={[
              { label: "Run terakhir", value: runs[0] ? `${RUN_STATUS_LABELS[runs[0].status]}, ${formatRelative(runs[0].startedAt, now)}` : "Belum ada" },
              {
                label: "Perkiraan berikutnya",
                value: nextExpected ? (
                  <>
                    {formatDateTime(nextExpected)}
                    <span className="block text-xs text-faint">GitHub Actions bisa terlambat beberapa menit</span>
                  </>
                ) : (
                  "Tidak diketahui"
                ),
              },
              { label: "Lock", value: lockActive ? `Dipegang run aktif sampai ${formatDateTime(lock!.expiresAt)}` : "Bebas" },
              { label: "Interval minimum", value: `${discovery.minIntervalMinutes} menit` },
              { label: "Batas waktu run", value: `${discovery.runTimeoutSeconds} detik` },
            ]}
          />
        </section>

        <section aria-labelledby="prov-h" className="panel p-4">
          <h2 id="prov-h" className="mb-3 text-sm font-semibold">
            Provider
          </h2>
          <KeyValue
            items={[
              {
                label: "Threads API",
                value: (
                  <>
                    <Badge tone={threadsHealth.status === "CONNECTED" ? "pine" : "ochre"}>{PROVIDER_STATUS_LABELS[threadsHealth.status]}</Badge>
                    <span className="mt-1 block text-xs text-muted">{threadsHealth.message}</span>
                  </>
                ),
              },
              { label: "Import manual", value: <Badge tone="pine">Tersedia</Badge> },
              { label: "Sukses terakhir", value: formatDateTime(providerRow?.lastSuccessAt) },
              { label: "Error terakhir", value: providerRow?.lastError ? <span className="text-danger">{providerRow.lastError}</span> : "-" },
            ]}
          />
        </section>

        <section aria-labelledby="quota-h" className="panel p-4">
          <h2 id="quota-h" className="mb-3 text-sm font-semibold">
            Kuota dan rate limit
          </h2>
          <KeyValue
            items={[
              {
                label: "Query Threads 24 jam",
                value: (
                  <span className="tabular">
                    {quotaUsed} / {threads.dailyQueryBudget}
                    <span className="block text-xs text-faint">Batas Meta 2.200 per 24 jam bergulir. Query tanpa hasil tidak dihitung.</span>
                  </span>
                ),
              },
              {
                label: "Rate limit",
                value:
                  providerRow?.rateLimitedUntil && providerRow.rateLimitedUntil > now ? (
                    <span className="text-clay">Aktif, {formatDuration(providerRow.rateLimitedUntil.getTime() - now.getTime())} lagi</span>
                  ) : (
                    "Tidak aktif"
                  ),
              },
              {
                label: "AI",
                value: (
                  <>
                    {aiStatus.runtime.label}
                    <span className={`block text-xs ${aiStatus.runtime.available || aiStatus.runtime.provider === "ollama" ? "text-muted" : "text-ochre"}`}>
                      {aiStatus.runtime.reason}
                    </span>
                    {aiStatus.runtime.provider === "ollama" ? (
                      <span className="block text-xs text-faint">
                        Worker lokal terakhir: {aiStatus.lastLocalRun ? `${RUN_STATUS_LABELS[aiStatus.lastLocalRun.status]}, ${formatRelative(aiStatus.lastLocalRun.startedAt, now)}` : "belum pernah"}
                      </span>
                    ) : null}
                  </>
                ),
              },
              { label: "Token Claude hari ini", value: <span className="tabular">{tokens.toLocaleString("id-ID")} / {ai.dailyTokenBudget.toLocaleString("id-ID")}</span> },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="hist-h">
          <SectionTitle id="hist-h">Riwayat run</SectionTitle>
          {runs.length === 0 ? (
            <EmptyState title="Belum ada run" reason="Jalankan discovery manual atau tunggu scheduler." />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="table-base min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Mulai</th>
                    <th scope="col">Pemicu</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">Query</th>
                    <th scope="col" className="text-right">Diambil</th>
                    <th scope="col" className="text-right">Baru</th>
                    <th scope="col" className="text-right">Analisis</th>
                    <th scope="col" className="text-right">Error</th>
                    <th scope="col">Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className={r.id === selected?.id ? "bg-canvas" : ""}>
                      <td>
                        <Link href={`/automation?run=${r.id}`} className="text-ink hover:underline" aria-current={r.id === selected?.id ? "true" : undefined}>
                          {formatDateTime(r.startedAt)}
                        </Link>
                      </td>
                      <td className="text-ink-2">{RUN_TRIGGER_LABELS[r.trigger]}</td>
                      <td>
                        <Badge tone={statusTone(r.status)}>{RUN_STATUS_LABELS[r.status]}</Badge>
                      </td>
                      <td className="tabular text-right">{r.apiRequests}</td>
                      <td className="tabular text-right">{r.postsFetched}</td>
                      <td className="tabular text-right">{r.postsNew}</td>
                      <td className="tabular text-right">
                        {r.analyzed}
                        {r.analysisPending ? <span className="block text-xs text-faint">{r.analysisPending} pending</span> : null}
                      </td>
                      <td className={`tabular text-right ${r.errorCount ? "text-danger" : ""}`}>{r.errorCount}</td>
                      <td className="text-ink-2">{r.finishedAt ? `${Math.max(0, Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000))} dtk` : "berjalan"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="log-h">
          <SectionTitle id="log-h" aside={selected ? <span className="text-xs">{selected.executionId}</span> : null}>
            Log run
          </SectionTitle>
          {selected ? (
            <div className="panel p-4">
              <p className="mb-3 text-xs text-muted">
                Cutoff {formatDateTime(selected.cutoffAt)} dari waktu server {formatDateTime(selected.serverNow)}. Stale {selected.postsStale}, timestamp invalid {selected.postsInvalid}, duplikat{" "}
                {selected.postsDuplicate}, tidak lolos pre-filter {selected.prefilterRejected}, draft {selected.draftsGenerated}.
              </p>
              {selected.error ? <p className="mb-3 text-sm text-danger">{selected.error}</p> : null}
              {selectedLog.length === 0 ? (
                <p className="text-sm text-muted">Tidak ada entri log.</p>
              ) : (
                <ol className="max-h-[480px] space-y-1.5 overflow-y-auto text-xs">
                  {selectedLog.map((l, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr] gap-2">
                      <span className="tabular text-faint">{formatTime(l.at)}</span>
                      <span className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-ochre" : "text-ink-2"}>{l.message}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Pilih run untuk melihat log.</p>
          )}

          <div className="mt-8" />
          <SectionTitle>Error API terbaru</SectionTitle>
          {failures.length === 0 ? (
            <p className="text-sm text-muted">Tidak ada panggilan API yang gagal.</p>
          ) : (
            <ul className="panel divide-y divide-line text-xs">
              {failures.map((f) => (
                <li key={f.id} className="px-3 py-2">
                  <span className="font-medium text-ink">{f.provider === "THREADS" ? "Threads" : f.provider === "OLLAMA" ? "Ollama" : "Claude"}</span> <span className="text-muted">{f.operation}</span>{" "}
                  <span className="text-faint">{formatDateTime(f.createdAt)}</span>
                  <p className="mt-0.5 text-danger">{f.error}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
