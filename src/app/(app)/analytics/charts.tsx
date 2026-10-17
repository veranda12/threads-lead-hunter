"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Palette divalidasi dengan dataviz validate_palette.js terhadap surface #ffffff (light):
// lightness band, chroma floor, CVD, dan kontras lolos semua.
const FOUND = "#3f9c7a";
const QUALIFIED = "#b8492a";
const SINGLE = "#14855f";

const axis = { fontSize: 12, fill: "#6b675e" };

function shortDate(key: string) {
  const [, m, d] = key.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function LeadsPerDayChart({ data }: { data: { date: string; found: number; qualified: number }[] }) {
  return (
    <div>
      <ul className="mb-2 flex gap-4 text-xs text-ink-2" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: FOUND }} /> Lead ditemukan
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: QUALIFIED }} /> Terkualifikasi (skor 60+)
        </li>
      </ul>
      <div className="h-64" role="img" aria-label="Grafik batang lead ditemukan dan terkualifikasi per hari, 30 hari terakhir">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="#ece9e2" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={{ stroke: "#cfcbc0" }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(26,25,21,0.05)" }}
              labelFormatter={(l) => shortDate(String(l))}
              formatter={(v, name) => [String(v), name === "found" ? "Ditemukan" : "Terkualifikasi"]}
              contentStyle={{ borderRadius: 6, borderColor: "#e3e0d8", fontSize: 12 }}
            />
            <Bar dataKey="found" fill={FOUND} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="qualified" fill={QUALIFIED} radius={[4, 4, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CategoryChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div style={{ height: Math.max(120, data.length * 40) }} role="img" aria-label="Grafik batang jumlah lead per kategori">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={140} />
          <Tooltip cursor={{ fill: "rgba(26,25,21,0.05)" }} formatter={(v) => [String(v), "Lead"]} contentStyle={{ borderRadius: 6, borderColor: "#e3e0d8", fontSize: 12 }} />
          <Bar dataKey="count" fill={SINGLE} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 12, fill: "#45423b" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
