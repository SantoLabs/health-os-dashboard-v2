"use client";

import { useEffect, useState } from "react";
import {
  cardioParse, cardioList, cardioSave, cardioPrescribe, cardioDelete,
  type CardioParsed, type CardioRoutine, type CardioStructure, type CardioStepOrLoop,
  type CardioStep, type CardioMeasure, type CardioTarget, type CardioValidator, type CardioLoop, type CardioProgression, type CardioReminder,
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
type Role = "work" | "recovery" | "steady" | "rest" | "transition";
type UITarget = { metric: Metric; low: string; high: string };
type UIProg = { metric: Metric; step: string };
type UIReminder = { uid: string; type: "fuel" | "hydrate"; sport: "all" | Sport; everyMin: string; note: string };
type UIStep = { uid: string; role: Role; reps: number; sport: Sport; prog?: UIProg | null; meas: MeasKind; dist: string; distUnit: "m" | "km"; time: string; targets: UITarget[]; label: string };
type UILoop = { uid: string; loop: true; repeat: number; label: string; prog?: UIProg | null; steps: MainItem[] };
type MainItem = UIStep | UILoop;
const isLoop = (it: MainItem): it is UILoop => (it as UILoop).loop === true;

function collectSports(warmup: UIStep[], main: MainItem[], cool: UIStep[]): Sport[] {
  const out: Sport[] = [];
  const push = (s: UIStep) => { if (s.role !== "transition") out.push(s.sport); };
  warmup.forEach(push);
  const walk = (items: MainItem[]) => items.forEach((it) => (isLoop(it) ? walk(it.steps) : push(it)));
  walk(main);
  cool.forEach(push);
  return out;
}
function dominantSport(sports: Sport[], fallback: Sport): Sport {
  if (!sports.length) return fallback;
  const c: Record<string, number> = {};
  for (const s of sports) c[s] = (c[s] || 0) + 1;
  let best: Sport = fallback, n = -1;
  for (const [k, v] of Object.entries(c)) if (v > n) { n = v; best = k as Sport; }
  return best;
}

// ---------- main-set tree helpers (one level of nesting) ----------
function patchStep(items: MainItem[], id: string, patch: Partial<UIStep>): MainItem[] {
  return items.map((n): MainItem => isLoop(n) ? { ...n, steps: patchStep(n.steps, id, patch) } : (n.uid === id ? { ...n, ...patch } : n));
}
function patchLoop(items: MainItem[], id: string, patch: Partial<UILoop>): MainItem[] {
  return items.map((n): MainItem => isLoop(n) ? (n.uid === id ? { ...n, ...patch } : { ...n, steps: patchLoop(n.steps, id, patch) }) : n);
}
function removeNode(items: MainItem[], id: string): MainItem[] {
  return items.filter((n) => n.uid !== id).map((n): MainItem => isLoop(n) ? { ...n, steps: removeNode(n.steps, id) } : n);
}
function addToLoop(items: MainItem[], id: string, node: MainItem): MainItem[] {
  return items.map((n): MainItem => isLoop(n) ? (n.uid === id ? { ...n, steps: [...n.steps, node] } : { ...n, steps: addToLoop(n.steps, id, node) }) : n);
}

function blankStep(role: Role = "work", meas: MeasKind = "distance", sport: Sport = "run"): UIStep {
  return { uid: uid(), role, reps: 1, sport, meas, dist: "", distUnit: "m", time: "", targets: [], label: "" };
}

// ---------- (de)serialize UI <-> unified ----------
function stepToUnified(st: UIStep, kind: CardioStep["kind"], sport: Sport, includeRole: boolean): CardioStep {
  let measure: CardioMeasure;
  if (st.meas === "lap") measure = { type: "lap" };
  else if (st.meas === "time" || kind === "rest" || kind === "transition") measure = { type: "time", seconds: Math.max(0, mmssToSec(st.time) || 0) };
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
function progToUnified(p?: UIProg | null): CardioProgression | undefined {
  if (!p || !p.metric) return undefined;
  const step = num(p.step);
  if (step == null || !isFinite(step)) return undefined;
  return { mode: "linear", apply_to: "target", metric: p.metric, step };
}
function progFromUnified(pr: any): UIProg | undefined {
  if (!pr || typeof pr !== "object" || pr.mode === "list") return undefined;
  const metric = String(pr.metric || "");
  if (!["pace", "hr", "power", "cadence", "rpe"].includes(metric)) return undefined;
  return { metric: metric as Metric, step: pr.step != null ? String(pr.step) : "" };
}
function itemToUnified(it: MainItem): CardioStepOrLoop {
  if (isLoop(it)) {
    const steps = it.steps.map((s) => itemToUnified(s));
    const loop: CardioLoop = { block_type: "loop", repeat: Math.max(1, Math.round(it.repeat || 1)), steps };
    if (it.label.trim()) loop.label = it.label.trim();
    const pr = progToUnified(it.prog);
    if (pr) loop.progression = pr;
    return loop;
  }
  const kind = it.role === "rest" ? "rest" : it.role === "transition" ? "transition" : "segment";
  const uStep = stepToUnified(it, kind, it.sport, true);
  if (it.reps > 1 && it.role !== "transition") {
    const loop: CardioLoop = { block_type: "loop", repeat: it.reps, steps: [uStep] };
    const pr = progToUnified(it.prog);
    if (pr) loop.progression = pr;
    return loop;
  }
  return uStep;
}
function remindersToUnified(rs: UIReminder[]): CardioReminder[] {
  return rs.map((r) => {
    const mins = num(r.everyMin);
    const o: CardioReminder = { type: r.type };
    if (mins != null && mins > 0) o.every_s = Math.round(mins * 60);
    if (r.sport !== "all") o.sport = r.sport;
    if (r.note.trim()) o.note = r.note.trim();
    return o;
  }).filter((o) => o.every_s != null);
}
function remindersFromUnified(rs?: CardioReminder[] | null): UIReminder[] {
  return (rs || []).map((r) => ({
    uid: uid(),
    type: (r.type === "hydrate" ? "hydrate" : "fuel") as "fuel" | "hydrate",
    sport: (["run", "bike", "swim"].includes(String(r.sport)) ? (r.sport as Sport) : "all") as "all" | Sport,
    everyMin: r.every_s ? String(Math.round(r.every_s / 60)) : "",
    note: r.note || "",
  })).filter((r) => r.everyMin);
}
function buildStructure(warmup: UIStep[], main: MainItem[], cool: UIStep[], reminders: UIReminder[]): CardioStructure {
  const blocks: CardioStepOrLoop[] = [];
  for (const s of warmup) blocks.push(stepToUnified(s, "warmup", s.sport, false));
  for (const it of main) blocks.push(itemToUnified(it));
  for (const s of cool) blocks.push(stepToUnified(s, "cooldown", s.sport, false));
  const out: CardioStructure = { schema_version: 1, blocks };
  const rem = remindersToUnified(reminders);
  if (rem.length) out.reminders = rem;
  return out;
}
function stepFromUnified(b: CardioStep, sport: Sport): UIStep {
  const m = b.measure || ({ type: "time", seconds: 0 } as CardioMeasure);
  const meas: MeasKind = m.type === "distance" ? "distance" : m.type === "lap" ? "lap" : "time";
  const meters = m.type === "distance" ? m.meters : 0;
  const km = meters >= 1000;
  return {
    uid: uid(),
    role: b.kind === "rest" ? "rest" : b.kind === "transition" ? "transition" : ((b.role as Role) || "work"),
    reps: 1,
    sport: normSport(b.sport || sport),
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
  const isStepU = (b: CardioStepOrLoop): b is CardioStep => (b as CardioStep).block_type === "step";
  const itemFromUnified = (b: CardioStepOrLoop): MainItem => {
    if (isStepU(b)) return stepFromUnified(b, sport);
    const lp = b as { repeat?: number; label?: string; steps?: CardioStepOrLoop[] };
    const inner = (lp.steps || []).map(itemFromUnified);
    const rep = Math.max(1, Math.round(lp.repeat || 1));
    const prog = progFromUnified((b as CardioLoop).progression);
    if (inner.length === 1 && !isLoop(inner[0]) && !(lp.label && lp.label.trim())) return { ...(inner[0] as UIStep), reps: rep, prog };
    return { uid: uid(), loop: true, repeat: rep, label: lp.label || "", prog, steps: inner };
  };
  for (let k = i; k <= j; k++) mid.push(itemFromUnified(blks[k]));
  return { w, mid, c: tail.length ? tail : c, rem: remindersFromUnified(struct?.reminders) };
}
function paceMid(t?: CardioTarget): number | null {
  if (!t || t.metric !== "pace") return null;
  const lo = t.low != null ? Number(t.low) : null, hi = t.high != null ? Number(t.high) : null;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return lo != null ? lo : hi;
}
function estimateTotals(struct: CardioStructure): { d: number; secs: number; complete: boolean } {
  let complete = true;
  const walk = (steps: CardioStepOrLoop[]): { d: number; secs: number } => {
    let d = 0, secs = 0;
    for (const s of steps) {
      if ((s as CardioStep).block_type === "step") {
        const st = s as CardioStep; const m = st.measure;
        if (m.type === "distance") {
          d += m.meters || 0;
          const p = (st.targets || []).map(paceMid).find((x) => x != null) as number | undefined;
          if (p != null && p > 0) secs += (st.sport === "swim" ? (m.meters || 0) / 100 : (m.meters || 0) / 1000) * p;
          else complete = false;
        } else if (m.type === "time") secs += m.seconds || 0;
        else complete = false;
      } else {
        const lp = s as { repeat?: number; steps?: CardioStepOrLoop[] }; const inner = walk(lp.steps || []); const r = Math.max(1, lp.repeat || 1);
        d += r * inner.d; secs += r * inner.secs;
      }
    }
    return { d, secs };
  };
  const r = walk(struct.blocks || []);
  return { d: r.d, secs: Math.round(r.secs), complete };
}
function fmtMin(secs: number): string { return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)} min`; }
const PACE_RANGE: Record<Sport, [number, number]> = { run: [150, 540], bike: [60, 240], swim: [45, 210] };
function genPaceOptions(sp: Sport): string[] {
  const [lo, hi] = PACE_RANGE[sp]; const out: string[] = [];
  for (let x = lo; x <= hi; x += 5) out.push(secToMMSS(x));
  return out;
}

// ---------- component ----------
export default function CardioBuilder({ sportHint = "running", onExit, intent = "workout", startMode = "build" }: { sportHint?: string; onExit?: () => void; intent?: "workout" | "routine"; startMode?: "describe" | "build" }) {
  const [seedSport, setSeedSport] = useState<Sport>(normSport(sportHint));
  const [name, setName] = useState("");
  const [date, setDate] = useState(cdToday());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [validator, setValidator] = useState<CardioValidator | null>(null);
  const [dErr, setDErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [text, setText] = useState("");
  const [showDescribe, setShowDescribe] = useState(startMode === "describe");
  const [warmup, setWarmup] = useState<UIStep[]>([]);
  const [main, setMain] = useState<MainItem[]>(startMode === "describe" ? [] : [blankStep("work", "distance", normSport(sportHint))]);
  const [cool, setCool] = useState<UIStep[]>([]);
  const [reminders, setReminders] = useState<UIReminder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<CardioRoutine[]>([]);

  useEffect(() => { cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [msg]);

  // ---- array helpers ----
  const patchArr = (setter: React.Dispatch<React.SetStateAction<UIStep[]>>, u: string, patch: Partial<UIStep>) =>
    setter((arr) => arr.map((s) => (s.uid === u ? { ...s, ...patch } : s)));

  // ---- describe ----
  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setDErr(null); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const r: CardioParsed = await cardioParse(text.trim(), seedSport);
      if (r.ok && r.structure) {
        const sp2 = r.sport ? normSport(r.sport) : seedSport;
        const { w, mid, c, rem } = loadStructure(r.structure, sp2);
        setSeedSport(sp2); setWarmup(w); setMain(mid); setCool(c); setReminders(rem); setEditingId(null); setName(r.name || "Custom session"); setShowDescribe(false);
      } else setDErr(r.error || "Kai couldn't turn that into a workout — try rephrasing.");
    } catch { setDErr("Something went wrong creating that."); } finally { setBusy(false); }
  }

  // ---- derived ----
  const structure = buildStructure(warmup, main, cool, reminders);
  const est = estimateTotals(structure);
  const hasBlocks = structure.blocks.length > 0;
  const allSports = collectSports(warmup, main, cool);
  const workoutSport = dominantSport(allSports, seedSport);
  const multisport = new Set(allSports).size > 1;

  async function doSave(asCopy?: boolean) {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const updating = !asCopy && !!editingId;
      const nm = (name.trim() || "Custom session") + (asCopy ? " (copy)" : "");
      const r = await cardioSave({ id: updating ? editingId as string : undefined, name: nm, sport: workoutSport, structure });
      if (r.ok) {
        setSavedOk(true);
        if (r.id) setEditingId(r.id);
        setMsg(updating ? "Updated — changes saved to this routine." : "Saved — find it in Saved routines below. Add it to your calendar, or tap Back to finish.");
        if (r.validator) setValidator(r.validator);
      } else setErr(r.error || "Couldn't save.");
    } catch { setErr("Couldn't save."); } finally { setBusy(false); }
  }
  function startNew() {
    setWarmup([]); setMain([blankStep("work", "distance", seedSport)]); setCool([]); setReminders([]);
    setEditingId(null); setName(""); setSavedOk(false); setValidator(null); setMsg(null); setErr(null); setShowDescribe(false);
  }
  async function doPrescribe() {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null);
    try {
      const r = await cardioPrescribe({ sport: workoutSport, date, structure, name: name.trim() });
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
    try { const sp = normSport(rt.sport || seedSport); setSeedSport(sp); const { w, mid, c, rem } = loadStructure(rt.structure, sp); setWarmup(w); setMain(mid); setCool(c); setReminders(rem); setEditingId(rt.id); setName(rt.name); setShowDescribe(false); }
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
  const sportSel = (st: UIStep, onPatch: (p: Partial<UIStep>) => void) => (
    <select value={st.sport} onChange={(e) => { const nsp = e.target.value as Sport; onPatch({ sport: nsp, targets: st.targets.map((t) => (t.metric === "pace" ? { ...t, low: "", high: "" } : t)) }); setSeedSport(nsp); }} title="segment sport" style={{ ...sel, fontWeight: 700, color: "#9db0e0" }}>
      {SPORTS.map((sp) => <option key={sp.id} value={sp.id}>{sp.label}</option>)}
    </select>
  );

  // ---- ladder (per-loop progression) ----
  const ladderRow = (prog: UIProg | null | undefined, onSet: (p: UIProg | null) => void) => {
    if (!prog) return <button onClick={() => onSet({ metric: "pace", step: "" })} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#8a90a6", cursor: "pointer", fontSize: 11, padding: "1px 2px" }}>+ ladder (each lap ±)</button>;
    const unit = prog.metric === "pace" ? "s/lap" : prog.metric === "power" ? "W/lap" : prog.metric === "hr" ? "bpm/lap" : prog.metric === "cadence" ? "rpm/lap" : "/lap";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
        <span className="subtle tiny" style={{ color: "#a274ff", fontWeight: 700 }}>ladder</span>
        <select value={prog.metric} onChange={(e) => onSet({ ...prog, metric: e.target.value as Metric })} style={sel}>
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <input value={prog.step} placeholder="±0" onChange={(e) => onSet({ ...prog, step: e.target.value })} style={{ ...mini, width: 52 }} />
        <span className="subtle tiny">{unit}</span>
        {prog.metric === "pace" ? <span className="subtle tiny">(− faster)</span> : null}
        <button onClick={() => onSet(null)} title="Remove ladder" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 13 }}>×</button>
      </div>
    );
  };

  // ---- step editor (shared) ----
  const stepRow = (st: UIStep, isMain: boolean, onPatch: (p: Partial<UIStep>) => void, onRemove: () => void) => {
    if (isMain && st.role === "transition") {
      return (
        <div key={st.uid} style={{ padding: "7px 8px", borderRadius: 8, background: "rgba(120,140,200,0.12)", border: "1px dashed rgba(120,140,200,0.35)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="subtle tiny" style={{ fontWeight: 700, color: "#9db0e0" }}>⇄ Transition</span>
          <input value={st.time} placeholder="mm:ss" onChange={(e) => onPatch({ time: e.target.value })} style={{ ...mini, width: 64 }} />
          <span className="subtle tiny">mm:ss</span>
          <button onClick={onRemove} title="Remove transition" style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
      );
    }
    const restLike = isMain && st.role === "rest";
    const measKind: MeasKind = restLike ? "time" : st.meas;
    const rowPace = genPaceOptions(st.sport);
    return (
      <div key={st.uid} style={{ padding: "7px 8px", borderRadius: 8, background: roleBg(isMain ? st.role : undefined), display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {isMain ? (
            <select value={st.role} onChange={(e) => onPatch({ role: e.target.value as Role })} style={sel}>
              <option value="work">work</option><option value="recovery">recovery</option><option value="steady">steady</option><option value="rest">rest</option>
            </select>
          ) : null}
          {sportSel(st, onPatch)}
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
          {isMain ? (<span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3 }}><span className="subtle tiny">×</span><input type="number" min={1} value={st.reps} onChange={(e) => onPatch({ reps: Math.max(1, Math.round(num(e.target.value) || 1)) })} title="repeat this step" style={{ ...mini, width: 40, color: st.reps > 1 ? "#a274ff" : "inherit", fontWeight: st.reps > 1 ? 800 : 400 }} /></span>) : null}
          <button onClick={onRemove} title="Remove step" style={{ marginLeft: isMain ? 4 : "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        {/* targets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {st.targets.map((tg, ti) => (
            <div key={ti} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", paddingLeft: 2 }}>
              <select value={tg.metric} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, metric: e.target.value as Metric, low: "", high: "" } : x)) })} style={sel}>
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              {tg.metric === "pace" ? (
                <>
                  <select value={tg.low} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, low: e.target.value } : x)) })} style={{ ...sel, width: 70 }}><option value="">—</option>{rowPace.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                  <span className="subtle tiny">–</span>
                  <select value={tg.high} onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, high: e.target.value } : x)) })} style={{ ...sel, width: 70 }}><option value="">—</option>{rowPace.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </>
              ) : (
                <>
                  <input value={tg.low} placeholder="min" onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, low: e.target.value } : x)) })} style={{ ...mini, width: 56 }} />
                  <span className="subtle tiny">–</span>
                  <input value={tg.high} placeholder="max" onChange={(e) => onPatch({ targets: st.targets.map((x, i) => (i === ti ? { ...x, high: e.target.value } : x)) })} style={{ ...mini, width: 56 }} />
                </>
              )}
              <span className="subtle tiny">{metricUnit(tg.metric, st.sport)}</span>
              <button onClick={() => onPatch({ targets: st.targets.filter((_, i) => i !== ti) })} title="Remove target" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 13 }}>×</button>
            </div>
          ))}
          {st.targets.length < 4 ? (
            <button onClick={() => onPatch({ targets: [...st.targets, { metric: st.targets.some((t) => t.metric === "pace") ? "hr" : "pace", low: "", high: "" }] })} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#8a90a6", cursor: "pointer", fontSize: 11, padding: "1px 2px" }}>+ target / alert</button>
          ) : null}
        </div>
        {isMain && st.reps > 1 ? ladderRow(st.prog, (p) => onPatch({ prog: p })) : null}
      </div>
    );
  };

  const renderItem = (n: MainItem, depth: number): React.ReactNode => {
    if (!isLoop(n)) return stepRow(n, true, (p) => setMain((m) => patchStep(m, n.uid, p)), () => setMain((m) => removeNode(m, n.uid)));
    const nested = depth > 0;
    return (
      <div key={n.uid} style={{ padding: 8, borderRadius: 10, background: nested ? "rgba(162,116,255,0.09)" : "rgba(162,116,255,0.05)", border: "1px solid rgba(162,116,255,0.22)", marginLeft: nested ? 6 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="subtle tiny">repeat</span>
          <input type="number" min={1} value={n.repeat} onChange={(e) => setMain((m) => patchLoop(m, n.uid, { repeat: Math.max(1, Math.round(num(e.target.value) || 1)) }))} style={{ ...mini, width: 46, color: "#a274ff", fontWeight: 800 }} />
          <span className="subtle tiny">×</span>
          <input value={n.label} placeholder={nested ? "sub-set label" : "set label (optional)"} onChange={(e) => setMain((m) => patchLoop(m, n.uid, { label: e.target.value }))} style={{ ...sel, flex: 1, minWidth: 60 }} />
          <button onClick={() => setMain((m) => removeNode(m, n.uid))} title="Remove set" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {n.steps.map((s) => renderItem(s, depth + 1))}
        </div>
        <div style={{ marginTop: 6 }}>{ladderRow(n.prog, (p) => setMain((m) => patchLoop(m, n.uid, { prog: p })))}</div>
        <button onClick={() => setMain((m) => addToLoop(m, n.uid, blankStep("work", "distance", seedSport)))} style={{ ...dashBtn("rgba(162,116,255,0.4)"), marginTop: 6, fontSize: 11, padding: "3px 8px" }}>+ step in set</button>
      </div>
    );
  };

  const totalsLine = !hasBlocks ? "empty" : `Est. ${fmtDist(est.d) || "0 m"}${est.secs ? ` · ~${fmtMin(est.secs)}${est.complete ? "" : "+"}` : ""}${multisport ? " · brick" : ""}`;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{intent === "routine" ? "New cardio routine" : "New cardio workout"}</div>
        <button className="trn-sub" onClick={() => { if (onExit) onExit(); }}>‹ Back</button>
      </div>

      {/* name */}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...field, fontWeight: 700, marginTop: 10 }} />
      <div className="subtle tiny" style={{ marginTop: 6 }}>Pick each segment’s sport below — mix them for a brick.</div>

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
            {dErr ? <div className="subtle tiny" style={{ marginTop: 8, color: "#ff8a8a" }}>{dErr}</div> : null}
          </div>
        )}
      </div>

      {/* WARMUP */}
      <Section title="Warmup">
        {warmup.map((s) => stepRow(s, false, (p) => patchArr(setWarmup, s.uid, p), () => setWarmup((a) => a.filter((x) => x.uid !== s.uid))))}
        <button onClick={() => setWarmup((a) => [...a, blankStep("steady", "time", seedSport)])} style={dashBtn("rgba(255,255,255,0.18)")}>+ warmup step</button>
      </Section>

      {/* MAIN */}
      <Section title="Main set">
        {main.map((it) => renderItem(it, 0))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setMain((a) => [...a, blankStep("work", "distance", seedSport)])} style={dashBtn("rgba(255,255,255,0.18)")}>+ step</button>
          <button onClick={() => setMain((a) => [...a, { uid: uid(), loop: true, repeat: 5, label: "", steps: [blankStep("work", "distance", seedSport), blankStep("recovery", "time", seedSport)] }])} style={dashBtn("rgba(162,116,255,0.5)")}>+ interval set</button>
          <button onClick={() => setMain((a) => [...a, blankStep("transition", "time", seedSport)])} style={dashBtn("rgba(120,140,200,0.55)")}>+ transition</button>
        </div>
      </Section>

      {/* COOLDOWN */}
      <Section title="Cooldown">
        {cool.map((s) => stepRow(s, false, (p) => patchArr(setCool, s.uid, p), () => setCool((a) => a.filter((x) => x.uid !== s.uid))))}
        <button onClick={() => setCool((a) => [...a, blankStep("steady", "time", seedSport)])} style={dashBtn("rgba(255,255,255,0.18)")}>+ cooldown step</button>
      </Section>

      {/* REMINDERS */}
      <Section title="Fueling & hydration">
        <div className="subtle tiny" style={{ marginBottom: 2 }}>In-app cues during the session — not sent to Garmin.{multisport ? " Scope each to a sport." : ""}</div>
        {reminders.map((r) => (
          <div key={r.uid} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 8px", borderRadius: 8, background: "rgba(240,180,80,0.08)", border: "1px solid rgba(240,180,80,0.18)" }}>
            <select value={r.type} onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, type: e.target.value as "fuel" | "hydrate" } : x)))} style={sel}>
              <option value="fuel">Fuel</option><option value="hydrate">Hydrate</option>
            </select>
            {multisport ? (
              <select value={r.sport} onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, sport: e.target.value as ("all" | Sport) } : x)))} title="applies to" style={{ ...sel, color: "#9db0e0" }}>
                <option value="all">All</option><option value="run">Run</option><option value="bike">Bike</option><option value="swim">Swim</option>
              </select>
            ) : null}
            <span className="subtle tiny">every</span>
            <input type="number" min={1} value={r.everyMin} placeholder="20" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, everyMin: e.target.value } : x)))} style={{ ...mini, width: 46 }} />
            <span className="subtle tiny">min</span>
            <input value={r.note} placeholder="note (optional)" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, note: e.target.value } : x)))} style={{ ...sel, flex: 1, minWidth: 80 }} />
            <button onClick={() => setReminders((a) => a.filter((x) => x.uid !== r.uid))} title="Remove" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "fuel", sport: "all", everyMin: "20", note: "" }])} style={dashBtn("rgba(240,180,80,0.5)")}>+ fuel reminder</button>
          <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "hydrate", sport: "all", everyMin: "15", note: "" }])} style={dashBtn("rgba(120,180,240,0.5)")}>+ hydrate reminder</button>
        </div>
      </Section>

      {/* actions */}
      {editingId ? <div className="subtle tiny" style={{ marginTop: 10, color: "#9db0e0" }}>Editing a saved routine — <button onClick={startNew} style={{ background: "none", border: "none", color: "#a274ff", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}>start new</button></div> : null}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="subtle tiny tnum" style={{ marginRight: "auto" }}>{totalsLine}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: "inherit" }} />
        <button onClick={doPrescribe} disabled={busy || !hasBlocks} style={pill("rgba(121,224,168,0.9)")}>Add to calendar</button>
        <button onClick={() => doSave()} disabled={busy || !hasBlocks} className="trn-sub" style={savedOk ? { color: "#79e0a8" } : undefined}>{savedOk ? (editingId ? "Updated ✓" : "Saved ✓") : editingId ? "Update routine" : intent === "routine" ? "Save routine" : "Save workout"}</button>
        {editingId ? <button onClick={() => doSave(true)} disabled={busy || !hasBlocks} className="trn-sub" style={{ fontSize: 11 }}>Save as copy</button> : null}
      </div>
      {msg ? <div className="subtle tiny" style={{ marginTop: 8, color: "#79e0a8" }}>{msg}</div> : null}
      {err ? <div className="subtle tiny" style={{ marginTop: 8, color: "#ff8a8a" }}>{err}</div> : null}
      {validator && validator.valid === false && validator.errors && validator.errors.length ? (
        <div className="subtle tiny" style={{ marginTop: 6, color: "#f0a35e" }}>Saved with auto-fixes: {validator.errors.join("; ")}</div>
      ) : null}
      {savedOk && onExit ? (
        <div style={{ marginTop: 8 }}><button onClick={onExit} style={pill(ACCENT)}>Done</button></div>
      ) : null}
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
