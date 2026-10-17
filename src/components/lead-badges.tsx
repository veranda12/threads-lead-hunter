import { Badge } from "@/components/ui";
import { priorityLabel, type Priority } from "@/lib/leads/scoring";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/crm";

export function PriorityBadge({ priority, score }: { priority: Priority | null; score: number | null }) {
  if (priority === null || score === null) return <Badge tone="neutral">Belum dinilai</Badge>;
  const tone = priority === "HIGH" ? "clay" : priority === "MEDIUM" ? "ochre" : priority === "LOW" ? "slate" : "neutral";
  return (
    <Badge tone={tone} title={priorityLabel(priority)}>
      <span className="tabular">{score}</span>
      <span className="font-normal">{priority === "HIGH" ? "Tinggi" : priority === "MEDIUM" ? "Sedang" : priority === "LOW" ? "Rendah" : "Abaikan"}</span>
    </Badge>
  );
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const tone =
    status === "WON"
      ? "pine"
      : status === "LOST" || status === "ARCHIVED"
        ? "neutral"
        : status === "NEW"
          ? "slate"
          : status === "NEGOTIATION" || status === "PROPOSAL_SENT"
            ? "ochre"
            : "pine";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

const ANALYSIS_LABELS: Record<string, { label: string; tone: "neutral" | "ochre" | "danger" | "slate" }> = {
  PENDING: { label: "Menunggu analisis", tone: "slate" },
  PREFILTERED_OUT: { label: "Tidak lolos pre-filter", tone: "neutral" },
  FAILED: { label: "Analisis gagal", tone: "danger" },
  BUDGET_EXCEEDED: { label: "Pending, budget AI habis", tone: "ochre" },
  NOT_CONFIGURED: { label: "Pending, API key belum ada", tone: "ochre" },
};

export function AnalysisStatusBadge({ status }: { status: string }) {
  const s = ANALYSIS_LABELS[status];
  if (!s) return null;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source === "MANUAL_IMPORT") return <Badge tone="neutral">Import manual</Badge>;
  if (source === "DEMO_FIXTURE") return <Badge tone="danger" title="Data contoh, bukan hasil pencarian">Data demo</Badge>;
  return null;
}
