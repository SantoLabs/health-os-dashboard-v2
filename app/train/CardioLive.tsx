"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardioRoutine, CardioStructure, CardioStep, CardioLoop, CardioStepOrLoop, CardioMeasure, CardioTarget } from "../lib/api";
import { cardioComplete } from "../lib/api";

/* ---------- training-mode palette (intentionally its own dark skin, matching mock 2a) ---------- */
const C = {
  bg: "#14100C", surface: "#201A15", surface2: "#2C251E", line: "#3A322A",
  text: "#F0E7DB", text2: "#B8AB9A", muted: "#8A7D6C", faint: "#6E6257",
  ember: "#D96F4E", cream: "#E8DCC9", green: "#82B287", gold: "#E0A64A",
};

/* ---------- helpers ---------- */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function encodePolyline(pts: [number, number][], precision = 5): string {
  const factor = Math.pow(10, precision);
  let out = "", prevLat = 0, prevLng = 0;
  const enc = (cur: number, prev: number) => {
    let v = Math.round(cur * factor) - Math.round(prev * factor);
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const [lat, lng] of pts) { out += enc(lat, prevLat) + enc(lng, prevLng); prevLat = lat; prevLng = lng; }
  return out;
}
function fmtClock(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtPaceSec(sPerKm: number | null): string {
  if (sPerKm == null || !isFinite(sPerKm) || sPerKm <= 0) return "--:--";
  const m = Math.floor(sPerKm / 60), s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtKm(m: number): string { return (m / 1000).toFixed(2); }

function isLoop(b: CardioStepOrLoop): b is CardioLoop { return b.block_type === "loop"; }

type LiveStep = { step: CardioStep; round: { i: number; of: number } | null };
function flatten(blocks: CardioStepOrLoop[], out: LiveStep[], round: { i: number; of: number } | null) {
  for (const b of blocks) {
    if (isLoop(b)) { for (let r = 0; r < Math.max(1, b.repeat); r++) flatten(b.steps, out, { i: r + 1, of: b.repeat }); }
    else out.push({ step: b, round });
  }
}

function kindColor(kind: string, role?: string | null): string {
  const k = (kind || "").toLowerCase(), r = (role || "").toLowerCase();
  if (k === "warmup") return C.cream;
  if (k === "cooldown") return C.green;
  if (k === "rest" || r.includes("recover") || r.includes("rest")) return C.faint;
  if (k === "transition") return C.muted;
  return C.ember; // segment / work
}
function kindWord(s: CardioStep): string {
  if (s.label) return s.label;
  const k = (s.kind || "").toLowerCase(), r = (s.role || "").toLowerCase();
  if (k === "warmup") return "Warm up";
  if (k === "cooldown") return "Cool down";
  if (k === "rest") return r.includes("recover") ? "Recover" : "Rest";
  if (k === "transition") return "Transition";
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return "Work";
}
function measureText(m: CardioMeasure): string {
  if (m.type === "distance") return m.meters >= 1000 ? `${(m.meters / 1000).toFixed(m.meters % 1000 ? 2 : 0)} km` : `${m.meters} m`;
  if (m.type === "time") return fmtClock(m.seconds);
  if (m.type === "lap") return m.laps && m.laps > 1 ? `${m.laps} laps` : "1 lap";
  return "open";
}
function paceTarget(t: CardioTarget[] | undefined): { low?: number; high?: number } | null {
  const p = (t || []).find((x) => x.metric === "pace");
  return p ? { low: p.low ?? undefined, high: p.high ?? undefined } : null;
}
function targetText(t: CardioTarget[] | undefined): string {
  if (!t || !t.length) return "";
  const parts: string[] = [];
  for (const x of t) {
    if (x.metric === "pace") { const a = fmtPaceSec(x.low ?? null), b = x.high != null ? fmtPaceSec(x.high) : null; parts.push(b && b !== a ? `${a}–${b} /km` : `${a} /km`); }
    else if (x.metric === "power") parts.push(x.low != null && x.high != null ? `${x.low}–${x.high} W` : `${x.low ?? x.high} W`);
    else if (x.metric === "hr") parts.push(x.low != null && x.high != null ? `${x.low}–${x.high} bpm` : `${x.low ?? x.high} bpm`);
    else if (x.metric === "cadence") parts.push(`${x.low ?? x.high} spm`);
    else if (x.metric === "rpe") parts.push(`RPE ${x.low ?? x.high}`);
  }
  return parts.join(" · ");
}
function estSec(s: CardioStep, sport: string): number {
  const m = s.measure;
  if (m.type === "time") return m.seconds;
  if (m.type === "distance") {
    const pt = paceTarget(s.targets);
    let sPerKm = pt?.low ?? pt?.high ?? null;
    if (!sPerKm) { const sp = sport.toLowerCase(); sPerKm = sp.startsWith("cyc") || sp.startsWith("bik") ? 120 : sp.startsWith("swim") ? 1200 : 360; }
    return (m.meters / 1000) * sPerKm;
  }
  return 0;
}

function speak(text: string, on: boolean) {
  if (!on || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.0; u.pitch = 1.0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
}
function stepPhrase(ls: LiveStep): string {
  const s = ls.step, word = kindWord(s), m = s.measure;
  const rnd = ls.round ? `${word}. Rep ${ls.round.i} of ${ls.round.of}. ` : `${word}. `;
  let meas = "";
  if (m.type === "distance") meas = m.meters >= 1000 ? `${(m.meters / 1000).toFixed(2)} kilometers` : `${m.meters} meters`;
  else if (m.type === "time") { const mn = Math.floor(m.seconds / 60), se = m.seconds % 60; meas = mn ? `${mn} minute${mn > 1 ? "s" : ""}${se ? ` ${se}` : ""}` : `${se} seconds`; }
  const pt = paceTarget(s.targets);
  const tgt = pt?.low ? `, at ${fmtPaceSec(pt.low)} per kilometer` : "";
  return `${rnd}${meas}${tgt}`.trim();
}

/* ---------- tiny SVG route trace (no base map — GPS path only) ---------- */
function RouteTrace({ pts }: { pts: [number, number][] }) {
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 360, H = 210, pad = 18;
  const sx = (maxLng - minLng) || 1e-6, sy = (maxLat - minLat) || 1e-6;
  const sc = Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sy);
  const ox = (W - sx * sc) / 2, oy = (H - sy * sc) / 2;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(ox + (p[1] - minLng) * sc).toFixed(1)},${(H - oy - (p[0] - minLat) * sc).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" stroke={C.ember} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ox + (last[1] - minLng) * sc} cy={H - oy - (last[0] - minLat) * sc} r="6" fill="#fff" stroke={C.ember} strokeWidth="3" />
    </svg>
  );
}

/* ================================================================= */
export default function CardioLive({ routine, onExit }: { routine: CardioRoutine; onExit: () => void }) {
  const sport = routine.sport || "running";
  const structure: CardioStructure = routine.structure;
  const steps = useMemo(() => { const out: LiveStep[] = []; flatten(structure.blocks || [], out, null); return out; }, [structure]);
  const reminders = structure.reminders || [];
  const totalEst = useMemo(() => steps.reduce((a, s) => a + estSec(s.step, sport), 0), [steps, sport]);

  const [phase, setPhase] = useState<"pre" | "live" | "summary">("pre");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [, setTick] = useState(0);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [dist, setDist] = useState(0);       // total meters (display)
  const [stepDistDisp, setStepDistDisp] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id?: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // engine refs
  const idxRef = useRef(0);
  const runRef = useRef(false);
  const startMsRef = useRef(0);
  const pausedAccRef = useRef(0);
  const pauseAtRef = useRef(0);
  const stepBaseRef = useRef(0);              // elapsed-sec at current step start
  const totalDistRef = useRef(0);
  const stepDistRef = useRef(0);
  const lastFixRef = useRef<[number, number] | null>(null);
  const ptsRef = useRef<[number, number][]>([]);
  const lapsRef = useRef<{ distance_m: number; duration_s: number; skipped?: boolean }[]>([]);
  const firedRef = useRef<Set<string>>(new Set());
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release?: () => void } | null>(null);
  const voiceRef = useRef(true); voiceRef.current = voiceOn;

  const elapsed = useCallback(() => {
    if (!startMsRef.current) return 0;
    const end = runRef.current ? Date.now() : pauseAtRef.current || Date.now();
    return Math.max(0, (end - startMsRef.current - pausedAccRef.current) / 1000);
  }, []);
  const stepElapsed = useCallback(() => elapsed() - stepBaseRef.current, [elapsed]);

  const cur = steps[idx] || null;
  const finishRef = useRef<() => void>(() => {});
  const advanceRef = useRef<(skipped?: boolean) => void>(() => {});

  const announce = useCallback((i: number) => { const ls = steps[i]; if (ls) speak(stepPhrase(ls), voiceRef.current); }, [steps]);

  const finish = useCallback(() => {
    // record final step actual
    const s = steps[idxRef.current];
    if (s && stepElapsed() > 0) lapsRef.current.push({ distance_m: Math.round(stepDistRef.current), duration_s: Math.round(stepElapsed()) });
    runRef.current = false;
    if (watchRef.current != null && typeof navigator !== "undefined") { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    speak("Session complete.", voiceRef.current);
    setPhase("summary");
  }, [steps, stepElapsed]);
  finishRef.current = finish;

  const advance = useCallback((skipped = false) => {
    const s = steps[idxRef.current];
    if (s) lapsRef.current.push({ distance_m: Math.round(stepDistRef.current), duration_s: Math.round(stepElapsed()), skipped });
    const next = idxRef.current + 1;
    if (next >= steps.length) { finishRef.current(); return; }
    stepDistRef.current = 0; setStepDistDisp(0);
    stepBaseRef.current = elapsed();
    idxRef.current = next; setIdx(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(120); } catch { /* */ } }
    announce(next);
  }, [steps, stepElapsed, elapsed, announce]);
  advanceRef.current = advance;

  // GPS
  const onFix = useCallback((pos: GeolocationPosition) => {
    if (!runRef.current) return;
    setGpsOk(true);
    const acc = pos.coords.accuracy ?? 999;
    const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    if (acc > 30) { lastFixRef.current = p; return; } // too rough to trust for distance
    const prev = lastFixRef.current;
    if (prev) {
      const d = haversine(prev, p);
      if (d >= 3 && d < 60) { // ignore jitter + implausible jumps
        totalDistRef.current += d; stepDistRef.current += d; ptsRef.current.push(p);
        setDist(totalDistRef.current); setStepDistDisp(stepDistRef.current);
      }
    } else { ptsRef.current.push(p); }
    lastFixRef.current = p;
    const m = steps[idxRef.current]?.step.measure;
    if (m && m.type === "distance" && stepDistRef.current >= m.meters) advanceRef.current(false);
  }, [steps]);

  const startGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGpsOk(false); return; }
    try {
      watchRef.current = navigator.geolocation.watchPosition(onFix, () => setGpsOk(false), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    } catch { setGpsOk(false); }
  }, [onFix]);

  const begin = useCallback(async () => {
    startMsRef.current = Date.now(); pausedAccRef.current = 0; stepBaseRef.current = 0;
    idxRef.current = 0; runRef.current = true;
    setIdx(0); setPaused(false); setPhase("live");
    startGps();
    try { const wl = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen"); if (wl) wakeRef.current = wl; } catch { /* */ }
    announce(0);
  }, [startGps, announce]);

  const togglePause = useCallback(() => {
    if (runRef.current) { runRef.current = false; pauseAtRef.current = Date.now(); setPaused(true); speak("Paused.", voiceRef.current); }
    else { pausedAccRef.current += Date.now() - pauseAtRef.current; runRef.current = true; lastFixRef.current = null; setPaused(false); speak("Resumed.", voiceRef.current); }
  }, []);

  // 1s tick: drive time-based advance, reminders, display
  useEffect(() => {
    if (phase !== "live") return;
    const iv = setInterval(() => {
      setTick((n) => n + 1);
      if (!runRef.current) return;
      const tot = elapsed();
      // reminders
      for (let i = 0; i < reminders.length; i++) {
        const r = reminders[i];
        if (r.at_s != null) { const key = `a${i}`; if (tot >= r.at_s && !firedRef.current.has(key)) { firedRef.current.add(key); const t = r.note || (r.type === "fuel" ? "Fuel — gel + a few sips" : "Hydrate — a few sips"); setToast(t); speak(t, voiceRef.current); } }
        else if (r.every_s != null && r.every_s > 0) { const c = Math.floor(tot / r.every_s); const key = `e${i}_${c}`; if (c > 0 && !firedRef.current.has(key)) { firedRef.current.add(key); const t = r.note || (r.type === "fuel" ? "Fuel — gel + a few sips" : "Hydrate — a few sips"); setToast(t); speak(t, voiceRef.current); } }
      }
      const m = steps[idxRef.current]?.step.measure;
      const se = tot - stepBaseRef.current;
      if (m && m.type === "time" && se >= m.seconds) advanceRef.current(false);
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, elapsed, reminders, steps]);

  useEffect(() => () => {
    if (watchRef.current != null && typeof navigator !== "undefined") navigator.geolocation.clearWatch(watchRef.current);
    try { wakeRef.current?.release?.(); } catch { /* */ }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const doSave = useCallback(async () => {
    setSaving(true); setSaveErr(null);
    try {
      const laps = lapsRef.current.filter((l) => l.duration_s > 0).map((l, i) => ({ lap_index: i, distance_m: l.distance_m || null, duration_s: l.duration_s, avg_speed_mps: l.distance_m && l.duration_s ? l.distance_m / l.duration_s : null }));
      const r = await cardioComplete({
        sport, name: routine.name, duration_s: Math.round(elapsed()), distance_m: Math.round(totalDistRef.current),
        elevation_gain_m: null, route_polyline: ptsRef.current.length > 1 ? encodePolyline(ptsRef.current) : null, laps,
      });
      if (r.ok) setSaved({ id: r.activity_id }); else setSaveErr(r.error || "Save failed");
    } catch (e) { setSaveErr((e as Error).message); }
    setSaving(false);
  }, [sport, routine.name, elapsed]);

  /* ---------- shared bits ---------- */
  const hdrLabel = `${sport.toUpperCase()} · ${routine.name.toUpperCase()}`;
  const segBar = (
    <div style={{ display: "flex", gap: 3 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ flex: Math.max(0.5, estSec(s.step, sport) / Math.max(1, totalEst / steps.length)), height: 6, borderRadius: 999, background: i < idx ? C.faint : i === idx && phase === "live" ? kindColor(s.step.kind, s.step.role) : kindColor(s.step.kind, s.step.role), opacity: i < idx ? 0.5 : 1 }} />
      ))}
    </div>
  );

  /* ================= PRE-START (8h) ================= */
  if (phase === "pre") {
    const renderBlocks = (blocks: CardioStepOrLoop[], depth = 0): JSX.Element[] =>
      blocks.map((b, i) => {
        if (isLoop(b)) {
          return (
            <div key={`l${depth}_${i}`} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8, borderBottom: `1px solid ${C.surface2}` }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: C.ember }}>REPEAT × {b.repeat}</span>
                {b.label ? <span style={{ fontSize: 11, color: C.muted }}>{b.label}</span> : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>{renderBlocks(b.steps, depth + 1)}</div>
            </div>
          );
        }
        const s = b as CardioStep;
        return (
          <div key={`s${depth}_${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px" }}>
            <div style={{ width: 10, height: 26, borderRadius: 999, background: kindColor(s.kind, s.role), flex: "0 0 auto" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{kindWord(s)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{measureText(s.measure)}{targetText(s.targets) ? ` · ${targetText(s.targets)}` : ""}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>~{fmtClock(estSec(s, sport))}</div>
          </div>
        );
      });

    const first = steps[0];
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={onExit} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 20, cursor: "pointer" }}>‹</button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>{hdrLabel}</div>
          <button onClick={() => setVoiceOn((v) => !v)} aria-label="Voice" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: voiceOn ? C.gold : C.faint, fontSize: 16, cursor: "pointer" }}>{voiceOn ? "🔊" : "🔇"}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>UP FIRST</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>{first ? `${kindWord(first.step)} · ${measureText(first.step.measure)}` : "—"}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{steps.length} steps · est {fmtClock(totalEst)}{routine.total_distance_m ? ` · ${(routine.total_distance_m / 1000).toFixed(1)} km` : ""}</div>
          </div>
          <div style={{ marginTop: 16 }}>{segBar}</div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.muted, margin: "20px 0 8px" }}>STEPS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{renderBlocks(structure.blocks || [])}</div>
        </div>
        <div style={{ padding: "10px 18px 24px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={begin} style={{ width: "100%", background: C.ember, border: "none", borderRadius: 999, padding: "17px 0", fontSize: 15.5, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,111,78,0.35)" }}>Start</button>
        </div>
      </div>
    );
  }

  /* ================= SUMMARY ================= */
  if (phase === "summary") {
    const tot = Math.round(elapsed());
    const km = totalDistRef.current / 1000;
    const avgPace = km > 0 ? tot / km : null;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "26px 20px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, textAlign: "center" }}>{saved ? "SAVED" : "SESSION COMPLETE"}</div>
          <div style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginTop: 4 }}>{routine.name}</div>
          <div style={{ display: "flex", marginTop: 24 }}>
            {[["DISTANCE", `${km.toFixed(2)} km`], ["TIME", fmtClock(tot)], ["AVG PACE", `${fmtPaceSec(avgPace)} /km`]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 3 }}>{l}</div></div>
            ))}
          </div>
          {ptsRef.current.length > 1 ? <div style={{ marginTop: 20, height: 210, borderRadius: 20, overflow: "hidden", background: C.surface }}><RouteTrace pts={ptsRef.current} /></div> : null}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.muted, margin: "22px 0 8px" }}>SPLITS</div>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
            {lapsRef.current.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? `1px solid ${C.surface2}` : "none" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, width: 22 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text2 }}>{steps[i] ? kindWord(steps[i].step) : "Step"}{l.skipped ? " · skipped" : ""}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{l.distance_m ? `${(l.distance_m / 1000).toFixed(2)} km · ` : ""}{fmtClock(l.duration_s)}</span>
              </div>
            ))}
          </div>
          {saveErr ? <div style={{ marginTop: 12, fontSize: 12, color: C.ember }}>{saveErr}</div> : null}
        </div>
        <div style={{ padding: "10px 20px 24px", maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", gap: 10 }}>
          {saved ? (
            <button onClick={onExit} style={{ flex: 1, background: C.ember, border: "none", borderRadius: 999, padding: "16px 0", fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer" }}>Done</button>
          ) : (
            <>
              <button onClick={onExit} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "16px 0", fontSize: 13.5, fontWeight: 800, color: C.text2, cursor: "pointer" }}>Discard</button>
              <button disabled={saving} onClick={doSave} style={{ flex: 2, background: C.green, border: "none", borderRadius: 999, padding: "16px 0", fontSize: 15, fontWeight: 800, color: "#14231a", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save to history"}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ================= LIVE (2a) ================= */
  const m = cur?.step.measure;
  const se = stepElapsed();
  let heroBig = "", heroSub = "", frac = 0;
  if (m?.type === "time") { const rem = Math.max(0, m.seconds - se); heroBig = fmtClock(rem); frac = m.seconds ? Math.min(1, se / m.seconds) : 0; heroSub = "remaining"; }
  else if (m?.type === "distance") { const rem = Math.max(0, m.meters - stepDistDisp); heroBig = rem >= 1000 ? `${(rem / 1000).toFixed(2)} km` : `${Math.round(rem)} m`; frac = m.meters ? Math.min(1, stepDistDisp / m.meters) : 0; heroSub = "to go"; }
  else { heroBig = fmtClock(se); frac = 0; heroSub = "elapsed"; }
  const tgt = cur ? targetText(cur.step.targets) : "";
  const next = steps[idx + 1] || null;
  const km = dist / 1000;
  const avgPace = km > 0 ? elapsed() / km : null;
  const manual = m?.type === "lap" || m?.type === "open";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={togglePause} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 11, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 18, cursor: "pointer" }}>‹</button>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hdrLabel}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: gpsOk === false ? C.ember : C.green }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: gpsOk === false ? C.ember : C.green }}>{gpsOk === false ? "NO GPS" : "GPS"}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div style={{ marginTop: 16 }}>{segBar}</div>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, padding: 22, textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>STEP {idx + 1} OF {steps.length}{cur?.round ? ` · REP ${cur.round.i}/${cur.round.of}` : ""} · {cur ? kindWord(cur.step).toUpperCase() : ""}</div>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6 }}>{heroBig}</div>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: "0.06em" }}>{heroSub}</div>
          {tgt ? <div style={{ fontSize: 15, fontWeight: 700, color: C.ember, marginTop: 6 }}>{tgt}</div> : null}
          <div style={{ height: 6, borderRadius: 999, background: C.surface2, marginTop: 14 }}><div style={{ width: `${Math.round((manual ? 1 : frac) * 100)}%`, height: 6, borderRadius: 999, background: C.ember }} /></div>
          {next ? <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Up next · <span style={{ fontWeight: 700, color: C.text2 }}>{kindWord(next.step)} · {measureText(next.step.measure)}</span></div> : <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Last step</div>}
        </div>
        <div style={{ display: "flex", marginTop: 16 }}>
          {[["DISTANCE", `${km.toFixed(2)} km`], ["TIME", fmtClock(elapsed())], ["AVG PACE", `${fmtPaceSec(avgPace)} /km`]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 2 }}>{l}</div></div>
          ))}
        </div>
        {ptsRef.current.length > 1 ? <div style={{ marginTop: 16, height: 180, borderRadius: 20, overflow: "hidden", background: C.surface }}><RouteTrace pts={ptsRef.current} /></div> : null}
        {toast ? (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, background: "rgba(224,166,74,0.14)", borderRadius: 16, padding: "12px 14px" }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: C.gold }}>{toast}</span>
            <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 20px 26px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={() => advanceRef.current(false)} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "14px 0", fontSize: 13, fontWeight: 800, color: manual ? C.text : C.text2, cursor: "pointer" }}>{manual ? "Lap" : "Next"}</button>
        <button onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} style={{ width: 74, height: 74, borderRadius: 999, background: C.ember, border: "none", boxShadow: "0 10px 26px rgba(217,111,78,0.4)", color: "#fff", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{paused ? "▶" : "❚❚"}</button>
        <button onClick={() => finishRef.current()} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "14px 0", fontSize: 13, fontWeight: 800, color: C.text2, cursor: "pointer" }}>End</button>
      </div>
    </div>
  );
}
