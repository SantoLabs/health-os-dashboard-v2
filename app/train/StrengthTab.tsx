"use client";

import { useEffect, useMemo, useState } from "react";
import { strengthStats, strengthSessions, sessionSets, type StrengthStats, type RadarAxis, type StrengthSession, type SessionExerciseSets } from "../lib/api";
import { muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";
import WorkoutLogger from "./WorkoutLogger";
import Sheet from "../components/Sheet";
import { workoutText, renderShareCard, shareImage, copyText } from "./shareCard";
import Icon from "../components/Icon";
import Loader from "../components/Loader";

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

// One set, compactly: "60 × 15", "15 reps" (bodyweight), "1:30", "400 m".
function setLabel(st: { weight_kg: number | null; reps: number | null; duration_s: number | null; distance_m: number | null }): string {
  if (st.weight_kg != null && st.reps != null) return `${st.weight_kg} \u00d7 ${st.reps}`;
  if (st.reps != null) return `${st.reps} reps`;
  if (st.duration_s != null) { const m = Math.floor(st.duration_s / 60), sec = st.duration_s % 60; return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`; }
  if (st.distance_m != null) return `${st.distance_m} m`;
  if (st.weight_kg != null) return `${st.weight_kg} kg`;
  return "\u2014";
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
  const [openSess, setOpenSess] = useState<StrengthSession | null>(null);
  const [sessDetail, setSessDetail] = useState<SessionExerciseSets[] | null>(null);
  const [sessErr, setSessErr] = useState(false);
  const [share, setShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [monthIdx, setMonthIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    strengthStats().then((s) => alive && setStats(s)).catch(() => {});
    strengthSessions().then((s) => alive && setSessions(s)).catch(() => { if (alive) { setSerr(true); setSessions([]); } });
    return () => { alive = false; };
  }, []);

  const openSession = (s: StrengthSession) => {
    setOpenSess(s); setSessDetail(null); setSessErr(false); setShare(false);
    sessionSets(s.id).then(setSessDetail).catch(() => setSessErr(true));
  };
  const closeSession = () => {
    setOpenSess(null); setSessDetail(null); setShare(false); setCopied(false);
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null); setShareBlob(null);
  };
  // Render the PNG once, when share opens and the sets have arrived.
  useEffect(() => {
    if (!share || !openSess || !sessDetail) return;
    let alive = true;
    setShareBusy(true);
    renderShareCard({ name: openSess.name, date: openSess.date, sets: openSess.sets, volume: openSess.volume, detail: sessDetail })
      .then((r2) => { if (alive) { setShareUrl(r2.url); setShareBlob(r2.blob); } })
      .catch(() => {})
      .finally(() => { if (alive) setShareBusy(false); });
    return () => { alive = false; };
  }, [share, openSess, sessDetail]);

  if (editId) return <WorkoutLogger editSessionId={editId} onExitEdit={() => { setEditId(null); strengthSessions().then(setSessions).catch(() => {}); }} />;

  const w = stats?.windows.find((x) => x.key === win) || null;
  const radar = stats?.radar?.[win] || [];
  const recent = sessions ? [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const months = useMemo(() => { const set = new Set<string>(); (sessions || []).forEach((s) => set.add(s.date.slice(0, 7))); return Array.from(set).sort().reverse(); }, [sessions]);
  const curMonth = months[monthIdx] || null;
  const monthSessions = curMonth ? recent.filter((s) => s.date.slice(0, 7) === curMonth) : recent;
  const monthLabel = curMonth ? `${MONTHS[parseInt(curMonth.slice(5, 7), 10) - 1]} ${curMonth.slice(0, 4)}` : "";
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 2px 6px" }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "var(--muted)" }}>SESSIONS · TAP FOR DETAIL</span>
        {months.length > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 1, background: "var(--surface-2)", borderRadius: 999, padding: 2 }}>
            <button aria-label="Older month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} style={{ background: "none", border: "none", cursor: monthIdx >= months.length - 1 ? "default" : "pointer", color: monthIdx >= months.length - 1 ? "var(--faint)" : "var(--ember)", fontSize: 14, lineHeight: 1, padding: "1px 7px" }}>‹</button>
            <span className="tnum" style={{ fontSize: 10.5, fontWeight: 800, minWidth: 52, textAlign: "center" }}>{monthLabel}</span>
            <button aria-label="Newer month" disabled={monthIdx <= 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} style={{ background: "none", border: "none", cursor: monthIdx <= 0 ? "default" : "pointer", color: monthIdx <= 0 ? "var(--faint)" : "var(--ember)", fontSize: 14, lineHeight: 1, padding: "1px 7px" }}>›</button>
          </div>
        ) : null}
      </div>
      {sessions == null ? <Loader /> :
        serr ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>Couldn&apos;t load sessions.</div> :
          monthSessions.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No sessions this month.</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {monthSessions.map((s) => {
                return (
                  <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
                    <button onClick={() => openSession(s)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800 }}>{s.name}{s.source === "hevy" ? <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 5px", verticalAlign: "middle" }}>hevy</span> : null}</div>
                        <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{fmtDate(s.date)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="tnum" style={{ fontSize: 11, fontWeight: 900 }}>{s.sets} sets</div>
                        {s.volume ? <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{s.volume.toLocaleString("en-US")} kg</div> : null}
                      </div>
                      <span className="subtle" style={{ fontSize: 12 }}>{"\u203A"}</span>
                    </button>
                  </div>
                );
              })}
            </div>}

      <Sheet open={!!openSess} title={openSess ? openSess.name : ""} onClose={closeSession}>
        {openSess ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>{fmtDate(openSess.date)}</span>
              <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>{"\u00b7"} {openSess.sets} sets</span>
              {openSess.volume ? <span className="subtle" style={{ fontSize: 10, fontWeight: 700 }}>{"\u00b7"} {openSess.volume.toLocaleString("en-US")} kg</span> : null}
              {openSess.source === "hevy" ? <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 5px" }}>hevy</span> : null}
              <button onClick={() => setShare((v) => !v)} disabled={!sessDetail}
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, background: share ? "var(--surface-2)" : "none", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 10px", cursor: sessDetail ? "pointer" : "default", color: sessDetail ? "var(--ember)" : "var(--faint)", fontFamily: "inherit", fontSize: 10, fontWeight: 800 }}>
                <Icon name="share" size={11} />{share ? "Close" : "Share"}
              </button>
            </div>

            {share && sessDetail ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--surface-2)", marginBottom: 8, minHeight: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {shareUrl ? <img src={shareUrl} alt="Share card" style={{ width: "100%", display: "block" }} />
                    : <span className="subtle tiny" style={{ padding: 20 }}>{shareBusy ? "Building card…" : "Preview unavailable"}</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { if (shareBlob) shareImage(shareBlob, openSess.name); }} disabled={!shareBlob}
                    style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", cursor: shareBlob ? "pointer" : "default", background: shareBlob ? "var(--t-grad)" : "var(--surface-2)", color: shareBlob ? "#fff" : "var(--faint)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800 }}>Share image</button>
                  <button onClick={async () => { const ok = await copyText(workoutText(openSess.name, openSess.date, sessDetail, { sets: openSess.sets, volume: openSess.volume })); setCopied(ok); setTimeout(() => setCopied(false), 1800); }}
                    style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "1px solid var(--line)", cursor: "pointer", background: "var(--surface-2)", color: "var(--text)", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800 }}>{copied ? "Copied ✓" : "Copy text"}</button>
                </div>
              </div>
            ) : null}

            {sessErr ? <div className="subtle tiny" style={{ padding: "10px 0" }}>Couldn&apos;t load the set detail.</div> :
             sessDetail == null ? <Loader /> :
             sessDetail.length === 0 ? <div className="subtle tiny" style={{ padding: "10px 0" }}>No set detail recorded for this session.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {sessDetail.map((ex, i) => (
                  <div key={ex.title + i}>
                    <button onClick={() => { const t = ex.title; closeSession(); setSel(t); }}
                      style={{ width: "100%", display: "flex", alignItems: "baseline", gap: 6, background: "none", border: "none", padding: "0 0 3px", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.title}</span>
                      {ex.muscle_group ? <span className="tiny" style={{ color: muscleTint(ex.muscle_group), textTransform: "capitalize" }}>{ex.muscle_group.replace(/_/g, " ")}</span> : null}
                      <span className="subtle" style={{ fontSize: 11 }}>{"\u203A"}</span>
                    </button>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 5px" }}>
                      {ex.sets.map((st, k) => (
                        <span key={k} className="tnum" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "2px 7px", whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--faint)", fontWeight: 800 }}>s{k + 1}</span>{"  "}{setLabel(st)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
             )}

            {openSess.source === "app" ? (
              <button onClick={() => { const id = openSess.id; closeSession(); setEditId(id); }}
                style={{ width: "100%", marginTop: 12, padding: "9px 8px", background: "none", border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", color: "var(--ember)", fontSize: 12, fontWeight: 800 }}>Edit workout</button>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!sel} title={sel || "Exercise"} onClose={() => setSel(null)}>
        {sel ? <ExerciseDetail title={sel} onBack={() => setSel(null)} embedded /> : null}
      </Sheet>
    </div>
  );
}
