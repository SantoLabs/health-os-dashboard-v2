"use client";

import { useApi } from "../lib/api";
import { Screen } from "../components/Screen";

type Pt = { date: string; v: number | null };
type Trends = {
  days: number;
  weight: Pt[];
  readiness: Pt[];
  hrv: Pt[];
  steps: Pt[];
  acwr: Pt[];
  summary: { avg_hrv: number; avg_steps: number; avg_sleep_h: number; avg_readiness: number };
  interpretation: Record<string, string>;
};

function Spark({ pts, color, band }: { pts: Pt[]; color: string; band?: [number, number] }) {
  const W = 320, H = 76, pad = 8;
  const idx = pts.map((p, i) => ({ i, v: p.v })).filter((p) => p.v != null) as { i: number; v: number }[];
  if (idx.length < 2) return <div className="subtle tiny">Not enough data yet.</div>;
  const vals = idx.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (band) { min = Math.min(min, band[0]); max = Math.max(max, band[1]); }
  const range = max - min || 1;
  const n = pts.length;
  const X = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const Y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const line = idx.map((p, k) => `${k === 0 ? "M" : "L"} ${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L ${X(idx[idx.length - 1].i).toFixed(1)} ${H - pad} L ${X(idx[0].i).toFixed(1)} ${H - pad} Z`;
  const last = idx[idx.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="76" preserveAspectRatio="none" style={{ display: "block", marginTop: 8 }}>
      {band && (
        <rect x={0} y={Y(band[1])} width={W} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill={color} opacity={0.08} />
      )}
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(last.i)} cy={Y(last.v)} r={3.5} fill={color} />
    </svg>
  );
}

function MetricCard({ title, latest, unit, series, color, note, band }: {
  title: string; latest?: string; unit?: string; series: Pt[]; color: string; note?: string; band?: [number, number];
}) {
  return (
    <section className="card">
      <div className="lever-top">
        <span><strong>{title}</strong></span>
        {latest && <span>{latest}{unit}</span>}
      </div>
      <Spark pts={series} color={color} band={band} />
      {note && <div className="subtle tiny mt8">{note}</div>}
    </section>
  );
}

const lastVal = (pts: Pt[]): number | undefined => {
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].v != null) return pts[i].v as number;
  return undefined;
};

export default function TrendsPage() {
  const { data, error } = useApi<Trends>("trends");

  return (
    <Screen title="Trends" sub={data ? `last ${data.days} days` : undefined} error={error} loading={!data && !error}>
      {data && (
        <>
          <section className="stats-row">
            <div className="card stat"><div className="stat-num">{Math.round(data.summary.avg_readiness)}</div><div className="stat-label">avg readiness</div></div>
            <div className="card stat"><div className="stat-num">{Math.round(data.summary.avg_hrv)}<span className="stat-of">ms</span></div><div className="stat-label">avg HRV</div></div>
            <div className="card stat"><div className="stat-num">{data.summary.avg_sleep_h}<span className="stat-of">h</span></div><div className="stat-label">avg sleep</div></div>
            <div className="card stat"><div className="stat-num">{(data.summary.avg_steps / 1000).toFixed(1)}<span className="stat-of">k</span></div><div className="stat-label">avg steps</div></div>
          </section>

          <h2 className="section-title">Body</h2>
          <MetricCard title="Weight" latest={lastVal(data.weight)?.toFixed(1)} unit="kg" series={data.weight} color="#38bdf8" note={data.interpretation.weight} />

          <h2 className="section-title">Recovery</h2>
          <MetricCard title="Readiness" latest={lastVal(data.readiness)?.toString()} series={data.readiness} color="#34d399" note={data.interpretation.readiness} />
          <MetricCard title="HRV" latest={lastVal(data.hrv)?.toString()} unit=" ms" series={data.hrv} color="#a78bfa" note={data.interpretation.hrv} />

          <h2 className="section-title">Activity</h2>
          <MetricCard title="Steps" latest={lastVal(data.steps)?.toLocaleString()} series={data.steps} color="#fbbf24" note={data.interpretation.steps} />
          <MetricCard title="Training load (ACWR)" latest={lastVal(data.acwr)?.toFixed(2)} series={data.acwr} color="#f472b6" note={data.interpretation.acwr} band={[0.8, 1.3]} />

          <div className="subtle tiny mt8" style={{ textAlign: "center" }}>ACWR shaded band = 0.8–1.3 sweet spot</div>
        </>
      )}
    </Screen>
  );
}
