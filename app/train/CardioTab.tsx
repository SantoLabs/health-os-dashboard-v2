"use client";

import { useEffect, useState } from "react";
import { useTrain, type TrnCardio, type TrnActivity, cardioParse, cardioList, cardioSave, cardioPrescribe, type CardioParsed, type CardioRoutine, type CardioSegment } from "../lib/api";
import { Spark, Delta, ZoneBar, fmtPace, dShort, sportEmoji } from "./ui";

const SPORTS = [
  { pill: "Run", sport: "running" },
  { pill: "Swim", sport: "swimming" },
  { pill: "Ride", sport: "cycling" },
] as const;
type Pill = (typeof SPORTS)[number]["pill"];

const isEasy = (a: TrnActivity) => (a.z2 || 0) > (a.z3 || 0) + (a.z4 || 0) + (a.z5 || 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function SportView({ pill, sport }: { pill: Pill; sport: string }) {
  const { data, error } = useTrain<TrnCardio>(`cardio&sport=${sport}`);
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;

  const acts = [...(data.activities || [])].sort((a, b) => a.date.localeCompare(b.date));
  const weekly = data.weekly || [];

  if (acts.length < 2) {
    return <div className="card"><div className="subtle center" style={{ padding: "18px 0" }}>Not enough {pill.toLowerCase()} sessions logged yet to analyse.</div></div>;
  }

  // easy-run avg pace (fallback to all if too few easy)
  const easy = acts.filter(isEasy);
  const paceSet = (easy.length >= 3 ? easy : acts).slice(-12).map((a) => a.pace_min_km).filter((p): p is number => p != null);
  const avgPace = mean(paceSet);

  // aerobic efficiency (m/beat) — recent vs ~4 weeks ago (weekly series)
  const effWeeks = weekly.filter((w) => w.avg_m_per_beat != null);
  const recentEff = effWeeks[effWeeks.length - 1]?.avg_m_per_beat ?? null;
  const pastEff = effWeeks[effWeeks.length - 5]?.avg_m_per_beat ?? effWeeks[0]?.avg_m_per_beat ?? null;
  const effPct = recentEff != null && pastEff ? Math.round((recentEff / pastEff - 1) * 1000) / 10 : null;
  const effSeries = weekly.slice(-16).map((w) => w.avg_m_per_beat);

  // HR zones — last 30 days summed (seconds → minutes)
  const cut30 = Date.now() - 30 * 86400000;
  const z: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  acts.forEach((a) => {
    if (new Date(a.date + "T00:00:00").getTime() >= cut30) {
      z[0] += a.z1 || 0; z[1] += a.z2 || 0; z[2] += a.z3 || 0; z[3] += a.z4 || 0; z[4] += a.z5 || 0;
    }
  });
  const zoneHas = z.some((v) => v > 0);
  const recent6 = [...acts].reverse().slice(0, 6);

  return (
    <>
      {/* avg pace hero */}
      <div className="trn-hero">
        <div className="trn-eyebrow">Avg pace · {easy.length >= 3 ? "easy sessions" : "recent"}</div>
        <div className="trn-hero-num tnum">
          {fmtPace(avgPace)}<small>/km</small>
          {effPct != null && <Delta v={effPct} unit="%" suffix="at same HR" />}
        </div>
        <div className="trn-hero-sub">
          {recentEff != null ? `Aerobic efficiency ${recentEff.toFixed(2)} m/beat` : "Efficiency trending"}
        </div>
        <Spark values={effSeries} color="#3ec8e6" />
        <div className="subtle tiny" style={{ marginTop: 8 }}>Aerobic efficiency (m/beat) · higher = faster at the same heart rate</div>
      </div>

      {/* HR zone distribution */}
      {zoneHas && (
        <div className="card">
          <div className="trn-eyebrow">Time in heart-rate zones · 30d</div>
          <ZoneBar z={z} />
        </div>
      )}

      {/* recent activities */}
      <div className="eyebrow">Recent {pill.toLowerCase()} sessions</div>
      <div className="card">
        {recent6.map((a, i) => (
          <div className="trn-srow" key={i}>
            <span className="d">{sportEmoji(sport)} {dShort(a.date)}</span>
            <span className="tnum">{a.distance_km != null ? `${a.distance_km.toFixed(2)} km` : "—"}</span>
            <span className="tnum" style={{ color: "var(--muted)" }}>
              {sport === "swimming" && a.avg_swolf != null
                ? `SWOLF ${Math.round(a.avg_swolf)}`
                : a.pace_min_km != null ? `${fmtPace(a.pace_min_km)}/km` : ""}
              {a.avg_hr != null ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const cdToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
function fmtDist(m?: number | null): string { if (!m) return ""; return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km` : `${Math.round(m)} m`; }
function fmtDur(s?: number | null): string { if (!s) return ""; return s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`; }
function segLabel(s: CardioSegment): string {
  const parts: string[] = [];
  const d = fmtDist(s.distance_m); if (d) parts.push(d);
  const t = fmtDur(s.duration_s); if (t) parts.push(t);
  if (s.intensity) parts.push(s.intensity);
  return parts.join(" · ") || (s.role || "");
}

function CardioBuilder({ sportHint }: { sportHint: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<CardioParsed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [date, setDate] = useState(cdToday());
  const [routines, setRoutines] = useState<CardioRoutine[]>([]);
  useEffect(() => { if (!open) return; cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [open, msg]);

  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null); setMsg(null); setParsed(null);
    try { const r = await cardioParse(text.trim(), sportHint); if (r.ok && r.structure) setParsed(r); else setErr(r.error || "Kai couldn't parse that — try rephrasing."); }
    catch { setErr("Something went wrong parsing that."); } finally { setBusy(false); }
  }
  async function doSave() {
    const st = parsed?.structure; if (!st || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioSave({ name: parsed?.name || "Custom session", sport: parsed?.sport, structure: st }); if (r.ok) setMsg("Saved to your sessions."); else setErr(r.error || "Couldn't save."); }
    finally { setBusy(false); }
  }
  async function doPrescribe() {
    const st = parsed?.structure; if (!st || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ sport: parsed?.sport || sportHint, date, structure: st, name: parsed?.name }); if (r.ok) setMsg(`Added to ${date} — it'll auto-complete when the activity uploads.`); else setErr(r.error || "Couldn't add."); }
    finally { setBusy(false); }
  }
  async function prescribeRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ routine_id: rt.id, date }); if (r.ok) setMsg(`${rt.name} added to ${date}.`); } finally { setBusy(false); }
  }
  async function quickRun() {
    if (busy) return; setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ sport: sportHint, date }); if (r.ok) setMsg(`Quick ${sportHint} added to ${date}.`); } finally { setBusy(false); }
  }

  const fieldStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", resize: "vertical" };
  const pillBtn = (bg: string): React.CSSProperties => ({ padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
  const pstruct = parsed?.structure || null;

  if (!open) {
    return (
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Build a session</div>
          <div className="subtle tiny" style={{ marginTop: 2 }}>Describe an interval workout — Kai turns it into a structured session to save or schedule.</div>
        </div>
        <button onClick={() => setOpen(true)} style={pillBtn("linear-gradient(135deg,#5f7dff,#a274ff)")}>Build</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Build a session</div>
        <button className="trn-sub" onClick={() => { setOpen(false); setParsed(null); setErr(null); setMsg(null); }}>Close</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. 10 min warmup, then 1 km hard + 2 min easy jog ×5, 10 min cooldown" style={{ ...fieldStyle, marginTop: 10 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={doParse} disabled={busy || !text.trim()} style={pillBtn("linear-gradient(135deg,#5f7dff,#a274ff)")}>{busy ? "Kai is reading…" : "Parse with Kai"}</button>
        <button onClick={quickRun} disabled={busy} className="trn-sub" style={{ textTransform: "capitalize" }}>Quick {sportHint} today</button>
      </div>

      {err ? <div className="subtle tiny" style={{ marginTop: 10, color: "#ff8a8a" }}>{err}</div> : null}
      {msg ? <div className="subtle tiny" style={{ marginTop: 10, color: "#79e0a8" }}>{msg}</div> : null}

      {pstruct ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{parsed?.name || "Custom session"}</div>
            <div className="subtle tiny tnum">{fmtDist(parsed?.total_distance_m)}{parsed?.total_distance_m && parsed?.total_duration_s ? " · " : ""}{fmtDur(parsed?.total_duration_s)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {pstruct.blocks.map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span className="tnum" style={{ width: 30, flex: "0 0 auto", fontWeight: 800, color: b.reps > 1 ? "#a274ff" : "var(--muted)", fontSize: 12 }}>{b.reps > 1 ? `×${b.reps}` : "1"}</span>
                <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {b.segments.map((s, si) => (
                    <span key={si} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: s.role === "work" ? "rgba(255,138,138,0.14)" : s.role === "recovery" ? "rgba(121,224,168,0.12)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span className="subtle" style={{ textTransform: "capitalize" }}>{s.role}</span> {segLabel(s)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: "inherit" }} />
            <button onClick={doPrescribe} disabled={busy} style={pillBtn("rgba(121,224,168,0.9)")}>Add to schedule</button>
            <button onClick={doSave} disabled={busy} className="trn-sub">Save as routine</button>
          </div>
        </div>
      ) : null}

      {routines.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Saved sessions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routines.map((rt) => (
              <div key={rt.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{rt.name}</div>
                  <div className="subtle tiny tnum">{fmtDist(rt.total_distance_m)}{rt.total_distance_m && rt.total_duration_s ? " · " : ""}{fmtDur(rt.total_duration_s)}{rt.source === "kai" ? " · from Kai" : ""}</div>
                </div>
                <button className="trn-sub" disabled={busy} onClick={() => prescribeRoutine(rt)}>Add</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CardioTab() {
  const [pill, setPill] = useState<Pill>("Run");
  const active = SPORTS.find((s) => s.pill === pill)!;
  return (
    <div>
      <CardioBuilder sportHint={active.sport} />
      <div className="trn-subs" style={{ marginBottom: 12 }}>
        {SPORTS.map((s) => (
          <button key={s.pill} className={pill === s.pill ? "trn-sub on" : "trn-sub"} onClick={() => setPill(s.pill)}>
            {sportEmoji(s.sport)} {s.pill}
          </button>
        ))}
      </div>
      <SportView key={active.sport} pill={active.pill} sport={active.sport} />
    </div>
  );
}
