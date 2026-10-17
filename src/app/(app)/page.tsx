import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getAiStatus, getOverview } from "@/lib/queries";
import { getThreadsHealth } from "@/lib/providers/threads-integration";
import { EmptyState, Metric, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { LeadRow } from "@/components/lead-row";
import { formatDate, formatDateTime, formatRelative } from "@/lib/time";
import { PROVIDER_STATUS_LABELS } from "@/lib/providers/types";
import { RUN_STATUS_LABELS } from "@/lib/labels";

export default async function OverviewPage() {
  await requireUser();
  const now = new Date();
  const [data, threads, aiStatus] = await Promise.all([getOverview(now), getThreadsHealth(now), getAiStatus()]);
  const serverNow = now.toISOString();
  const { runtime, lastLocalRun } = aiStatus;
  const localWorkerStale = !lastLocalRun || now.getTime() - lastLocalRun.startedAt.getTime() > 90 * 60_000;
  // Ollama di Vercel memang tidak tersedia; yang perlu diperingatkan hanya bila worker lokal tidak terlihat jalan.
  const aiProblem = runtime.provider === "ollama" ? !runtime.available && localWorkerStale : !runtime.available;
  const usage = data.ai.budget > 0 ? Math.min(100, Math.round((data.ai.tokensToday / data.ai.budget) * 100)) : 0;

  return (
    <div>
      <PageHeader
        title="Ringkasan"
        description={`${formatDate(now)}. Lead dihitung fresh selama 6 jam sejak diposting.`}
        actions={
          <>
            <Link href="/leads/import" className="btn btn-secondary">
              Import postingan
            </Link>
            <Link href="/leads" className="btn btn-primary">
              Buka lead fresh
            </Link>
          </>
        }
      />

      {threads.status !== "CONNECTED" || aiProblem ? (
        <div className="mb-6 space-y-2">
          {threads.status !== "CONNECTED" ? (
            <Notice tone="warn" title={`Threads API: ${PROVIDER_STATUS_LABELS[threads.status]}`}>
              {threads.message} Discovery otomatis belum mengambil postingan; import manual tetap bisa dipakai.{" "}
              <Link href="/settings#integrasi" className="link">
                Atur integrasi
              </Link>
            </Notice>
          ) : null}
          {aiProblem ? (
            runtime.provider === "ollama" ? (
              <Notice tone="warn" title={lastLocalRun ? "Worker AI lokal tidak terlihat jalan" : "Worker AI lokal belum pernah jalan"}>
                Analisis memakai {runtime.label} di laptop Anda.{" "}
                {lastLocalRun ? `Terakhir jalan ${formatRelative(lastLocalRun.startedAt, now)}.` : ""} {data.counts.pendingAnalysis} kandidat menunggu. Nyalakan Ollama dan jalankan{" "}
                <code className="rounded bg-sunken px-1">npm run worker:analyze</code>.
              </Notice>
            ) : (
              <Notice tone="warn" title="Claude API belum dikonfigurasi">
                ANTHROPIC_API_KEY belum diatur, jadi kandidat disimpan sebagai pending tanpa analisis.
              </Notice>
            )
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="fresh-heading">
          <SectionTitle id="fresh-heading" aside={<Link href="/leads" className="link">Semua lead fresh</Link>}>
            Siap dihubungi sekarang
          </SectionTitle>
          {data.freshTop.length === 0 ? (
            <EmptyState
              title="Belum ada lead fresh"
              reason={
                threads.status === "CONNECTED"
                  ? "Belum ada postingan relevan dalam 6 jam terakhir. Discovery berjalan setiap 30 menit."
                  : "Discovery otomatis belum aktif karena integrasi Threads belum siap. Tempel URL postingan yang Anda temukan untuk dianalisis."
              }
              action={{ href: "/leads/import", label: "Import postingan manual" }}
            />
          ) : (
            <div className="panel overflow-hidden">
              {data.freshTop.map((l) => (
                <LeadRow
                  key={l.id}
                  compact
                  serverNow={serverNow}
                  lead={{ ...l, keyword: null, dmPreview: null, reason: null }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="angka-heading">
            <SectionTitle id="angka-heading">Angka hari ini</SectionTitle>
            <div className="panel grid grid-cols-2 gap-x-2 gap-y-3 p-3">
              <Metric label="Lead fresh" value={data.counts.freshCount} href="/leads" />
              <Metric label="Prioritas tinggi" value={data.counts.highCount} href="/leads?priority=HIGH" />
              <Metric label="Ditemukan hari ini" value={data.counts.foundToday} hint="sejak 00.00 WIB" href="/leads?fresh=0" />
              <Metric label="Menunggu analisis" value={data.counts.pendingAnalysis} />
              <Metric label="Dihubungi" value={data.counts.contacted} hint="total" href="/pipeline" />
              <Metric label="Membalas" value={data.counts.replied} hint="total" href="/pipeline" />
              <Metric label="Deal" value={data.counts.won} hint="total" href="/pipeline?view=table&status=WON" />
            </div>
          </section>

          <section aria-labelledby="sistem-heading">
            <SectionTitle id="sistem-heading" aside={<Link href="/automation" className="link">Detail</Link>}>
              Sistem
            </SectionTitle>
            <dl className="panel divide-y divide-line text-sm">
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">Run terakhir</dt>
                <dd className="text-right">
                  {data.lastRun ? (
                    <>
                      {RUN_STATUS_LABELS[data.lastRun.status]}
                      <span className="block text-xs text-faint">{formatRelative(data.lastRun.startedAt, now)}</span>
                    </>
                  ) : (
                    "Belum pernah"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">Sukses terakhir</dt>
                <dd className="text-right">{data.lastSuccess ? formatDateTime(data.lastSuccess.startedAt) : "Belum ada"}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">Threads API</dt>
                <dd className={threads.status === "CONNECTED" ? "text-pine" : "text-ochre"}>{PROVIDER_STATUS_LABELS[threads.status]}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">AI</dt>
                <dd className="text-right">
                  {runtime.label}
                  {runtime.provider === "ollama" ? (
                    <span className="block text-xs text-faint">
                      Worker lokal {lastLocalRun ? formatRelative(lastLocalRun.startedAt, now) : "belum pernah jalan"}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="px-4 py-2.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Token Claude hari ini</dt>
                  <dd className="tabular">
                    {data.ai.tokensToday.toLocaleString("id-ID")} / {data.ai.budget.toLocaleString("id-ID")}
                  </dd>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100} aria-label="Pemakaian budget token AI">
                  <div className={`h-full ${usage >= 90 ? "bg-clay" : "bg-pine"}`} style={{ width: `${usage}%` }} />
                </div>
                <p className="mt-1 text-xs text-faint">Estimasi biaya hari ini ${(data.ai.costMicroUsdToday / 1e6).toFixed(2)}</p>
              </div>
            </dl>
          </section>

          {data.followUps.length > 0 ? (
            <section aria-labelledby="followup-heading">
              <SectionTitle id="followup-heading">Follow-up 24 jam ke depan</SectionTitle>
              <ul className="panel divide-y divide-line text-sm">
                {data.followUps.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex justify-between gap-3 px-4 py-2.5 hover:bg-canvas">
                      <span className="truncate">@{l.authorUsername ?? "tanpa nama"}</span>
                      <span className={`shrink-0 text-xs ${l.nextFollowUpAt! < now ? "text-clay" : "text-muted"}`}>{formatDateTime(l.nextFollowUpAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="aktivitas-heading">
            <SectionTitle id="aktivitas-heading">Aktivitas terbaru</SectionTitle>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted">Belum ada aktivitas. Aktivitas muncul setelah lead pertama masuk.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {data.recent.map((a) => (
                  <li key={a.id} className="grid grid-cols-[auto_1fr] gap-x-3">
                    <span className="tabular w-12 pt-0.5 text-xs text-faint">{formatRelative(a.createdAt, now).replace(" lalu", "")}</span>
                    <Link href={`/leads/${a.leadId}`} className="min-w-0 text-ink-2 hover:text-ink">
                      <span className="font-medium text-ink">@{a.lead.authorUsername ?? "?"}</span> {a.message}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
