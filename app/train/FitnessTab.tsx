"use client";
import Icon, { type IconName } from "../components/Icon";

import { useEffect, useMemo, useState } from "react";
import { SubPills } from "./ui";
import { trainingLoad, type TrnLoadPoint, type TrnThreshold } from "../lib/api";
import Loader from "../components/Loader";

const RANGES = ["6W", "3M", "6M"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "6W": 42, "3M": 91, "6M": 182 };

const C_CTL = "#6d8bff"; // fitness
const C_ATL = "#ff7aa8"; // fatigue
const C_TSB = "#ffb547"; // form

const pad2 = (n: number) => String(n).padStart(2, "0");
const paceKm = (s: number) => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}/km`;
const pace100 = (s: number) => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}/100m`;

function formStatus(tsb: number): { label: string; color: string } {
  if (tsb > 5) return { label: "Fresh", color: "var(--success)" };
  if (tsb >= -10) return { label: "Neutral", color: "var(--muted)" };
  if (tsb >= -30) return { label: "Tired", color: "var(--gold)" };
  return { label: "Very tired", color: "var(--danger)" };
}

function PmcChart({ pts }: { pts: TrnLoadPoint[] }) {
  const W = 320, H = 150, pad = 10;
  if (pts.length < 2)
    return <div className="subtle tiny center" style={{ padding: "26px 0" }}>Not enough data yet</div>;
  const n = pts.length;
  const xs = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const load = pts.flatMap((p) => [p.ctl, p.atl]);
  let lo = Math.min(...load), hi = Math.max(...load);
  if (hi === lo) hi = lo + 1;
  const ys = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad);
  const line = (key: "ctl" | "atl") =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)} ${ys(p[key]).toFixed(1)}`).join(" ");
  const last = pts[n - 1];
  return (
    <svg className="trn-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
      <path d={line("atl")} fill="none" stroke={C_ATL} strokeWidth="2" opacity="0.9"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={line("ctl")} fill="none" stroke={C_CTL} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xs(n - 1)} cy={ys(last.ctl)} r="3.4" fill={C_CTL} />
      <circle cx={xs(n - 1)} cy={ys(last.atl)} r="3" fill={C_ATL} />
    </svg>
  );
}

const tile: React.CSSProperties = { flex: 1, textAlign: "center", padding: "10px 4px" };
const big: React.CSSProperties = { display: "block", fontSize: 26, fontWeight: 700, lineHeight: 1.1, margin: "2px 0" };
const dot: React.CSSProperties = { display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 4 };

export default function FitnessTab() {
  const [range, setRange] = useState<Range>("3M");
  const [resp, setResp] = useState<{ load: TrnLoadPoint[]; thresholds: TrnThreshold[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    trainingLoad(190)
      .then((d) => { if (alive) setResp({ load: d.load || [], thresholds: d.thresholds || [] }); })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);

  const pts = useMemo(() => (resp ? resp.load.slice(-RANGE_DAYS[range]) : []), [resp, range]);

  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!resp) return <Loader />;

  const last = resp.load[resp.load.length - 1];
  const ctl = last?.ctl ?? 0, atl = last?.atl ?? 0, tsb = last?.tsb ?? 0;
  const st = formStatus(tsb);

  const thr = (sport: string, metric: string) => resp.thresholds.find((t) => t.sport === sport && t.metric === metric);
  const ftp = thr("bike", "ftp_w"), lthrB = thr("bike", "lthr"), lthrR = thr("run", "lthr"),
    tpace = thr("run", "threshold_pace_s_per_km"), css = thr("swim", "css_pace_s_per_100m");

  const srcBadge = (s?: string) => s ? (
    <span className="subtle tiny" style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 6,
      background: s === "garmin" ? "rgba(109,139,255,0.16)" : "rgba(255,181,71,0.16)" }}>
      {s === "garmin" ? "Garmin" : s === "computed" ? "Est" : "Manual"}
    </span>
  ) : null;

  const thCell = (icon: string, label: string, val: string, src?: string) => (
    <div key={label} style={{ flex: "1 1 45%", minWidth: 132, display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 10 }}>
      <span className="subtle tiny">{icon} {label}</span>
      <span style={{ display: "flex", alignItems: "center" }}><b>{val}</b>{srcBadge(src)}</span>
    </div>
  );

  return (
    <div>
      <div className="card" style={{ display: "flex", padding: "6px 4px" }}>
        <div style={tile}><span className="subtle tiny" style={{ color: C_CTL }}>Fitness</span><span style={big}>{ctl.toFixed(0)}</span><span className="subtle tiny">CTL · 42d</span></div>
        <div style={tile}><span className="subtle tiny" style={{ color: C_ATL }}>Fatigue</span><span style={big}>{atl.toFixed(0)}</span><span className="subtle tiny">ATL · 7d</span></div>
        <div style={tile}><span className="subtle tiny" style={{ color: C_TSB }}>Form</span><span style={{ ...big, color: st.color }}>{tsb > 0 ? "+" : ""}{tsb.toFixed(0)}</span><span className="subtle tiny" style={{ color: st.color }}>{st.label}</span></div>
      </div>

      <section className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div className="subtle tiny" style={{ display: "flex", gap: 12 }}>
            <span><i style={{ ...dot, background: C_CTL }} />Fitness</span>
            <span><i style={{ ...dot, background: C_ATL }} />Fatigue</span>
          </div>
          <SubPills items={RANGES} value={range} onChange={setRange} />
        </div>
        <PmcChart pts={pts} />
        <div className="subtle tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
          Form is yesterday&apos;s Fitness minus Fatigue. Positive means fresh and race-ready; deep negative means overreached. Fitness rises when you hold Fatigue above it across steady weeks — then taper to lift Form for race day.
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <b>Thresholds</b><span className="subtle tiny">auto-updated · TSS per session</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {thCell("bike", "FTP", ftp ? `${ftp.value.toFixed(0)} W` : "—", ftp?.source)}
          {thCell("bike", "LTHR", lthrB ? `${lthrB.value.toFixed(0)} bpm` : "—", lthrB?.source)}
          {thCell("run", "Thr pace", tpace ? paceKm(tpace.value) : "—", tpace?.source)}
          {thCell("run", "LTHR", lthrR ? `${lthrR.value.toFixed(0)} bpm` : "—", lthrR?.source)}
          {thCell("swim", "CSS", css ? pace100(css.value) : "—", css?.source)}
        </div>
      </section>
    </div>
  );
}
