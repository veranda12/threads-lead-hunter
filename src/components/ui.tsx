import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] font-semibold leading-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold text-ink">
        {children}
      </h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "pine" | "clay" | "ochre" | "slate" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  pine: "bg-pine-soft text-pine-strong",
  clay: "bg-clay-soft text-clay",
  ochre: "bg-ochre-soft text-ochre",
  slate: "bg-slate-soft text-slate",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Empty state: menyebut alasan kosong dan satu tindakan berikutnya. */
export function EmptyState({
  title,
  reason,
  action,
}: {
  title: string;
  reason: ReactNode;
  action?: { href: string; label: string } | ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted">{reason}</div>
      {action ? (
        <div className="mt-4">
          {action && typeof action === "object" && "href" in action ? (
            <Link href={action.href} className="btn btn-secondary">
              {action.label}
            </Link>
          ) : (
            action
          )}
        </div>
      ) : null}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted">{i.label}</dt>
          <dd className="min-w-0 break-words text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: "neutral" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-ochre/30 bg-ochre-soft text-ink"
      : tone === "danger"
        ? "border-danger/30 bg-danger-soft text-ink"
        : tone === "ok"
          ? "border-pine/25 bg-pine-soft text-ink"
          : "border-line bg-surface text-ink";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${cls}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-0.5 text-ink-2" : "text-ink-2"}>{children}</div>
    </div>
  );
}

export function Metric({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-0.5 text-xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-faint">{hint}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-md px-1 py-1 hover:bg-sunken">
      {body}
    </Link>
  ) : (
    <div className="px-1 py-1">{body}</div>
  );
}

export function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Memuat data" className="space-y-3">
      <div className="h-7 w-56 animate-pulse rounded bg-sunken" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-sunken/70" />
      ))}
    </div>
  );
}
