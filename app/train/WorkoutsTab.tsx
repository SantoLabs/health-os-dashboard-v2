"use client";

import { useState } from "react";
import { useTrain, type TrnOverview } from "../lib/api";
import WorkoutLogger from "./WorkoutLogger";
import CardioBuilder from "./CardioBuilder";

export default function WorkoutsTab() {
  const { data: ov, error } = useTrain<TrnOverview>("overview");
  // Phase 3.0 — type-first entry: one surface at a time. Logger owns strength family; cardio forks out.
  const [surface, setSurface] = useState<"logger" | "cardio">("logger");
  const [cardioIntent, setCardioIntent] = useState<"workout" | "routine">("workout");
  const [cardioStart, setCardioStart] = useState<"describe" | "build">("build");

  if (surface === "cardio") {
    return <CardioBuilder onExit={() => setSurface("logger")} intent={cardioIntent} startMode={cardioStart} />;
  }

  return (
    <div>
      {/* Live logger owns strength/mobility/recovery entry + execution; forks to cardio via onOpenCardio. */}
      <WorkoutLogger onOpenCardio={(intent, start) => { setCardioIntent(intent); setCardioStart(start); setSurface("cardio"); }} />

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
