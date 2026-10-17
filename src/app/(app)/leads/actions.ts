"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/dal";
import { parseManualImport } from "@/lib/providers/manual";
import { ingestPost } from "@/lib/discovery/ingest";
import { analyzeLead, changeLeadStatus, generateDrafts, logActivity, saveManualDraft } from "@/lib/leads/service";
import { getSetting } from "@/lib/settings";
import { isLeadStatus, STATUS_LABELS } from "@/lib/leads/crm";
import { DRAFT_TONES, type DraftToneId } from "@/lib/ai/schemas";
import { audit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";

export type ActionState = { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;

const idSchema = z.string().min(1).max(40);

export async function importPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const parsed = parseManualImport({
    url: String(formData.get("url") ?? ""),
    text: String(formData.get("text") ?? ""),
    postedAtLocal: String(formData.get("postedAtLocal") ?? ""),
  });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ai = await getSetting("ai");
  const res = await ingestPost(parsed.post, {
    now: new Date(),
    source: "MANUAL_IMPORT",
    prefilterThreshold: ai.prefilterThreshold,
    actorId: user.id,
    enforceFreshWindow: false,
  });
  await audit({ action: "lead.manual_import", actorId: user.id, entityType: "Lead", metadata: { outcome: res.outcome } });

  if (res.outcome === "DUPLICATE") {
    return { ok: false, message: "Postingan ini sudah ada di database.", errors: { url: `Duplikat. Buka /leads/${res.leadId}` } };
  }
  if (res.outcome === "SUPPRESSED") return { ok: false, message: "Penulis ini sudah meminta datanya dihapus. Postingan tidak disimpan." };
  if (res.outcome === "FUTURE_TIMESTAMP" || res.outcome === "INVALID_TIMESTAMP") return { ok: false, errors: { postedAtLocal: res.reason } };
  if (!("leadId" in res)) return { ok: false, message: res.reason };

  if (formData.get("analyzeNow") === "on") {
    await analyzeLead(res.leadId, { actorId: user.id });
  }
  redirect(`/leads/${res.leadId}`);
}

export async function analyzeLeadAction(formData: FormData) {
  const user = await assertUser();
  const leadId = idSchema.parse(formData.get("leadId"));
  const limit = await consumeRateLimit(`ai:manual:${user.id}`, 30, 3600);
  if (!limit.allowed) return;
  await analyzeLead(leadId, { actorId: user.id, force: formData.get("force") === "1" });
  refresh();
}

export async function generateDraftsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const leadId = idSchema.parse(formData.get("leadId"));
  const tone = formData.get("tone");
  const tones = typeof tone === "string" && (DRAFT_TONES as readonly string[]).includes(tone) ? [tone as DraftToneId] : undefined;
  const limit = await consumeRateLimit(`ai:manual:${user.id}`, 30, 3600);
  if (!limit.allowed) return { ok: false, message: "Batas generate manual tercapai (30 per jam)." };
  const res = await generateDrafts(leadId, { tones, actorId: user.id });
  refresh();
  if (!res.ok) return { ok: false, message: res.error };
  const issues = Object.values(res.issues).flat();
  return { ok: true, message: issues.length ? `Draft dibuat dengan catatan: ${issues.join("; ")}` : "Draft dibuat." };
}

export async function saveDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const draftId = idSchema.parse(formData.get("draftId"));
  const body = String(formData.get("body") ?? "");
  try {
    const res = await saveManualDraft(draftId, body, user.id);
    refresh();
    return { ok: true, message: res.issues.length ? `Tersimpan. Perhatikan: ${res.issues.join("; ")}` : "Tersimpan sebagai revisi baru." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function toggleFavoriteAction(formData: FormData) {
  const user = await assertUser();
  const draftId = idSchema.parse(formData.get("draftId"));
  const draft = await db.messageDraft.findUniqueOrThrow({ where: { id: draftId } });
  await db.messageDraft.update({ where: { id: draftId }, data: { isFavorite: !draft.isFavorite } });
  await logActivity(db, {
    leadId: draft.leadId,
    type: "DRAFT_FAVORITED",
    actorId: user.id,
    message: draft.isFavorite ? `Draft ${draft.tone} dihapus dari favorit` : `Draft ${draft.tone} ditandai favorit`,
  });
  refresh();
}

/** Tandai draft sudah dipakai: pengguna mengirim DM sendiri di Threads, aplikasi hanya mencatat. */
export async function markContactedAction(formData: FormData) {
  const user = await assertUser();
  const leadId = idSchema.parse(formData.get("leadId"));
  const draftId = formData.get("draftId");
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (typeof draftId === "string" && draftId) {
    await db.messageDraft.updateMany({ where: { id: draftId, leadId }, data: { usedAt: new Date() } });
  }
  if (lead.status === "NEW" || lead.status === "REVIEWED") {
    await changeLeadStatus(leadId, "CONTACTED", user.id, typeof draftId === "string" && draftId ? "Memakai draft DM" : undefined);
  } else {
    await logActivity(db, { leadId, type: "CONTACTED", actorId: user.id, message: "DM dikirim manual (status pipeline tidak berubah)" });
  }
  refresh();
}

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const leadId = idSchema.parse(formData.get("leadId"));
  const to = formData.get("status");
  if (!isLeadStatus(to)) return { ok: false, message: "Status tidak dikenal" };
  try {
    await changeLeadStatus(leadId, to, user.id);
    await audit({ action: "lead.status_changed", actorId: user.id, entityType: "Lead", entityId: leadId, metadata: { to } });
    refresh();
    return { ok: true, message: `Status diubah ke ${STATUS_LABELS[to]}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

const noteSchema = z.object({ leadId: idSchema, body: z.string().trim().min(1, "Catatan kosong").max(4000) });

export async function addNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const parsed = noteSchema.safeParse({ leadId: formData.get("leadId"), body: formData.get("body") });
  if (!parsed.success) return { ok: false, errors: { body: parsed.error.issues[0].message } };
  await db.$transaction(async (tx) => {
    await tx.leadNote.create({ data: { leadId: parsed.data.leadId, body: parsed.data.body, authorId: user.id } });
    await logActivity(tx, { leadId: parsed.data.leadId, type: "NOTE_ADDED", actorId: user.id, message: "Catatan ditambahkan" });
  });
  refresh();
  return { ok: true, message: "Catatan disimpan." };
}

export async function setFollowUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertUser();
  const leadId = idSchema.parse(formData.get("leadId"));
  const raw = String(formData.get("followUp") ?? "").trim();
  let date: Date | null = null;
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return { ok: false, errors: { followUp: "Format tanggal tidak valid" } };
    date = new Date(`${raw}:00+07:00`);
    if (Number.isNaN(date.getTime())) return { ok: false, errors: { followUp: "Tanggal tidak valid" } };
  }
  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: date } });
    await logActivity(tx, {
      leadId,
      type: "FOLLOW_UP_SET",
      actorId: user.id,
      message: date ? `Follow-up dijadwalkan ${raw.replace("T", " ")} WIB` : "Jadwal follow-up dihapus",
    });
  });
  refresh();
  return { ok: true, message: date ? "Jadwal follow-up disimpan." : "Jadwal follow-up dihapus." };
}
