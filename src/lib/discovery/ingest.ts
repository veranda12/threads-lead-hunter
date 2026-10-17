import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { checkPostTimestamp, freshnessOf, parseProviderTimestamp, FUTURE_SKEW_TOLERANCE_MS } from "@/lib/time";
import { contentHash, normalizeUsername, usernameHash } from "@/lib/discovery/normalize";
import { prefilterPost } from "@/lib/discovery/prefilter";
import type { RawPost } from "@/lib/providers/types";

export type IngestOutcome =
  | { outcome: "NEW_LEAD"; leadId: string; prefilterPass: boolean }
  | { outcome: "UPDATED_CONTENT"; leadId: string; prefilterPass: boolean }
  | { outcome: "DUPLICATE"; leadId: string }
  | { outcome: "STALE" | "INVALID_TIMESTAMP" | "FUTURE_TIMESTAMP" | "SUPPRESSED" | "ERROR"; reason: string };

export type IngestContext = {
  now: Date;
  source: "OFFICIAL_THREADS" | "MANUAL_IMPORT" | "DEMO_FIXTURE";
  keywordId?: string | null;
  prefilterThreshold: number;
  actorId?: string | null;
  /** Discovery otomatis wajib dalam jendela 6 jam; import manual boleh lebih lama (freshness EXPIRED). */
  enforceFreshWindow: boolean;
};

export async function isSuppressed(username: string | null): Promise<boolean> {
  if (!username) return false;
  const row = await db.suppressedAuthor.findUnique({ where: { usernameHash: usernameHash(username) } });
  return row !== null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function ingestPost(post: RawPost, ctx: IngestContext): Promise<IngestOutcome> {
  if (await isSuppressed(post.username)) {
    return { outcome: "SUPPRESSED", reason: "Penulis meminta datanya dihapus" };
  }

  let postedAt: Date | null = null;
  if (ctx.enforceFreshWindow) {
    const check = checkPostTimestamp(post.timestamp, ctx.now);
    if (!check.ok) return { outcome: check.reason, reason: check.detail };
    postedAt = check.postedAt;
  } else if (post.timestamp !== null && post.timestamp !== undefined) {
    postedAt = parseProviderTimestamp(post.timestamp);
    if (!postedAt) return { outcome: "INVALID_TIMESTAMP", reason: "Timestamp tidak valid" };
    if (postedAt.getTime() - ctx.now.getTime() > FUTURE_SKEW_TOLERANCE_MS) {
      return { outcome: "FUTURE_TIMESTAMP", reason: "Waktu posting berada di masa depan" };
    }
  }

  const text = (post.text ?? "").trim();
  const hash = contentHash(text);
  const prefilter = prefilterPost(text, ctx.prefilterThreshold);
  // Import manual dipilih sendiri oleh pengguna, jadi tetap dikirim ke AI walau skor pre-filter rendah.
  const prefilterPass = prefilter.pass || ctx.source === "MANUAL_IMPORT";
  const username = post.username ? normalizeUsername(post.username) : null;

  const existing = await db.lead.findFirst({
    where: {
      platform: post.platform,
      OR: [{ platformPostId: post.platformPostId }, ...(post.shortcode ? [{ shortcode: post.shortcode }] : [])],
    },
  });

  if (existing) {
    if (existing.contentHash === hash) return { outcome: "DUPLICATE", leadId: existing.id };
    await db.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: existing.id },
        data: {
          text,
          contentHash: hash,
          prefilterScore: prefilter.score,
          prefilterReason: prefilter.reason,
          analysisStatus: prefilterPass ? "PENDING" : existing.analysisStatus === "ANALYZED" ? "ANALYZED" : "PREFILTERED_OUT",
          rawData: post.raw as Prisma.InputJsonValue,
          lastActivityAt: ctx.now,
        },
      });
      await tx.leadActivity.create({
        data: { leadId: existing.id, type: "CONTENT_UPDATED", message: "Teks postingan berubah sejak terakhir diambil", actorId: ctx.actorId ?? null },
      });
    });
    return { outcome: "UPDATED_CONTENT", leadId: existing.id, prefilterPass };
  }

  try {
    const lead = await db.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          platform: post.platform,
          platformPostId: post.platformPostId,
          shortcode: post.shortcode,
          source: ctx.source,
          permalink: post.permalink,
          authorUsername: username,
          text,
          contentHash: hash,
          mediaType: post.mediaType,
          postedAt,
          discoveredAt: ctx.now,
          rawData: post.raw as Prisma.InputJsonValue,
          matchedKeywordId: ctx.keywordId ?? null,
          freshness: freshnessOf(postedAt, ctx.now),
          prefilterScore: prefilter.score,
          prefilterReason: prefilter.reason,
          analysisStatus: prefilterPass ? "PENDING" : "PREFILTERED_OUT",
          lastActivityAt: ctx.now,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          type: ctx.source === "MANUAL_IMPORT" ? "IMPORTED" : "DISCOVERED",
          message: ctx.source === "MANUAL_IMPORT" ? "Diimpor manual" : `Ditemukan lewat pencarian${prefilterPass ? "" : ", tidak lolos pre-filter"}`,
          actorId: ctx.actorId ?? null,
          metadata: { prefilterScore: prefilter.score, matched: prefilter.matched },
        },
      });
      if (ctx.keywordId && prefilterPass) {
        await tx.searchKeyword.update({ where: { id: ctx.keywordId }, data: { leadsFound: { increment: 1 } } });
      }
      return created;
    });
    return { outcome: "NEW_LEAD", leadId: lead.id, prefilterPass };
  } catch (error) {
    // Dua proses memasukkan post yang sama bersamaan: constraint unik menang, sisanya jadi duplikat.
    if (isUniqueViolation(error)) {
      const dup = await db.lead.findUnique({ where: { platform_platformPostId: { platform: post.platform, platformPostId: post.platformPostId } } });
      if (dup) return { outcome: "DUPLICATE", leadId: dup.id };
    }
    return { outcome: "ERROR", reason: (error as Error)?.message?.slice(0, 300) ?? "Gagal menyimpan" };
  }
}
