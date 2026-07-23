"use client";
import Icon from "../components/Icon";

import { useCallback, useEffect, useRef, useState } from "react";
import { cardioComplete } from "../lib/api";

/* training-mode palette (matches CardioLive / mock 2b) */
const C = {
  bg: "#14100C", surface: "#201A15", surface2: "#2C251E", line: "#3A322A",
  text: "#F0E7DB", text2: "#B8AB9A", muted: "#8A7D6C", faint: "#6E6257",
  ember: "#D96F4E", cream: "#E8DCC9", green: "#82B287", gold: "#E0A64A",
};

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
function speak(text: string, on: boolean) {
  if (!on || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(u); } catch { /* */ }
}
function sportWord(sport: string): string {
  const s = sport.toLowerCase();
  return s.startsWith("cyc") || s.startsWith("bik") ? "Bike" : "Run";
}
function isBike(sport: string): boolean { const s = sport.toLowerCase(); return s.startsWith("cyc") || s.startsWith("bik"); }

function RouteTrace({ pts }: { pts: [number, number][] }) {
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 360, H = 200, pad = 18;
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
export default function CardioFree({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<"pre" | "live" | "summary">("pre");
  const [sport, setSport] = useState("running");
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [, setTick] = useState(0);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [dist, setDist] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id?: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const runRef = useRef(false);
  const startMsRef = useRef(0);
  const pausedAccRef = useRef(0);
  const pauseAtRef = useRef(0);
  const totalDistRef = useRef(0);
  const lastFixRef = useRef<[number, number] | null>(null);
  const ptsRef = useRef<[number, number][]>([]);
  const lapsRef = useRef<{ distance_m: number; duration_s: number; auto: boolean }[]>([]);
  const lastLapDistRef = useRef(0);
  const lastLapElapRef = useRef(0);
  const kmDoneRef = useRef(0);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release?: () => void } | null>(null);
  const voiceRef = useRef(true); voiceRef.current = voiceOn;
  const sportRef = useRef("running"); sportRef.current = sport;

  const elapsed = useCallback(() => {
    if (!startMsRef.current) return 0;
    const end = runRef.current ? Date.now() : pauseAtRef.current || Date.now();
    return Math.max(0, (end - startMsRef.current - pausedAccRef.current) / 1000);
  }, []);

  const recordLap = useCallback((auto: boolean) => {
    const d = Math.round(totalDistRef.current - lastLapDistRef.current);
    const t = Math.round(elapsed() - lastLapElapRef.current);
    if (t <= 0 && d <= 0) return;
    lapsRef.current.push({ distance_m: d, duration_s: t, auto });
    lastLapDistRef.current = totalDistRef.current;
    lastLapElapRef.current = elapsed();
  }, [elapsed]);

  const onFix = useCallback((pos: GeolocationPosition) => {
    if (!runRef.current) return;
    setGpsOk(true);
    const acc = pos.coords.accuracy ?? 999;
    const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    if (acc > 30) { lastFixRef.current = p; return; }
    const prev = lastFixRef.current;
    if (prev) {
      const dd = haversine(prev, p);
      if (dd >= 3 && dd < 60) { totalDistRef.current += dd; ptsRef.current.push(p); setDist(totalDistRef.current); }
    } else { ptsRef.current.push(p); }
    lastFixRef.current = p;
    // auto 1 km laps
    while (totalDistRef.current >= (kmDoneRef.current + 1) * 1000) {
      kmDoneRef.current += 1;
      recordLap(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(120); } catch { /* */ } }
      const last = lapsRef.current[lapsRef.current.length - 1];
      speak(`${kmDoneRef.current} kilometer${kmDoneRef.current > 1 ? "s" : ""}. ${fmtClock(last.duration_s)}.`, voiceRef.current);
    }
  }, [recordLap]);

  const startGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGpsOk(false); return; }
    try { watchRef.current = navigator.geolocation.watchPosition(onFix, () => setGpsOk(false), { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }); }
    catch { setGpsOk(false); }
  }, [onFix]);

  const begin = useCallback(async () => {
    startMsRef.current = Date.now(); pausedAccRef.current = 0; runRef.current = true;
    setPaused(false); setPhase("live");
    startGps();
    try { const wl = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen"); if (wl) wakeRef.current = wl; } catch { /* */ }
    speak(`${sportWord(sportRef.current)} started.`, voiceRef.current);
  }, [startGps]);

  const togglePause = useCallback(() => {
    if (runRef.current) { runRef.current = false; pauseAtRef.current = Date.now(); setPaused(true); speak("Paused.", voiceRef.current); }
    else { pausedAccRef.current += Date.now() - pauseAtRef.current; runRef.current = true; lastFixRef.current = null; setPaused(false); speak("Resumed.", voiceRef.current); }
  }, []);

  const finishRef = useRef<() => void>(() => {});
  const finish = useCallback(() => {
    recordLap(false); // final partial
    runRef.current = false;
    if (watchRef.current != null && typeof navigator !== "undefined") { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    speak("Session complete.", voiceRef.current);
    setPhase("summary");
  }, [recordLap]);
  finishRef.current = finish;

  useEffect(() => {
    if (phase !== "live") return;
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

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
        sport, name: `${sportWord(sport)} — free`, duration_s: Math.round(elapsed()), distance_m: Math.round(totalDistRef.current),
        route_polyline: ptsRef.current.length > 1 ? encodePolyline(ptsRef.current) : null, laps,
      });
      if (r.ok) setSaved({ id: r.activity_id }); else setSaveErr(r.error || "Save failed");
    } catch (e) { setSaveErr((e as Error).message); }
    setSaving(false);
  }, [sport, elapsed]);

  const km = dist / 1000;
  const secs = elapsed();
  const avgPace = km > 0 ? secs / km : null;
  const bike = isBike(sport);
  const speedKmh = secs > 0 ? km / (secs / 3600) : 0;

  /* ================= PRE-START ================= */
  if (phase === "pre") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={onExit} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 20, cursor: "pointer" }}>‹</button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>FREE SESSION</div>
          <button onClick={() => setVoiceOn((v) => !v)} aria-label="Voice" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: voiceOn ? C.gold : C.faint, fontSize: 16, cursor: "pointer" }}><Icon name={voiceOn ? "volumeOn" : "volumeOff"} size={15} /></button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 18px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, textAlign: "center", marginBottom: 14 }}>NO PLAN · GPS TRACKED · AUTO 1 KM LAPS</div>
          <div style={{ display: "flex", gap: 10 }}>
            {(["running", "cycling"] as const).map((s) => {
              const on = s === sport;
              return (
                <button key={s} onClick={() => setSport(s)}
                  style={{ flex: 1, background: on ? C.surface2 : "transparent", border: `1px solid ${on ? C.ember : C.line}`, borderRadius: 16, padding: "18px 8px", cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: on ? C.text : C.muted }}>{s === "cycling" ? "Bike" : "Run"}</div>
                  <div style={{ fontSize: 10, color: on ? C.ember : C.faint, marginTop: 3 }}>{s === "cycling" ? "distance · speed" : "distance · pace"}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "10px 18px 24px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={begin} style={{ width: "100%", background: C.ember, border: "none", borderRadius: 999, padding: "17px 0", fontSize: 15.5, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,111,78,0.35)" }}>Start {sportWord(sport)}</button>
        </div>
      </div>
    );
  }

  /* ================= SUMMARY ================= */
  if (phase === "summary") {
    const tot = Math.round(secs);
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "26px 20px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, textAlign: "center" }}>{saved ? "SAVED" : "SESSION COMPLETE"}</div>
          <div style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginTop: 4 }}>{sportWord(sport)} — free</div>
          <div style={{ display: "flex", marginTop: 24 }}>
            {[["DISTANCE", `${km.toFixed(2)} km`], ["TIME", fmtClock(tot)], [bike ? "AVG SPEED" : "AVG PACE", bike ? `${speedKmh.toFixed(1)} km/h` : `${fmtPaceSec(avgPace)} /km`]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 21, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 3 }}>{l}</div></div>
            ))}
          </div>
          {ptsRef.current.length > 1 ? <div style={{ marginTop: 20, height: 200, borderRadius: 20, overflow: "hidden", background: C.surface }}><RouteTrace pts={ptsRef.current} /></div> : null}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.muted, margin: "22px 0 8px" }}>SPLITS</div>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
            {lapsRef.current.map((l, i) => {
              const p = l.distance_m > 0 ? l.duration_s / (l.distance_m / 1000) : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? `1px solid ${C.surface2}` : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, width: 22 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text2 }}>{(l.distance_m / 1000).toFixed(2)} km{l.auto ? "" : " · lap"}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtClock(l.duration_s)}{p && !bike ? ` · ${fmtPaceSec(p)}/km` : ""}</span>
                </div>
              );
            })}
          </div>
          {saveErr ? <div style={{ marginTop: 12, fontSize: 12, color: C.ember }}>{saveErr}</div> : null}
        </div>
        <div style={{ padding: "10px 20px 24px", maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", gap: 10 }}>
          {saved ? (
            <button onClick={onExit} style={{ flex: 1, background: C.ember, border: "none", borderRadius: 999, padding: "16px 0", fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer" }}>Done</button>
          ) : (
            <>
              <button onClick={onExit} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "16px 0", fontSize: 13.5, fontWeight: 800, color: C.text2, cursor: "pointer" }}>Discard</button>
              <button disabled={saving} onClick={doSave} style={{ flex: 2, background: C.green, border: "none", borderRadius: 999, padding: "16px 0", fontSize: 15, fontWeight: 800, color: "#14231a", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ================= LIVE (8j — giant metrics) ================= */
  const kmProg = (totalDistRef.current % 1000) / 1000;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={togglePause} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 11, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 18, cursor: "pointer" }}>‹</button>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>{sportWord(sport).toUpperCase()} · FREE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: gpsOk === false ? C.ember : C.green }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: gpsOk === false ? C.ember : C.green }}>{gpsOk === false ? "NO GPS" : "GPS"}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px", maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" }}>
        {/* giant distance hero */}
        <div style={{ textAlign: "center", marginTop: 26 }}>
          <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{km.toFixed(2)}</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: C.faint, marginTop: 2 }}>KILOMETRES</div>
        </div>
        {/* km progress */}
        <div style={{ height: 6, borderRadius: 999, background: C.surface2, marginTop: 18 }}><div style={{ width: `${Math.round(kmProg * 100)}%`, height: 6, borderRadius: 999, background: C.ember }} /></div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, textAlign: "center" }}>{(kmProg * 1000).toFixed(0)} m into km {kmDoneRef.current + 1}</div>
        {/* time + pace/speed */}
        <div style={{ display: "flex", marginTop: 26 }}>
          <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 800 }}>{fmtClock(secs)}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 2 }}>TIME</div></div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{bike ? speedKmh.toFixed(1) : fmtPaceSec(avgPace)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 2 }}>{bike ? "KM/H AVG" : "AVG PACE"}</div>
          </div>
        </div>
        {ptsRef.current.length > 1 ? <div style={{ marginTop: 22, height: 150, borderRadius: 20, overflow: "hidden", background: C.surface }}><RouteTrace pts={ptsRef.current} /></div> : <div style={{ marginTop: 22, height: 150, borderRadius: 20, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 12 }}>{gpsOk === false ? "No GPS signal" : "Acquiring GPS…"}</div>}
        {lapsRef.current.length ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: C.muted, marginBottom: 6 }}>SPLITS</div>
            {lapsRef.current.slice().reverse().slice(0, 4).map((l, ri) => {
              const idx = lapsRef.current.length - ri;
              return (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "6px 2px", fontSize: 12.5, color: C.text2 }}>
                  <span>Km {idx}</span><span style={{ color: C.muted }}>{fmtClock(l.duration_s)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 20px 26px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={() => recordLap(false)} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "14px 0", fontSize: 13, fontWeight: 800, color: C.text, cursor: "pointer" }}>Lap</button>
        <button onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} style={{ width: 74, height: 74, borderRadius: 999, background: C.ember, border: "none", boxShadow: "0 10px 26px rgba(217,111,78,0.4)", color: "#fff", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{paused ? "▶" : "❚❚"}</button>
        <button onClick={() => finishRef.current()} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "14px 0", fontSize: 13, fontWeight: 800, color: C.text2, cursor: "pointer" }}>End</button>
      </div>
    </div>
  );
}
