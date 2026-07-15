"use client";

import { useEffect, useRef, useState } from "react";
import {
  cardioParse, cardioList, cardioSave, cardioPrescribe, cardioDelete,
  type CardioParsed, type CardioRoutine, type CardioStructure, type CardioStepOrLoop,
  type CardioStep, type CardioMeasure, type CardioTarget, type CardioValidator, type CardioReminder,
} from "../lib/api";

// ---------- utils ----------
const cdToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
let _uidN = 0;
const uid = () => `s${++_uidN}${Math.random().toString(36).slice(2, 6)}`;
function num(v: string): number | null { const n = parseFloat(v); return isFinite(n) ? n : null; }
function fmtDist(m?: number | null): string { if (!m) return ""; return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km` : `${Math.round(m)} m`; }
function fmtDur(s?: number | null): string { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.round(s % 60); return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`; }
function secToMMSS(s?: number | null): string { if (s == null) return ""; const m = Math.floor(s / 60), ss = Math.round(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; }
function mmssToSec(v: string): number | null {
  const t = v.trim(); if (!t) return null;
  if (t.includes(":")) { const [m, s] = t.split(":"); const mm = parseInt(m || "0", 10), ss = parseInt(s || "0", 10); if (!isFinite(mm) || !isFinite(ss)) return null; return mm * 60 + ss; }
  const n = parseFloat(t); return isFinite(n) ? Math.round(n) : null;
}

type Sport = "run" | "bike" | "swim";
function normSport(h?: string): Sport { const s = (h || "").toLowerCase(); if (s.startsWith("swim") || s.startsWith("pool")) return "swim"; if (s.startsWith("bik") || s.startsWith("cyc") || s.startsWith("rid")) return "bike"; return "run"; }
const paceUnit = (sp: Sport) => (sp === "swim" ? "/100m" : "/km");

type StepType = "warmup" | "active" | "walk" | "recover" | "rest" | "cooldown" | "other";
type DurType = "time" | "distance" | "lap";
type TargetType = "none" | "pace" | "cadence" | "hr" | "power";
type UITarget = { type: TargetType; lo: string; hi: string };
type UIStep = { uid: string; stepType: StepType; durType: DurType; secs: number; dist: string; distUnit: "m" | "km"; target: UITarget };
type UIRepeat = { uid: string; loop: true; reps: number; steps: (UIStep | UIRepeat)[] };
type UIItem = UIStep | UIRepeat;
const isRepeat = (it: UIItem): it is UIRepeat => (it as UIRepeat).loop === true;
function walkMapStep(items: UIItem[], u: string, fn: (s: UIStep) => UIStep): UIItem[] {
  return items.map((it) => isRepeat(it) ? { ...it, steps: walkMapStep(it.steps, u, fn) } : (it.uid === u ? fn(it) : it));
}
function walkRemove(items: UIItem[], u: string): UIItem[] {
  return items.filter((it) => it.uid !== u).map((it) => isRepeat(it) ? { ...it, steps: walkRemove(it.steps, u) } : it).filter((it) => !isRepeat(it) || it.steps.length > 0);
}
function walkFindStep(items: UIItem[], u: string): UIStep | null {
  for (const it of items) { if (!isRepeat(it)) { if (it.uid === u) return it; } else { const f = walkFindStep(it.steps, u); if (f) return f; } } return null;
}
function walkPatchRepeat(items: UIItem[], u: string, patch: Partial<UIRepeat>): UIItem[] {
  return items.map((it) => !isRepeat(it) ? it : (it.uid === u ? { ...it, ...patch } : { ...it, steps: walkPatchRepeat(it.steps, u, patch) }));
}
function walkAddToRepeat(items: UIItem[], repeatUid: string, node: UIItem): UIItem[] {
  return items.map((it) => !isRepeat(it) ? it : (it.uid === repeatUid ? { ...it, steps: [...it.steps, node] } : { ...it, steps: walkAddToRepeat(it.steps, repeatUid, node) }));
}

type UIReminder = { uid: string; type: "fuel" | "hydrate"; everyMin: string; note: string };

const STEP_TYPES: StepType[] = ["warmup", "active", "walk", "recover", "rest", "cooldown", "other"];
function stepTypeLabel(t: StepType, sport: Sport): string {
  if (t === "active") return sport === "run" ? "Run" : sport === "bike" ? "Bike" : "Swim";
  return t === "warmup" ? "Warm Up" : t === "walk" ? "Walk" : t === "recover" ? "Recover" : t === "rest" ? "Rest" : t === "cooldown" ? "Cool Down" : "Other";
}
const stepAccent: Record<StepType, string> = { warmup: "#ff6b6b", active: "#5f9dff", walk: "#4bd0c4", recover: "#8a90a6", rest: "#8a90a6", cooldown: "#5fd08a", other: "#b0b4c0" };

const TARGET_TYPES: { id: TargetType; label: string }[] = [
  { id: "none", label: "No Target" }, { id: "pace", label: "Pace" }, { id: "cadence", label: "Cadence" }, { id: "hr", label: "Custom Heart Rate" }, { id: "power", label: "Custom Power" },
];
const metricUnit = (t: TargetType, sp: Sport) => (t === "pace" ? paceUnit(sp) : t === "cadence" ? (sp === "swim" ? "spm" : sp === "bike" ? "rpm" : "spm") : t === "hr" ? "bpm" : t === "power" ? "W" : "");
const targetMetricName: Record<Exclude<TargetType, "none">, CardioTarget["metric"]> = { pace: "pace", cadence: "cadence", hr: "hr", power: "power" };

const PACE_RANGE: Record<Sport, [number, number]> = { run: [150, 540], bike: [60, 240], swim: [45, 210] };
function genPaceOptions(sp: Sport): string[] { const [lo, hi] = PACE_RANGE[sp]; const out: string[] = []; for (let x = lo; x <= hi; x += 5) out.push(secToMMSS(x)); return out; }

function blankStep(stepType: StepType = "active"): UIStep {
  const durType: DurType = stepType === "active" ? "distance" : "time";
  return { uid: uid(), stepType, durType, secs: stepType === "warmup" || stepType === "cooldown" ? 600 : 120, dist: "", distUnit: "m", target: { type: "none", lo: "", hi: "" } };
}

// ---------- serialize UI <-> unified ----------
function stepTypeToKindRole(t: StepType): { kind: CardioStep["kind"]; role: NonNullable<CardioStep["role"]> } {
  if (t === "warmup") return { kind: "warmup", role: "steady" };
  if (t === "cooldown") return { kind: "cooldown", role: "steady" };
  if (t === "rest") return { kind: "rest", role: "rest" };
  if (t === "recover") return { kind: "segment", role: "recovery" };
  if (t === "walk") return { kind: "segment", role: "steady" };
  if (t === "other") return { kind: "segment", role: "steady" };
  return { kind: "segment", role: "work" };
}
function kindRoleToStepType(kind: string, role: string | null | undefined, label: string | null | undefined): StepType {
  if (kind === "warmup") return "warmup";
  if (kind === "cooldown") return "cooldown";
  if (kind === "rest") return "rest";
  if (role === "work") return "active";
  if (role === "recovery") return "recover";
  if (role === "steady") return (label === "Walk" ? "walk" : label === "Other" ? "other" : "active");
  return "active";
}
function stepToUnified(st: UIStep, sport: Sport): CardioStep {
  const { kind, role } = stepTypeToKindRole(st.stepType);
  let measure: CardioMeasure;
  if (st.durType === "lap") measure = { type: "lap" };
  else if (st.durType === "distance") measure = { type: "distance", meters: Math.max(0, st.distUnit === "km" ? Math.round((num(st.dist) || 0) * 1000) : Math.round(num(st.dist) || 0)) };
  else measure = { type: "time", seconds: Math.max(0, st.secs || 0) };
  const out: CardioStep = { block_type: "step", kind, sport, role, measure };
  if (st.target.type !== "none") {
    const metric = targetMetricName[st.target.type];
    const conv = (v: string) => (st.target.type === "pace" ? mmssToSec(v) : num(v));
    const lo = conv(st.target.lo), hi = conv(st.target.hi);
    const tg: CardioTarget = { metric };
    if (lo != null) tg.low = lo; if (hi != null) tg.high = hi;
    if (lo != null || hi != null) out.targets = [tg];
  }
  if (st.stepType === "walk") out.label = "Walk";
  else if (st.stepType === "other") out.label = "Other";
  return out;
}
function itemToUnified(it: UIItem, sport: Sport): CardioStepOrLoop {
  if (isRepeat(it)) return { block_type: "loop", repeat: Math.max(1, Math.round(it.reps || 1)), steps: it.steps.map((s) => itemToUnified(s, sport)) };
  return stepToUnified(it, sport);
}
function remindersToUnified(rs: UIReminder[]): CardioReminder[] {
  return rs.map((r) => {
    const mins = num(r.everyMin);
    const o: CardioReminder = { type: r.type };
    if (mins != null && mins > 0) o.every_s = Math.round(mins * 60);
    if (r.note.trim()) o.note = r.note.trim();
    return o;
  }).filter((o) => o.every_s != null);
}
function buildStructure(items: UIItem[], sport: Sport, reminders: UIReminder[]): CardioStructure {
  const blocks = items.map((it) => itemToUnified(it, sport));
  const out: CardioStructure = { schema_version: 1, blocks };
  const rem = remindersToUnified(reminders);
  if (rem.length) out.reminders = rem;
  return out;
}
function stepFromUnified(b: CardioStep): UIStep {
  const m = b.measure || ({ type: "time", seconds: 0 } as CardioMeasure);
  const durType: DurType = m.type === "distance" ? "distance" : m.type === "lap" ? "lap" : "time";
  const meters = m.type === "distance" ? m.meters : 0;
  const km = meters >= 1000;
  const tg = (b.targets || [])[0];
  const tt: TargetType = tg ? (["pace", "cadence", "hr", "power"].includes(String(tg.metric)) ? (tg.metric as TargetType) : "none") : "none";
  const back = (v?: number | null) => (v == null ? "" : tt === "pace" ? secToMMSS(v) : String(v));
  return {
    uid: uid(),
    stepType: kindRoleToStepType(b.kind, b.role, b.label),
    durType,
    secs: m.type === "time" ? (m.seconds || 0) : 0,
    dist: m.type === "distance" ? String(km ? +(meters / 1000).toFixed(2) : meters) : "",
    distUnit: km ? "km" : "m",
    target: { type: tt, lo: back(tg?.low), hi: back(tg?.high) },
  };
}
function remindersFromUnified(rs?: CardioReminder[] | null): UIReminder[] {
  return (rs || []).map((r) => ({ uid: uid(), type: (r.type === "hydrate" ? "hydrate" : "fuel") as "fuel" | "hydrate", everyMin: r.every_s ? String(Math.round(r.every_s / 60)) : "", note: r.note || "" })).filter((r) => r.everyMin);
}
function isStepBlock(b: CardioStepOrLoop): b is CardioStep { return (b as CardioStep).block_type === "step"; }
function blockToItem(b: CardioStepOrLoop): UIItem {
  if (isStepBlock(b)) return stepFromUnified(b);
  const lp = b as { repeat?: number; steps?: CardioStepOrLoop[] };
  const rep = Math.max(1, Math.round(lp.repeat || 1));
  const inner = (lp.steps || []).map(blockToItem);
  if (inner.length === 1 && rep === 1 && !isRepeat(inner[0])) return inner[0];
  return { uid: uid(), loop: true, reps: rep, steps: inner.length ? inner : [blankStep("active")] };
}
function loadStructure(struct: CardioStructure | undefined): { items: UIItem[]; rem: UIReminder[] } {
  const blks = (struct?.blocks || []) as CardioStepOrLoop[];
  const items: UIItem[] = blks.map(blockToItem);
  return { items, rem: remindersFromUnified(struct?.reminders) };
}

// ---------- estimate ----------
function paceOf(st: UIStep): number | null {
  if (st.target.type !== "pace") return null;
  const lo = mmssToSec(st.target.lo), hi = mmssToSec(st.target.hi);
  if (lo != null && hi != null) return (lo + hi) / 2;
  return lo != null ? lo : hi;
}
function estimateTotals(items: UIItem[], sport: Sport): { secs: number; meters: number; complete: boolean } {
  let secs = 0, meters = 0, complete = true;
  const one = (st: UIStep, mult: number) => {
    if (st.durType === "time") { secs += (st.secs || 0) * mult; }
    else if (st.durType === "distance") {
      const mtr = (st.distUnit === "km" ? (num(st.dist) || 0) * 1000 : (num(st.dist) || 0)) * mult;
      meters += mtr;
      const p = paceOf(st);
      if (p != null && p > 0) secs += (sport === "swim" ? mtr / 100 : mtr / 1000) * p; else complete = false;
    } else complete = false;
  };
  const walk = (nodes: UIItem[], mult: number) => {
    for (const it of nodes) {
      if (isRepeat(it)) walk(it.steps, mult * Math.max(1, it.reps || 1));
      else one(it, mult);
    }
  };
  walk(items, 1);
  return { secs: Math.round(secs), meters, complete };
}

// ---------- duration wheel picker ----------
const IH = 38;
function WheelCol({ max, value, onChange, pad2 }: { max: number; value: number; onChange: (n: number) => void; pad2?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = value * IH; /* eslint-disable-next-line */ }, []);
  const onScroll = () => { const el = ref.current; if (!el) return; const i = Math.round(el.scrollTop / IH); if (i >= 0 && i <= max && i !== value) onChange(i); };
  const nums: number[] = []; for (let n = 0; n <= max; n++) nums.push(n);
  return (
    <div ref={ref} onScroll={onScroll} style={{ height: IH * 5, width: 64, overflowY: "scroll", scrollSnapType: "y mandatory", textAlign: "center", position: "relative" }}>
      <div style={{ height: IH * 2 }} />
      {nums.map((n) => (
        <div key={n} style={{ height: IH, lineHeight: `${IH}px`, scrollSnapAlign: "center", fontSize: 22, fontWeight: n === value ? 800 : 400, color: n === value ? "#e6e9f2" : "#5c6070", fontVariantNumeric: "tabular-nums" }}>{pad2 ? String(n).padStart(2, "0") : n}</div>
      ))}
      <div style={{ height: IH * 2 }} />
    </div>
  );
}
function DurationWheel({ initial, onCancel, onOk }: { initial: number; onCancel: () => void; onOk: (secs: number) => void }) {
  const [h, setH] = useState(Math.floor(initial / 3600));
  const [m, setM] = useState(Math.floor((initial % 3600) / 60));
  const [s, setS] = useState(initial % 60);
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1b1d24", borderRadius: 16, padding: "18px 18px 12px", width: 300, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Set Duration (h:m:s)</div>
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", gap: 2 }}>
          <div style={{ position: "absolute", left: 12, right: 12, top: IH * 2, height: IH, borderTop: "1px solid rgba(255,255,255,0.14)", borderBottom: "1px solid rgba(255,255,255,0.14)", pointerEvents: "none" }} />
          <WheelCol max={23} value={h} onChange={setH} pad2 />
          <span style={{ fontSize: 20, color: "#5c6070" }}>:</span>
          <WheelCol max={59} value={m} onChange={setM} pad2 />
          <span style={{ fontSize: 20, color: "#5c6070" }}>:</span>
          <WheelCol max={59} value={s} onChange={setS} pad2 />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 10 }}>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#8a90a6", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "6px 8px" }}>CANCEL</button>
          <button onClick={() => onOk(h * 3600 + m * 60 + s)} style={{ background: "none", border: "none", color: "#a274ff", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "6px 8px" }}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ---------- component ----------
export default function CardioBuilder({ sportHint = "running", onExit, intent = "workout", startMode = "build" }: { sportHint?: string; onExit?: () => void; intent?: "workout" | "routine"; startMode?: "describe" | "build" }) {
  const [view, setView] = useState<"pick" | "build" | "step">("pick");
  const [sport, setSport] = useState<Sport>(normSport(sportHint));
  const [items, setItems] = useState<UIItem[]>([]);
  const [editUid, setEditUid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(cdToday());
  const [reminders, setReminders] = useState<UIReminder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dErr, setDErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [validator, setValidator] = useState<CardioValidator | null>(null);
  const [text, setText] = useState("");
  const [showDescribe, setShowDescribe] = useState(false);
  const [wheelUid, setWheelUid] = useState<string | null>(null);
  const [routines, setRoutines] = useState<CardioRoutine[]>([]);

  useEffect(() => { cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [msg]);

  // ---- item helpers ----
  const mapStep = (u: string, fn: (s: UIStep) => UIStep) => setItems((arr) => walkMapStep(arr, u, fn));
  const removeItem = (u: string) => setItems((arr) => walkRemove(arr, u));
  const patchRepeat = (u: string, patch: Partial<UIRepeat>) => setItems((arr) => walkPatchRepeat(arr, u, patch));
  const addToRepeat = (repeatUid: string, node: UIItem) => setItems((arr) => walkAddToRepeat(arr, repeatUid, node));
  const findStep = (u: string): UIStep | null => walkFindStep(items, u);

  function pickSport(sp: Sport) {
    setSport(sp);
    if (startMode === "describe") { setItems([]); setShowDescribe(true); }
    else setItems([blankStep("active")]);
    setView("build");
  }

  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setDErr(null); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const r: CardioParsed = await cardioParse(text.trim(), sport);
      if (r.ok && r.structure) {
        const { items: its, rem } = loadStructure(r.structure);
        setItems(its.length ? its : [blankStep("active")]); setReminders(rem); setEditingId(null);
        if (r.name) setName(r.name); setShowDescribe(false);
      } else setDErr(r.error || "Kai couldn't turn that into a workout — try rephrasing.");
    } catch { setDErr("Something went wrong creating that."); } finally { setBusy(false); }
  }

  const structure = buildStructure(items, sport, reminders);
  const est = estimateTotals(items, sport);
  const hasBlocks = items.length > 0;

  async function doSave(asCopy?: boolean) {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const updating = !asCopy && !!editingId;
      const nm = (name.trim() || "Custom session") + (asCopy ? " (copy)" : "");
      const r = await cardioSave({ id: updating ? editingId as string : undefined, name: nm, sport, structure });
      if (r.ok) {
        setSavedOk(true);
        if (r.id) setEditingId(r.id);
        setMsg(updating ? "Updated — changes saved to this routine." : "Saved — find it in Saved routines below, or tap Back to finish.");
        if (r.validator) setValidator(r.validator);
      } else setErr(r.error || "Couldn't save.");
    } catch { setErr("Couldn't save."); } finally { setBusy(false); }
  }
  function startNew() { setItems([blankStep("active")]); setReminders([]); setEditingId(null); setName(""); setSavedOk(false); setValidator(null); setMsg(null); setErr(null); setShowDescribe(false); }
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
    try { const sp = normSport(rt.sport || sport); setSport(sp); const { items: its, rem } = loadStructure(rt.structure); setItems(its.length ? its : [blankStep("active")]); setReminders(rem); setEditingId(rt.id); setName(rt.name); setShowDescribe(false); setView("build"); }
    finally { setBusy(false); }
  }
  async function delRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true);
    try { await cardioDelete(rt.id); setRoutines((r) => r.filter((x) => x.id !== rt.id)); } finally { setBusy(false); }
  }

  // ---- styles ----
  const field: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", resize: "vertical" };
  const mini: React.CSSProperties = { width: 58, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" };
  const sel: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" };
  const pill = (bg: string): React.CSSProperties => ({ padding: "9px 13px", borderRadius: 9, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
  const dashBtn = (c: string): React.CSSProperties => ({ background: "none", border: `1px dashed ${c}`, color: c, cursor: "pointer", fontSize: 12, borderRadius: 8, padding: "8px 12px", fontWeight: 600 });
  const ACCENT = "linear-gradient(135deg,#5f7dff,#a274ff)";
  const rowLabel: React.CSSProperties = { fontSize: 13, color: "#8a90a6", fontWeight: 600 };

  // ---------- PICK VIEW ----------
  if (view === "pick") {
    const active: { sp: Sport; label: string; icon: string }[] = [{ sp: "run", label: "Run", icon: "🏃" }, { sp: "bike", label: "Bike", icon: "🚴" }, { sp: "swim", label: "Pool Swim", icon: "🏊" }];
    const soon = [{ label: "Multisport", icon: "🔗" }, { label: "Yoga", icon: "🧘" }, { label: "HIIT", icon: "⚡" }];
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Create a Workout</div>
          <button className="trn-sub" onClick={() => { if (onExit) onExit(); }}>‹ Back</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {active.map((a) => (
            <button key={a.sp} onClick={() => pickSport(a.sp)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 20 }}>{a.icon}</span><span style={{ fontSize: 14, fontWeight: 700 }}>{a.label}</span>
            </button>
          ))}
          <div className="eyebrow" style={{ marginTop: 6 }}>Coming soon</div>
          {soon.map((a) => (
            <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", color: "#5c6070" }}>
              <span style={{ fontSize: 20, opacity: 0.5 }}>{a.icon}</span><span style={{ fontSize: 14, fontWeight: 600 }}>{a.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: "2px 7px", borderRadius: 999, background: "rgba(240,136,62,0.16)", color: "#f0a35e" }}>SOON</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- STEP DETAIL VIEW ----------
  const editStep = editUid ? findStep(editUid) : null;
  if (view === "step" && editStep && editUid) {
    const st = editStep;
    const paceOpts = genPaceOptions(sport);
    const set = (patch: Partial<UIStep>) => mapStep(editUid, (s) => ({ ...s, ...patch }));
    const setTarget = (patch: Partial<UITarget>) => mapStep(editUid, (s) => ({ ...s, target: { ...s.target, ...patch } }));
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button className="trn-sub" onClick={() => setView("build")}>‹ {stepTypeLabel(st.stepType, sport)}</button>
          <button onClick={() => { removeItem(editUid); setView("build"); }} className="trn-sub" style={{ color: "#ff8a8a" }}>REMOVE</button>
        </div>

        <div className="eyebrow" style={{ marginTop: 14 }}>Step info</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={rowLabel}>Step Type</span>
          <select value={st.stepType} onChange={(e) => set({ stepType: e.target.value as StepType })} style={{ ...sel, minWidth: 140 }}>
            {STEP_TYPES.map((t) => <option key={t} value={t}>{stepTypeLabel(t, sport)}</option>)}
          </select>
        </label>

        <div className="eyebrow" style={{ marginTop: 16 }}>Duration</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={rowLabel}>Duration Type</span>
          <select value={st.durType} onChange={(e) => set({ durType: e.target.value as DurType })} style={{ ...sel, minWidth: 140 }}>
            <option value="time">Time</option><option value="distance">Distance</option><option value="lap">Lap Button Press</option>
          </select>
        </label>
        {st.durType === "time" ? (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <span style={rowLabel}>Duration</span>
            <button onClick={() => setWheelUid(editUid)} style={{ ...sel, minWidth: 100, textAlign: "center", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{fmtDur(st.secs) || "0:00"}</button>
          </label>
        ) : null}
        {st.durType === "distance" ? (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
            <span style={rowLabel}>Distance</span>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <input type="number" min={0} value={st.dist} placeholder="0" onChange={(e) => set({ dist: e.target.value })} style={{ ...mini, width: 80 }} />
              <select value={st.distUnit} onChange={(e) => set({ distUnit: e.target.value as "m" | "km" })} style={sel}><option value="m">m</option><option value="km">km</option></select>
            </span>
          </label>
        ) : null}
        {st.durType === "lap" ? <div className="subtle tiny" style={{ marginTop: 10 }}>Ends when you press the lap button.</div> : null}

        <div className="eyebrow" style={{ marginTop: 16 }}>Intensity target</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={rowLabel}>Target Type</span>
          <select value={st.target.type} onChange={(e) => setTarget({ type: e.target.value as TargetType, lo: "", hi: "" })} style={{ ...sel, minWidth: 160 }}>
            {TARGET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            <option value="__hrz" disabled>HR Zone (needs thresholds)</option>
            <option value="__pwz" disabled>Power Zone (needs thresholds)</option>
          </select>
        </label>
        {st.target.type !== "none" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {st.target.type === "pace" ? (
              <>
                <select value={st.target.lo} onChange={(e) => setTarget({ lo: e.target.value })} style={{ ...sel, width: 84 }}><option value="">—</option>{paceOpts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                <span className="subtle tiny">–</span>
                <select value={st.target.hi} onChange={(e) => setTarget({ hi: e.target.value })} style={{ ...sel, width: 84 }}><option value="">—</option>{paceOpts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </>
            ) : (
              <>
                <input value={st.target.lo} placeholder="min" onChange={(e) => setTarget({ lo: e.target.value })} style={{ ...mini, width: 68 }} />
                <span className="subtle tiny">–</span>
                <input value={st.target.hi} placeholder="max" onChange={(e) => setTarget({ hi: e.target.value })} style={{ ...mini, width: 68 }} />
              </>
            )}
            <span className="subtle tiny">{metricUnit(st.target.type, sport)}</span>
          </div>
        ) : null}
        <div className="subtle tiny" style={{ marginTop: 12, opacity: 0.7 }}>Zone targets unlock once your thresholds are computed.</div>

        {wheelUid === editUid ? <DurationWheel initial={st.secs || 0} onCancel={() => setWheelUid(null)} onOk={(secs) => { set({ secs }); setWheelUid(null); }} /> : null}
      </div>
    );
  }

  // ---------- BUILD VIEW ----------
  const totalTime = est.secs ? fmtDur(est.secs) : "—";
  const totalDist = est.meters ? fmtDist(est.meters) : "—";

  const stepRow = (st: UIStep, insideRepeat: boolean) => {
    const tgt = st.target.type === "none" ? "" : st.target.type === "pace" ? `${st.target.lo || "?"}–${st.target.hi || "?"}${paceUnit(sport)}` : `${TARGET_TYPES.find((t) => t.id === st.target.type)?.label}`;
    const dur = st.durType === "lap" ? "Lap" : st.durType === "time" ? fmtDur(st.secs) : (st.dist ? `${st.dist} ${st.distUnit}` : "—");
    return (
      <div key={st.uid} onClick={() => { setEditUid(st.uid); setView("step"); }} style={{ display: "flex", alignItems: "stretch", gap: 0, borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", overflow: "hidden", marginLeft: insideRepeat ? 10 : 0 }}>
        <div style={{ width: 4, background: stepAccent[st.stepType], flex: "0 0 auto" }} />
        <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{stepTypeLabel(st.stepType, sport)}</div>
          <div className="subtle tiny tnum" style={{ marginTop: 2 }}>{dur}{tgt ? ` · ${tgt}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", paddingRight: 12, color: "#5c6070", fontSize: 18 }}>›</div>
      </div>
    );
  };

  const renderNode = (it: UIItem, depth: number): JSX.Element => {
    if (!isRepeat(it)) return stepRow(it, depth > 0);
    return (
      <div key={it.uid} style={{ borderRadius: 10, border: "1px solid rgba(162,116,255,0.28)", background: "rgba(162,116,255,0.05)", padding: 8, marginLeft: depth > 0 ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <select value={it.reps} onChange={(e) => patchRepeat(it.uid, { reps: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...sel, width: 62, color: "#a274ff", fontWeight: 800 }}>{Array.from({ length: Math.max(20, it.reps) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#a274ff" }}>Times{depth > 0 ? " \u00b7 nested" : ""}</span>
          <button onClick={() => removeItem(it.uid)} title="Remove repeat" style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{it.steps.map((child) => renderNode(child, depth + 1))}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button onClick={() => addToRepeat(it.uid, blankStep("active"))} style={{ ...dashBtn("rgba(162,116,255,0.4)"), fontSize: 11, padding: "5px 10px" }}>+ step</button>
          {depth < 1 ? <button onClick={() => addToRepeat(it.uid, { uid: uid(), loop: true, reps: 4, steps: [blankStep("active")] })} style={{ ...dashBtn("rgba(162,116,255,0.4)"), fontSize: 11, padding: "5px 10px" }}>+ nested repeat</button> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button className="trn-sub" onClick={() => setView("pick")}>‹ {sport === "run" ? "Run" : sport === "bike" ? "Bike" : "Pool Swim"} Workout</button>
        <button onClick={() => doSave()} disabled={busy || !hasBlocks} className="trn-sub" style={savedOk ? { color: "#79e0a8" } : { color: "#a274ff" }}>{savedOk ? (editingId ? "UPDATED ✓" : "SAVED ✓") : editingId ? "UPDATE" : "SAVE"}</button>
      </div>

      {/* totals */}
      <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
        <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{totalTime}{est.secs && !est.complete ? "+" : ""}</div><div className="subtle tiny">Total Time</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{totalDist}</div><div className="subtle tiny">Est Distance</div></div>
      </div>

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...field, fontWeight: 700, marginTop: 12 }} />

      {/* describe */}
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

      {/* steps */}
      <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>Steps</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => renderNode(it, 0))}
      </div>

      {/* add step / repeat */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setItems((a) => [...a, blankStep("active")])} style={{ ...pill("rgba(95,125,255,0.9)"), flex: 1, padding: 11 }}>+ Add Step</button>
        <button onClick={() => setItems((a) => [...a, { uid: uid(), loop: true, reps: 6, steps: [blankStep("active"), blankStep("recover")] }])} style={{ ...pill("rgba(162,116,255,0.9)"), flex: 1, padding: 11 }}>⟳ Add Repeat</button>
      </div>

      {/* reminders */}
      <div className="eyebrow" style={{ marginTop: 16, marginBottom: 6 }}>Fueling & hydration</div>
      <div className="subtle tiny" style={{ marginBottom: 6 }}>In-app cues during the session — not sent to Garmin.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {reminders.map((r) => (
          <div key={r.uid} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 8px", borderRadius: 8, background: "rgba(240,180,80,0.08)", border: "1px solid rgba(240,180,80,0.18)" }}>
            <select value={r.type} onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, type: e.target.value as "fuel" | "hydrate" } : x)))} style={sel}>
              <option value="fuel">Fuel</option><option value="hydrate">Hydrate</option>
            </select>
            <span className="subtle tiny">every</span>
            <input type="number" min={1} value={r.everyMin} placeholder="20" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, everyMin: e.target.value } : x)))} style={{ ...mini, width: 52 }} />
            <span className="subtle tiny">min</span>
            <input value={r.note} placeholder="note (optional)" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, note: e.target.value } : x)))} style={{ ...sel, flex: 1, minWidth: 80 }} />
            <button onClick={() => setReminders((a) => a.filter((x) => x.uid !== r.uid))} title="Remove" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "fuel", everyMin: "20", note: "" }])} style={dashBtn("rgba(240,180,80,0.5)")}>+ fuel reminder</button>
        <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "hydrate", everyMin: "15", note: "" }])} style={dashBtn("rgba(120,180,240,0.5)")}>+ hydrate reminder</button>
      </div>

      {/* actions */}
      {editingId ? <div className="subtle tiny" style={{ marginTop: 12, color: "#9db0e0" }}>Editing a saved routine — <button onClick={startNew} style={{ background: "none", border: "none", color: "#a274ff", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}>start new</button></div> : null}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: "inherit", marginRight: "auto" }} />
        <button onClick={doPrescribe} disabled={busy || !hasBlocks} style={pill("rgba(121,224,168,0.9)")}>Add to calendar</button>
        {editingId ? <button onClick={() => doSave(true)} disabled={busy || !hasBlocks} className="trn-sub" style={{ fontSize: 11 }}>Save as copy</button> : null}
      </div>
      {msg ? <div className="subtle tiny" style={{ marginTop: 8, color: "#79e0a8" }}>{msg}</div> : null}
      {err ? <div className="subtle tiny" style={{ marginTop: 8, color: "#ff8a8a" }}>{err}</div> : null}
      {validator && validator.valid === false && validator.errors && validator.errors.length ? (
        <div className="subtle tiny" style={{ marginTop: 6, color: "#f0a35e" }}>Saved with auto-fixes: {validator.errors.join("; ")}</div>
      ) : null}
      {savedOk && onExit ? <div style={{ marginTop: 8 }}><button onClick={onExit} style={pill(ACCENT)}>Done</button></div> : null}
      <div style={{ marginTop: 10 }}>
        <button disabled title="Garmin push is coming soon" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#6b7080", fontSize: 12, fontWeight: 600, cursor: "not-allowed" }}>
          Push to Garmin
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: "1px 6px", borderRadius: 999, background: "rgba(240,136,62,0.16)", color: "#f0a35e" }}>SOON</span>
        </button>
      </div>

      {/* saved routines */}
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
