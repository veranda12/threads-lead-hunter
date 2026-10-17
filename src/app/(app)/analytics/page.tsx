import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getAnalytics } from "@/lib/queries";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import { formatRupiah } from "@/lib/pricing/format";
import { CategoryChart, LeadsPerDayChart } from "./charts";

export const metadata: Metadata = { title: "Analitik" };

function pct(v: number | null) {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

export default async function AnalyticsPage() {
  await requireUser();
  const now = new Date();
  const a = await getAnalytics(now, 30);
  const hasData = a.totals.all > 0;

  const rates = [
    { label: "Qualified rate", value: pct(a.rates.qualified), basis: `${a.totals.qualified} skor 60+ dari ${a.totals.analyzed} lead teranalisis` },
    { label: "Contacted rate", value: pct(a.rates.contacted), basis: `${a.totals.contacted} dihubungi dari ${a.totals.qualified} terkualifikasi` },
    { label: "Reply rate", value: pct(a.rates.reply), basis: `${a.totals.replied} membalas dari ${a.totals.contacted} dihubungi` },
    { label: "Conversion rate", value: pct(a.rates.conversion), basis: `${a.totals.won} deal dari ${a.totals.contacted} dihubungi` },
  ];

  return (
    <div>
      <PageHeader title="Analitik" description="Dihitung langsung dari database. Data demo tidak ikut dihitung. Rasio kosong (-) berarti penyebutnya masih nol." />

      {!hasData ? (
        <EmptyState
          title="Belum ada data untuk dianalisis"
          reason="Analitik terisi setelah lead pertama tersimpan, baik dari discovery otomatis maupun import manual."
          action={{ href: "/leads/import", label: "Import postingan" }}
        />
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="funnel-h">
            <SectionTitle id="funnel-h">Funnel sepanjang waktu</SectionTitle>
            <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {rates.map((r) => (
                <div key={r.label} className="bg-surface p-4">
                  <dt className="text-xs text-muted">{r.label}</dt>
                  <dd className="tabular mt-1 text-2xl font-semibold text-ink">{r.value}</dd>
                  <dd className="mt-1 text-xs text-faint">{r.basis}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="day-h">
            <SectionTitle id="day-h" aside="30 hari terakhir, WIB">
              Lead yang ditemukan per hari
            </SectionTitle>
            <div className="panel p-4">
              <LeadsPerDayChart data={a.days} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">Lihat sebagai tabel</summary>
                <div className="mt-2 max-h-72 overflow-y-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th scope="col">Tanggal</th>
                        <th scope="col" className="text-right">Ditemukan</th>
                        <th scope="col" className="text-right">Terkualifikasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...a.days].reverse().map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td className="tabular text-right">{d.found}</td>
                          <td className="tabular text-right">{d.qualified}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>

          <div className="grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="cat-h">
              <SectionTitle id="cat-h" aside="30 hari terakhir">
                Lead per kategori
              </SectionTitle>
              <div className="panel p-4">
                {a.categories.length ? (
                  <CategoryChart
                    data={a.categories.map((c) => ({
                      label: c.category === "UNSCORED" ? "Belum dianalisis" : (CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? c.category),
                      count: c.count,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted">Belum ada lead dalam 30 hari terakhir.</p>
                )}
              </div>
            </section>

            <section aria-labelledby="pipe-h">
              <SectionTitle id="pipe-h">Estimasi nilai pipeline</SectionTitle>
              <div className="panel p-5">
                <p className="tabular text-3xl font-semibold text-ink">{formatRupiah(a.pipeline.value)}</p>
                <p className="mt-2 text-sm text-ink-2">
                  Jumlah harga minimum dari konfigurasi untuk {a.pipeline.pricedLeads} dari {a.pipeline.openLeads} lead berstatus Terkualifikasi, Proposal terkirim, atau Negosiasi.
                </p>
                {a.pipeline.openLeads > a.pipeline.pricedLeads ? (
                  <p className="mt-2 text-xs text-muted">
                    {a.pipeline.openLeads - a.pipeline.pricedLeads} lead tidak dihitung karena layanannya belum punya harga di halaman Harga layanan. Angka ini batas bawah, bukan proyeksi
                    pendapatan.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
