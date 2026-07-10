"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cardioActivities, cardioDetail, cardioParse, cardioList, cardioSave, cardioPrescribe, type CardioActivityLite, type CardioDetail, type CardioHrZone, type CardioParsed, type CardioRoutine, type CardioSegment } from "../lib/api";
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

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v)), base = Math.pow(10, exp), f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}
function axisLabel(v: number, metric: string): string {
  if (metric === "time") return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}h`;
  if (metric === "distance") return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} km`;
  if (metric === "elevation") return `${Math.round(v)} m`;
  return `${Math.round(v)}`;
}

function CardioChart({ acts, sport }: { acts: CardioActivityLite[]; sport: string }) {
  const [metric, setMetric] = useState("distance");
  const [range, setRange] = useState("1M");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rdef = RANGES.find((r) => r[0] === range) || RANGES[1];
  const unit = rdef[2];
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

  const buckets = buildBuckets(start, today, unit);
  const bvals = buckets.map((b) => cur.filter((a) => { const d = D(a.date); return d >= b.start && d <= b.end; }).reduce((s, a) => s + value(a), 0));
  const n = buckets.length;
  const ymax = niceMax(Math.max(...bvals, 0));

  const W = 340, H = 190, x0 = 8, padR = 36, padT = 14, padB = 22;
  const plotW = W - x0 - padR, plotH = H - padT - padB, baseY = padT + plotH;
  const X = (i: number) => n <= 1 ? x0 + plotW / 2 : x0 + (i / (n - 1)) * plotW;
  const Y = (v: number) => baseY - (v / ymax) * plotH;
  const linePts = bvals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const areaPts = `${X(0).toFixed(1)},${baseY} ${linePts} ${X(n - 1).toFixed(1)},${baseY}`;
  const grid = [0, 1 / 3, 2 / 3, 1];
  const xTickIdx = Array.from(new Set([0, ...Array.from({ length: 4 }, (_, k) => Math.round(((k + 1) / 5) * (n - 1)))]));
  const xlabel = (b: Bucket) => unit === "month" ? MONTHS[b.start.getMonth()] : `${b.start.getDate()} ${MONTHS[b.start.getMonth()]}`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current; if (!svg || n < 1) return;
    const r = svg.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    const idx = n <= 1 ? 0 : Math.round(((rel - x0) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {METRICS.map(([k, lbl]) => (
          <button key={k} onClick={() => { setMetric(k); setHover(null); }} style={{ padding: "5px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: metric === k ? "linear-gradient(135deg,#f0883e,#f0a03e)" : "rgba(255,255,255,0.05)", color: metric === k ? "#1a1206" : "#8a90a6" }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
        <div className="tnum" style={{ fontSize: 26, fontWeight: 800 }}>{fmtMetric(total, metric)}</div>
        {pct != null ? <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 0 ? "#34d399" : "#fb7185" }}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span> : null}
      </div>
      <div className="subtle tiny" style={{ marginBottom: 6 }}>{cap(sport)} · {rdef[0]}{pct != null ? " · vs prior period" : ""}</div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id="carea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0883e" stopOpacity="0.35" /><stop offset="100%" stopColor="#f0883e" stopOpacity="0" /></linearGradient></defs>
        {grid.map((g, i) => {
          const y = baseY - g * plotH;
          return (<g key={i}>
            <line x1={x0} y1={y} x2={x0 + plotW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={W - padR + 5} y={y + 3} fill="#6b7080" fontSize={8}>{axisLabel(ymax * g, metric)}</text>
          </g>);
        })}
        <polygon points={areaPts} fill="url(#carea)" />
        <polyline points={linePts} fill="none" stroke="#f0883e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {bvals.map((v, i) => v > 0 ? <circle key={i} cx={X(i)} cy={Y(v)} r={hover === i ? 4 : 2.2} fill="#f0a03e" stroke="#0d0f16" strokeWidth={hover === i ? 1.5 : 0} /> : null)}
        {xTickIdx.map((i) => <text key={"x" + i} x={X(i)} y={H - 6} fill="#6b7080" fontSize={8} textAnchor="middle">{xlabel(buckets[i])}</text>)}
        {hover != null ? (
          <g>
            <line x1={X(hover)} y1={padT} x2={X(hover)} y2={baseY} stroke="rgba(240,136,62,0.5)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={Math.max(x0 + 26, Math.min(X(hover), x0 + plotW - 26))} y={padT - 3} fill="#f0c088" fontSize={9} fontWeight={700} textAnchor="middle">{fmtMetric(bvals[hover], metric)} · {xlabel(buckets[hover])}</text>
          </g>
        ) : null}
      </svg>
      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {RANGES.map(([k]) => (
          <button key={k} onClick={() => { setRange(k); setHover(null); }} style={{ padding: "3px 10px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: range === k ? "rgba(240,136,62,0.18)" : "transparent", color: range === k ? "#f0a35e" : "#6b7080" }}>{k}</button>
        ))}
      </div>
    </div>
  );
}
function CardioList({ acts, sport, onOpen }: { acts: CardioActivityLite[]; sport: string; onOpen: (id: string) => void }) {
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
          <div key={a.activity_id} className="card" onClick={() => onOpen(a.activity_id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", marginBottom: 8, cursor: "pointer" }}>
            <span style={{ fontSize: 16 }}>{sportEmoji(sport)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.distance_km != null ? `${a.distance_km.toFixed(2)} km` : (a.duration_mins != null ? fmtHrMin(a.duration_mins) : (a.name || "Session"))}</div>
              <div className="subtle tiny">{new Date(a.date + "T00:00:00").getDate()} {MONTHS[new Date(a.date + "T00:00:00").getMonth()]}{a.duration_mins != null ? ` · ${fmtHrMin(a.duration_mins)}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "#c9cede" }}>{sport === "swimming" && a.avg_swolf != null ? `SWOLF ${Math.round(a.avg_swolf)}` : a.pace_min_km != null ? `${fmtPace(a.pace_min_km)}/km` : ""}</div>
              {a.avg_hr != null ? <div className="subtle tiny tnum">{Math.round(a.avg_hr)} bpm</div> : null}
            </div>
            <span style={{ color: "#6b7080", fontSize: 18, marginLeft: 2 }}>{"›"}</span>
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

const HRZ_COLORS = ["#6b8cff", "#34d399", "#f0c05a", "#f0883e", "#fb7185"];
const PZ_COLORS = ["#6b8cff", "#34d399", "#3fc7bd", "#f0c05a", "#f0883e", "#fb7185"];
const PZ_NAMES = ["Recovery", "Endurance", "Tempo", "Threshold", "VO2", "Anaerobic"];
const PZ_RATIOS = [1.347, 1.16, 1.039, 0.973, 0.915];

function fmtPaceS(s: number | null | undefined): string {
  if (!s || !isFinite(s) || s <= 0) return "—";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtClock(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
}
function pickHrZones(zones: CardioHrZone[] | null, sport: string): CardioHrZone | null {
  if (!zones || !zones.length) return null;
  const key = sport === "running" ? "RUNNING" : sport === "cycling" ? "CYCLING" : "DEFAULT";
  return zones.find((z) => z.sport === key) || zones.find((z) => z.sport === "DEFAULT") || zones[0];
}
type PaceZone = { z: number; name: string; fast: number; slow: number };
function buildPaceZones(t: number | null): PaceZone[] {
  if (!t) return [];
  const b = PZ_RATIOS.map((r) => Math.round(r * t));
  return [
    { z: 1, name: PZ_NAMES[0], fast: b[0], slow: Infinity },
    { z: 2, name: PZ_NAMES[1], fast: b[1], slow: b[0] },
    { z: 3, name: PZ_NAMES[2], fast: b[2], slow: b[1] },
    { z: 4, name: PZ_NAMES[3], fast: b[3], slow: b[2] },
    { z: 5, name: PZ_NAMES[4], fast: b[4], slow: b[3] },
    { z: 6, name: PZ_NAMES[5], fast: 0, slow: b[4] },
  ];
}
function hrZoneIndex(hr: number | null | undefined, hz: CardioHrZone | null): number {
  if (hr == null || !hz) return -1;
  if (hr >= hz.z5) return 4;
  if (hr >= hz.z4) return 3;
  if (hr >= hz.z3) return 2;
  if (hr >= hz.z2) return 1;
  return 0;
}

function ZoneBar({ label, rows }: { label: string; rows: { range: string; secs: number; color: string }[] }) {
  const total = rows.reduce((s, r) => s + r.secs, 0) || 1;
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="eyebrow" style={{ marginTop: 0, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r, i) => {
          const pct = Math.round((r.secs / total) * 100);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tnum" style={{ width: 20, fontSize: 11, fontWeight: 700, color: r.color }}>Z{i + 1}</span>
              <div style={{ flex: 1, height: 15, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: r.color, minWidth: r.secs > 0 ? 3 : 0, borderRadius: 5 }} />
              </div>
              <span className="tnum subtle" style={{ width: 82, fontSize: 10, textAlign: "right" }}>{r.range}</span>
              <span className="tnum" style={{ width: 32, fontSize: 11, textAlign: "right", fontWeight: 600 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "9px 11px" }}>
      <div className="subtle tiny" style={{ marginBottom: 2 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function decodePolyline(str: string, precision = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coords: [number, number][] = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let shift = 0, result = 0, byte = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

function RouteTrace({ poly }: { poly: string }) {
  const pts = useMemo(() => { try { return decodePolyline(poly); } catch { return [] as [number, number][]; } }, [poly]);
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const W = 440, H = 200, pad = 16;
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
  const PX = (lng: number) => offX + (lng - minLng) * kx * scale;
  const PY = (lat: number) => offY + (maxLat - lat) * scale;
  const dpath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${PX(p[1]).toFixed(1)},${PY(p[0]).toFixed(1)}`).join(" ");
  const s = pts[0], e = pts[pts.length - 1];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8, background: "#0d0f16" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <path d={dpath} fill="none" stroke="#f0883e" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={PX(s[1])} cy={PY(s[0])} r={4} fill="#34d399" stroke="#0d0f16" strokeWidth={1.5} />
        <circle cx={PX(e[1])} cy={PY(e[0])} r={4} fill="#fb7185" stroke="#0d0f16" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function CardioActivityDetail({ id, sport, onBack }: { id: string; sport: string; onBack: () => void }) {
  const [d, setD] = useState<CardioDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let a = true; cardioDetail(id).then((r) => a && setD(r)).catch((e) => a && setErr((e as Error).message)); return () => { a = false; }; }, [id]);

  const back = <button onClick={onBack} style={{ background: "none", border: "none", color: "#f0a35e", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 0" }}>{"‹"} Back</button>;
  if (err) return <div>{back}<div className="card error" style={{ marginTop: 8 }}><strong>Couldn&apos;t load</strong><div className="subtle">{err}</div></div></div>;
  if (!d) return <div>{back}<div className="muted center pad">Loading{"…"}</div></div>;
  const a = d.activity;
  if (!a) return <div>{back}<div className="subtle center pad">Activity not found.</div></div>;

  const laps = d.laps || [];
  const hz = pickHrZones(d.hr_zones, sport);
  const pzones = buildPaceZones(d.threshold_pace_s_per_km);
  const isRun = sport === "running";
  const isSwim = sport === "swimming";

  const movingS = laps.reduce((s, l) => s + (l.moving_s || 0), 0) || null;
  const elapsedS = (a.duration_mins || 0) * 60 || null;

  const hrSecs = [a.z1, a.z2, a.z3, a.z4, a.z5].map((v) => v || 0);
  const hrHas = hrSecs.some((v) => v > 0) && hz;
  const hrRange = (i: number) => {
    if (!hz) return "";
    const lo = [hz.z1, hz.z2, hz.z3, hz.z4, hz.z5][i];
    const hi = i < 4 ? [hz.z2, hz.z3, hz.z4, hz.z5][i] - 1 : (hz.maxHr || lo);
    return `${lo}–${hi}`;
  };

  const pzSecs = pzones.map(() => 0);
  if (pzones.length) laps.forEach((l) => {
    if (!l.gap_mps || l.gap_mps <= 0) return;
    const pace = 1000 / l.gap_mps;
    const w = l.moving_s || l.dur_s || 0;
    const zi = pzones.findIndex((z) => pace >= z.fast && pace < z.slow);
    if (zi >= 0) pzSecs[zi] += w;
  });
  const pzHas = isRun && pzSecs.some((v) => v > 0);

  const poly = d.polyline;

  const paceVals = laps.map((l) => (l.speed_mps && l.speed_mps > 0 ? 1000 / l.speed_mps : null)).filter((p): p is number => p != null);
  const pMin = paceVals.length ? Math.min(...paceVals) : 0, pMax = paceVals.length ? Math.max(...paceVals) : 1;

  return (
    <div>
      {back}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 12px" }}>
        <span style={{ fontSize: 20 }}>{sportEmoji(sport)}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name || `${cap(sport)} session`}</div>
          <div className="subtle tiny">{new Date(a.date + "T00:00:00").getDate()} {MONTHS[new Date(a.date + "T00:00:00").getMonth()]} {new Date(a.date + "T00:00:00").getFullYear()}</div>
        </div>
      </div>

      {poly ? <RouteTrace poly={poly} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        {a.distance_km != null ? <Stat label="Distance" value={`${a.distance_km.toFixed(2)} km`} /> : null}
        {!isSwim && a.pace_min_km != null ? <Stat label="Avg pace" value={`${fmtPaceS(a.pace_min_km * 60)}/km`} /> : null}
        {isSwim && a.avg_swolf != null ? <Stat label="Avg SWOLF" value={`${Math.round(a.avg_swolf)}`} /> : null}
        {movingS ? <Stat label="Moving" value={fmtClock(movingS)} /> : (elapsedS ? <Stat label="Time" value={fmtClock(elapsedS)} /> : null)}
        {a.elevation_gain_m != null ? <Stat label="Elev gain" value={`${Math.round(a.elevation_gain_m)} m`} /> : null}
        {a.avg_hr != null ? <Stat label="Avg HR" value={`${Math.round(a.avg_hr)}${a.max_hr ? ` / ${Math.round(a.max_hr)}` : ""}`} /> : null}
        {a.calories != null ? <Stat label="Calories" value={`${Math.round(a.calories)}`} /> : null}
        {a.avg_power != null ? <Stat label="Power" value={`${Math.round(a.avg_power)}${a.normalized_power ? ` / ${Math.round(a.normalized_power)}` : ""} W`} /> : null}
        {a.avg_run_cadence != null ? <Stat label="Cadence" value={`${Math.round(a.avg_run_cadence)} spm`} /> : null}
      </div>

      {hrHas ? (
        <ZoneBar label="Time in heart-rate zones" rows={hrSecs.map((secs, i) => ({ range: hrRange(i), secs, color: HRZ_COLORS[i] }))} />
      ) : null}

      {pzHas ? (
        <>
          <ZoneBar label="Time in pace zones" rows={pzones.map((z, i) => ({ range: i === 0 ? `>${fmtPaceS(z.fast)}` : i === 5 ? `<${fmtPaceS(z.slow)}` : `${fmtPaceS(z.fast)}–${fmtPaceS(z.slow)}`, secs: pzSecs[i], color: PZ_COLORS[i] }))} />
          <div className="subtle tiny" style={{ margin: "-2px 2px 8px" }}>Pace zones from your Garmin threshold ({fmtPaceS(d.threshold_pace_s_per_km)}/km), grade-adjusted {"·"} Strava model</div>
        </>
      ) : null}

      {laps.length > 1 ? (
        <>
          <div className="eyebrow">Splits</div>
          <div className="card">
            {laps.map((l, i) => {
              const pace = l.speed_mps && l.speed_mps > 0 ? 1000 / l.speed_mps : null;
              const zi = hrZoneIndex(l.avg_hr, hz);
              const barPct = pace != null && pMax > pMin ? 100 - ((pace - pMin) / (pMax - pMin)) * 100 : 50;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < laps.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <span className="tnum subtle" style={{ width: 16, fontSize: 11 }}>{i + 1}</span>
                  <span className="tnum" style={{ width: 50, fontSize: 12, fontWeight: 600 }}>{isSwim ? (l.swolf != null ? `${Math.round(l.swolf)}` : "—") : fmtPaceS(pace)}</span>
                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(4, barPct)}%`, height: "100%", background: zi >= 0 ? HRZ_COLORS[zi] : "#f0883e", borderRadius: 3 }} />
                  </div>
                  {l.elev_gain != null ? <span className="tnum subtle" style={{ width: 32, fontSize: 10, textAlign: "right" }}>{"↑"}{Math.round(l.elev_gain)}</span> : null}
                  {l.avg_hr != null ? <span className="tnum" style={{ width: 40, fontSize: 11, textAlign: "right", color: zi >= 0 ? HRZ_COLORS[zi] : "var(--muted)" }}>{Math.round(l.avg_hr)}</span> : null}
                </div>
              );
            })}
          </div>
          {!isSwim ? <div className="subtle tiny" style={{ marginTop: 4 }}>Bar = relative pace {"·"} color = HR zone</div> : null}
        </>
      ) : null}
    </div>
  );
}

export default function CardioTab() {
  const [acts, setActs] = useState<CardioActivityLite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sport, setSport] = useState<string>("running");
  const [sel, setSel] = useState<string | null>(null);

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
  useEffect(() => { setSel(null); }, [sport]);

  if (sel) return <CardioActivityDetail id={sel} sport={sport} onBack={() => setSel(null)} />;

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
          <CardioList acts={acts} sport={sport} onOpen={setSel} />
        </>
      )}
    </div>
  );
}
