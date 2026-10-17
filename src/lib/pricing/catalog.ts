import "server-only";
import { db } from "@/lib/db";
import { hasPrice, servicePriceSummary } from "@/lib/pricing/format";
import type { CatalogEntry } from "@/lib/ai/prompts";

/** Katalog aktif beserta ringkasan harga. Satu-satunya sumber harga untuk AI dan UI. */
export async function loadCatalog(): Promise<CatalogEntry[]> {
  const services = await db.service.findMany({
    where: { active: true },
    include: { plans: { where: { active: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return services.map((s) => {
    const summary = servicePriceSummary(s.plans);
    return { slug: s.slug, name: s.name, category: s.category, description: s.description, priceText: summary.text, priced: summary.priced };
  });
}

/** Semua nominal harga yang dikonfigurasi, untuk memvalidasi angka yang muncul di draft DM. */
export async function allowedPriceValues(): Promise<number[]> {
  const plans = await db.pricingPlan.findMany({ where: { active: true, service: { active: true } } });
  const values = new Set<number>();
  for (const p of plans) {
    if (!hasPrice(p)) continue;
    if (p.priceMin) values.add(p.priceMin);
    if (p.priceMax) values.add(p.priceMax);
  }
  return [...values];
}
