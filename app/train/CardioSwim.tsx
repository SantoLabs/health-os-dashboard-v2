"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardioRoutine, CardioStructure, CardioStep, CardioLoop, CardioStepOrLoop, CardioMeasure } from "../lib/api";
import { cardioComplete } from "../lib/api";

/* training-mode palette (matches CardioLive / mock 2d) */
const C = {
  bg: "#14100C", surface: "#201A15", surface2: "#2C251E", line: "#3A322A",
  text: "#F0E7DB", text2: "#B8AB9A", muted: "#8A7D6C", faint: "#6E6257",
  ember: "#D96F4E", cream: "#E8DCC9", green: "#82B287", gold: "#E0A64A",
};

function fmtClock(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtPer100(sPer100: number | null): string {
  if (sPer100 == null || !isFinite(sPer100) || sPer100 <= 0) return "--:--";
  const m = Math.floor(sPer100 / 60), s = Math.round(sPer100 % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function speak(text: string, on: boolean) {
  if (!on || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); window.speechSynthesis.speak(u); } catch { /* */ }
}
function isLoop(b: CardioStepOrLoop): b is CardioLoop { return b.block_type === "loop"; }

type SwimStep = { step: CardioStep; round: { i: number; of: number } | null };
function flatten(blocks: CardioStepOrLoop[], out: SwimStep[], round: { i: number; of: number } | null) {
  for (const b of blocks) {
    if (isLoop(b)) { for (let r = 0; r < Math.max(1, b.repeat); r++) flatten(b.steps, out, { i: r + 1, of: b.repeat }); }
    else out.push({ step: b, round });
  }
}
function isRest(s: CardioStep): boolean {
  const k = (s.kind || "").toLowerCase(), r = (s.role || "").toLowerCase();
  return (k === "rest" || r.includes("rest") || r.includes("recover")) && s.measure.type === "time";
}
function repMeters(m: CardioMeasure, poolLen: number): number {
  if (m.type === "distance") return m.meters;
  if (m.type === "lap") return (m.laps || 1) * poolLen;
  return 0;
}
function repText(s: CardioStep, poolLen: number): string {
  const m = s.measure;
  if (m.type === "distance") return m.meters >= 1000 ? `${(m.meters / 1000).toFixed(2)} km` : `${m.meters} m`;
  if (m.type === "lap") return `${m.laps || 1} × ${poolLen} m`;
  if (m.type === "time") return fmtClock(m.seconds);
  return "swim";
}
function strokeWord(s: CardioStep): string {
  if (s.label) return s.label;
  const k = (s.kind || "").toLowerCase(), r = (s.role || "").toLowerCase();
  if (k === "warmup") return "Warm up";
  if (k === "cooldown") return "Cool down";
  if (isRest(s)) return "Rest";
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return "Swim";
}

const POOLS: { label: string; m: number }[] = [
  { label: "25 m", m: 25 }, { label: "50 m", m: 50 }, { label: "25 yd", m: 22.86 },
];

/* ================================================================= */
export default function CardioSwim({ routine, onExit }: { routine?: CardioRoutine | null; onExit: () => void }) {
  const structured = !!(routine && (routine.structure?.blocks?.length ?? 0) > 0);
  const structure: CardioStructure | null = structured ? (routine as CardioRoutine).structure : null;
  const steps: SwimStep[] = (() => { if (!structure) return []; const out: SwimStep[] = []; flatten(structure.blocks || [], out, null); return out; })();

  const [phase, setPhase] = useState<"pre" | "live" | "summary">("pre");
  const [poolIdx, setPoolIdx] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [, setTick] = useState(0);
  const [idx, setIdx] = useState(0);
  const [resting, setResting] = useState(false);
  const [laps, setLaps] = useState(0);            // free swim length count
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id?: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const poolLen = POOLS[poolIdx].m;
  const poolRef = useRef(poolLen); poolRef.current = poolLen;
  const runRef = useRef(false);
  const startMsRef = useRef(0);
  const pausedAccRef = useRef(0);
  const pauseAtRef = useRef(0);
  const stepBaseRef = useRef(0);
  const restEndRef = useRef(0);                    // elapsed-sec when current rest ends
  const idxRef = useRef(0);
  const lapCountRef = useRef(0);
  const lastLapElapRef = useRef(0);
  const recRef = useRef<{ distance_m: number; duration_s: number; label: string; rest?: boolean }[]>([]);
  const voiceRef = useRef(true); voiceRef.current = voiceOn;
  const wakeRef = useRef<{ release?: () => void } | null>(null);

  const elapsed = useCallback(() => {
    if (!startMsRef.current) return 0;
    const end = runRef.current ? Date.now() : pauseAtRef.current || Date.now();
    return Math.max(0, (end - startMsRef.current - pausedAccRef.current) / 1000);
  }, []);
  const stepElapsed = useCallback(() => elapsed() - stepBaseRef.current, [elapsed]);

  const totalDist = () => structured ? recRef.current.reduce((a, r) => a + r.distance_m, 0) : lapCountRef.current * poolRef.current;

  /* ---- structured engine ---- */
  const enterStep = useCallback((i: number) => {
    const ls = steps[i];
    if (!ls) return;
    stepBaseRef.current = elapsed();
    if (isRest(ls.step) && ls.step.measure.type === "time") {
      setResting(true);
      restEndRef.current = elapsed() + ls.step.measure.seconds;
      speak(`Rest ${ls.step.measure.seconds} seconds.`, voiceRef.current);
    } else {
      setResting(false);
      speak(`${repText(ls.step, poolRef.current)}. ${strokeWord(ls.step)}.`, voiceRef.current);
    }
  }, [steps, elapsed]);

  const finishRef = useRef<() => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});

  const finish = useCallback(() => {
    runRef.current = false;
    speak("Session complete.", voiceRef.current);
    setPhase("summary");
  }, []);
  finishRef.current = finish;

  const advance = useCallback(() => {
    // record the step we're leaving
    const ls = steps[idxRef.current];
    if (ls) {
      const rest = isRest(ls.step);
      recRef.current.push({ distance_m: rest ? 0 : repMeters(ls.step.measure, poolRef.current), duration_s: Math.round(stepElapsed()), label: strokeWord(ls.step), rest });
    }
    const next = idxRef.current + 1;
    if (next >= steps.length) { finishRef.current(); return; }
    idxRef.current = next; setIdx(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(90); } catch { /* */ } }
    enterStep(next);
  }, [steps, stepElapsed, enterStep]);
  advanceRef.current = advance;

  /* ---- free engine ---- */
  const addLap = useCallback(() => {
    lapCountRef.current += 1; setLaps(lapCountRef.current);
    const t = Math.round(elapsed() - lastLapElapRef.current);
    recRef.current.push({ distance_m: poolRef.current, duration_s: t, label: "Length" });
    lastLapElapRef.current = elapsed();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(60); } catch { /* */ } }
  }, [elapsed]);
  const undoLap = useCallback(() => {
    if (lapCountRef.current <= 0) return;
    lapCountRef.current -= 1; setLaps(lapCountRef.current);
    const last = recRef.current.pop();
    if (last) lastLapElapRef.current = Math.max(0, lastLapElapRef.current - last.duration_s);
  }, []);

  const begin = useCallback(async () => {
    startMsRef.current = Date.now(); pausedAccRef.current = 0; runRef.current = true;
    setPaused(false); setPhase("live");
    try { const wl = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } }).wakeLock?.request("screen"); if (wl) wakeRef.current = wl; } catch { /* */ }
    if (structured) { idxRef.current = 0; setIdx(0); enterStep(0); }
    else { lastLapElapRef.current = 0; speak("Swim started. Tap once each length.", voiceRef.current); }
  }, [structured, enterStep]);

  const togglePause = useCallback(() => {
    if (runRef.current) { runRef.current = false; pauseAtRef.current = Date.now(); setPaused(true); }
    else { pausedAccRef.current += Date.now() - pauseAtRef.current; runRef.current = true; setPaused(false); }
  }, []);

  // tick + rest auto-advance
  useEffect(() => {
    if (phase !== "live") return;
    const iv = setInterval(() => {
      setTick((n) => n + 1);
      if (!runRef.current) return;
      if (structured && resting && elapsed() >= restEndRef.current) advanceRef.current();
    }, 250);
    return () => clearInterval(iv);
  }, [phase, structured, resting, elapsed]);

  useEffect(() => () => { try { wakeRef.current?.release?.(); } catch { /* */ } if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  const doSave = useCallback(async () => {
    setSaving(true); setSaveErr(null);
    try {
      const lapsOut = recRef.current.filter((r) => !r.rest && r.duration_s >= 0).map((r, i) => ({ lap_index: i, distance_m: r.distance_m || null, duration_s: r.duration_s, avg_speed_mps: r.distance_m && r.duration_s ? r.distance_m / r.duration_s : null }));
      const r = await cardioComplete({
        sport: "swimming", name: structured ? (routine as CardioRoutine).name : "Pool swim",
        duration_s: Math.round(elapsed()), distance_m: Math.round(totalDist()), laps: lapsOut,
      });
      if (r.ok) setSaved({ id: r.activity_id }); else setSaveErr(r.error || "Save failed");
    } catch (e) { setSaveErr((e as Error).message); }
    setSaving(false);
  }, [structured, routine, elapsed]);

  const secs = elapsed();
  const dist = totalDist();
  const per100 = dist > 0 ? secs / (dist / 100) : null;

  /* ================= PRE-START ================= */
  if (phase === "pre") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={onExit} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 20, cursor: "pointer" }}>‹</button>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>{structured ? (routine as CardioRoutine).name.toUpperCase() : "POOL SWIM"}</div>
          <button onClick={() => setVoiceOn((v) => !v)} aria-label="Voice" style={{ width: 38, height: 38, borderRadius: 12, background: C.surface2, border: `1px solid ${C.line}`, color: voiceOn ? C.gold : C.faint, fontSize: 16, cursor: "pointer" }}>{voiceOn ? "🔊" : "🔇"}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>POOL LENGTH</div>
          <div style={{ display: "flex", gap: 8 }}>
            {POOLS.map((p, i) => {
              const on = i === poolIdx;
              return (
                <button key={p.label} onClick={() => setPoolIdx(i)}
                  style={{ flex: 1, background: on ? C.surface2 : "transparent", border: `1px solid ${on ? C.ember : C.line}`, borderRadius: 14, padding: "12px 6px", cursor: "pointer", fontSize: 14, fontWeight: 800, color: on ? C.text : C.muted }}>{p.label}</button>
              );
            })}
          </div>
          {structured ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: C.muted, margin: "22px 0 8px" }}>SET · {steps.length} reps · {Math.round(steps.reduce((a, s) => a + (isRest(s.step) ? 0 : repMeters(s.step.measure, poolLen)), 0))} m</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 2px" }}>
                    <div style={{ width: 9, height: 22, borderRadius: 999, background: isRest(s.step) ? C.faint : C.ember, flex: "0 0 auto" }} />
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: C.text }}>{strokeWord(s.step)}{s.round ? <span style={{ color: C.muted, fontWeight: 600 }}> · {s.round.i}/{s.round.of}</span> : null}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{repText(s.step, poolLen)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ marginTop: 22, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>Free swim — leave the phone poolside and tap <b style={{ color: C.text }}>+ Length</b> once each time you finish a length. Distance counts up at {poolLen} m per tap.</div>
          )}
        </div>
        <div style={{ padding: "10px 18px 24px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={begin} style={{ width: "100%", background: C.ember, border: "none", borderRadius: 999, padding: "17px 0", fontSize: 15.5, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,111,78,0.35)" }}>Start swim</button>
        </div>
      </div>
    );
  }

  /* ================= SUMMARY ================= */
  if (phase === "summary") {
    const tot = Math.round(secs);
    const swimLaps = recRef.current.filter((r) => !r.rest);
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "26px 20px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, textAlign: "center" }}>{saved ? "SAVED" : "SESSION COMPLETE"}</div>
          <div style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginTop: 4 }}>{structured ? (routine as CardioRoutine).name : "Pool swim"}</div>
          <div style={{ display: "flex", marginTop: 24 }}>
            {[["DISTANCE", `${Math.round(dist)} m`], ["TIME", fmtClock(tot)], ["AVG /100m", fmtPer100(per100)]].map(([l, v]) => (
              <div key={l} style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 3 }}>{l}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.muted, margin: "22px 0 8px" }}>{structured ? "REPS" : "LENGTHS"}</div>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
            {swimLaps.map((r, i) => {
              const p = r.distance_m > 0 ? r.duration_s / (r.distance_m / 100) : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderTop: i ? `1px solid ${C.surface2}` : "none" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.faint, width: 22 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text2 }}>{r.label} · {Math.round(r.distance_m)} m</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtClock(r.duration_s)}{p ? ` · ${fmtPer100(p)}/100` : ""}</span>
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

  /* ================= LIVE ================= */
  const cur = structured ? steps[idx] : null;
  const restLeft = resting ? Math.max(0, restEndRef.current - secs) : 0;
  const next = structured ? steps[idx + 1] : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.text, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 0", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={togglePause} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 11, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 18, cursor: "pointer" }}>‹</button>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>SWIM · {POOLS[poolIdx].label} POOL</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.text2 }}>{Math.round(dist)} m</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        {structured && resting ? (
          <div style={{ background: "rgba(130,178,135,0.14)", border: `1px solid ${C.green}`, borderRadius: 24, padding: 26, textAlign: "center", marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: C.green }}>REST</div>
            <div style={{ fontSize: 58, fontWeight: 800, color: C.green, marginTop: 4 }}>{fmtClock(restLeft)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{next ? `Up next · ${strokeWord(next.step)} · ${repText(next.step, poolLen)}` : "Last one"}</div>
          </div>
        ) : structured && cur ? (
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, padding: 24, textAlign: "center", marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.muted }}>REP {idx + 1} OF {steps.length}{cur.round ? ` · ${cur.round.i}/${cur.round.of}` : ""}</div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6 }}>{repText(cur.step, poolLen)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ember, marginTop: 2 }}>{strokeWord(cur.step)}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 10 }}>this rep · {fmtClock(stepElapsed())}</div>
            {next ? <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Up next · <span style={{ color: C.text2, fontWeight: 700 }}>{strokeWord(next.step)} · {repText(next.step, poolLen)}</span></div> : <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Last rep</div>}
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: 26 }}>
            <div style={{ fontSize: 74, fontWeight: 800, lineHeight: 1 }}>{laps}</div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: C.faint, marginTop: 2 }}>LENGTHS · {Math.round(dist)} M</div>
          </div>
        )}

        <div style={{ display: "flex", marginTop: 24 }}>
          {[["TIME", fmtClock(secs)], ["DISTANCE", `${Math.round(dist)} m`], ["AVG /100m", fmtPer100(per100)]].map(([l, v]) => (
            <div key={l} style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginTop: 2 }}>{l}</div></div>
          ))}
        </div>

        {!structured ? (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button onClick={undoLap} disabled={laps <= 0} style={{ background: "none", border: "none", color: laps > 0 ? C.muted : C.faint, fontSize: 12, fontWeight: 700, cursor: laps > 0 ? "pointer" : "default" }}>− Undo last length</button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 26px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <button onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} style={{ width: 58, height: 58, borderRadius: 999, background: C.surface2, border: `1px solid ${C.line}`, color: C.text, fontSize: 18, cursor: "pointer", flex: "0 0 auto" }}>{paused ? "▶" : "❚❚"}</button>
        {structured ? (
          <button onClick={() => advanceRef.current()} style={{ flex: 1, background: resting ? C.green : C.ember, border: "none", borderRadius: 999, padding: "18px 0", fontSize: 16, fontWeight: 800, color: resting ? "#14231a" : "#fff", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,111,78,0.3)" }}>{resting ? "Skip rest" : "Done"}</button>
        ) : (
          <button onClick={addLap} style={{ flex: 1, background: C.ember, border: "none", borderRadius: 999, padding: "18px 0", fontSize: 17, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,111,78,0.35)" }}>+ Length</button>
        )}
        <button onClick={() => finishRef.current()} style={{ width: 58, height: 58, borderRadius: 999, background: C.surface2, border: `1px solid ${C.line}`, color: C.text2, fontSize: 11, fontWeight: 800, cursor: "pointer", flex: "0 0 auto" }}>End</button>
      </div>
    </div>
  );
}
