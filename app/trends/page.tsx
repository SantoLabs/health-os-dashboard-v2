"use client";

import { useState, useRef } from "react";
import { useApi } from "../lib/api";
import { Screen } from "../components/Screen";

type Pt = { date: string; v: number | null };
type SleepPt = { date: string; total: number | null };
type Trends = {
  days: number;
  weight: Pt[];
  readiness: Pt[];
  hrv: Pt[];
  steps: Pt[];
  acwr: Pt[];
  sleep: SleepPt[];
  summary: { avg_hrv: number; avg_steps: number; avg_sleep_h: number; avg_readiness: number };
  interpretation: Record<string, string>;
};

function fmtDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Present = { i: number; v: number; date: string };

function InteractiveChart({ pts, color, band, fmt }: {
  pts: Pt[]; color: string; band?: [number, number]; fmt: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 340, H = 120, padX = 10, padTop = 14, padBot = 16;

  const idx: Present[] = pts.map((p, i) => ({ i, v: p.v as number, date: p.date })).filter((p) => p.v != null);
  if (idx.length < 2) return <div className="subtle tiny" style={{ marginTop: 8 }}>Not enough data yet.</div>;

  const vals = idx.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (band) { min = Math.min(min, band[0]); max = Math.max(max, band[1]); }
  const range = max - min || 1;
  const n = pts.length;
  const X = (i: number) => padX + (i / (n - 1)) * (W - 2 * padX);
  const Y = (v: number) => H - padBot - ((v - min) / range) * (H - padTop - padBot);

  const line = idx.map((p, k) => `${k === 0 ? "M" : "L"} ${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L ${X(idx[idx.length - 1].i).toFixed(1)} ${H - padBot} L ${X(idx[0].i).toFixed(1)} ${H - padBot} Z`;

  const minPt = idx.reduce((a, b) => (b.v < a.v ? b : a));
  const maxPt = idx.reduce((a, b) => (b.v > a.v ? b : a));
  const last = idx[idx.length - 1];

  function locate(clientX: number) {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vbX = ((clientX - r.left) / r.width) * W;
    let best = idx[0], bestD = Infinity;
    for (const p of idx) { const d = Math.abs(X(p.i) - vbX); if (d < bestD) { bestD = d; best = p; } }
    setActive(best.i);
  }

  const act = active != null ? idx.find((p) => p.i === active) : null;
  const tipX = act ? Math.min(Math.max(X(act.i), 34), W - 34) : 0;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 8, touchAction: "pan-y" }}
      onPointerDown={(e) => locate(e.clientX)}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") locate(e.clientX); }}
      onPointerLeave={() => setActive(null)}
      onPointerUp={() => setActive(null)}>
      {band && <rect x={0} y={Y(band[1])} width={W} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill={color} opacity={0.09} />}
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(minPt.i)} cy={Y(minPt.v)} r={2.6} fill="var(--muted)" opacity={0.7} />
      <circle cx={X(maxPt.i)} cy={Y(maxPt.v)} r={2.6} fill="var(--muted)" opacity={0.7} />
      <circle cx={X(last.i)} cy={Y(last.v)} r={3.5} fill={color} />
      {act && (
        <g>
          <line x1={X(act.i)} y1={padTop - 6} x2={X(act.i)} y2={H - padBot} stroke={color} strokeWidth={1} opacity={0.5} strokeDasharray="3 3" />
          <circle cx={X(act.i)} cy={Y(act.v)} r={4.5} fill={color} stroke="#0b0f17" strokeWidth={1.5} />
          <rect x={tipX - 32} y={0} width={64} height={15} rx={4} fill="#0b0f17" opacity={0.9} />
          <text x={tipX} y={11} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>{fmt(act.v)}</text>
          <text x={tipX} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted)">{fmtDate(act.date)}</text>
        </g>
      )}
    </svg>
  );
}

function MetricCard({ title, latest, unit, series, color, note, band, fmt }: {
  title: string; latest?: string; unit?: string; series: Pt[]; color: string; note?: string; band?: [number, number]; fmt?: (v: number) => string;
}) {
  const present = series.filter((p) => p.v != null) as { date: string; v: number }[];
  let delta: { txt: string; up: boolean } | null = null;
  if (present.length >= 2) {
    const d = present[present.length - 1].v - present[0].v;
    if (Math.abs(d) > 1e-9) delta = { txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d) >= 100 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}`, up: d > 0 };
  }
  const f = fmt || ((v: number) => `${v}`);
  return (
    <section className="card">
      <div className="lever-top">
        <span><strong>{title}</strong></span>
        <span>
          {latest && <span>{latest}{unit}</span>}
          {delta && <span className="subtle tiny" style={{ marginLeft: 8 }}>{delta.txt} <span style={{ fontSize: 9 }}>over {present.length}d</span></span>}
        </span>
      </div>
      <InteractiveChart pts={series} color={color} band={band} fmt={f} />
      {note && <div className="subtle tiny mt8">{note}</div>}
    </section>
  );
}

const lastVal = (pts: Pt[]): number | undefined => {
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].v != null) return pts[i].v as number;
  return undefined;
};

const RANGES = [7, 30, 90];

export default function TrendsPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useApi<Trends>(`trends&days=${days}`);
  const sleepHours: Pt[] = data ? data.sleep.map((s) => ({ date: s.date, v: s.total != null ? Math.round((s.total / 60) * 10) / 10 : null })) : [];

  return (
    <Screen title="Trends" error={error} loading={!data && !error}>
      <section className="range-seg">
        {RANGES.map((r) => (
          <button key={r} className={r === days ? "range-opt active" : "range-opt"} onClick={() => setDays(r)}>
            {r}d
          </button>
        ))}
      </section>
      {data && (
        <>
          <section className="stats-row">
            <div className="card stat"><div className="stat-num">{Math.round(data.summary.avg_readiness)}</div><div className="stat-label">avg readiness</div></div>
            <div className="card stat"><div className="stat-num">{Math.round(data.summary.avg_hrv)}<span className="stat-of">ms</span></div><div className="stat-label">avg HRV</div></div>
            <div className="card stat"><div className="stat-num">{data.summary.avg_sleep_h}<span className="stat-of">h</span></div><div className="stat-label">avg sleep</div></div>
            <div className="card stat"><div className="stat-num">{(data.summary.avg_steps / 1000).toFixed(1)}<span className="stat-of">k</span></div><div className="stat-label">avg steps</div></div>
          </section>

          <div className="subtle tiny" style={{ textAlign: "center", marginBottom: 4 }}>Tap or drag any chart to read values</div>

          <h2 className="section-title">Body</h2>
          <MetricCard title="Weight" latest={lastVal(data.weight)?.toFixed(1)} unit="kg" series={data.weight} color="#38bdf8" note={data.interpretation.weight} fmt={(v) => `${v.toFixed(1)}kg`} />

          <h2 className="section-title">Sleep</h2>
          <MetricCard title="Sleep duration" latest={lastVal(sleepHours)?.toFixed(1)} unit="h" series={sleepHours} color="#60a5fa" note={data.interpretation.sleep} band={[7, 9]} fmt={(v) => `${v.toFixed(1)}h`} />

          <h2 className="section-title">Recovery</h2>
          <MetricCard title="Readiness" latest={lastVal(data.readiness)?.toString()} series={data.readiness} color="#34d399" note={data.interpretation.readiness} fmt={(v) => `${Math.round(v)}`} />
          <MetricCard title="HRV" latest={lastVal(data.hrv)?.toString()} unit=" ms" series={data.hrv} color="#a78bfa" note={data.interpretation.hrv} fmt={(v) => `${Math.round(v)} ms`} />

          <h2 className="section-title">Activity</h2>
          <MetricCard title="Steps" latest={lastVal(data.steps)?.toLocaleString()} series={data.steps} color="#fbbf24" note={data.interpretation.steps} fmt={(v) => v.toLocaleString()} />
          <MetricCard title="Training load (ACWR)" latest={lastVal(data.acwr)?.toFixed(2)} series={data.acwr} color="#f472b6" note={data.interpretation.acwr} band={[0.8, 1.3]} fmt={(v) => v.toFixed(2)} />

          <div className="subtle tiny mt8" style={{ textAlign: "center" }}>ACWR shaded band = 0.8–1.3 sweet spot</div>
        </>
      )}
    </Screen>
  );
}
