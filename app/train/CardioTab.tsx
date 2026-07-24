"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cardioActivities, cardioDetail, cardioSources, cardioRenameActivity, cardioDeleteActivity, type CardioActivityLite, type CardioDetail, type CardioHrZone } from "../lib/api";
import { fmtPace } from "./ui";
import Icon, { sportIcon } from "../components/Icon";
import Sheet from "../components/Sheet";
import Loader from "../components/Loader";

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

function CardioChart({ acts, sport, metric, range }: { acts: CardioActivityLite[]; sport: string; metric: string; range: string }) {
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

  const W = 340, H = 132, x0 = 6, padR = 34, padT = 10, padB = 20;
  const plotW = W - x0 - padR, plotH = H - padT - padB, baseY = padT + plotH;
  const X = (i: number) => n <= 1 ? x0 + plotW / 2 : x0 + (i / (n - 1)) * plotW;
  const Y = (v: number) => baseY - (v / ymax) * plotH;
  const linePts = bvals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const areaPts = `${X(0).toFixed(1)},${baseY} ${linePts} ${X(n - 1).toFixed(1)},${baseY}`;
  const grid = [0, 0.5, 1];
  const xTickIdx = Array.from(new Set([0, ...Array.from({ length: 3 }, (_, k) => Math.round(((k + 1) / 4) * (n - 1)))]));
  const xlabel = (b: Bucket) => unit === "month" ? MONTHS[b.start.getMonth()] : `${b.start.getDate()} ${MONTHS[b.start.getMonth()]}`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current; if (!svg || n < 1) return;
    const r = svg.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    const idx = n <= 1 ? 0 : Math.round(((rel - x0) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="tnum" style={{ fontSize: 20, fontWeight: 900 }}>{fmtMetric(total, metric)}</div>
            {pct != null ? <span style={{ fontSize: 11, fontWeight: 800, color: pct >= 0 ? "var(--success)" : "var(--danger)" }}>{pct >= 0 ? "▲" : "▼"}{Math.abs(pct)}%</span> : null}
          </div>
          <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{cap(sport)} · {rdef[0]}{pct != null ? " · vs prior period" : ""}</div>
        </div>
        {hover != null ? <span style={{ fontSize: 9, fontWeight: 800, color: "var(--ember)", background: "rgba(217,111,78,0.12)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{xlabel(buckets[hover])} · {fmtMetric(bvals[hover], metric)}</span> : null}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair", marginTop: 4 }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id="carea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ember)" stopOpacity="0.32" /><stop offset="100%" stopColor="var(--ember)" stopOpacity="0" /></linearGradient></defs>
        {grid.map((g, i) => {
          const y = baseY - g * plotH;
          return (<g key={i}>
            <line x1={x0} y1={y} x2={x0 + plotW} y2={y} stroke="var(--line)" strokeWidth={1} strokeDasharray={g === 0 ? "0" : "3 3"} />
            <text x={W - padR + 5} y={y + 3} fill="var(--muted)" fontSize={8}>{axisLabel(ymax * g, metric)}</text>
          </g>);
        })}
        <polygon points={areaPts} fill="url(#carea)" />
        <polyline points={linePts} fill="none" stroke="var(--ember)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {bvals.map((v, i) => v > 0 ? <circle key={i} cx={X(i)} cy={Y(v)} r={hover === i ? 4 : 2.2} fill="var(--ember)" stroke="var(--surface)" strokeWidth={hover === i ? 1.5 : 0} /> : null)}
        {xTickIdx.map((i) => <text key={"x" + i} x={X(i)} y={H - 5} fill="var(--muted)" fontSize={8} textAnchor="middle">{xlabel(buckets[i])}</text>)}
        {hover != null ? <line x1={X(hover)} y1={padT} x2={X(hover)} y2={baseY} stroke="color-mix(in srgb, var(--ember) 50%, transparent)" strokeWidth={1} strokeDasharray="3 3" /> : null}
      </svg>
    </div>
  );
}
function sourceLabel(src?: string): string | null {
  if (!src) return null;
  const s = src.toLowerCase();
  if (s === "in_app") return "In-app";
  if (s === "garmin") return "Garmin";
  if (s === "strava") return "Strava";
  if (s === "manual") return "Manual";
  return src.charAt(0).toUpperCase() + src.slice(1);
}
function SourcePill({ src }: { src?: string }) {
  const label = sourceLabel(src);
  if (!label) return null;
  const inApp = (src || "").toLowerCase() === "in_app";
  return (
    <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 999, color: inApp ? "var(--ember)" : "var(--muted)", background: inApp ? "rgba(217,111,78,0.12)" : "var(--surface-2)", border: `1px solid ${inApp ? "transparent" : "var(--line)"}`, whiteSpace: "nowrap" }}>{label}</span>
  );
}

function CardioList({ acts, sport, onOpen, sources }: { acts: CardioActivityLite[]; sport: string; onOpen: (id: string) => void; sources: Record<string, { source: string; name: string | null }> }) {
  const rows = useMemo(() => acts.filter((a) => a.sport === sport).slice().sort((a, b) => (a.date < b.date ? 1 : -1)), [acts, sport]);
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "var(--muted)", margin: "10px 2px 6px", textTransform: "uppercase" }}>{cap(sport)} sessions</div>
      {rows.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No {sport} sessions.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {rows.map((a) => (
            <div key={a.activity_id} className="card" onClick={() => onOpen(a.activity_id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", margin: 0, cursor: "pointer" }}>
              <Icon name={sportIcon(sport)} size={15} color="var(--muted)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 12 }}>{a.distance_km != null ? `${a.distance_km.toFixed(2)} km` : (a.duration_mins != null ? fmtHrMin(a.duration_mins) : (a.name || "Session"))}</div>
                <div className="subtle" style={{ fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span>{new Date(a.date + "T00:00:00").getDate()} {MONTHS[new Date(a.date + "T00:00:00").getMonth()]}{a.duration_mins != null ? ` · ${fmtHrMin(a.duration_mins)}` : ""}</span>
                  <SourcePill src={sources[a.activity_id]?.source} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="tnum" style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)" }}>{sport === "swimming" && a.avg_swolf != null ? `SWOLF ${Math.round(a.avg_swolf)}` : a.pace_min_km != null ? `${fmtPace(a.pace_min_km)}/km` : ""}</div>
                {a.avg_hr != null ? <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{Math.round(a.avg_hr)} bpm</div> : null}
              </div>
              <span style={{ color: "var(--muted)", fontSize: 15 }}>{"›"}</span>
            </div>
          ))}
        </div>}
    </div>
  );
}

const HRZ_COLORS = ["#6b8cff", "#34d399", "#f0c05a", "#f0883e", "#fb7185"];
const PZ_COLORS = ["#6b8cff", "#34d399", "#3fc7bd", "#f0c05a", "#f0883e", "#fb7185"];
const PZ_NAMES = ["Recovery", "Endurance", "Tempo", "Threshold", "VO2", "Anaerobic"];
const PZ_RATIOS = [1.347, 1.16, 1.039, 0.973, 0.915];

function fmtPaceS(s: number | null | undefined): string {
  if (!s || !isFinite(s) || s <= 0) return "—";
  const t = Math.round(s), m = Math.floor(t / 60), sec = t % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtClock(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
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
              <div style={{ flex: 1, height: 15, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
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
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "9px 11px" }}>
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

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad, dLng = (b[1] - a[1]) * toRad;
  const la1 = a[0] * toRad, la2 = b[0] * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function RouteTrace({ poly }: { poly: string }) {
  const pts = useMemo(() => { try { return decodePolyline(poly); } catch { return [] as [number, number][]; } }, [poly]);
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const W = 440, H = 210, pad = 20;
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
  const PX = (lng: number) => offX + (lng - minLng) * kx * scale;
  const PY = (lat: number) => offY + (maxLat - lat) * scale;
  const dpath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${PX(p[1]).toFixed(1)},${PY(p[0]).toFixed(1)}`).join(" ");
  const s = pts[0], e = pts[pts.length - 1];

  const widthMeters = Math.max(haversine([midLat, minLng], [midLat, maxLng]), 1);
  const metersPerPx = widthMeters / (spanX * scale);
  const targets = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let barM = targets[0];
  for (const t of targets) if (t / metersPerPx <= 96) barM = t;
  const barPx = barM / metersPerPx;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8, background: "var(--surface-2)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <filter id="rtglow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((f) => <line key={"v" + f} x1={W * f} y1={0} x2={W * f} y2={H} stroke="var(--line)" strokeWidth={1} />)}
        {[0.25, 0.5, 0.75].map((f) => <line key={"h" + f} x1={0} y1={H * f} x2={W} y2={H * f} stroke="var(--line)" strokeWidth={1} />)}
        <path d={dpath} fill="none" stroke="var(--ember)" strokeWidth={5} opacity={0.35} filter="url(#rtglow)" strokeLinejoin="round" strokeLinecap="round" />
        <path d={dpath} fill="none" stroke="var(--ember)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={PX(s[1])} cy={PY(s[0])} r={6} fill="none" stroke="var(--success)" strokeWidth={1.5} opacity={0.5} />
        <circle cx={PX(s[1])} cy={PY(s[0])} r={3.5} fill="var(--success)" stroke="var(--surface-2)" strokeWidth={1.5} />
        <circle cx={PX(e[1])} cy={PY(e[0])} r={3.5} fill="var(--danger)" stroke="var(--surface-2)" strokeWidth={1.5} />
        <line x1={14} y1={H - 14} x2={14 + barPx} y2={H - 14} stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" />
        <text x={14} y={H - 19} fill="var(--muted)" fontSize={9}>{barM >= 1000 ? `${barM / 1000} km` : `${barM} m`}</text>
      </svg>
    </div>
  );
}
export function CardioActivityDetail({ id, sport, onBack, source, onChanged, onDeleted, embedded }: { id: string; sport: string; onBack: () => void; source?: string; onChanged?: (name: string) => void; onDeleted?: () => void; embedded?: boolean }) {
  const [d, setD] = useState<CardioDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  useEffect(() => { let a = true; cardioDetail(id).then((r) => a && setD(r)).catch((e) => a && setErr((e as Error).message)); return () => { a = false; }; }, [id]);

  const inApp = (source || "").toLowerCase() === "in_app";
  const saveName = async () => {
    const nm = nameInput.trim(); if (!nm) { setEditing(false); return; }
    setBusy(true); setActErr(null);
    try { await cardioRenameActivity(id, nm); setLocalName(nm); onChanged?.(nm); setEditing(false); }
    catch (e) { setActErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true); setActErr(null);
    try { await cardioDeleteActivity(id); onDeleted?.(); }
    catch (e) { setActErr((e as Error).message); setBusy(false); }
  };

  const back = embedded ? null : <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--ember)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 0" }}>{"‹"} Back</button>;
  if (err) return <div>{back}<div className="card error" style={{ marginTop: 8 }}><strong>Couldn&apos;t load</strong><div className="subtle">{err}</div></div></div>;
  if (!d) return <div>{back}<Loader /></div>;
  const a = d.activity;
  if (!a) return <div>{back}<div className="subtle center pad">Activity not found.</div></div>;
  const displayName = localName ?? a.name;

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
        <Icon name={sportIcon(sport)} size={19} color="var(--ember)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus maxLength={80}
                style={{ flex: 1, minWidth: 0, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", color: "var(--text)", fontSize: 14, fontWeight: 700 }} />
              <button disabled={busy} onClick={saveName} style={{ background: "var(--ember)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{busy ? "…" : "Save"}</button>
              <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{displayName || `${cap(sport)} session`}</div>
              <SourcePill src={source} />
              {inApp ? <button onClick={() => { setNameInput(displayName || ""); setEditing(true); }} aria-label="Rename" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 0 }}><Icon name="edit" size={13} /></button> : null}
            </div>
          )}
          <div className="subtle tiny">{new Date(a.date + "T00:00:00").getDate()} {MONTHS[new Date(a.date + "T00:00:00").getMonth()]} {new Date(a.date + "T00:00:00").getFullYear()}</div>
        </div>
        {inApp && !editing ? <button onClick={() => setConfirmDel(true)} aria-label="Delete" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15, padding: 4 }}><Icon name="trash" size={15} /></button> : null}
      </div>
      {actErr ? <div className="subtle tiny" style={{ color: "var(--danger)", marginBottom: 8 }}>{actErr}</div> : null}
      {confirmDel ? (
        <div className="card" style={{ marginBottom: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--text-2)" }}>Delete this in-app activity? This can&apos;t be undone.</span>
          <button onClick={() => setConfirmDel(false)} className="trn-sub">Cancel</button>
          <button disabled={busy} onClick={doDelete} className="trn-sub" style={{ color: "#fff", background: "var(--danger)", borderColor: "transparent" }}>{busy ? "…" : "Delete"}</button>
        </div>
      ) : null}

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
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < laps.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span className="tnum subtle" style={{ width: 16, fontSize: 11 }}>{i + 1}</span>
                  <span className="tnum" style={{ width: 50, fontSize: 12, fontWeight: 600 }}>{isSwim ? (l.swolf != null ? `${Math.round(l.swolf)}` : "—") : fmtPaceS(pace)}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(4, barPct)}%`, height: "100%", background: zi >= 0 ? HRZ_COLORS[zi] : "var(--ember)", borderRadius: 3 }} />
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

function DropPill({ options, value, onChange, placeholder }: { options: { key: string; label: string; icon?: ReactNode }[]; value: string; onChange: (k: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.key === value);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 999, border: `1px solid ${open ? "color-mix(in srgb, var(--ember) 55%, transparent)" : "var(--line)"}`, background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", font: "inherit", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
        {cur?.icon ? <span>{cur.icon}</span> : null}<span>{cur?.label ?? placeholder ?? "Select"}</span><span style={{ color: "var(--muted)", fontSize: 9, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 41, minWidth: 150, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.28)", overflow: "hidden", maxHeight: 264, overflowY: "auto" }}>
            {options.map((o, i) => (
              <button key={o.key} onClick={() => { onChange(o.key); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: o.key === value ? "var(--surface-2)" : "transparent", border: "none", borderTop: i ? "1px solid var(--line)" : "none", color: o.key === value ? "var(--ember)" : "var(--text)", cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: o.key === value ? 700 : 600, textAlign: "left" }}>
                {o.icon ? <span>{o.icon}</span> : null}<span style={{ flex: 1 }}>{o.label}</span>{o.key === value ? <span style={{ fontSize: 11, color: "var(--ember)" }}>✓</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function CardioTab() {
  const [acts, setActs] = useState<CardioActivityLite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sport, setSport] = useState<string>("running");
  const [metric, setMetric] = useState<string>("distance");
  const [range, setRange] = useState<string>("1M");
  const [sel, setSel] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, { source: string; name: string | null }>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => { let alive = true; cardioActivities().then((r) => alive && setActs(r)).catch((e) => alive && setErr((e as Error).message)); return () => { alive = false; }; }, [reload]);
  useEffect(() => { let alive = true; cardioSources().then((r) => alive && setSources(r)).catch(() => {}); return () => { alive = false; }; }, [reload]);

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

  return (
    <div>
      {err ? <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{err}</div></div> : null}
      {acts == null ? <Loader /> : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <DropPill options={sports.map((s) => ({ key: s, label: cap(s), icon: <Icon name={sportIcon(s)} size={13} /> }))} value={sport} onChange={setSport} placeholder="Sport" />
            <DropPill options={METRICS.map(([k, l]) => ({ key: k, label: l }))} value={metric} onChange={setMetric} placeholder="Metric" />
            <DropPill options={RANGES.map(([k]) => ({ key: k, label: k }))} value={range} onChange={setRange} placeholder="Period" />
          </div>
          <CardioChart acts={acts} sport={sport} metric={metric} range={range} />
          <CardioList acts={acts} sport={sport} onOpen={setSel} sources={sources} />
        </>
      )}
      <Sheet open={!!sel} title="Activity" onClose={() => setSel(null)}>
        {sel ? <CardioActivityDetail id={sel} sport={sport} onBack={() => setSel(null)} source={sources[sel]?.source} onChanged={() => setReload((n) => n + 1)} onDeleted={() => { setSel(null); setReload((n) => n + 1); }} embedded /> : null}
      </Sheet>
    </div>
  );
}
