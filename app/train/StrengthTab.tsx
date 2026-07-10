"use client";

import { useEffect, useState } from "react";
import { useTrain, strengthStats, type TrnStrength, type TrnLiftSummary, type StrengthStats } from "../lib/api";
import { kg, muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";

const AXES = ["Chest", "Back", "Core", "Legs", "Shoulders", "Arms"];
const WIN_LABEL: Record<string, string> = { "30d": "30 days", "60d": "60 days", "90d": "90 days", lifetime: "Lifetime" };

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (d === 0) return <span className="subtle tiny">±0</span>;
  const up = d > 0;
  const pct = Math.round((d / prev) * 100);
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#34d399" : "#fb7185" }}>{up ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Radar({ data }: { data: StrengthStats["radar"] }) {
  const byAxis: Record<string, { current: number; previous: number }> = {};
  data.forEach((d) => { byAxis[d.axis] = { current: d.current, previous: d.previous }; });
  const max = Math.max(1, ...data.flatMap((d) => [d.current, d.previous]));
  const cx = 130, cy = 130, R = 88;
  const pt = (i: number, v: number): [number, number] => {
    const ang = ((-90 + i * 60) * Math.PI) / 180;
    const r = (v / max) * R;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = (sel: "current" | "previous") => AXES.map((a, i) => pt(i, byAxis[a]?.[sel] ?? 0).join(",")).join(" ");
  const gridPoly = (frac: number) => AXES.map((a, i) => { const ang = ((-90 + i * 60) * Math.PI) / 180; return [cx + frac * R * Math.cos(ang), cy + frac * R * Math.sin(ang)].join(","); }).join(" ");
  return (
    <svg viewBox="0 0 260 260" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={gridPoly(f)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />)}
      {AXES.map((a, i) => { const [x, y] = pt(i, max); return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />; })}
      <polygon points={poly("previous")} fill="rgba(148,163,184,0.14)" stroke="rgba(148,163,184,0.55)" strokeWidth={1.5} />
      <polygon points={poly("current")} fill="rgba(139,124,246,0.22)" stroke="#a274ff" strokeWidth={2} />
      {AXES.map((a, i) => {
        const ang = ((-90 + i * 60) * Math.PI) / 180;
        const lx = cx + (R + 20) * Math.cos(ang), ly = cy + (R + 20) * Math.sin(ang);
        return <text key={a} x={lx} y={ly} fill="#8a90a6" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="middle">{a}</text>;
      })}
    </svg>
  );
}

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
  const [stats, setStats] = useState<StrengthStats | null>(null);
  const [win, setWin] = useState<string>("30d");
  const { data, error } = useTrain<TrnStrength>(sel ? null : "strength");

  useEffect(() => { let alive = true; strengthStats().then((s) => { if (alive) setStats(s); }).catch(() => {}); return () => { alive = false; }; }, []);

  if (sel) return <ExerciseDetail title={sel} onBack={() => setSel(null)} />;
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;

  const lifts = (data.lifts || []).filter((l) => l.sessions > 0);
  const groups = new Map<string, TrnLiftSummary[]>();
  for (const l of lifts) { const k = l.muscle_group || "other"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
  const groupList = Array.from(groups.entries())
    .map(([k, arr]) => ({ k, arr: arr.slice().sort((a, b) => (b.recent_e1rm ?? b.best_e1rm ?? b.max_weight ?? 0) - (a.recent_e1rm ?? a.best_e1rm ?? a.max_weight ?? 0)) }))
    .sort((a, b) => b.arr.length - a.arr.length);

  const w = stats?.windows.find((x) => x.key === win) || null;

  return (
    <div>
      {stats ? (
        <>
          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Training volume</div>
              <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
                {["30d", "60d", "90d", "lifetime"].map((k) => (
                  <button key={k} onClick={() => setWin(k)} style={{ padding: "4px 9px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: win === k ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: win === k ? "#fff" : "#8a90a6" }}>{k === "lifetime" ? "All" : k}</button>
                ))}
              </div>
            </div>
            {w ? (
              <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <div className="trn-cell"><div className="v tnum">{(w.vol / 1000).toFixed(1)}<span style={{ fontSize: 11 }}>t</span></div><div className="l">volume <Delta cur={w.vol} prev={w.prev_vol} /></div></div>
                <div className="trn-cell"><div className="v tnum">{w.sets}</div><div className="l">sets <Delta cur={w.sets} prev={w.prev_sets} /></div></div>
                <div className="trn-cell"><div className="v tnum">{w.sessions}</div><div className="l">sessions <Delta cur={w.sessions} prev={w.prev_sessions} /></div></div>
              </div>
            ) : null}
            <div className="subtle tiny" style={{ marginTop: 8, opacity: 0.7 }}>{WIN_LABEL[win]}{win !== "lifetime" ? ` · vs prior ${WIN_LABEL[win].toLowerCase()}` : ""}</div>
          </div>

          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Muscle balance</div>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#a274ff" }} />Last 30d</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(148,163,184,0.55)" }} />Prior 30d</span>
              </div>
            </div>
            <Radar data={stats.radar} />
            <div className="subtle tiny" style={{ textAlign: "center", opacity: 0.7 }}>Sets per muscle region · last 30 days vs the 30 before</div>
          </div>
        </>
      ) : null}

      <div className="eyebrow" style={{ marginTop: 0 }}>Your lifts · {lifts.length} · {groupList.length} muscle groups</div>
      {groupList.map(({ k, arr }, i) => {
        const isOpen = open[k] ?? (i === 0);
        return (
          <div key={k} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
            <button onClick={() => setOpen((o) => ({ ...o, [k]: !isOpen }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: muscleTint(k), flex: "0 0 auto" }} />
              <span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
              <span className="subtle tiny tnum">{arr.length}</span>
              <span className="subtle" style={{ fontSize: 15, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>{"›"}</span>
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
