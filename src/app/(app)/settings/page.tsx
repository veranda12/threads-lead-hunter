import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AI_MODELS, getSetting } from "@/lib/settings";
import { getThreadsHealth } from "@/lib/providers/threads-integration";
import { getAiStatus } from "@/lib/queries";
import { privacyConfigGaps } from "@/lib/privacy";
import { Badge, KeyValue, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm } from "@/components/client/action-form";
import { TestSearchForm } from "./test-search-form";
import { CopyButton, SubmitButton } from "@/components/client/buttons";
import { formatDateTime, formatRelative } from "@/lib/time";
import { PROVIDER_STATUS_LABELS } from "@/lib/providers/types";
import {
  changePasswordAction,
  disconnectThreadsAction,
  revokeSessionsAction,
  saveAiAction,
  saveDiscoveryAction,
  savePrivacyAction,
  saveProfileAction,
  saveThreadsAction,
} from "./actions";

export const metadata: Metadata = { title: "Pengaturan" };

function NumberField({ name, label, value, min, max, hint }: { name: string; label: string; value: number | null; min: number; max: number; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input id={name} name={name} type="number" min={min} max={max} defaultValue={value ?? ""} className="input tabular" />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

function Toggle({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5" />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const [discovery, ai, threads, profile, privacy, health, sessions, aiStatus] = await Promise.all([
    getSetting("discovery"),
    getSetting("ai"),
    getSetting("threads"),
    getSetting("profile"),
    getSetting("privacy"),
    getThreadsHealth(now),
    db.userSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: "desc" } }),
    getAiStatus(),
  ]);
  const gaps = privacyConfigGaps(privacy);
  const appConfigured = Boolean(env.threadsAppId && env.threadsAppSecret);
  const oauthMessage = typeof sp.threads === "string" ? sp.threads : null;
  const callbackUrls = [
    { label: "Redirect callback URL (OAuth)", value: env.threadsRedirectUri },
    { label: "Uninstall callback URL", value: `${env.appUrl}/api/threads/uninstall` },
    { label: "Delete callback URL", value: `${env.appUrl}/api/threads/data-deletion` },
    { label: "Privacy Policy URL", value: `${env.appUrl}/privacy-policy` },
  ];

  return (
    <div className="max-w-4xl">
      <PageHeader title="Pengaturan" description="Integrasi, AI, scheduler, profil untuk draft DM, privasi, dan keamanan akun." />
      <nav aria-label="Bagian pengaturan" className="mb-8 flex flex-wrap gap-2 text-sm">
        {[
          ["integrasi", "Integrasi"],
          ["ai", "AI"],
          ["scheduler", "Scheduler"],
          ["profil", "Profil"],
          ["privasi", "Privasi"],
          ["keamanan", "Keamanan"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="btn btn-secondary btn-sm">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        <section id="integrasi" aria-labelledby="integrasi-h" className="scroll-mt-6">
          <SectionTitle id="integrasi-h">Integrasi Threads</SectionTitle>
          {oauthMessage ? (
            <div className="mb-4">
              <Notice tone={oauthMessage === "connected" ? "ok" : "danger"}>
                {oauthMessage === "connected" ? "Akun Threads berhasil dihubungkan." : `Koneksi gagal: ${oauthMessage}`}
              </Notice>
            </div>
          ) : null}
          <div className="panel space-y-5 p-5">
            <KeyValue
              items={[
                { label: "Status", value: <Badge tone={health.status === "CONNECTED" ? "pine" : "ochre"}>{PROVIDER_STATUS_LABELS[health.status]}</Badge> },
                { label: "Keterangan", value: health.message },
                { label: "Akun", value: health.username ? `@${health.username}` : "Belum terhubung" },
                {
                  label: "Token berlaku sampai",
                  value: health.tokenExpiresAt ? `${formatDateTime(health.tokenExpiresAt)} (${formatRelative(health.tokenExpiresAt, now)})` : "-",
                },
                { label: "App ID", value: appConfigured ? "Terkonfigurasi di environment" : <span className="text-ochre">THREADS_APP_ID / THREADS_APP_SECRET belum diatur</span> },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {appConfigured ? (
                <a href="/api/threads/oauth/start" className="btn btn-primary">
                  {health.username ? "Hubungkan ulang akun Threads" : "Hubungkan akun Threads"}
                </a>
              ) : null}
              {health.username ? (
                <form action={disconnectThreadsAction}>
                  <SubmitButton className="btn btn-danger">Putuskan dan hapus token</SubmitButton>
                </form>
              ) : null}
            </div>
            <ActionForm action={saveThreadsAction} className="space-y-4 border-t border-line pt-5">
              <Toggle
                name="keywordSearchApproved"
                label="Meta sudah menyetujui threads_keyword_search"
                checked={threads.keywordSearchApproved}
                hint="Centang hanya setelah App Review disetujui. Tanpa approval, Keyword Search hanya mengembalikan postingan milik akun sendiri, jadi discovery otomatis tetap dimatikan."
              />
              <div className="max-w-xs">
                <NumberField name="dailyQueryBudget" label="Budget query Threads per 24 jam" value={threads.dailyQueryBudget} min={1} max={2200} hint="Batas resmi Meta 2.200. Sisakan ruang untuk query manual." />
              </div>
            </ActionForm>
            {health.username ? <TestSearchForm approved={threads.keywordSearchApproved} /> : null}
            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink">URL untuk Meta App Dashboard</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {callbackUrls.map((u) => (
                  <li key={u.label} className="flex flex-wrap items-center gap-2">
                    <span className="w-56 text-muted">{u.label}</span>
                    <code className="min-w-0 break-all rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">{u.value}</code>
                    <CopyButton text={u.value} label="Salin" className="btn btn-ghost btn-sm" />
                  </li>
                ))}
              </ul>
              {env.appUrl.startsWith("http://") ? <p className="mt-2 text-xs text-ochre">APP_URL masih http. Meta mewajibkan HTTPS untuk callback dan Privacy Policy.</p> : null}
            </div>
          </div>
        </section>

        <section id="ai" aria-labelledby="ai-h" className="scroll-mt-6">
          <SectionTitle id="ai-h">AI dan biaya</SectionTitle>
          <div className="mb-4">
            {aiStatus.runtime.provider === "ollama" ? (
              <Notice tone="neutral" title={`Provider aktif: ${aiStatus.runtime.label}`}>
                {aiStatus.runtime.reason}. Worker lokal terakhir:{" "}
                {aiStatus.lastLocalRun ? `${formatDateTime(aiStatus.lastLocalRun.startedAt)}` : "belum pernah jalan"}. Panduan: docs/LOCAL_AI.md.
              </Notice>
            ) : !aiStatus.runtime.available ? (
              <Notice tone="warn">ANTHROPIC_API_KEY belum diatur di environment server. Analisis dan draft tidak berjalan sampai key diisi, atau pilih Ollama lokal.</Notice>
            ) : null}
          </div>
          <ActionForm action={saveAiAction} className="panel space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="provider" className="field-label">
                  Provider AI
                </label>
                <select id="provider" name="provider" defaultValue={ai.provider} className="input">
                  <option value="anthropic">Claude API (Anthropic)</option>
                  <option value="ollama">Ollama lokal (worker di laptop)</option>
                </select>
                <p className="field-hint">Ollama tidak bisa dipanggil dari Vercel; analisis dijalankan oleh npm run worker:analyze di laptop Anda.</p>
              </div>
              <div>
                <label htmlFor="ollamaModel" className="field-label">
                  Model Ollama
                </label>
                <input id="ollamaModel" name="ollamaModel" defaultValue={ai.ollamaModel} className="input" placeholder="qwen2.5:7b" />
                <p className="field-hint">Harus sudah di-pull: ollama pull {ai.ollamaModel}</p>
              </div>
              <div>
                <label htmlFor="ollamaTriageModel" className="field-label">
                  Classifier awal Ollama (opsional)
                </label>
                <input id="ollamaTriageModel" name="ollamaTriageModel" defaultValue={ai.ollamaTriageModel} className="input" placeholder="kosong = tanpa triage" />
                <p className="field-hint">Model kecil yang muat penuh di GPU menyaring kandidat sebelum model utama.</p>
              </div>
              <NumberField
                name="triageMinRelevance"
                label="Relevansi minimal lolos triage"
                value={ai.triageMinRelevance}
                min={0}
                max={100}
                hint="Bukan permintaan jasa dan relevansi di bawah ini berhenti di triage"
              />
            </div>
            {/* Field Claude hanya dipakai provider anthropic. Saat Ollama aktif dilipat (tetap ikut tersimpan). */}
            <details open={ai.provider === "anthropic"} className="rounded-md border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Claude API (berbayar){ai.provider === "ollama" ? " · tidak dipakai selama Ollama lokal aktif" : ""}
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="model" className="field-label">
                    Model Claude
                  </label>
                  <select id="model" name="model" defaultValue={ai.model} className="input">
                    {AI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} (${m.inputPerMTok} / ${m.outputPerMTok} per 1 juta token)
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">Nama model disimpan di setiap analisis sebagai modelVersion.</p>
                </div>
                <NumberField name="dailyTokenBudget" label="Budget token Claude harian" value={ai.dailyTokenBudget} min={0} max={100_000_000} hint="Input + output, reset 00.00 WIB" />
              </div>
            </details>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField name="maxAnalysesPerRun" label="Maks analisis per run" value={ai.maxAnalysesPerRun} min={0} max={500} />
              <NumberField name="minLeadScoreForDrafts" label="Skor minimal untuk draft DM" value={ai.minLeadScoreForDrafts} min={0} max={100} />
              <NumberField name="prefilterThreshold" label="Ambang pre-filter" value={ai.prefilterThreshold} min={0} max={100} hint="Di bawah ini tidak dikirim ke AI" />
            </div>
            <Toggle name="autoGenerateDrafts" label="Buat draft DM otomatis untuk lead berkualitas" checked={ai.autoGenerateDrafts} />
          </ActionForm>
        </section>

        <section id="scheduler" aria-labelledby="scheduler-h" className="scroll-mt-6">
          <SectionTitle id="scheduler-h">Scheduler dan discovery</SectionTitle>
          <ActionForm action={saveDiscoveryAction} className="panel space-y-4 p-5">
            <Toggle name="enabled" label="Discovery aktif" checked={discovery.enabled} hint="Bila mati, panggilan scheduler dicatat sebagai dilewati." />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField name="minIntervalMinutes" label="Interval minimum (menit)" value={discovery.minIntervalMinutes} min={5} max={1440} hint="Panggilan scheduler lebih cepat dari ini dilewati" />
              <NumberField name="maxKeywordsPerRun" label="Maks keyword per run" value={discovery.maxKeywordsPerRun} min={1} max={100} />
              <NumberField name="maxPagesPerKeyword" label="Maks halaman per keyword" value={discovery.maxPagesPerKeyword} min={1} max={10} />
              <NumberField name="resultsPerPage" label="Hasil per halaman" value={discovery.resultsPerPage} min={1} max={100} hint="Maksimal API 100" />
              <NumberField name="maxPostsPerRun" label="Maks postingan per run" value={discovery.maxPostsPerRun} min={1} max={2000} />
              <NumberField name="runTimeoutSeconds" label="Batas waktu run (detik)" value={discovery.runTimeoutSeconds} min={30} max={800} hint="Sesuaikan dengan maxDuration Vercel" />
            </div>
          </ActionForm>
        </section>

        <section id="profil" aria-labelledby="profil-h" className="scroll-mt-6">
          <SectionTitle id="profil-h">Profil untuk draft DM</SectionTitle>
          <ActionForm action={saveProfileAction} className="panel space-y-4 p-5">
            <p className="text-sm text-muted">AI hanya boleh memakai fakta dari sini. Jangan masukkan klaim yang tidak bisa Anda buktikan.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="displayName" className="field-label">
                  Nama (opsional)
                </label>
                <input id="displayName" name="displayName" defaultValue={profile.displayName} className="input" placeholder="Your Name" />
              </div>
              <div>
                <label htmlFor="portfolioUrl" className="field-label">
                  URL portfolio
                </label>
                <input id="portfolioUrl" name="portfolioUrl" defaultValue={profile.portfolioUrl} className="input" />
              </div>
            </div>
            <div>
              <label htmlFor="headline" className="field-label">
                Headline
              </label>
              <input id="headline" name="headline" defaultValue={profile.headline} className="input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="skills" className="field-label">
                  Keahlian (satu per baris)
                </label>
                <textarea id="skills" name="skills" rows={8} defaultValue={profile.skills.join("\n")} className="input" />
              </div>
              <div>
                <label htmlFor="experiences" className="field-label">
                  Pengalaman (satu per baris)
                </label>
                <textarea id="experiences" name="experiences" rows={8} defaultValue={profile.experiences.join("\n")} className="input" />
              </div>
            </div>
          </ActionForm>
        </section>

        <section id="privasi" aria-labelledby="privasi-h" className="scroll-mt-6">
          <SectionTitle id="privasi-h" aside={<Link href="/privacy-policy" className="link">Lihat halaman publik</Link>}>
            Privasi dan retensi
          </SectionTitle>
          {gaps.length ? (
            <div className="mb-4">
              <Notice tone="warn" title="Privacy Policy belum lengkap untuk App Review">
                Belum diisi: {gaps.join(", ")}. Halaman publik menampilkan bagian ini sebagai &ldquo;belum ditetapkan&rdquo; sampai Anda melengkapinya.
              </Notice>
            </div>
          ) : (
            <div className="mb-4">
              <Notice tone="ok">Semua isian wajib Privacy Policy sudah lengkap.</Notice>
            </div>
          )}
          <ActionForm action={savePrivacyAction} className="panel space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="controllerName" className="field-label">
                  Nama pengelola data
                </label>
                <input id="controllerName" name="controllerName" defaultValue={privacy.controllerName} className="input" placeholder="Nama Anda atau nama usaha" />
              </div>
              <div>
                <label htmlFor="contactEmail" className="field-label">
                  Email kontak privasi
                </label>
                <input id="contactEmail" name="contactEmail" type="email" defaultValue={privacy.contactEmail} className="input" placeholder="email@example.com" />
              </div>
              <div>
                <label htmlFor="contactAddress" className="field-label">
                  Alamat atau kota (opsional)
                </label>
                <input id="contactAddress" name="contactAddress" defaultValue={privacy.contactAddress} className="input" />
              </div>
              <div>
                <label htmlFor="effectiveDate" className="field-label">
                  Tanggal berlaku
                </label>
                <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={privacy.effectiveDate} className="input" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="retentionUnqualifiedDays"
                label="Hapus lead tidak relevan setelah (hari)"
                value={privacy.retentionUnqualifiedDays}
                min={1}
                max={3650}
                hint="Lead status Baru yang tidak lolos pre-filter atau berprioritas Abaikan. Kosong = belum ditetapkan, tidak ada penghapusan otomatis."
              />
              <NumberField
                name="retentionRawPayloadDays"
                label="Hapus data mentah API setelah (hari)"
                value={privacy.retentionRawPayloadDays}
                min={1}
                max={3650}
                hint="Payload JSON dari Threads API. Teks lead dan riwayat CRM tetap."
              />
              <NumberField
                name="retentionClosedLeadDays"
                label="Hapus lead Tidak jadi / Diarsipkan setelah (hari)"
                value={privacy.retentionClosedLeadDays}
                min={1}
                max={3650}
                hint="Dihitung dari aktivitas terakhir. Lead Deal tidak dihapus otomatis."
              />
              <NumberField name="deletionResponseDays" label="Batas waktu proses permintaan hapus (hari)" value={privacy.deletionResponseDays} min={1} max={90} />
            </div>
          </ActionForm>
        </section>

        <section id="keamanan" aria-labelledby="keamanan-h" className="scroll-mt-6">
          <SectionTitle id="keamanan-h">Keamanan akun</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionForm action={changePasswordAction} submitLabel="Ganti password" className="panel space-y-4 p-5" resetOnSuccess>
              <div>
                <label htmlFor="current" className="field-label">
                  Password saat ini
                </label>
                <input id="current" name="current" type="password" autoComplete="current-password" className="input" required />
              </div>
              <div>
                <label htmlFor="next" className="field-label">
                  Password baru (min. 12 karakter)
                </label>
                <input id="next" name="next" type="password" autoComplete="new-password" minLength={12} className="input" required />
              </div>
              <div>
                <label htmlFor="confirm" className="field-label">
                  Ulangi password baru
                </label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required />
              </div>
            </ActionForm>
            <div className="panel p-5">
              <h3 className="text-sm font-semibold text-ink">Sesi aktif ({sessions.length})</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-ink-2" title={s.userAgent ?? ""}>
                      {s.id === user.sessionId ? <Badge tone="pine">Sesi ini</Badge> : null} {s.ipAddress ?? "IP tidak diketahui"}
                    </span>
                    <span className="shrink-0 text-xs text-faint">{formatRelative(s.lastSeenAt, now)}</span>
                  </li>
                ))}
              </ul>
              {sessions.length > 1 ? (
                <form action={revokeSessionsAction} className="mt-4">
                  <SubmitButton className="btn btn-secondary btn-sm">Keluarkan sesi lain</SubmitButton>
                </form>
              ) : null}
              <p className="mt-4 text-xs text-muted">Sesi berlaku 7 hari, disimpan sebagai hash di database, cookie HttpOnly dan SameSite=Lax.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
