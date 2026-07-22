"use client";

import { useEffect, useState } from "react";
import { strengthStats, strengthSessions, type StrengthStats, type RadarAxis, type StrengthSession } from "../lib/api";
import { muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";
import WorkoutLogger from "./WorkoutLogger";
import Sheet from "../components/Sheet";

const WIN: [string, string][] = [["15d", "15d"], ["30d", "30d"], ["60d", "60d"], ["90d", "90d"], ["lifetime", "All"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (d === 0) return null;
  const up = d > 0;
  const pct = Math.round((d / prev) * 100);
  return <span style={{ fontSize: 9, fontWeight: 800, marginLeft: 3, color: up ? "var(--success)" : "var(--danger)" }}>{up ? "▲" : "▼"}{Math.abs(pct)}%</span>;
}

function fmtDate(d: string) { const dt = new Date(d + "T00:00:00"); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; }

// 12a muscle balance: current (ember, 5px) stacked over prior (muted, 4px), sorted desc.
function MuscleBars({ data, showPrev }: { data: RadarAxis[]; showPrev: boolean }) {
  const rows = [...data].sort((a, b) => b.current - a.current);
  const max = Math.max(1, ...data.map((d) => Math.max(d.current, d.previous ?? 0)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r) => {
        const d = r.previous == null ? null : r.current - r.previous;
        return (
          <div key={r.axis} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 56, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{r.axis}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 5, borderRadius: 3, background: "var(--ember)", width: `${Math.max(3, (r.current / max) * 100)}%` }} />
              {showPrev && r.previous != null ? <div style={{ height: 4, borderRadius: 3, background: "color-mix(in srgb, var(--muted) 38%, transparent)", width: `${Math.max(3, (r.previous / max) * 100)}%`, marginTop: 2 }} /> : null}
            </div>
            <div className="tnum" style={{ width: 54, textAlign: "right", fontSize: 12, fontWeight: 900 }}>{Math.round(r.current)}{d != null && d !== 0 ? <span style={{ fontSize: 9.5, fontWeight: 800, marginLeft: 3, color: d > 0 ? "var(--success)" : "var(--danger)" }}>{d > 0 ? "▲" : "▼"}{Math.abs(Math.round(d))}</span> : null}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function StrengthTab() {
  const [sel, setSel] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [stats, setStats] = useState<StrengthStats | null>(null);
  const [win, setWin] = useState<string>("30d");
  const [sessions, setSessions] = useState<StrengthSession[] | null>(null);
  const [serr, setSerr] = useState(false);
  const [exp, setExp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    strengthStats().then((s) => alive && setStats(s)).catch(() => {});
    strengthSessions().then((s) => alive && setSessions(s)).catch(() => { if (alive) { setSerr(true); setSessions([]); } });
    return () => { alive = false; };
  }, []);

  if (editId) return <WorkoutLogger editSessionId={editId} onExitEdit={() => { setEditId(null); strengthSessions().then(setSessions).catch(() => {}); }} />;

  const w = stats?.windows.find((x) => x.key === win) || null;
  const radar = stats?.radar?.[win] || [];
  const recent = sessions ? [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const tinyPill = (k: string, lbl: string) => (
    <button key={k} onClick={() => setWin(k)} style={{ padding: "3px 8px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 800, background: win === k ? "var(--t-grad)" : "transparent", color: win === k ? "#fff" : "var(--muted)" }}>{lbl}</button>
  );

  return (
    <div>
      {stats && w ? (
        <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>Training volume</span>
            <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 999, padding: 2 }}>{WIN.map(([k, lbl]) => tinyPill(k, lbl))}</div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--line)" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 15 }}>{w.sessions}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>sessions<Delta cur={w.sessions} prev={w.prev_sessions} /></div></div>
            <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--line)" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 15 }}>{w.vol.toLocaleString("en-US")}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>kg<Delta cur={w.vol} prev={w.prev_vol} /></div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 15 }}>{w.sets}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>sets<Delta cur={w.sets} prev={w.prev_sets} /></div></div>
          </div>
        </div>
      ) : null}

      {stats && radar.length ? (
        <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>Muscle balance</span>
            <span className="subtle" style={{ fontSize: 8, fontWeight: 700 }}>sets/region · {win === "lifetime" ? "all time" : "vs prior"}</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <span className="subtle" style={{ fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 10, height: 5, borderRadius: 3, background: "var(--ember)" }} />This period</span>
            {win !== "lifetime" ? <span className="subtle" style={{ fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 10, height: 5, borderRadius: 3, background: "color-mix(in srgb, var(--muted) 38%, transparent)" }} />Prior</span> : null}
          </div>
          <MuscleBars data={radar} showPrev={win !== "lifetime"} />
        </div>
      ) : null}

      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "var(--muted)", margin: "10px 2px 6px" }}>SESSIONS · TAP TO EXPAND</div>
      {sessions == null ? <div className="muted center pad">Loading…</div> :
        serr ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>Couldn&apos;t load sessions.</div> :
          recent.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No sessions yet.</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {recent.map((s) => {
                const open = exp[s.id] ?? false;
                return (
                  <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
                    <button onClick={() => setExp((o) => ({ ...o, [s.id]: !open }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>{s.name}{s.source === "hevy" ? <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 5px", verticalAlign: "middle" }}>hevy</span> : null}</div>
                        <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{fmtDate(s.date)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="tnum" style={{ fontSize: 11, fontWeight: 900 }}>{s.sets} sets</div>
                        {s.volume ? <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{s.volume.toLocaleString("en-US")} kg</div> : null}
                      </div>
                      <span className="subtle" style={{ fontSize: 11, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                    </button>
                    {open ? (
                      <div style={{ padding: "0 8px 6px" }}>
                        {s.exercises.map((ex, i) => (
                          <button key={ex.title + i} onClick={() => setSel(ex.title)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid var(--line)", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{ex.title}</span>{" "}
                              <span className="tiny" style={{ color: muscleTint(ex.muscle_group), textTransform: "capitalize" }}>{ex.muscle_group.replace(/_/g, " ")}</span>
                            </div>
                            <div className="subtle tiny tnum">{ex.sets} sets{ex.volume ? ` · ${ex.volume.toLocaleString("en-US")}kg` : ""}</div>
                            <span className="subtle" style={{ fontSize: 11 }}>›</span>
                          </button>
                        ))}
                        {s.source === "app" ? (
                          <button onClick={() => setEditId(s.id)} style={{ width: "100%", marginTop: 4, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid var(--line)", cursor: "pointer", color: "var(--ember)", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Edit workout</button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>}

      <Sheet open={!!sel} title={sel || "Exercise"} onClose={() => setSel(null)}>
        {sel ? <ExerciseDetail title={sel} onBack={() => setSel(null)} embedded /> : null}
      </Sheet>
    </div>
  );
}
