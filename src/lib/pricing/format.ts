export type PricingType = "FIXED" | "STARTING_FROM" | "MONTHLY" | "CUSTOM_QUOTE";

export type PlanLike = {
  name: string;
  pricingType: PricingType;
  priceMin: number | null;
  priceMax: number | null;
  active: boolean;
};

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  FIXED: "Harga tetap",
  STARTING_FROM: "Mulai dari",
  MONTHLY: "Langganan bulanan",
  CUSTOM_QUOTE: "Custom quotation",
};

/** Frasa wajib bila harga belum ditetapkan. Dipakai oleh UI dan prompt AI. */
export const UNPRICED_PHRASE = "menyesuaikan kebutuhan dan scope";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function formatRupiah(value: number): string {
  return rupiah.format(value).replace(/ /g, " ");
}

/** Plan dianggap punya harga hanya jika nominalnya benar-benar diisi. */
export function hasPrice(plan: PlanLike): boolean {
  if (!plan.active || plan.pricingType === "CUSTOM_QUOTE") return false;
  return typeof plan.priceMin === "number" && plan.priceMin > 0;
}

export function formatPlanPrice(plan: PlanLike): string {
  if (!hasPrice(plan)) return UNPRICED_PHRASE;
  const min = formatRupiah(plan.priceMin!);
  const max = plan.priceMax && plan.priceMax > plan.priceMin! ? formatRupiah(plan.priceMax) : null;
  switch (plan.pricingType) {
    case "FIXED":
      return max ? `${min} - ${max}` : min;
    case "STARTING_FROM":
      return `mulai ${min}`;
    case "MONTHLY":
      return max ? `${min} - ${max} per bulan` : `${min} per bulan`;
    default:
      return UNPRICED_PHRASE;
  }
}

/** Ringkasan harga sebuah layanan dari plan-plan aktifnya. */
export function servicePriceSummary(plans: PlanLike[]): { text: string; priced: boolean } {
  const priced = plans.filter(hasPrice);
  if (priced.length === 0) return { text: UNPRICED_PHRASE, priced: false };
  const cheapest = priced.reduce((a, b) => (a.priceMin! <= b.priceMin! ? a : b));
  return { text: formatPlanPrice(cheapest), priced: true };
}

export function validatePlanInput(input: { pricingType: PricingType; priceMin: number | null; priceMax: number | null }): string | null {
  const { pricingType, priceMin, priceMax } = input;
  if (priceMin !== null && (!Number.isInteger(priceMin) || priceMin < 0)) return "Harga minimum harus bilangan bulat positif";
  if (priceMax !== null && (!Number.isInteger(priceMax) || priceMax < 0)) return "Harga maksimum harus bilangan bulat positif";
  if (priceMin !== null && priceMax !== null && priceMax < priceMin) return "Harga maksimum tidak boleh lebih kecil dari minimum";
  if (pricingType === "CUSTOM_QUOTE" && (priceMin !== null || priceMax !== null))
    return "Custom quotation tidak memakai nominal harga";
  if (priceMax !== null && priceMin === null) return "Isi harga minimum terlebih dahulu";
  return null;
}
