"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useTrain, type TrnOverview, planWeek, planHistory, wkReconcile } from "../lib/api";
import WorkoutLogger from "./WorkoutLogger";

type HistWindow = { planned: number; completed: number; pct: number | null; planned_min: number; completed_min: number };
type PlanHistory = { windows: { week: HistWindow }; current_streak: number; best_streak: number };
type PlanSess = { session_date: string; completed: boolean; skipped: boolean; is_rest_day: boolean; committed: boolean };
type AdhDay = { d: string; s: "done" | "miss" | "resl" | "none" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wtToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];

export default function WorkoutsTab() {
  const { data: ov, error } = useTrain<TrnOverview>("overview");
  const [hist, setHist] = useState<PlanHistory | null>(null);
  const [week, setWeek] = useState<{ sessions: PlanSess[] } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try { await wkReconcile(); } catch { /* best-effort */ }
      const [h, w] = await Promise.all([
        planHistory<PlanHistory>().catch(() => null),
        planWeek<{ sessions: PlanSess[] }>().catch(() => null),
      ]);
      if (!alive) return;
      setHist(h); setWeek(w);
    })();
    return () => { alive = false; };
  }, []);
  const wStart = (() => { const d = new Date(wtToday() + "T00:00:00Z"); const dw = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dw); return d; })();
  const adhDays: AdhDay[] = DOW.map((label, i): AdhDay => {
    const dt = new Date(wStart); dt.setUTCDate(dt.getUTCDate() + i);
    const iso = dt.toISOString().split("T")[0];
    const ss = (week?.sessions || []).filter((s) => s.session_date === iso && s.committed && !s.is_rest_day);
    if (ss.length === 0) return { d: label, s: "none" };
    if (ss.some((s) => s.completed)) return { d: label, s: "done" };
    if (iso < wtToday() && ss.some((s) => !s.completed)) return { d: label, s: "miss" };
    return { d: label, s: "resl" };
  });
  const wwin = hist?.windows.week;
  const pct = wwin && wwin.planned > 0 ? Math.round((wwin.completed / wwin.planned) * 100) : null;
  const volHit = wwin && wwin.planned_min > 0 ? Math.round((wwin.completed_min / wwin.planned_min) * 100) : null;

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

          {/* This week's adherence — live from committed plan + completions */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="ring" style={{ "--p": pct != null ? pct / 100 : 0, "--c": "#34d6a4", width: 72, height: 72, flex: "0 0 72px" } as CSSProperties}>
                <span className="ring-num tnum" style={{ fontSize: 20 }}>{pct != null ? pct + "%" : "—"}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>This week&apos;s adherence</div>
                <div className="subtle tiny" style={{ marginTop: 3 }}>{wwin && wwin.planned > 0 ? `${wwin.completed} of ${wwin.planned} planned session${wwin.planned === 1 ? "" : "s"} done this week.` : "No committed sessions yet this week — commit a plan on the Schedule tab."}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  <span className="tnum" style={{ fontSize: 12 }}>🔥 {hist?.current_streak ?? 0} <span className="subtle">streak</span></span>
                  {volHit != null ? <span className="tnum" style={{ fontSize: 12 }}>{volHit}% <span className="subtle">time hit</span></span> : null}
                </div>
              </div>
            </div>
            <div className="trn-adh-days">
              {adhDays.map((x) => (
                <div className="trn-adh-day" key={x.d}>
                  <div className={`trn-adh-box ${x.s}`}>{x.s === "done" ? "✓" : x.s === "miss" ? "✕" : x.s === "resl" ? "·" : ""}</div>
                  <div className="dl">{x.d}</div>
                </div>
              ))}
            </div>
            <div className="trn-adh-legend">
              <span><i style={{ background: "rgba(52,214,164,.9)" }} />Done</span>
              <span><i style={{ background: "rgba(255,111,94,.85)" }} />Missed</span>
              <span><i style={{ background: "linear-gradient(135deg,#5f7dff,#a274ff)" }} />Planned</span>
            </div>
            <div className="subtle tiny" style={{ marginTop: 10, opacity: 0.8 }}>✓ Cardio (swim · run · ride) is auto-detected from your watch — no manual logging needed.</div>
          </div>
        </>
      )}
    </div>
  );
}
