import { db } from "@/lib/db";

/** Kosongkan tabel antar test. AuditLog append-only (trigger menolak TRUNCATE), jadi tidak disentuh. */
export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "DiscoveryRunItem", "DiscoveryRun", "LeadActivity", "LeadNote", "MessageDraftRevision", "MessageDraft",
    "LeadAnalysis", "Lead", "SearchKeyword", "SearchProvider", "IntegrationAccount", "JobLock", "ApiUsageLog",
    "AppSetting", "SuppressedAuthor", "DataDeletionRequest", "RateLimitBucket", "PricingPlan", "Service",
    "UserSession", "User" CASCADE`);
}

export function isoAgo(now: Date, ms: number) {
  return new Date(now.getTime() - ms).toISOString().replace(".000Z", "+0000");
}
