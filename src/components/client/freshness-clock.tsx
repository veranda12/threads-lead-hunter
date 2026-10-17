"use client";

import { useEffect, useState } from "react";

const WINDOW_MS = 6 * 60 * 60 * 1000;

function describe(postedAtMs: number, nowMs: number) {
  const remaining = postedAtMs + WINDOW_MS - nowMs;
  if (remaining <= 0) return { fresh: false, urgent: false, text: "Lewat 6 jam" };
  const min = Math.floor(remaining / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const text = h > 0 ? `sisa ${h} j ${m} m` : `sisa ${m} m`;
  return { fresh: true, urgent: remaining < 60 * 60 * 1000, text };
}

/**
 * Hitung mundur jendela freshness 6 jam. Render awal memakai waktu server agar
 * tidak terjadi hydration mismatch, lalu diperbarui setiap 30 detik di browser.
 */
export function FreshnessClock({ postedAt, serverNow, manual }: { postedAt: string | null; serverNow: string; manual?: boolean }) {
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!postedAt) {
    return <span className="text-xs text-faint">Waktu posting tidak diketahui</span>;
  }
  const d = describe(new Date(postedAt).getTime(), now);
  return (
    <span
      className={`tabular inline-flex items-center gap-1.5 text-xs font-medium ${d.fresh ? (d.urgent ? "text-clay" : "text-pine") : "text-faint"}`}
      title={manual ? "Waktu posting diisi manual saat import" : "Dihitung dari timestamp Threads API"}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${d.fresh ? (d.urgent ? "bg-clay" : "bg-pine") : "bg-line-strong"}`} />
      {d.fresh ? `Fresh, ${d.text}` : d.text}
      {manual ? <span className="font-normal text-faint">(manual)</span> : null}
    </span>
  );
}
