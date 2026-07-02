"use client";

import { useState } from "react";
import { useTrain, type TrnStrength, type TrnLiftSummary } from "../lib/api";
import { kg, muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";

function LiftRow({ l, onOpen }: { l: TrnLiftSummary; onOpen: (t: string) => void }) {
  const right = l.recent_e1rm ?? l.best_e1rm ?? l.max_weight;
  return (
    <button className="trn-liftrow" onClick={() => onOpen(l.title)}>
      <span className="ic" style={{ color: muscleTint(l.muscle_group) }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
        </svg>
      </span>
      <div className="main">
        <div className="tt">{l.title}</div>
        <div className="mm">{l.muscle_group.replace(/_/g, " ")} · {l.sessions} sessions</div>
      </div>
      <div className="rt">
        <div className="n tnum">{right != null ? kg(right) : "bw"}</div>
        <div className="k">{right != null ? (l.recent_e1rm != null ? "recent e1RM" : "kg") : "bodyweight"}</div>
      </div>
    </button>
  );
}

export default function StrengthTab() {
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data, error } = useTrain<TrnStrength>(sel ? null : "strength");

  if (sel) return <ExerciseDetail title={sel} onBack={() => setSel(null)} />;
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;

  const lifts = (data.lifts || []).filter((l) => l.sessions > 0);
  const groups = new Map<string, TrnLiftSummary[]>();
  for (const l of lifts) { const k = l.muscle_group || "other"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
  const groupList = Array.from(groups.entries())
    .map(([k, arr]) => ({ k, arr: arr.slice().sort((a, b) => (b.recent_e1rm ?? b.best_e1rm ?? b.max_weight ?? 0) - (a.recent_e1rm ?? a.best_e1rm ?? a.max_weight ?? 0)) }))
    .sort((a, b) => b.arr.length - a.arr.length);

  return (
    <div>
      <div className="eyebrow" style={{ marginTop: 0 }}>Your lifts · {lifts.length} · {groupList.length} muscle groups</div>
      {groupList.map(({ k, arr }, i) => {
        const isOpen = open[k] ?? (i === 0);
        return (
          <div key={k} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
            <button onClick={() => setOpen((o) => ({ ...o, [k]: !isOpen }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: muscleTint(k), flex: "0 0 auto" }} />
              <span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
              <span className="subtle tiny tnum">{arr.length}</span>
              <span className="subtle" style={{ fontSize: 15, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
            </button>
            {isOpen ? (
              <div style={{ padding: "0 8px 8px" }}>
                {arr.map((l) => <LiftRow key={l.title} l={l} onOpen={setSel} />)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
