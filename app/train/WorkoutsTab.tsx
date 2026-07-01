"use client";

import type { CSSProperties } from "react";
import { useTrain, type TrnOverview } from "../lib/api";

// Saved routines are static this phase (no planner/logger yet).
const ROUTINES = [
  { name: "Upper Push A", meta: "6 exercises · 58 min", adherence: "92% adherence", grad: "linear-gradient(135deg,#2b2f52,#191b2e)", tint: "#a9b6ff" },
  { name: "Z2 Base Run", meta: "45 min · easy", adherence: "100% adherence", grad: "linear-gradient(135deg,#123b35,#0f221f)", tint: "#4fe0b6" },
  { name: "Lower Strength", meta: "7 exercises · 62 min", adherence: "88% adherence", grad: "linear-gradient(135deg,#3a2540,#211623)", tint: "#e2a9ff" },
  { name: "Long Run", meta: "90 min · aerobic", adherence: "95% adherence", grad: "linear-gradient(135deg,#123049,#0f1d2b)", tint: "#6fc3ff" },
];

// Static adherence week (activates once the planner commits plans — Phase 2).
const ADH_DAYS: { d: string; s: "done" | "miss" | "resl" | "none" }[] = [
  { d: "Mon", s: "done" }, { d: "Tue", s: "done" }, { d: "Wed", s: "none" },
  { d: "Thu", s: "done" }, { d: "Fri", s: "miss" }, { d: "Sat", s: "resl" }, { d: "Sun", s: "none" },
];

export default function WorkoutsTab() {
  const { data: ov, error } = useTrain<TrnOverview>("overview");
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!ov) return <div className="muted center pad">Loading…</div>;

  const sw = ov.strength.weekly;
  const lastSw = sw[sw.length - 1];
  const run = ov.cardio.weekly.running || [];
  const run4 = run.slice(-4).reduce((a, w) => a + (w.distance_km || 0), 0);
  const tonnes = lastSw ? (lastSw.volume_kg / 1000).toFixed(1) : "—";

  return (
    <div>
      {/* Continue (static resume card) */}
      <button className="trn-continue" type="button">
        <span className="play">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5l11 7-11 7z" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">Continue: Upper Push + Core</div>
          <div className="s">3 exercises left · 24 min in</div>
        </div>
      </button>

      {/* Quick stats (real, from overview) */}
      <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="trn-cell"><div className="v tnum">{lastSw?.sessions ?? 0}</div><div className="l">lifts · this wk</div></div>
        <div className="trn-cell"><div className="v tnum">{tonnes}<span style={{ fontSize: 11 }}>t</span></div><div className="l">volume · this wk</div></div>
        <div className="trn-cell"><div className="v tnum">{run4.toFixed(0)}<span style={{ fontSize: 11 }}>km</span></div><div className="l">run · 4 wk</div></div>
      </div>

      {/* This week's adherence — static preview this phase */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="ring" style={{ "--p": 0.8, "--c": "#34d6a4", width: 72, height: 72, flex: "0 0 72px" } as CSSProperties}>
            <span className="ring-num tnum" style={{ fontSize: 20 }}>80%</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>This week&apos;s adherence</div>
            <div className="subtle tiny" style={{ marginTop: 3 }}>4 of 5 planned sessions done. Missed Fri intervals — coach reslotted it to Sat.</div>
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              <span className="tnum" style={{ fontSize: 12 }}>🔥 12 <span className="subtle">wk streak</span></span>
              <span className="tnum" style={{ fontSize: 12 }}>96% <span className="subtle">volume hit</span></span>
            </div>
          </div>
        </div>
        <div className="trn-adh-days">
          {ADH_DAYS.map((x) => (
            <div className="trn-adh-day" key={x.d}>
              <div className={`trn-adh-box ${x.s}`}>{x.s === "done" ? "✓" : x.s === "miss" ? "✕" : x.s === "resl" ? "⟳" : ""}</div>
              <div className="dl">{x.d}</div>
            </div>
          ))}
        </div>
        <div className="trn-adh-legend">
          <span><i style={{ background: "rgba(52,214,164,.9)" }} />Done</span>
          <span><i style={{ background: "rgba(255,111,94,.85)" }} />Missed</span>
          <span><i style={{ background: "linear-gradient(135deg,#5f7dff,#a274ff)" }} />Reslotted</span>
        </div>
        <div className="subtle tiny" style={{ marginTop: 10, opacity: 0.8 }}>Preview · goes live once the planner commits weekly plans.</div>
      </div>

      {/* Saved routines (static) */}
      <div className="eyebrow" style={{ marginTop: 4 }}>Saved routines</div>
      <div className="trn-routines">
        {ROUTINES.map((r) => (
          <div className="trn-routine" key={r.name} style={{ background: r.grad }}>
            <span className="badge" style={{ color: r.tint }}>{r.adherence}</span>
            <div className="t">{r.name}</div>
            <div className="s">{r.meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
