"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { validatePlanInput, type PricingType } from "@/lib/pricing/format";
import { Prisma } from "@/generated/prisma/client";

export type PricingState = { ok?: boolean; message?: string } | undefined;

const PRICING_TYPES = ["FIXED", "STARTING_FROM", "MONTHLY", "CUSTOM_QUOTE"] as const;

function rupiahField(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const digits = v.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

const planSchema = z.object({
  name: z.string().trim().min(2, "Nama plan minimal 2 karakter").max(80),
  pricingType: z.enum(PRICING_TYPES),
  notes: z.string().trim().max(300).optional(),
});

function parsePlan(formData: FormData) {
  const parsed = planSchema.safeParse({
    name: formData.get("name"),
    pricingType: formData.get("pricingType"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const priceMin = rupiahField(formData.get("priceMin"));
  const priceMax = rupiahField(formData.get("priceMax"));
  const err = validatePlanInput({ pricingType: parsed.data.pricingType as PricingType, priceMin, priceMax });
  if (err) return { error: err } as const;
  return { data: { ...parsed.data, priceMin, priceMax, active: formData.get("active") !== "off" } } as const;
}

export async function createPlanAction(_prev: PricingState, formData: FormData): Promise<PricingState> {
  const user = await assertUser();
  const serviceId = z.string().min(1).parse(formData.get("serviceId"));
  const res = parsePlan(formData);
  if ("error" in res) return { ok: false, message: res.error };
  const plan = await db.pricingPlan.create({ data: { serviceId, ...res.data } });
  await audit({ action: "pricing.plan_created", actorId: user.id, entityType: "PricingPlan", entityId: plan.id, metadata: res.data });
  refresh();
  return { ok: true, message: "Plan ditambahkan" };
}

export async function updatePlanAction(_prev: PricingState, formData: FormData): Promise<PricingState> {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  const res = parsePlan(formData);
  if ("error" in res) return { ok: false, message: res.error };
  const before = await db.pricingPlan.findUniqueOrThrow({ where: { id } });
  await db.pricingPlan.update({ where: { id }, data: res.data });
  await audit({
    action: "pricing.plan_updated",
    actorId: user.id,
    entityType: "PricingPlan",
    entityId: id,
    metadata: { before: { pricingType: before.pricingType, priceMin: before.priceMin, priceMax: before.priceMax, active: before.active }, after: res.data },
  });
  refresh();
  return { ok: true, message: "Tersimpan" };
}

export async function deletePlanAction(formData: FormData) {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  await db.pricingPlan.delete({ where: { id } });
  await audit({ action: "pricing.plan_deleted", actorId: user.id, entityType: "PricingPlan", entityId: id });
  refresh();
}

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(["WEBSITE", "ENTERPRISE_SOFTWARE", "TECHNICAL_SERVICE"]),
  description: z.string().trim().max(300).optional(),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export async function createServiceAction(_prev: PricingState, formData: FormData): Promise<PricingState> {
  const user = await assertUser();
  const parsed = serviceSchema.safeParse({ name: formData.get("name"), category: formData.get("category"), description: formData.get("description") || undefined });
  if (!parsed.success) return { ok: false, message: "Nama layanan minimal 2 karakter" };
  const slug = slugify(parsed.data.name);
  if (!slug) return { ok: false, message: "Nama layanan tidak valid" };
  try {
    const max = await db.service.aggregate({ _max: { sortOrder: true } });
    const s = await db.service.create({ data: { ...parsed.data, slug, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await audit({ action: "pricing.service_created", actorId: user.id, entityType: "Service", entityId: s.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: "Layanan dengan nama serupa sudah ada" };
    throw e;
  }
  refresh();
  return { ok: true, message: "Layanan ditambahkan" };
}

export async function toggleServiceAction(formData: FormData) {
  const user = await assertUser();
  const id = z.string().min(1).parse(formData.get("id"));
  const s = await db.service.findUniqueOrThrow({ where: { id } });
  await db.service.update({ where: { id }, data: { active: !s.active } });
  await audit({ action: s.active ? "pricing.service_disabled" : "pricing.service_enabled", actorId: user.id, entityType: "Service", entityId: id });
  refresh();
}
