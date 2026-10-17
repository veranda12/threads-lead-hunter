"use server";

import { refresh } from "next/cache";
import { assertUser } from "@/lib/auth/dal";
import { runDiscovery } from "@/lib/discovery/pipeline";
import { audit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { RUN_STATUS_LABELS } from "@/lib/labels";

export type RunState = { ok?: boolean; message?: string } | undefined;

export async function manualRunAction(_prev: RunState): Promise<RunState> {
  const user = await assertUser();
  const limit = await consumeRateLimit(`discovery:manual:${user.id}`, 6, 3600);
  if (!limit.allowed) return { ok: false, message: "Manual run dibatasi 6 kali per jam untuk menjaga kuota API." };
  const summary = await runDiscovery({ trigger: "MANUAL" });
  await audit({ action: "discovery.manual_run", actorId: user.id, entityType: "DiscoveryRun", entityId: summary.runId, metadata: { status: summary.status } });
  refresh();
  const c = summary.counters;
  return {
    ok: summary.status === "SUCCEEDED" || summary.status === "PARTIAL",
    message: `${RUN_STATUS_LABELS[summary.status] ?? summary.status}: ${c.postsNew} lead baru, ${c.analyzed} dianalisis, ${c.errorCount} error.${summary.error ? ` ${summary.error}` : ""}`,
  };
}
