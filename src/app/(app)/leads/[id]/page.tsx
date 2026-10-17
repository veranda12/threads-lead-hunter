import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getAiStatus, getLeadDetail, getServiceMap } from "@/lib/queries";

import { Badge, EmptyState, KeyValue, Notice, SectionTitle } from "@/components/ui";
import { AnalysisStatusBadge, PriorityBadge, SourceBadge, StatusBadge } from "@/components/lead-badges";
import { FreshnessClock } from "@/components/client/freshness-clock";
import { SubmitButton } from "@/components/client/buttons";
import { formatDateTime } from "@/lib/time";
import { allowedTransitions, STATUS_LABELS, type LeadStatus } from "@/lib/leads/crm";
import { INTENT_LABELS, type Priority } from "@/lib/leads/scoring";
import { CATEGORY_LABELS, DRAFT_TONES, TONE_LABELS } from "@/lib/ai/schemas";
import { ACTIVITY_LABELS, COMPLEXITY_LABELS, URGENCY_LABELS } from "@/lib/labels";
import { threadsProfileUrl } from "@/lib/discovery/normalize";
import { analyzeLeadAction } from "../actions";
import { DraftEditor, FollowUpForm, GenerateDraftsForm, NoteForm, StatusForm } from "./lead-forms";

export const metadata: Metadata = { title: "Detail lead" };

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

export default async function LeadDetailPage({ params }: PageProps<"/leads/[id]">) {
  await requireUser();
  const { id } = await params;
  const [lead, services] = await Promise.all([getLeadDetail(id), getServiceMap()]);
  if (!lead) notFound();
  const now = new Date();
  const analysis = lead.analyses.find((a) => a.isCurrent) ?? null;
  const service = analysis?.estimatedService ? services.get(analysis.estimatedService) : undefined;
  const profile = threadsProfileUrl(lead.authorUsername);
  const { runtime } = await getAiStatus();
  // Tombol AI hanya aktif bila provider bisa dipanggil dari server ini (di Vercel + Ollama: tidak).
  const aiConfigured = runtime.available;
  const transitions = allowedTransitions(lead.status as LeadStatus).map((s) => ({ value: s, label: STATUS_LABELS[s] }));
  const draftsByTone = new Map(lead.drafts.map((d) => [d.tone, d]));
  const complex = analysis?.projectComplexity === "COMPLEX" || analysis?.category === "ENTERPRISE_SOFTWARE";

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href="/leads" className="hover:text-ink">
          Lead
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-2">{lead.authorUsername ? `@${lead.authorUsername}` : lead.id}</span>
      </nav>

      <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.6rem] font-semibold text-ink">{lead.authorUsername ? `@${lead.authorUsername}` : "Penulis tidak diketahui"}</h1>
            <StatusBadge status={lead.status as LeadStatus} />
            <PriorityBadge priority={lead.priority as Priority | null} score={lead.leadScore} />
            <SourceBadge source={lead.source} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <FreshnessClock postedAt={lead.postedAt?.toISOString() ?? null} serverNow={now.toISOString()} manual={lead.source === "MANUAL_IMPORT"} />
            <span>Diposting {formatDateTime(lead.postedAt)}</span>
            <span>Ditemukan {formatDateTime(lead.discoveredAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.permalink ? (
            <a href={lead.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Buka postingan <ExternalLink size={14} aria-hidden />
            </a>
          ) : null}
          {profile ? (
            <a href={profile} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Buka profil <ExternalLink size={14} aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="post-heading">
            <SectionTitle id="post-heading" aside={lead.matchedKeyword ? `Keyword: ${lead.matchedKeyword.phrase}` : lead.source === "MANUAL_IMPORT" ? "Import manual" : null}>
              Postingan asli
            </SectionTitle>
            <blockquote className="panel whitespace-pre-line p-5 text-[15px] leading-relaxed text-ink">{lead.text || <span className="text-muted">Postingan tanpa teks</span>}</blockquote>
            {lead.rawPurgedAt ? <p className="mt-2 text-xs text-faint">Data mentah API dihapus sesuai retensi pada {formatDateTime(lead.rawPurgedAt)}.</p> : null}
          </section>

          <section aria-labelledby="analysis-heading">
            <SectionTitle
              id="analysis-heading"
              aside={
                aiConfigured ? (
                  <form action={analyzeLeadAction}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="force" value={analysis ? "1" : "0"} />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="Menganalisis...">
                      {analysis ? "Analisis ulang" : "Analisis sekarang"}
                    </SubmitButton>
                  </form>
                ) : null
              }
            >
              Analisis AI
            </SectionTitle>
            {!analysis ? (
              <EmptyState
                title="Belum dianalisis"
                reason={
                  <>
                    <AnalysisStatusBadge status={lead.analysisStatus} />
                    <span className="mt-2 block">
                      {lead.analysisStatus === "PREFILTERED_OUT"
                        ? `Pre-filter menilai postingan ini tidak relevan (${lead.prefilterReason ?? "-"}, skor ${lead.prefilterScore}). Anda tetap bisa menganalisisnya manual.`
                        : lead.analysisError ?? (aiConfigured
                          ? "Kandidat akan dianalisis pada run berikutnya, atau klik Analisis sekarang."
                          : runtime.provider === "ollama"
                            ? `Menunggu worker lokal ${runtime.label}. Jalankan npm run worker:analyze di laptop yang menjalankan Ollama.`
                            : "Atur ANTHROPIC_API_KEY untuk mengaktifkan analisis.")}
                    </span>
                  </>
                }
              />
            ) : (
              <div className="panel divide-y divide-line">
                <div className="p-5">
                  <p className="text-[15px] leading-relaxed text-ink">{analysis.qualificationReason}</p>
                  <div className="mt-4">
                    <KeyValue
                      items={[
                        { label: "Intent", value: INTENT_LABELS[analysis.intent] ?? analysis.intent },
                        { label: "Kategori", value: CATEGORY_LABELS[analysis.category as keyof typeof CATEGORY_LABELS] ?? analysis.category },
                        { label: "Permintaan jasa", value: analysis.isServiceRequest ? "Ya" : "Tidak" },
                        { label: "Confidence", value: <span className="tabular">{Math.round(analysis.confidence * 100)}%</span> },
                        { label: "Urgensi", value: URGENCY_LABELS[analysis.urgency] ?? analysis.urgency },
                        { label: "Kompleksitas", value: COMPLEXITY_LABELS[analysis.projectComplexity] ?? analysis.projectComplexity },
                      ]}
                    />
                  </div>
                </div>
                <div className="grid gap-5 p-5 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Budget</h3>
                    {analysis.budgetType === "STATED_BY_AUTHOR" && analysis.possibleBudget ? (
                      <>
                        <p className="mt-1 text-sm text-ink">Disebut penulis: {analysis.possibleBudget}</p>
                        <p className="mt-1 border-l-2 border-line-strong pl-3 text-sm italic text-muted">&ldquo;{analysis.budgetEvidence}&rdquo;</p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Belum diketahui. Penulis tidak menyebut budget.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Kecocokan layanan</h3>
                    {service ? (
                      <>
                        <p className="mt-1 text-sm text-ink">{service.name}</p>
                        <p className="text-sm text-ink-2">Harga dari konfigurasi: {service.price.text}</p>
                        {complex || !service.price.priced ? (
                          <p className="mt-1 text-xs text-muted">Harga indikatif. Diskusikan scope sebelum memberi quotation final.</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Tidak ada layanan di katalog yang cocok.</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-5 p-5 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Pendekatan yang disarankan</h3>
                    <p className="mt-1 text-sm text-ink-2">{analysis.recommendedApproach}</p>
                    {analysis.nextQuestion ? (
                      <p className="mt-2 text-sm text-ink-2">
                        <span className="text-muted">Pertanyaan berikutnya: </span>
                        {analysis.nextQuestion}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Red flag</h3>
                    {analysis.redFlags.length ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                        {analysis.redFlags.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Tidak ada.</p>
                    )}
                  </div>
                </div>
                <div className="px-5 py-3 text-xs text-faint">
                  {analysis.modelVersion} · {analysis.promptVersion} · {formatDateTime(analysis.createdAt)} · {analysis.inputTokens + analysis.outputTokens} token
                  {analysis.guardNotes.length ? <span className="block text-ochre">Koreksi aturan: {analysis.guardNotes.join("; ")}</span> : null}
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="dm-heading">
            <SectionTitle
              id="dm-heading"
              aside={analysis?.isServiceRequest && aiConfigured && lead.drafts.length > 0 ? <GenerateDraftsForm leadId={lead.id} label="Tulis ulang semua" className="btn btn-ghost btn-sm" /> : null}
            >
              Draft DM
            </SectionTitle>
            <p className="mb-3 text-sm text-muted">Aplikasi tidak mengirim DM. Salin draft, kirim sendiri di Threads, lalu tandai sudah dikirim.</p>
            {lead.drafts.length === 0 ? (
              <EmptyState
                title="Belum ada draft"
                reason={
                  !analysis
                    ? "Draft dibuat setelah lead dianalisis."
                    : !analysis.isServiceRequest
                      ? "Analisis menilai ini bukan permintaan jasa, jadi draft tidak dibuat otomatis."
                      : aiConfigured
                        ? "Buat tiga versi: santai, profesional, dan konsultatif."
                        : runtime.provider === "ollama"
                          ? "Draft dibuat oleh worker lokal Ollama untuk lead dengan skor cukup."
                          : "ANTHROPIC_API_KEY belum diatur."
                }
                action={analysis?.isServiceRequest && aiConfigured ? <GenerateDraftsForm leadId={lead.id} label="Buat 3 draft DM" /> : undefined}
              />
            ) : (
              <div className="panel">
                {DRAFT_TONES.map((tone) => {
                  const d = draftsByTone.get(tone);
                  if (!d || d.revisions.length === 0) {
                    return (
                      <div key={tone} className="flex items-center justify-between border-b border-line p-4 last:border-b-0">
                        <span className="text-sm text-muted">{TONE_LABELS[tone]}: belum ada</span>
                        {aiConfigured ? <GenerateDraftsForm leadId={lead.id} tone={tone} label="Buat versi ini" className="btn btn-ghost btn-sm" /> : null}
                      </div>
                    );
                  }
                  const latest = d.revisions[0];
                  return (
                    <div key={tone}>
                      <DraftEditor
                        key={latest.id}
                        leadId={lead.id}
                        draftId={d.id}
                        tone={tone}
                        toneLabel={TONE_LABELS[tone]}
                        body={latest.body}
                        isFavorite={d.isFavorite}
                        usedAt={d.usedAt?.toISOString() ?? null}
                        issues={latest.issues}
                        revisionLabel={`Revisi ${latest.revision}, ${latest.source === "AI" ? "AI" : "diedit manual"}`}
                      />
                      {d.revisions.length > 1 ? (
                        <details className="border-b border-line px-5 pb-4 text-sm last:border-b-0">
                          <summary className="cursor-pointer text-muted hover:text-ink">Riwayat revisi ({d.revisions.length - 1})</summary>
                          <ol className="mt-2 space-y-3">
                            {d.revisions.slice(1).map((r) => (
                              <li key={r.id}>
                                <p className="text-xs text-faint">
                                  Revisi {r.revision}, {r.source === "AI" ? "AI" : "manual"}, {formatDateTime(r.createdAt)}
                                </p>
                                <p className="whitespace-pre-line text-ink-2">{r.body}</p>
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="crm-heading">
            <SectionTitle id="crm-heading">CRM</SectionTitle>
            <div className="panel space-y-4 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Status sekarang</span>
                <StatusBadge status={lead.status as LeadStatus} />
              </div>
              {lead.contactedAt ? <p className="text-xs text-muted">Pertama dihubungi {formatDateTime(lead.contactedAt)}</p> : null}
              <StatusForm leadId={lead.id} current={lead.status} options={transitions} />
              <FollowUpForm leadId={lead.id} value={toLocalInput(lead.nextFollowUpAt)} />
              {lead.freshness === "EXPIRED" && lead.status !== "NEW" ? (
                <Notice>Postingan sudah lewat 6 jam. Lead tetap di pipeline dengan status {STATUS_LABELS[lead.status as LeadStatus]}.</Notice>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="notes-heading">
            <SectionTitle id="notes-heading">Catatan</SectionTitle>
            <NoteForm leadId={lead.id} />
            {lead.notes.length ? (
              <ul className="mt-4 space-y-3">
                {lead.notes.map((n) => (
                  <li key={n.id} className="panel p-3 text-sm">
                    <p className="whitespace-pre-line text-ink">{n.body}</p>
                    <p className="mt-1 text-xs text-faint">
                      {n.author?.name ?? "Pengguna"}, {formatDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="timeline-heading">
            <SectionTitle id="timeline-heading">Riwayat aktivitas</SectionTitle>
            <ol className="relative space-y-4 border-l border-line pl-4">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[20.5px] top-1.5 h-2 w-2 rounded-full bg-line-strong" />
                  <p className="text-ink">
                    <Badge>{ACTIVITY_LABELS[a.type] ?? a.type}</Badge> <span className="text-ink-2">{a.message}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-faint">{formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
