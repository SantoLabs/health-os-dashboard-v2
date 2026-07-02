"use client";

import type { CSSProperties } from "react";
import { useTrain, type TrnOverview } from "../lib/api";
import WorkoutLogger from "./WorkoutLogger";

// Static adherence week (activates once the planner commits plans — Phase 2/3 wiring).
const ADH_DAYS: { d: string; s: "done" | "miss" | "resl" | "none" }[] = [
  { d: "Mon", s: "done" }, { d: "Tue", s: "done" }, { d: "Wed", s: "none" },
  { d: "Thu", s: "done" }, { d: "Fri", s: "miss" }, { d: "Sat", s: "resl" }, { d: "Sun", s: "none" },
];

export default function WorkoutsTab() {
  const { data: ov, error } = useTrain<TrnOverview>("overview");

  return (
    <div>
      {/* Live logger: resume / start-from-plan / start-from-routine / empty, live set logging,
          celebration + PRs, and the routine builder. Owns the execution surface (Phase 3). */}
      <WorkoutLogger />

      {/* Quick stats (real, from overview) */}
      {error ? (
        <div className="card error" style={{ marginTop: 12 }}><strong>Couldn&apos;t load stats</strong><div className="subtle">{error}</div></div>
      ) : !ov ? (
        <div className="muted center pad">Loading…</div>
      ) : (
        <>
          {(() => {
            const sw = ov.strength.weekly;
            const lastSw = sw[sw.length - 1];
            const run = ov.cardio.weekly.running || [];
            const run4 = run.slice(-4).reduce((a, w) => a + (w.distance_km || 0), 0);
            const tonnes = lastSw ? (lastSw.volume_kg / 1000).toFixed(1) : "—";
            return (
              <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 12 }}>
                <div className="trn-cell"><div className="v tnum">{lastSw?.sessions ?? 0}</div><div className="l">lifts · this wk</div></div>
                <div className="trn-cell"><div className="v tnum">{tonnes}<span style={{ fontSize: 11 }}>t</span></div><div className="l">volume · this wk</div></div>
                <div className="trn-cell"><div className="v tnum">{run4.toFixed(0)}<span style={{ fontSize: 11 }}>km</span></div><div className="l">run · 4 wk</div></div>
              </div>
            );
          })()}

          {/* This week's adherence — static preview until planner adherence lands */}
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
        </>
      )}
    </div>
  );
}
