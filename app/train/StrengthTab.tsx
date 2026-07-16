"use client";

import { useEffect, useMemo, useState } from "react";
import { strengthStats, strengthSessions, type StrengthStats, type RadarAxis, type StrengthSession } from "../lib/api";
import { muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";
import WorkoutLogger from "./WorkoutLogger";

const AXES = ["Chest", "Back", "Core", "Legs", "Shoulders", "Arms"];
const WIN: [string, string][] = [["30d", "30 days"], ["60d", "60 days"], ["90d", "90 days"], ["lifetime", "Lifetime"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (d === 0) return <span className="subtle tiny"> ±0</span>;
  const up = d > 0;
  const pct = Math.round((d / prev) * 100);
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#34d399" : "#fb7185" }}> {up ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Radar({ data }: { data: RadarAxis[] }) {
  const byAxis: Record<string, RadarAxis> = {};
  data.forEach((d) => { byAxis[d.axis] = d; });
  const showPrev = data.some((d) => d.previous != null && d.previous > 0);
  const max = Math.max(1, ...data.flatMap((d) => [d.current, d.previous ?? 0]));
  const cx = 130, cy = 130, R = 88;
  const pt = (i: number, v: number): [number, number] => { const a = ((-90 + i * 60) * Math.PI) / 180; const r = (v / max) * R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = (sel: "current" | "previous") => AXES.map((a, i) => pt(i, (byAxis[a]?.[sel] ?? 0) as number).join(",")).join(" ");
  const gridPoly = (f: number) => AXES.map((a, i) => { const an = ((-90 + i * 60) * Math.PI) / 180; return [cx + f * R * Math.cos(an), cy + f * R * Math.sin(an)].join(","); }).join(" ");
  return (
    <svg viewBox="0 0 260 260" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={gridPoly(f)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />)}
      {AXES.map((a, i) => { const [x, y] = pt(i, max); return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />; })}
      {showPrev ? <polygon points={poly("previous")} fill="rgba(148,163,184,0.14)" stroke="rgba(148,163,184,0.55)" strokeWidth={1.5} /> : null}
      <polygon points={poly("current")} fill="rgba(139,124,246,0.22)" stroke="#a274ff" strokeWidth={2} />
      {AXES.map((a, i) => { const an = ((-90 + i * 60) * Math.PI) / 180; const lx = cx + (R + 20) * Math.cos(an), ly = cy + (R + 20) * Math.sin(an); return <text key={a} x={lx} y={ly} fill="#8a90a6" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="middle">{a}</text>; })}
    </svg>
  );
}

function fmtDate(d: string) { const dt = new Date(d + "T00:00:00"); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; }


export default function StrengthTab() {
  const [sel, setSel] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [stats, setStats] = useState<StrengthStats | null>(null);
  const [win, setWin] = useState<string>("30d");
  const [sessions, setSessions] = useState<StrengthSession[] | null>(null);
  const [serr, setSerr] = useState(false);
  const [monthIdx, setMonthIdx] = useState(0);
  const [exp, setExp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    strengthStats().then((s) => alive && setStats(s)).catch(() => {});
    strengthSessions().then((s) => alive && setSessions(s)).catch(() => { if (alive) { setSerr(true); setSessions([]); } });
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    if (!sessions) return [];
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [sessions]);
  const curMonth = months[monthIdx] || null;
  const monthSessions = useMemo(() => (sessions && curMonth ? sessions.filter((s) => s.date.slice(0, 7) === curMonth) : []), [sessions, curMonth]);

  if (sel) return <ExerciseDetail title={sel} onBack={() => setSel(null)} />;
  if (editId) return <WorkoutLogger editSessionId={editId} onExitEdit={() => { setEditId(null); strengthSessions().then(setSessions).catch(() => {}); }} />;

  const w = stats?.windows.find((x) => x.key === win) || null;
  const radar = stats?.radar?.[win] || [];
  const winLabel = (WIN.find(([k]) => k === win) || ["", ""])[1].toLowerCase();
  const monthLabel = curMonth ? `${MONTHS[parseInt(curMonth.slice(5, 7), 10) - 1]} ${curMonth.slice(0, 4)}` : "";

  return (
    <div>
      {stats && w ? (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Training volume</div>
            <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
              {WIN.map(([k]) => <button key={k} onClick={() => setWin(k)} style={{ padding: "4px 9px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: win === k ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: win === k ? "#fff" : "#8a90a6" }}>{k === "lifetime" ? "All" : k}</button>)}
            </div>
          </div>
          <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="trn-cell"><div className="v tnum">{w.sessions}</div><div className="l">sessions<Delta cur={w.sessions} prev={w.prev_sessions} /></div></div>
            <div className="trn-cell"><div className="v tnum" style={{ fontSize: 17 }}>{w.vol.toLocaleString("en-US")}<span style={{ fontSize: 11, fontWeight: 600 }}> kg</span></div><div className="l">volume<Delta cur={w.vol} prev={w.prev_vol} /></div></div>
            <div className="trn-cell"><div className="v tnum">{w.sets}</div><div className="l">sets<Delta cur={w.sets} prev={w.prev_sets} /></div></div>
          </div>
        </div>
      ) : null}

      {stats && radar.length ? (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Muscle balance</div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#a274ff" }} />{win === "lifetime" ? "Lifetime" : "Selected"}</span>
              {win !== "lifetime" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(148,163,184,0.55)" }} />Prior</span> : null}
            </div>
          </div>
          <Radar data={radar} />
          <div className="subtle tiny" style={{ textAlign: "center", opacity: 0.7 }}>Sets per muscle region{win !== "lifetime" ? ` · ${winLabel} vs the prior ${winLabel}` : " · all time"}</div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 8, padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button aria-label="Older month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} style={{ background: "none", border: "none", color: monthIdx >= months.length - 1 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 22, cursor: monthIdx >= months.length - 1 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>‹</button>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{monthLabel || "—"}</div>
          <button aria-label="Newer month" disabled={monthIdx <= 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} style={{ background: "none", border: "none", color: monthIdx <= 0 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 22, cursor: monthIdx <= 0 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>›</button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 0 }}>Sessions · tap to expand</div>
      {sessions == null ? <div className="muted center pad">Loading…</div> :
        serr ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>Couldn&apos;t load sessions.</div> :
          monthSessions.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No sessions this month.</div> :
            monthSessions.map((s) => {
              const open = exp[s.id] ?? false;
              return (
                <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
                  <button onClick={() => setExp((o) => ({ ...o, [s.id]: !open }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                    <span className="subtle" style={{ fontSize: 15, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}{s.source === "hevy" ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#8a90a6", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, padding: "1px 5px", verticalAlign: "middle" }}>hevy</span> : null}</div>
                      <div className="subtle tiny">{fmtDate(s.date)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tnum" style={{ fontWeight: 700, fontSize: 14 }}>{s.sets} sets</div>
                      {s.volume ? <div className="subtle tiny">{s.volume.toLocaleString("en-US")} kg</div> : null}
                    </div>
                  </button>
                  {open ? (
                    <div style={{ padding: "0 8px 6px" }}>
                      {s.exercises.map((ex, i) => (
                        <button key={ex.title + i} onClick={() => setSel(ex.title)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{ex.title}</span>{" "}
                            <span className="tiny" style={{ color: muscleTint(ex.muscle_group), textTransform: "capitalize" }}>{ex.muscle_group.replace(/_/g, " ")}</span>
                          </div>
                          <div className="subtle tiny tnum">{ex.sets} sets{ex.volume ? ` · ${ex.volume.toLocaleString("en-US")}kg` : ""}</div>
                        </button>
                      ))}
                      {s.source === "app" ? (
                        <button onClick={() => setEditId(s.id)} style={{ width: "100%", marginTop: 4, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#8ab4ff", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Edit workout</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
    </div>
  );
}
