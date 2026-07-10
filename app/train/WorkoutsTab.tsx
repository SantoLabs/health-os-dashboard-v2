"use client";

import { useTrain, type TrnOverview } from "../lib/api";
import WorkoutLogger from "./WorkoutLogger";
import CardioBuilder from "./CardioBuilder";

export default function WorkoutsTab() {
  const { data: ov, error } = useTrain<TrnOverview>("overview");

  return (
    <div>
      {/* Live logger: resume / start-from-plan / start-from-routine / empty, live set logging,
          celebration + PRs, and the routine builder. Owns the execution surface (Phase 3). */}
      <WorkoutLogger />

      {/* Cardio session builder (6c): create structured, editable interval workouts to save or add to calendar. */}
      <CardioBuilder />

      {/* Quick stats (real, from overview) */}
      {error ? (
        <div className="card error" style={{ marginTop: 12 }}><strong>Couldn&apos;t load stats</strong><div className="subtle">{error}</div></div>
      ) : !ov ? (
        <div className="muted center pad">Loading…</div>
      ) : (
        (() => {
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
        })()
      )}
    </div>
  );
}
