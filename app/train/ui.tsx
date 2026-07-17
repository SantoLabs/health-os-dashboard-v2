"use client";

import { ReactNode } from "react";

// ---------- formatters ----------
export const fmtPace = (dec: number | null | undefined): string => {
  if (dec == null || !isFinite(dec)) return "—";
  const m = Math.floor(dec);
  const s = Math.round((dec - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
};
export const dShort = (d: string): string =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const dWeekday = (d: string): string =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
export const kg = (n: number | null | undefined): string =>
  n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1);
export const daysAgo = (d: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000));

export const sportEmoji = (s: string): string => {
  const k = (s || "").toLowerCase();
  if (k.includes("swim")) return "🏊";
  if (k.includes("run")) return "🏃";
  if (k.includes("cycl") || k.includes("rid") || k.includes("bik")) return "🚴";
  return "💪";
};

// muscle-group → soft accent for lift row icons
const MUSCLE_TINT: Record<string, string> = {
  chest: "#d9704e", triceps: "#cc9a3d", biceps: "#b8734e", shoulders: "#5f9d8a",
  quadriceps: "#c2544a", hamstrings: "#82a05a", glutes: "#d98a5a", calves: "#8a7f73",
  lats: "#a07a4a", upper_back: "#a07a4a", abdominals: "#cba54d",
};
export const muscleTint = (m: string): string => MUSCLE_TINT[m] || "#8a7f73";

// ---------- delta pill (▲ +4.5 · 30d) ----------
export function Delta({ v, suffix, unit = "" }: { v: number | null | undefined; suffix?: string; unit?: string }) {
  if (v == null || v === 0)
    return <span className="trn-delta flat tnum">±0{unit}{suffix ? ` · ${suffix}` : ""}</span>;
  const up = v > 0;
  const n = Number.isInteger(v) ? String(v) : Math.abs(v).toFixed(1);
  return (
    <span className={up ? "trn-delta up tnum" : "trn-delta down tnum"}>
      {up ? "▲" : "▼"} {up ? "+" : "−"}{n}{unit}{suffix ? ` · ${suffix}` : ""}
    </span>
  );
}

// ---------- sparkline / area line chart ----------
export function Spark({
  values, height = 130, color = "var(--ember)", target = null, area = true,
}: { values: (number | null)[]; height?: number; color?: string; target?: number | null; area?: boolean }) {
  const W = 320, H = height, pad = 8;
  const n = values.length;
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null);
  if (pts.length < 2)
    return <div className="subtle tiny center" style={{ padding: "26px 0" }}>Not enough data yet</div>;
  const xs = (i: number) => pad + (n > 1 ? (i / (n - 1)) * (W - 2 * pad) : 0);
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (target != null) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
  if (hi === lo) hi = lo + 1;
  const ys = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
  const line = pts.map((p, k) => `${k === 0 ? "M" : "L"}${xs(p.i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  const areaPath = `${line} L${xs(last.i).toFixed(1)} ${(H - pad).toFixed(1)} L${xs(first.i).toFixed(1)} ${(H - pad).toFixed(1)} Z`;
  const gid = "sg" + Math.abs(Math.round(values.reduce<number>((a, v) => a + (v || 0), 0) * 100)).toString(36);
  return (
    <svg className="trn-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#${gid})`} />}
      {target != null && (
        <line x1={pad} y1={ys(target)} x2={W - pad} y2={ys(target)} stroke="var(--gold)" strokeWidth="1"
          strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity="0.75" />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
      <circle cx={xs(last.i)} cy={ys(last.v)} r="3.4" fill={color} />
    </svg>
  );
}

// ---------- horizontal HR-zone stacked bar + legend ----------
export function ZoneBar({ z }: { z: [number, number, number, number, number] }) {
  const cols = ["var(--z1)", "var(--z2)", "var(--z3)", "var(--z4)", "var(--z5)"];
  const labels = ["Z1", "Z2", "Z3", "Z4", "Z5"];
  const tot = z.reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <div className="trn-zonebar">
        {z.map((s, i) => (s > 0 ? <span key={i} style={{ width: `${(s / tot) * 100}%`, background: cols[i] }} /> : null))}
      </div>
      <div className="trn-zlegend">
        {z.map((s, i) => (
          <span key={i}><i style={{ background: cols[i] }} />{labels[i]} · {Math.round((s / tot) * 100)}%</span>
        ))}
      </div>
    </>
  );
}

// ---------- navigation ----------
export const PRIMARY = ["Coach", "Train", "Recovery", "Progress"] as const;
export type Primary = (typeof PRIMARY)[number];

export function Pills({ value, onChange }: { value: Primary; onChange: (p: Primary) => void }) {
  return (
    <div className="trn-pills">
      {PRIMARY.map((p) => (
        <button key={p} className={value === p ? "trn-pill on" : "trn-pill"} onClick={() => onChange(p)}>{p}</button>
      ))}
    </div>
  );
}

export function SubPills<T extends string>({ items, value, onChange }: { items: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="trn-subs">
      {items.map((it) => (
        <button key={it} className={value === it ? "trn-sub on" : "trn-sub"} onClick={() => onChange(it)}>{it}</button>
      ))}
    </div>
  );
}

export function BackHead({ title, sub, onBack, right }: { title: string; sub?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="trn-back">
      <button onClick={onBack} aria-label="Back">‹</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3>{title}</h3>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}
