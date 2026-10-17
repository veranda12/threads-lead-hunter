import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { computeCutoff, jakartaDateKey, startOfJakartaDay } from "@/lib/time";
import { ENGAGED_STATUSES, isLeadStatus, type LeadStatus } from "@/lib/leads/crm";
import { aiRuntime, tokensUsedToday } from "@/lib/ai/client";
import { getSetting } from "@/lib/settings";
import { servicePriceSummary } from "@/lib/pricing/format";

export async function getOverview(now: Date) {
  const cutoff = computeCutoff(now);
  const today = startOfJakartaDay(now);
  // Sama dengan daftar "Siap dihubungi": skor 40+ atau belum dinilai. Skor di bawah 40 = Abaikan.
  const freshWhere: Prisma.LeadWhereInput = {
    postedAt: { gte: cutoff },
    status: { notIn: ["ARCHIVED", "LOST"] },
    analysisStatus: { not: "PREFILTERED_OUT" },
    OR: [{ leadScore: { gte: 40 } }, { leadScore: null }],
  };

  const [freshTop, freshCount, highCount, foundToday, contacted, replied, won, lastRun, lastSuccess, followUps, recent, aiTokens, aiCost, ai, pendingAnalysis] =
    await Promise.all([
      db.lead.findMany({
        where: freshWhere,
        orderBy: [{ leadScore: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }],
        take: 8,
        include: { drafts: { select: { id: true } } },
      }),
      db.lead.count({ where: freshWhere }),
      db.lead.count({ where: { ...freshWhere, priority: "HIGH" } }),
      db.lead.count({ where: { discoveredAt: { gte: today }, analysisStatus: { not: "PREFILTERED_OUT" } } }),
      db.lead.count({ where: { status: { in: ENGAGED_STATUSES } } }),
      db.lead.count({ where: { status: { in: ["REPLIED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON"] } } }),
      db.lead.count({ where: { status: "WON" } }),
      db.discoveryRun.findFirst({ orderBy: { startedAt: "desc" } }),
      db.discoveryRun.findFirst({ where: { status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" } }),
      db.lead.findMany({
        where: { nextFollowUpAt: { not: null, lte: new Date(now.getTime() + 24 * 3600_000) }, status: { notIn: ["WON", "LOST", "ARCHIVED"] } },
        orderBy: { nextFollowUpAt: "asc" },
        take: 5,
      }),
      db.leadActivity.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { lead: { select: { id: true, authorUsername: true } } } }),
      tokensUsedToday(now),
      db.apiUsageLog.aggregate({ where: { provider: "ANTHROPIC", createdAt: { gte: today } }, _sum: { costMicroUsd: true } }),
      getSetting("ai"),
      db.lead.count({ where: { analysisStatus: { in: ["PENDING", "BUDGET_EXCEEDED", "NOT_CONFIGURED"] } } }),
    ]);

  return {
    freshTop,
    counts: { freshCount, highCount, foundToday, contacted, replied, won, pendingAnalysis },
    lastRun,
    lastSuccess,
    followUps,
    recent,
    ai: { tokensToday: aiTokens, budget: ai.dailyTokenBudget, costMicroUsdToday: aiCost._sum.costMicroUsd ?? 0, model: ai.model },
  };
}

export type LeadFilters = {
  fresh?: boolean;
  priority?: string;
  category?: string;
  status?: string;
  keyword?: string;
  minScore?: number;
  from?: string;
  to?: string;
  q?: string;
  analysis?: string;
  page?: number;
};

export function parseLeadFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  const minScore = s("minScore") ? Number(s("minScore")) : undefined;
  const page = s("page") ? Math.max(1, Math.floor(Number(s("page")))) : 1;
  return {
    fresh: s("fresh") === undefined ? true : s("fresh") === "1",
    priority: s("priority"),
    category: s("category"),
    status: s("status"),
    keyword: s("keyword"),
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    from: s("from"),
    to: s("to"),
    q: s("q")?.slice(0, 100),
    analysis: s("analysis"),
    page: Number.isFinite(page) ? page : 1,
  };
}

const PAGE_SIZE = 25;

export async function listLeads(f: LeadFilters, now: Date) {
  const and: Prisma.LeadWhereInput[] = [];
  if (f.fresh) and.push({ postedAt: { gte: computeCutoff(now) } });
  if (f.priority && ["HIGH", "MEDIUM", "LOW", "IGNORE"].includes(f.priority)) and.push({ priority: f.priority as Prisma.LeadWhereInput["priority"] });
  if (f.priority === "UNSCORED") and.push({ priority: null });
  if (f.category) and.push({ category: f.category });
  if (f.status && isLeadStatus(f.status)) and.push({ status: f.status });
  else and.push({ status: { not: "ARCHIVED" } });
  if (f.keyword) and.push({ matchedKeywordId: f.keyword });
  if (f.minScore !== undefined) and.push({ leadScore: { gte: f.minScore } });
  if (f.analysis === "hidden") and.push({ analysisStatus: "PREFILTERED_OUT" });
  else if (f.analysis !== "all") and.push({ analysisStatus: { not: "PREFILTERED_OUT" } });
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (f.from && dateRe.test(f.from)) and.push({ discoveredAt: { gte: new Date(`${f.from}T00:00:00+07:00`) } });
  if (f.to && dateRe.test(f.to)) and.push({ discoveredAt: { lt: new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 86_400_000) } });
  if (f.q) and.push({ OR: [{ text: { contains: f.q, mode: "insensitive" } }, { authorUsername: { contains: f.q.replace(/^@/, ""), mode: "insensitive" } }] });

  const where: Prisma.LeadWhereInput = { AND: and };
  const page = f.page ?? 1;
  const [rows, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: f.fresh ? [{ leadScore: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }] : [{ discoveredAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        matchedKeyword: { select: { phrase: true } },
        analyses: { where: { isCurrent: true }, take: 1, select: { qualificationReason: true, estimatedService: true, budgetType: true, possibleBudget: true } },
        drafts: { where: { tone: "FRIENDLY" }, include: { revisions: { orderBy: { revision: "desc" }, take: 1, select: { body: true } } } },
      },
    }),
    db.lead.count({ where }),
  ]);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getServiceMap() {
  const services = await db.service.findMany({ include: { plans: { where: { active: true } } } });
  return new Map(services.map((s) => [s.slug, { name: s.name, price: servicePriceSummary(s.plans) }]));
}

export async function getLeadDetail(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: {
      matchedKeyword: true,
      analyses: { orderBy: { createdAt: "desc" }, take: 5 },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      drafts: { include: { revisions: { orderBy: { revision: "desc" } } } },
    },
  });
}

export async function getPipeline(includeArchived: boolean) {
  return db.lead.findMany({
    where: includeArchived ? { analysisStatus: { not: "PREFILTERED_OUT" } } : { status: { not: "ARCHIVED" }, OR: [{ status: { not: "NEW" } }, { leadScore: { gte: 40 } }] },
    orderBy: [{ lastActivityAt: "desc" }],
    take: 500,
    select: {
      id: true,
      authorUsername: true,
      text: true,
      status: true,
      leadScore: true,
      priority: true,
      estimatedService: true,
      nextFollowUpAt: true,
      lastActivityAt: true,
      postedAt: true,
      contactedAt: true,
      source: true,
    },
  });
}

export async function getAnalytics(now: Date, days = 30) {
  const since = new Date(startOfJakartaDay(now).getTime() - (days - 1) * 86_400_000);
  const [leads, statusGroups, serviceMap] = await Promise.all([
    db.lead.findMany({
      where: { discoveredAt: { gte: since }, source: { not: "DEMO_FIXTURE" } },
      select: { discoveredAt: true, category: true, leadScore: true, analysisStatus: true, status: true, estimatedService: true },
    }),
    db.lead.groupBy({ by: ["status"], where: { source: { not: "DEMO_FIXTURE" } }, _count: { _all: true } }),
    getServiceMap(),
  ]);

  const byDay = new Map<string, { date: string; found: number; qualified: number }>();
  for (let i = 0; i < days; i++) {
    const key = jakartaDateKey(new Date(since.getTime() + i * 86_400_000));
    byDay.set(key, { date: key, found: 0, qualified: 0 });
  }
  const byCategory = new Map<string, number>();
  for (const l of leads) {
    if (l.analysisStatus === "PREFILTERED_OUT") continue;
    const d = byDay.get(jakartaDateKey(l.discoveredAt));
    if (d) {
      d.found += 1;
      if ((l.leadScore ?? 0) >= 60) d.qualified += 1;
    }
    const cat = l.category ?? "UNSCORED";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Partial<Record<LeadStatus, number>>;
  const all = await db.lead.count({ where: { analysisStatus: { not: "PREFILTERED_OUT" }, source: { not: "DEMO_FIXTURE" } } });
  const analyzed = await db.lead.count({ where: { analysisStatus: "ANALYZED", source: { not: "DEMO_FIXTURE" } } });
  const qualified = await db.lead.count({ where: { leadScore: { gte: 60 }, source: { not: "DEMO_FIXTURE" } } });
  const sum = (ss: LeadStatus[]) => ss.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const contacted = sum(["CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]);
  const replied = sum(["REPLIED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON"]);
  const won = counts.WON ?? 0;

  // Nilai pipeline hanya dari layanan yang punya harga terkonfigurasi (harga minimum), tidak menebak.
  const openLeads = await db.lead.findMany({
    where: { status: { in: ["QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION"] }, source: { not: "DEMO_FIXTURE" } },
    select: { estimatedService: true },
  });
  const plans = await db.pricingPlan.findMany({ where: { active: true, priceMin: { gt: 0 }, pricingType: { not: "CUSTOM_QUOTE" } }, include: { service: true } });
  const minPriceBySlug = new Map<string, number>();
  for (const p of plans) {
    const cur = minPriceBySlug.get(p.service.slug);
    if (p.priceMin && (cur === undefined || p.priceMin < cur)) minPriceBySlug.set(p.service.slug, p.priceMin);
  }
  let pipelineValue = 0;
  let pipelinePriced = 0;
  for (const l of openLeads) {
    const v = l.estimatedService ? minPriceBySlug.get(l.estimatedService) : undefined;
    if (v) {
      pipelineValue += v;
      pipelinePriced += 1;
    }
  }

  return {
    days: [...byDay.values()],
    categories: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    totals: { all, analyzed, qualified, contacted, replied, won },
    rates: {
      qualified: analyzed ? qualified / analyzed : null,
      contacted: qualified ? contacted / qualified : null,
      reply: contacted ? replied / contacted : null,
      conversion: contacted ? won / contacted : null,
    },
    pipeline: { value: pipelineValue, pricedLeads: pipelinePriced, openLeads: openLeads.length },
    serviceMap,
  };
}

/** Status AI untuk UI: provider aktif, tersedia di proses ini atau tidak, dan heartbeat worker lokal. */
export async function getAiStatus() {
  const ai = await getSetting("ai");
  const runtime = aiRuntime(ai);
  const lastLocalRun =
    runtime.provider === "ollama" ? await db.discoveryRun.findFirst({ where: { trigger: "LOCAL_AI" }, orderBy: { startedAt: "desc" } }) : null;
  return { ai, runtime, lastLocalRun };
}
