"use client";

import { useEffect, useMemo, useState } from "react";
import { cardioActivities, cardioParse, cardioList, cardioSave, cardioPrescribe, type CardioActivityLite, type CardioParsed, type CardioRoutine, type CardioSegment } from "../lib/api";
import { sportEmoji, fmtPace } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const METRICS: [string, string][] = [["distance", "Distance"], ["time", "Time"], ["elevation", "Elevation"], ["sessions", "Sessions"]];
const RANGES: [string, number | null, "day" | "week" | "month"][] = [["7D", 7, "day"], ["1M", 30, "day"], ["3M", 91, "week"], ["6M", 182, "week"], ["YTD", null, "month"], ["1Y", 365, "month"]];

function fmtHrMin(mins: number) { const h = Math.floor(mins / 60), m = Math.round(mins % 60); return h ? `${h}h ${m}m` : `${m}m`; }
function fmtMetric(v: number, metric: string) {
  if (metric === "distance") return `${v.toFixed(1)} km`;
  if (metric === "time") return fmtHrMin(v * 60);
  if (metric === "elevation") return `${Math.round(v)} m`;
  return `${Math.round(v)}`;
}
const D = (s: string) => new Date(s + "T00:00:00");

type Bucket = { start: Date; end: Date; label: string };
function buildBuckets(start: Date, end: Date, unit: "day" | "week" | "month"): Bucket[] {
  const out: Bucket[] = [];
  if (unit === "day") {
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000))
      out.push({ start: new Date(d), end: new Date(d), label: d.getDate() === 1 ? MONTHS[d.getMonth()] : "" });
  } else if (unit === "week") {
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 7 * 86400000)) {
      const e = new Date(Math.min(d.getTime() + 6 * 86400000, end.getTime()));
      out.push({ start: new Date(d), end: e, label: MONTHS[d.getMonth()] });
    }
  } else {
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= end) {
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({ start: new Date(d), end: new Date(Math.min(e.getTime(), end.getTime())), label: MONTHS[d.getMonth()] });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }
  return out;
}

function CardioChart({ acts, sport }: { acts: CardioActivityLite[]; sport: string }) {
  const [metric, setMetric] = useState("distance");
  const [range, setRange] = useState("1M");
  const rdef = RANGES.find((r) => r[0] === range) || RANGES[1];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = rdef[1] == null ? new Date(today.getFullYear(), 0, 1) : new Date(today.getTime() - (rdef[1] - 1) * 86400000);
  const prevLen = rdef[1] == null ? Math.round((today.getTime() - start.getTime()) / 86400000) + 1 : rdef[1];
  const prevStart = new Date(start.getTime() - prevLen * 86400000);
  const value = (a: CardioActivityLite) => metric === "distance" ? (a.distance_km || 0) : metric === "time" ? (a.duration_mins || 0) / 60 : metric === "elevation" ? (a.elevation_gain_m || 0) : 1;

  const inSport = acts.filter((a) => a.sport === sport);
  const cur = inSport.filter((a) => { const d = D(a.date); return d >= start && d <= today; });
  const prev = inSport.filter((a) => { const d = D(a.date); return d >= prevStart && d < start; });
  const total = cur.reduce((s, a) => s + value(a), 0);
  const ptotal = prev.reduce((s, a) => s + value(a), 0);
  const pct = ptotal > 0 ? Math.round((total / ptotal - 1) * 100) : null;

  const buckets = buildBuckets(start, today, rdef[2]);
  const bvals = buckets.map((b) => cur.filter((a) => { const d = D(a.date); return d >= b.start && d <= b.end; }).reduce((s, a) => s + value(a), 0));
  const max = Math.max(1, ...bvals);
  const W = 320, H = 132, PAD = 6, chartH = H - 20;
  const bw = (W - PAD * 2) / Math.max(1, buckets.length);

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {METRICS.map(([k, lbl]) => (
          <button key={k} onClick={() => setMetric(k)} style={{ padding: "5px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: metric === k ? "linear-gradient(135deg,#f0883e,#f0a03e)" : "rgba(255,255,255,0.05)", color: metric === k ? "#1a1206" : "#8a90a6" }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
        <div className="tnum" style={{ fontSize: 26, fontWeight: 800 }}>{fmtMetric(total, metric)}</div>
        {pct != null ? <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 0 ? "#34d399" : "#fb7185" }}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span> : null}
      </div>
      <div className="subtle tiny" style={{ marginBottom: 8 }}>{cap(sport)} · {rdef[0]}{pct != null ? " · vs prior period" : ""}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} preserveAspectRatio="none">
        <defs><linearGradient id="cbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0a03e" /><stop offset="100%" stopColor="#f0883e" /></linearGradient></defs>
        {bvals.map((v, i) => {
          const h = v > 0 ? Math.max(2, (v / max) * chartH) : 0;
          return <rect key={i} x={PAD + i * bw + bw * 0.15} y={chartH - h} width={bw * 0.7} height={h} rx={Math.min(2, bw * 0.3)} fill="url(#cbar)" opacity={v > 0 ? 1 : 0.2} />;
        })}
        <line x1={PAD} y1={chartH} x2={W - PAD} y2={chartH} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {buckets.map((b, i) => b.label ? <text key={i} x={PAD + i * bw + bw / 2} y={H - 4} fill="#6b7080" fontSize={8} textAnchor="middle">{b.label}</text> : null)}
      </svg>
      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {RANGES.map(([k]) => (
          <button key={k} onClick={() => setRange(k)} style={{ padding: "3px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: range === k ? "rgba(240,136,62,0.18)" : "transparent", color: range === k ? "#f0a35e" : "#6b7080" }}>{k}</button>
        ))}
      </div>
    </div>
  );
}

function CardioList({ acts, sport }: { acts: CardioActivityLite[]; sport: string }) {
  const [monthIdx, setMonthIdx] = useState(0);
  const inSport = useMemo(() => acts.filter((a) => a.sport === sport), [acts, sport]);
  const months = useMemo(() => {
    const set = new Set<string>(); inSport.forEach((a) => set.add(a.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [inSport]);
  useEffect(() => { setMonthIdx(0); }, [sport]);
  const curMonth = months[monthIdx] || null;
  const rows = curMonth ? inSport.filter((a) => a.date.slice(0, 7) === curMonth) : [];
  const monthLabel = curMonth ? `${MONTHS[parseInt(curMonth.slice(5, 7), 10) - 1]} ${curMonth.slice(0, 4)}` : "—";

  return (
    <div>
      <div className="card" style={{ marginBottom: 8, padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button aria-label="Older" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} style={{ background: "none", border: "none", color: monthIdx >= months.length - 1 ? "rgba(255,255,255,0.2)" : "#f0a35e", fontSize: 22, cursor: monthIdx >= months.length - 1 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>‹</button>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{monthLabel}</div>
          <button aria-label="Newer" disabled={monthIdx <= 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} style={{ background: "none", border: "none", color: monthIdx <= 0 ? "rgba(255,255,255,0.2)" : "#f0a35e", fontSize: 22, cursor: monthIdx <= 0 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>›</button>
        </div>
      </div>
      <div className="eyebrow" style={{ marginTop: 0 }}>{cap(sport)} sessions</div>
      {rows.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No {sport} sessions this month.</div> :
        rows.map((a) => (
          <div key={a.activity_id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{sportEmoji(sport)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.distance_km != null ? `${a.distance_km.toFixed(2)} km` : (a.duration_mins != null ? fmtHrMin(a.duration_mins) : (a.name || "Session"))}</div>
              <div className="subtle tiny">{new Date(a.date + "T00:00:00").getDate()} {MONTHS[new Date(a.date + "T00:00:00").getMonth()]}{a.duration_mins != null ? ` · ${fmtHrMin(a.duration_mins)}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "#c9cede" }}>{sport === "swimming" && a.avg_swolf != null ? `SWOLF ${Math.round(a.avg_swolf)}` : a.pace_min_km != null ? `${fmtPace(a.pace_min_km)}/km` : ""}</div>
              {a.avg_hr != null ? <div className="subtle tiny tnum">{Math.round(a.avg_hr)} bpm</div> : null}
            </div>
          </div>
        ))}
    </div>
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
  const [acts, setActs] = useState<CardioActivityLite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sport, setSport] = useState<string>("running");

  useEffect(() => { let alive = true; cardioActivities().then((r) => alive && setActs(r)).catch((e) => alive && setErr((e as Error).message)); return () => { alive = false; }; }, []);

  const sports = useMemo(() => {
    if (!acts) return [];
    const counts: Record<string, number> = {};
    acts.forEach((a) => { counts[a.sport] = (counts[a.sport] || 0) + 1; });
    const order = ["running", "cycling", "swimming", "walking"];
    return Object.keys(counts).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia < 0 && ib < 0) return counts[b] - counts[a];
      if (ia < 0) return 1; if (ib < 0) return -1; return ia - ib;
    });
  }, [acts]);
  useEffect(() => { if (sports.length && !sports.includes(sport)) setSport(sports[0]); }, [sports, sport]);

  return (
    <div>
      <CardioBuilder sportHint={sport} />
      {err ? <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{err}</div></div> : null}
      {acts == null ? <div className="muted center pad">Loading…</div> : (
        <>
          <div className="trn-subs" style={{ marginBottom: 12 }}>
            {sports.map((s) => <button key={s} className={sport === s ? "trn-sub on" : "trn-sub"} onClick={() => setSport(s)}>{sportEmoji(s)} {cap(s)}</button>)}
          </div>
          <CardioChart acts={acts} sport={sport} />
          <CardioList acts={acts} sport={sport} />
        </>
      )}
    </div>
  );
}
