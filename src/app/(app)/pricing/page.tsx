import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { Badge, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmSubmit } from "@/components/client/buttons";
import { formatPlanPrice, hasPrice, PRICING_TYPE_LABELS, UNPRICED_PHRASE } from "@/lib/pricing/format";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import { deletePlanAction, toggleServiceAction } from "./actions";
import { AddPlanForm, AddServiceForm, EditPlanForm } from "./pricing-forms";

export const metadata: Metadata = { title: "Harga layanan" };

const GROUPS = ["WEBSITE", "ENTERPRISE_SOFTWARE", "TECHNICAL_SERVICE"] as const;

export default async function PricingPage() {
  await requireUser();
  const services = await db.service.findMany({ include: { plans: { orderBy: { createdAt: "asc" } } }, orderBy: [{ sortOrder: "asc" }] });
  const priced = services.filter((s) => s.plans.some(hasPrice)).length;

  return (
    <div>
      <PageHeader
        title="Harga layanan"
        description={
          <>
            Satu-satunya sumber harga untuk analisis dan draft DM. Layanan tanpa harga aktif ditulis AI sebagai &ldquo;{UNPRICED_PHRASE}&rdquo;. {priced} dari {services.length} layanan
            sudah punya harga.
          </>
        }
      />
      <div className="mb-8">
        <AddServiceForm />
      </div>

      <div className="space-y-10">
        {GROUPS.map((g) => {
          const list = services.filter((s) => s.category === g);
          if (list.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`g-${g}`}>
              <SectionTitle id={`g-${g}`} aside={`${list.length} layanan`}>
                {CATEGORY_LABELS[g]}
              </SectionTitle>
              <ul className="panel divide-y divide-line">
                {list.map((s) => (
                  <li key={s.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className={`font-medium ${s.active ? "text-ink" : "text-faint line-through"}`}>{s.name}</p>
                        <p className="text-xs text-faint">
                          slug: {s.slug}
                          {s.description ? ` · ${s.description}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!s.active ? <Badge>Nonaktif</Badge> : s.plans.some(hasPrice) ? null : <Badge tone="ochre">Belum ada harga</Badge>}
                        <form action={toggleServiceAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            {s.active ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </div>
                    </div>
                    {s.plans.length ? (
                      <ul className="mt-3 space-y-2">
                        {s.plans.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-canvas px-3 py-2 text-sm">
                            <span className="font-medium text-ink">{p.name}</span>
                            <span className="text-muted">{PRICING_TYPE_LABELS[p.pricingType]}</span>
                            <span className="tabular text-ink-2">{formatPlanPrice(p)}</span>
                            {!p.active ? <Badge>Nonaktif</Badge> : null}
                            {p.notes ? <span className="text-xs text-faint">{p.notes}</span> : null}
                            <span className="ml-auto flex gap-1">
                              <EditPlanForm plan={p} />
                              <form action={deletePlanAction}>
                                <input type="hidden" name="id" value={p.id} />
                                <ConfirmSubmit confirmText="Hapus plan?">Hapus</ConfirmSubmit>
                              </form>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2">
                      <AddPlanForm serviceId={s.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
