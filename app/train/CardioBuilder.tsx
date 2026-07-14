"use client";

import { useEffect, useState } from "react";
import {
  cardioParse, cardioList, cardioSave, cardioPrescribe, cardioDelete,
  type CardioParsed, type CardioRoutine, type CardioStructure, type CardioStepOrLoop,
  type CardioStep, type CardioMeasure, type CardioTarget, type CardioValidator,
} from "../lib/api";

// ---------- small utils ----------
const cdToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
let _uidN = 0;
const uid = () => `s${++_uidN}${Math.random().toString(36).slice(2, 6)}`;
function num(v: string): number | null { const n = parseFloat(v); return isFinite(n) ? n : null; }
function fmtDist(m?: number | null): string { if (!m) return ""; return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km` : `${Math.round(m)} m`; }
function fmtDur(s?: number | null): string { if (!s) return ""; const m = Math.floor(s / 60), ss = Math.round(s % 60); return m ? `${m}:${String(ss).padStart(2, "0")}` : `${ss}s`; }
function secToMMSS(s?: number | null): string { if (s == null) return ""; const m = Math.floor(s / 60), ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; }
function mmssToSec(v: string): number | null {
  const t = v.trim(); if (!t) return null;
  if (t.includes(":")) { const [m, s] = t.split(":"); const mm = parseInt(m || "0", 10), ss = parseInt(s || "0", 10); if (!isFinite(mm) || !isFinite(ss)) return null; return mm * 60 + ss; }
  const n = parseFloat(t); return isFinite(n) ? Math.round(n) : null;
}

type Sport = "run" | "bike" | "swim";
function normSport(h?: string): Sport { const s = (h || "").toLowerCase(); if (s.startsWith("swim")) return "swim"; if (s.startsWith("bik") || s.startsWith("cyc") || s.startsWith("rid")) return "bike"; return "run"; }
const SPORTS: { id: Sport; label: string }[] = [{ id: "run", label: "Run" }, { id: "bike", label: "Bike" }, { id: "swim", label: "Swim" }];
const paceUnit = (sp: Sport) => (sp === "swim" ? "/100m" : "/km");

type Metric = "pace" | "hr" | "power" | "cadence" | "rpe";
const METRICS: { id: Metric; label: string }[] = [
  { id: "pace", label: "Pace" }, { id: "hr", label: "HR" }, { id: "power", label: "Power" }, { id: "cadence", label: "Cadence" }, { id: "rpe", label: "RPE" },
];
const metricUnit = (m: Metric, sp: Sport) => (m === "pace" ? paceUnit(sp) : m === "hr" ? "bpm" : m === "power" ? "W" : m === "cadence" ? "rpm" : "/10");
function targetInToNum(metric: Metric, raw: string): number | null { return metric === "pace" ? mmssToSec(raw) : num(raw); }
function targetNumToIn(metric: Metric, val?: number | null): string { if (val == null) return ""; return metric === "pace" ? secToMMSS(val) : String(val); }

type MeasKind = "distance" | "time" | "lap";
type Role = "work" | "recovery" | "steady" | "rest";
type UITarget = { metric: Metric; low: string; high: string };
type UIStep = { uid: string; role: Role; meas: MeasKind; dist: string; distUnit: "m" | "km"; time: string; targets: UITarget[]; label: string };
type UILoop = { uid: string; loop: true; repeat: number; label: string; steps: UIStep[] };
type MainItem = UIStep | UILoop;
const isLoop = (it: MainItem): it is UILoop => (it as UILoop).loop === true;

function blankStep(role: Role = "work", meas: MeasKind = "distance"): UIStep {
  return { uid: uid(), role, meas, dist: "", distUnit: "m", time: "", targets: [], label: "" };
}

// ---------- (de)serialize UI <-> unified ----------
function stepToUnified(st: UIStep, kind: CardioStep["kind"], sport: Sport, includeRole: boolean): CardioStep {
  let measure: CardioMeasure;
  if (st.meas === "lap") measure = { type: "lap" };
  else if (st.meas === "time" || kind === "rest") measure = { type: "time", seconds: Math.max(0, mmssToSec(st.time) || 0) };
  else measure = { type: "distance", meters: Math.max(0, st.distUnit === "km" ? Math.round((num(st.dist) || 0) * 1000) : Math.round(num(st.dist) || 0)) };
  const out: CardioStep = { block_type: "step", kind, sport, measure };
  if (includeRole) out.role = st.role;
  const targets: CardioTarget[] = st.targets.map((t) => {
    const low = targetInToNum(t.metric, t.low); const high = targetInToNum(t.metric, t.high);
    const o: CardioTarget = { metric: t.metric };
    if (low != null) o.low = low; if (high != null) o.high = high;
    return o;
  }).filter((t) => t.low != null || t.high != null);
  if (targets.length) out.targets = targets;
  if (st.label.trim()) out.label = st.label.trim();
  return out;
}
function buildStructure(sport: Sport, warmup: UIStep[], main: MainItem[], cool: UIStep[]): CardioStructure {
  const blocks: CardioStepOrLoop[] = [];
  for (const s of warmup) blocks.push(stepToUnified(s, "warmup", sport, false));
  for (const it of main) {
    if (isLoop(it)) {
      const steps = it.steps.map((s) => stepToUnified(s, s.role === "rest" ? "rest" : "segment", sport, true));
      const loop: CardioStepOrLoop = { block_type: "loop", repeat: Math.max(1, Math.round(it.repeat || 1)), steps };
      if (it.label.trim()) (loop as { label?: string }).label = it.label.trim();
      blocks.push(loop);
    } else {
      blocks.push(stepToUnified(it, it.role === "rest" ? "rest" : "segment", sport, true));
    }
  }
  for (const s of cool) blocks.push(stepToUnified(s, "cooldown", sport, false));
  return { schema_version: 1, blocks };
}
function stepFromUnified(b: CardioStep, sport: Sport): UIStep {
  const m = b.measure || ({ type: "time", seconds: 0 } as CardioMeasure);
  const meas: MeasKind = m.type === "distance" ? "distance" : m.type === "lap" ? "lap" : "time";
  const meters = m.type === "distance" ? m.meters : 0;
  const km = meters >= 1000;
  return {
    uid: uid(),
    role: b.kind === "rest" ? "rest" : ((b.role as Role) || "work"),
    meas,
    dist: m.type === "distance" ? String(km ? +(meters / 1000).toFixed(2) : meters) : "",
    distUnit: km ? "km" : "m",
    time: m.type === "time" ? secToMMSS(m.seconds) : "",
    targets: (b.targets || []).map((t) => ({ metric: (t.metric as Metric) || "pace", low: targetNumToIn(t.metric as Metric, t.low), high: targetNumToIn(t.metric as Metric, t.high) })),
    label: b.label || "",
  };
}
function loadStructure(struct: CardioStructure | undefined, sport: Sport) {
  const blks = (struct?.blocks || []) as CardioStepOrLoop[];
  const w: UIStep[] = [], mid: MainItem[] = [], c: UIStep[] = [];
  let i = 0;
  const isStep = (b: CardioStepOrLoop): b is CardioStep => (b as CardioStep).block_type === "step";
  while (i < blks.length && isStep(blks[i]) && (blks[i] as CardioStep).kind === "warmup") { w.push(stepFromUnified(blks[i] as CardioStep, sport)); i++; }
  let j = blks.length - 1; const tail: UIStep[] = [];
  while (j >= i && isStep(blks[j]) && (blks[j] as CardioStep).kind === "cooldown") { tail.unshift(stepFromUnified(blks[j] as CardioStep, sport)); j--; }
  for (let k = i; k <= j; k++) {
    const b = blks[k];
    if (!isStep(b)) { const lp = b as { repeat?: number; label?: string; steps?: CardioStep[] }; mid.push({ uid: uid(), loop: true, repeat: lp.repeat || 1, label: lp.label || "", steps: (lp.steps || []).filter((s) => (s as CardioStep).block_type === "step").map((s) => stepFromUnified(s as CardioStep, sport)) }); }
    else mid.push(stepFromUnified(b as CardioStep, sport));
  }
  return { w, mid, c: tail.length ? tail : c };
}
function clientTotals(struct: CardioStructure): { d: number; t: number } {
  const sum = (steps: CardioStepOrLoop[]): { d: number; t: number } => {
    let d = 0, t = 0;
    for (const s of steps) {
      if ((s as CardioStep).block_type === "step") { const m = (s as CardioStep).measure; if (m.type === "distance") d += m.meters || 0; else if (m.type === "time") t += m.seconds || 0; }
      else { const lp = s as { repeat?: number; steps?: CardioStepOrLoop[] }; const inner = sum(lp.steps || []); const r = Math.max(1, lp.repeat || 1); d += r * inner.d; t += r * inner.t; }
    }
    return { d, t };
  };
  return sum(struct.blocks || []);
}

// ---------- component ----------
export default function CardioBuilder({ sportHint = "running", onExit, intent = "workout", startMode = "build" }: { sportHint?: string; onExit?: () => void; intent?: "workout" | "routine"; startMode?: "describe" | "build" }) {
  const [sport, setSport] = useState<Sport>(normSport(sportHint));
  const [name, setName] = useState("");
  const [date, setDate] = useState(cdToday());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [validator, setValidator] = useState<CardioValidator | null>(null);
  const [text, setText] = useState("");
  const [showDescribe, setShowDescribe] = useState(startMode === "describe");
  const [warmup, setWarmup] = useState<UIStep[]>([]);
  const [main, setMain] = useState<MainItem[]>(startMode === "describe" ? [] : [blankStep("work", "distance")]);
  const [cool, setCool] = useState<UIStep[]>([]);
  const [routines, setRoutines] = useState<CardioRoutine[]>([]);

  useEffect(() => { cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [msg]);

  // ---- array helpers ----
  const patchArr = (setter: React.Dispatch<React.SetStateAction<UIStep[]>>, u: string, patch: Partial<UIStep>) =>
    setter((arr) => arr.map((s) => (s.uid === u ? { ...s, ...patch } : s)));
  const patchMain = (u: string, patch: Partial<UIStep>) =>
    setMain((arr) => arr.map((it) => (!isLoop(it) && it.uid === u ? { ...it, ...patch } : it)));
  const patchLoopStep = (lu: string, su: string, patch: Partial<UIStep>) =>
    setMain((arr) => arr.map((it) => (isLoop(it) && it.uid === lu ? { ...it, steps: it.steps.map((s) => (s.uid === su ? { ...s, ...patch } : s)) } : it)));

  // ---- describe ----
  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null); setMsg(null); setValidator(null);
    try {
      const r: CardioParsed = await cardioParse(text.trim(), sport);
      if (r.ok && r.structure) {
        if (r.sport) setSport(normSport(r.sport));
        const { w, mid, c } = loadStructure(r.structure, r.sport ? normSport(r.sport) : sport);
        setWarmup(w); setMain(mid); setCool(c); setName(r.name || "Custom session"); setShowDescribe(false);
      } else setErr(r.error || "Kai couldn't turn that into a workout — try rephrasing.");
    } catch { setErr("Something went wrong creating that."); } finally { setBusy(false); }
  }

  // ---- save / prescribe ----
  const structure = buildStructure(sport, warmup, main, cool);
  const totals = clientTotals(structure);
  const hasBlocks = structure.blocks.length > 0;

  async function doSave() {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null);
    try {
      const r = await cardioSave({ name: name.trim() || "Custom session", sport, structure });
      if (r.ok) { setMsg(intent === "routine" ? "Routine saved." : "Saved to your workouts."); if (r.validator) setValidator(r.validator); }
      else setErr(r.error || "Couldn't save.");
    } catch { setErr("Couldn't save."); } finally { setBusy(false); }
  }
  async function doPrescribe() {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null);
    try {
      const r = await cardioPrescribe({ sport, date, structure, name: name.trim() });
      if (r.ok) setMsg(`Added to your calendar on ${date} — it'll auto-complete when the activity uploads.`);
      else setErr(r.error || "Couldn't add.");
    } catch { setErr("Couldn't add."); } finally { setBusy(false); }
  }
  async function addRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ routine_id: rt.id, date }); if (r.ok) setMsg(`${rt.name} added on ${date}.`); } finally { setBusy(false); }
  }
  async function loadRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true); setErr(null); setMsg(null);
    try { const sp = normSport(rt.sport || sport); setSport(sp); const { w, mid, c } = loadStructure(rt.structure, sp); setWarmup(w); setMain(mid); setCool(c); setName(rt.name); setShowDescribe(false); }
    finally { setBusy(false); }
  }
  async function delRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true);
    try { await cardioDelete(rt.id); setRoutines((r) => r.filter((x) => x.id !== rt.id)); } finally { setBusy(false); }
  }

  // ---- styles ----
  const field: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", resize: "vertical" };
  const mini: React.CSSProperties = { width: 58, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 6px", fontSize: 12, fontFamily: "inherit" };
  const sel: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 6px", fontSize: 12, fontFamily: "inherit" };
  const pill = (bg: string): React.CSSProperties => ({ padding: "9px 13px", borderRadius: 9, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
  const ACCENT = "linear-gradient(135deg,#5f7dff,#a274ff)";
  const roleBg = (r?: Role) => (r === "work" ? "rgba(255,138,138,0.13)" : r === "recovery" || r === "rest" ? "rgba(121,224,168,0.11)" : "rgba(255,255,255,0.05)");
  const dashBtn = (c: string): React.CSSProperties => ({ background: "none", border: `1px dashed ${c}`, color: c, cursor: "pointer", fontSize: 12, borderRadius: 8, padding: "5px 10px", fontWeight: 600 });

  // ---- step editor (shared) ----
  const stepRow = (st: UIStep, isMain: boolean, onPatch: (p: Partial<UIStep>) => void, onRemove: () => void) => {
    const restLike = isMain && st.role === "rest";
    const measKind: MeasKind = restLike ? "time" : st.meas;
    return (
      <div key={st.uid} style={{ padding: "7px 8px", borderRadius: 8, background: roleBg(isMain ? st.role : undefined), display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {isMain ? (
            <select value={st.role} onChange={(e) => onPatch({ role: e.target.value as Role })} style={sel}>
              <option value="work">work</option><option value="recovery">recovery</option><option value="steady">steady</option><option value="rest">rest</option>
            </select>
          ) : null}
          {!restLike ? (
            <select value={measKind} onChange={(e) => onPatch({ meas: e.target.value as MeasKind })} style={sel}>
              <option value="distance">distance</option><option value="time">time</option><option value="lap">lap</option>
            </select>
          ) : <span className="subtle tiny">rest</span>}
          {measKind === "distance" ? (
            <>
              <input type="number" min={0} value={st.dist} placeholder="0" onChange={(e) => onPatch({ dist: e.target.value })} style={mini} />
              <select value={st.distUnit} onChange={(e) => onPatch({ distUnit: e.target.value as "m" | "km" })} style={sel}><option value="m">m</option><option value="km">km</option></select>
            </>
          ) : null}
          {measKind === "time" ? (
            <><input value={st.time} placeholder="mm:ss" onChange={(e) => onPatch({ time: e.target.value })} style={{ ...mini, width: 64 }} /><span className="subtle tiny">mm:ss</span></>
          ) : null}
          {measKind === "lap" ? <span className="subtle tiny">until lap pressed</span> : null}
          <button onClick={onRemove} title="Remove step" style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        {/* targets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {st.targets.map((tg, ti) => (
            <div key={ti} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
              <select value={tg.metric} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, metric: e.target.value as Metric } : x)) })} style={sel}>
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <input value={tg.low} placeholder={tg.metric === "pace" ? "mm:ss" : "min"} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, low: e.target.value } : x)) })} style={{ ...mini, width: 56 }} />
              <span className="subtle tiny">–</span>
              <input value={tg.high} placeholder={tg.metric === "pace" ? "mm:ss" : "max"} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, high: e.target.value } : x)) })} style={{ ...mini, width: 56 }} />
              <span className="subtle tiny">{metricUnit(tg.metric, sport)}</span>
              <button onClick={() => onPatch({ targets: st.targets.filter((_, i) => i !== ti) })} title="Remove target" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 13 }}>×</button>
            </div>
          ))}
          {st.targets.length < 4 ? (
            <button onClick={() => onPatch({ targets: [...st.targets, { metric: st.targets.some((t) => t.metric === "pace") ? "hr" : "pace", low: "", high: "" }] })} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#8a90a6", cursor: "pointer", fontSize: 11, padding: "1px 2px" }}>+ target / alert</button>
          ) : null}
        </div>
      </div>
    );
  };

  const totalsLine = (fmtDist(totals.d) && fmtDur(totals.t)) ? `${fmtDist(totals.d)} · ${fmtDur(totals.t)}` : (fmtDist(totals.d) || fmtDur(totals.t) || "empty");

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{intent === "routine" ? "New cardio routine" : "New cardio workout"}</div>
        <button className="trn-sub" onClick={() => { if (onExit) onExit(); }}>‹ Back</button>
      </div>

      {/* sport + name */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {SPORTS.map((s) => (
          <button key={s.id} onClick={() => setSport(s.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#fff", background: sport === s.id ? ACCENT : "rgba(255,255,255,0.05)" }}>{s.label}</button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...field, fontWeight: 700, marginTop: 8 }} />

      {/* describe (collapsible) */}
      <div style={{ marginTop: 8 }}>
        {!showDescribe ? (
          <button onClick={() => setShowDescribe(true)} style={dashBtn("rgba(162,116,255,0.5)")}>✎ Describe it · Kai</button>
        ) : (
          <div style={{ padding: 10, borderRadius: 10, background: "rgba(162,116,255,0.06)", border: "1px solid rgba(162,116,255,0.2)" }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. 10 min warmup, then 1 km hard + 2 min easy jog ×5, 10 min cooldown" style={field} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={doParse} disabled={busy || !text.trim()} style={pill(ACCENT)}>{busy ? "Reading…" : "Build with Kai"}</button>
              <button onClick={() => setShowDescribe(false)} className="trn-sub">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {err ? <div className="subtle tiny" style={{ marginTop: 10, color: "#ff8a8a" }}>{err}</div> : null}
      {msg ? <div className="subtle tiny" style={{ marginTop: 10, color: "#79e0a8" }}>{msg}</div> : null}
      {validator && validator.valid === false && validator.errors && validator.errors.length ? (
        <div className="subtle tiny" style={{ marginTop: 6, color: "#f0a35e" }}>Saved with auto-fixes: {validator.errors.join("; ")}</div>
      ) : null}

      {/* WARMUP */}
      <Section title="Warmup">
        {warmup.map((s) => stepRow(s, false, (p) => patchArr(setWarmup, s.uid, p), () => setWarmup((a) => a.filter((x) => x.uid !== s.uid))))}
        <button onClick={() => setWarmup((a) => [...a, blankStep("steady", "time")])} style={dashBtn("rgba(255,255,255,0.18)")}>+ warmup step</button>
      </Section>

      {/* MAIN */}
      <Section title="Main set">
        {main.map((it) => isLoop(it) ? (
          <div key={it.uid} style={{ padding: 8, borderRadius: 10, background: "rgba(162,116,255,0.05)", border: "1px solid rgba(162,116,255,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span className="subtle tiny">repeat</span>
              <input type="number" min={1} value={it.repeat} onChange={(e) => setMain((arr) => arr.map((x) => (x.uid === it.uid && isLoop(x) ? { ...x, repeat: Math.max(1, Math.round(num(e.target.value) || 1)) } : x)))} style={{ ...mini, width: 46, color: "#a274ff", fontWeight: 800 }} />
              <span className="subtle tiny">×</span>
              <input value={it.label} placeholder="set label (optional)" onChange={(e) => setMain((arr) => arr.map((x) => (x.uid === it.uid && isLoop(x) ? { ...x, label: e.target.value } : x)))} style={{ ...sel, flex: 1, minWidth: 60 }} />
              <button onClick={() => setMain((arr) => arr.filter((x) => x.uid !== it.uid))} title="Remove set" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {it.steps.map((s) => stepRow(s, true, (p) => patchLoopStep(it.uid, s.uid, p), () => setMain((arr) => arr.map((x) => (x.uid === it.uid && isLoop(x) ? { ...x, steps: x.steps.filter((y) => y.uid !== s.uid) } : x)))))}
            </div>
            <button onClick={() => setMain((arr) => arr.map((x) => (x.uid === it.uid && isLoop(x) ? { ...x, steps: [...x.steps, blankStep("work", "distance")] } : x)))} style={{ ...dashBtn("rgba(162,116,255,0.4)"), marginTop: 6, fontSize: 11, padding: "3px 8px" }}>+ step in set</button>
          </div>
        ) : (
          stepRow(it, true, (p) => patchMain(it.uid, p), () => setMain((a) => a.filter((x) => x.uid !== it.uid)))
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMain((a) => [...a, blankStep("work", "distance")])} style={dashBtn("rgba(255,255,255,0.18)")}>+ step</button>
          <button onClick={() => setMain((a) => [...a, { uid: uid(), loop: true, repeat: 5, label: "", steps: [blankStep("work", "distance"), blankStep("recovery", "time")] }])} style={dashBtn("rgba(162,116,255,0.5)")}>+ interval set</button>
        </div>
      </Section>

      {/* COOLDOWN */}
      <Section title="Cooldown">
        {cool.map((s) => stepRow(s, false, (p) => patchArr(setCool, s.uid, p), () => setCool((a) => a.filter((x) => x.uid !== s.uid))))}
        <button onClick={() => setCool((a) => [...a, blankStep("steady", "time")])} style={dashBtn("rgba(255,255,255,0.18)")}>+ cooldown step</button>
      </Section>

      {/* actions */}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="subtle tiny tnum" style={{ marginRight: "auto" }}>{totalsLine}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: "inherit" }} />
        <button onClick={doPrescribe} disabled={busy || !hasBlocks} style={pill("rgba(121,224,168,0.9)")}>Add to calendar</button>
        <button onClick={doSave} disabled={busy || !hasBlocks} className="trn-sub">{intent === "routine" ? "Save routine" : "Save workout"}</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button disabled title="Garmin push is coming soon" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#6b7080", fontSize: 12, fontWeight: 600, cursor: "not-allowed" }}>
          Push to Garmin
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: "1px 6px", borderRadius: 999, background: "rgba(240,136,62,0.16)", color: "#f0a35e" }}>SOON</span>
        </button>
      </div>

      {/* saved */}
      {routines.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Saved routines</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routines.map((rt) => (
              <div key={rt.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => loadRoutine(rt)}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{rt.name}{rt.sport ? <span className="subtle tiny"> · {rt.sport}</span> : null}</div>
                  <div className="subtle tiny tnum">{fmtDist(rt.total_distance_m)}{rt.total_distance_m && rt.total_duration_s ? " · " : ""}{fmtDur(rt.total_duration_s)}{rt.source === "kai" ? " · from Kai" : ""}</div>
                </div>
                <button className="trn-sub" disabled={busy} onClick={() => addRoutine(rt)}>Add</button>
                <button title="Delete" disabled={busy} onClick={() => delRoutine(rt)} style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}
