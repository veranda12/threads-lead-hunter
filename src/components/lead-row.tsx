import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { FreshnessClock } from "@/components/client/freshness-clock";
import { AnalysisStatusBadge, PriorityBadge, SourceBadge, StatusBadge } from "@/components/lead-badges";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/time";
import { CATEGORY_LABELS } from "@/lib/ai/schemas";
import type { Priority } from "@/lib/leads/scoring";
import type { LeadStatus } from "@/lib/leads/crm";
import { threadsProfileUrl } from "@/lib/discovery/normalize";

export type LeadRowData = {
  id: string;
  authorUsername: string | null;
  text: string;
  permalink: string | null;
  postedAt: Date | null;
  discoveredAt: Date;
  leadScore: number | null;
  priority: string | null;
  status: string;
  category: string | null;
  analysisStatus: string;
  source: string;
  keyword?: string | null;
  reason?: string | null;
  service?: { name: string; price: string } | null;
  budget?: string | null;
  dmPreview?: string | null;
};

export function LeadRow({ lead, serverNow, compact }: { lead: LeadRowData; serverNow: string; compact?: boolean }) {
  const profile = threadsProfileUrl(lead.authorUsername);
  return (
    <article className="group relative border-b border-line px-4 py-4 last:border-b-0 hover:bg-canvas/60 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <PriorityBadge priority={lead.priority as Priority | null} score={lead.leadScore} />
        <span className="text-sm font-semibold text-ink">{lead.authorUsername ? `@${lead.authorUsername}` : "Penulis tidak diketahui"}</span>
        <FreshnessClock postedAt={lead.postedAt?.toISOString() ?? null} serverNow={serverNow} manual={lead.source === "MANUAL_IMPORT"} />
        <div className="flex flex-wrap items-center gap-1.5">
          {lead.status !== "NEW" ? <StatusBadge status={lead.status as LeadStatus} /> : null}
          {lead.analysisStatus !== "ANALYZED" ? <AnalysisStatusBadge status={lead.analysisStatus} /> : null}
          {lead.category ? <Badge>{CATEGORY_LABELS[lead.category as keyof typeof CATEGORY_LABELS] ?? lead.category}</Badge> : null}
          <SourceBadge source={lead.source} />
        </div>
      </div>

      <p className={`mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink ${compact ? "line-clamp-2" : "line-clamp-4"}`}>{lead.text}</p>

      {!compact && (lead.reason || lead.service) ? (
        <div className="mt-2 grid gap-1 text-sm text-ink-2 sm:grid-cols-[1fr_auto] sm:gap-4">
          {lead.reason ? <p className="line-clamp-2">{lead.reason}</p> : <span />}
          {lead.service ? (
            <p className="text-muted sm:text-right">
              {lead.service.name}, <span className="text-ink-2">{lead.service.price}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {!compact && lead.dmPreview ? (
        <p className="mt-2 line-clamp-2 border-l-2 border-line-strong pl-3 text-sm italic text-muted">{lead.dmPreview}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
        <span>Diposting {formatDateTime(lead.postedAt)}</span>
        {!compact ? <span>Ditemukan {formatDateTime(lead.discoveredAt)}</span> : null}
        {lead.keyword ? <span>Keyword: {lead.keyword}</span> : null}
        {lead.budget ? <span className="text-ink-2">Budget disebut: {lead.budget}</span> : null}
        <span className="ml-auto flex items-center gap-3">
          {lead.permalink ? (
            <a href={lead.permalink} target="_blank" rel="noopener noreferrer" className="relative z-10 inline-flex items-center gap-1 text-muted hover:text-ink">
              Postingan <ExternalLink size={12} aria-hidden />
            </a>
          ) : null}
          {profile ? (
            <a href={profile} target="_blank" rel="noopener noreferrer" className="relative z-10 inline-flex items-center gap-1 text-muted hover:text-ink">
              Profil <ExternalLink size={12} aria-hidden />
            </a>
          ) : null}
        </span>
      </div>
      <Link href={`/leads/${lead.id}`} className="absolute inset-0" aria-label={`Buka detail lead ${lead.authorUsername ?? lead.id}`} />
    </article>
  );
}
