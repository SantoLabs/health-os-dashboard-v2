"use client";

import { useEffect, useRef, useState } from "react";
import {
  cardioParse, cardioList, cardioSave, cardioPrescribe, cardioDelete, cardioActivities,
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
const sportName = (sp: Sport) => (sp === "run" ? "Run" : sp === "bike" ? "Bike" : "Swim");
const sportIcon = (sp: Sport) => (sp === "run" ? "🏃" : sp === "bike" ? "🚴" : "🏊");

type StepType = "warmup" | "active" | "walk" | "recover" | "rest" | "cooldown" | "other";
type DurType = "time" | "distance" | "lap";
type TargetType = "none" | "pace" | "cadence" | "hr" | "power" | "rpe";
type Stroke = "" | "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "im" | "choice" | "drill";
type Equipment = "" | "kickboard" | "pull_buoy" | "paddles" | "fins" | "snorkel";
type UITarget = { type: TargetType; lo: string; hi: string; speed?: boolean };
type UIStep = { uid: string; stepType: StepType; durType: DurType; secs: number; dist: string; distUnit: "m" | "km"; target: UITarget; target2: UITarget; stroke: Stroke; equipment: Equipment; drill: string };
type ProgApply = "measure" | "target";
type UIProg = { on: boolean; apply_to: ProgApply; metric: string; mode: "list" | "linear"; step: string; values: string[] };
type UIRepeat = { uid: string; loop: true; reps: number; steps: (UIStep | UIRepeat)[]; skipLast: boolean; prog?: UIProg };
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
function cloneItem(it: UIItem): UIItem {
  if (isRepeat(it)) return { ...it, uid: uid(), steps: it.steps.map(cloneItem), prog: it.prog ? { ...it.prog, values: [...it.prog.values] } : undefined };
  return { ...it, uid: uid(), target: { ...it.target }, target2: { ...it.target2 } };
}
function walkMove(items: UIItem[], u: string, dir: -1 | 1): UIItem[] {
  const idx = items.findIndex((it) => it.uid === u);
  if (idx >= 0) { const j = idx + dir; if (j < 0 || j >= items.length) return items; const c = items.slice(); const [m] = c.splice(idx, 1); c.splice(j, 0, m); return c; }
  return items.map((it) => isRepeat(it) ? { ...it, steps: walkMove(it.steps, u, dir) } : it);
}
function walkDuplicate(items: UIItem[], u: string): UIItem[] {
  const idx = items.findIndex((it) => it.uid === u);
  if (idx >= 0) { const c = items.slice(); c.splice(idx + 1, 0, cloneItem(items[idx])); return c; }
  return items.map((it) => isRepeat(it) ? { ...it, steps: walkDuplicate(it.steps, u) } : it);
}
function walkPatchProg(items: UIItem[], u: string, patch: Partial<UIProg>): UIItem[] {
  return items.map((it) => {
    if (!isRepeat(it)) return it;
    if (it.uid === u) { const base: UIProg = it.prog || { on: false, apply_to: "measure", metric: "distance", mode: "list", step: "", values: [] }; return { ...it, prog: { ...base, ...patch } }; }
    return { ...it, steps: walkPatchProg(it.steps, u, patch) };
  });
}
type ProgDim = { apply_to: ProgApply; metric: string; label: string };
function progKind(apply_to: ProgApply, metric: string): "pace" | "sec" | "num" | "dist" {
  if (apply_to === "measure") return metric === "distance" ? "dist" : "sec";
  return metric === "pace" ? "pace" : "num";
}
function progParse(kind: string, v: string): number | null {
  if (kind === "pace" || kind === "sec") return mmssToSec(v);
  return num(v);
}
function progFmt(kind: string, n: number): string {
  return (kind === "pace" || kind === "sec") ? secToMMSS(n) : String(n);
}
function progUnit(kind: string, sport: Sport): string {
  if (kind === "dist") return "m";
  if (kind === "sec") return "min:s";
  if (kind === "pace") return sport === "swim" ? "/100m" : "/km";
  return "";
}
function progDimsForStep(st: UIStep): ProgDim[] {
  const dims: ProgDim[] = [];
  if (st.durType === "distance") dims.push({ apply_to: "measure", metric: "distance", label: "Distance" });
  else if (st.durType === "time") dims.push({ apply_to: "measure", metric: "time", label: "Time" });
  for (const t of [st.target, st.target2]) {
    if (t.type === "none") continue;
    dims.push({ apply_to: "target", metric: targetMetricName[t.type], label: TARGET_TYPES.find((o) => o.id === t.type)?.label || String(t.type) });
  }
  return dims;
}
function progBase(st: UIStep, apply_to: ProgApply, metric: string): number {
  if (apply_to === "measure") return metric === "distance" ? (st.distUnit === "km" ? (num(st.dist) || 0) * 1000 : (num(st.dist) || 0)) : (st.secs || 0);
  const kind = metric === "pace" ? "pace" : "num";
  for (const t of [st.target, st.target2]) {
    if (t.type !== "none" && targetMetricName[t.type] === metric) { const lo = progParse(kind, t.lo); if (lo != null) return lo; const hi = progParse(kind, t.hi); if (hi != null) return hi; }
  }
  return 0;
}
function progLadder(prog: UIProg, reps: number, base: number): number[] {
  const n = Math.max(1, reps); const kind = progKind(prog.apply_to, prog.metric); const out: number[] = [];
  if (prog.mode === "list") {
    const vals = prog.values.map((v) => progParse(kind, v)).filter((x): x is number => x != null);
    for (let i = 0; i < n; i++) out.push(vals[i] != null ? vals[i] : (vals.length ? vals[vals.length - 1] : base));
  } else {
    const step = progParse(kind, prog.step) || 0;
    for (let i = 0; i < n; i++) out.push(Math.max(0, base + i * step));
  }
  return out;
}
function firstStepOf(it: UIRepeat): UIStep | null { const s = it.steps[0]; return s && !isRepeat(s) ? s : null; }
function ladderPreview(vals: number[], kind: string, sport: Sport): string {
  if (!vals.length) return "";
  const show = (n: number) => (kind === "pace" || kind === "sec") ? secToMMSS(n) : String(Math.round(n));
  const parts = vals.length <= 6 ? vals.map(show) : [show(vals[0]), "…", show(vals[vals.length - 1])];
  return `${parts.join(" → ")} ${progUnit(kind, sport)}`.trim();
}

type UIReminder = { uid: string; type: "fuel" | "hydrate"; everyMin: string; note: string; sport: "all" | Sport };

const STEP_TYPES: StepType[] = ["warmup", "active", "walk", "recover", "rest", "cooldown", "other"];
function stepTypeLabel(t: StepType, sport: Sport): string {
  if (t === "active") return sportName(sport);
  return t === "warmup" ? "Warm Up" : t === "walk" ? "Walk" : t === "recover" ? "Recover" : t === "rest" ? "Rest" : t === "cooldown" ? "Cool Down" : "Other";
}
const stepAccent: Record<StepType, string> = { warmup: "#ff6b6b", active: "#5f9dff", walk: "#4bd0c4", recover: "#8a90a6", rest: "#8a90a6", cooldown: "#5fd08a", other: "#b0b4c0" };

const TARGET_TYPES: { id: TargetType; label: string }[] = [
  { id: "none", label: "No Target" }, { id: "pace", label: "Pace" }, { id: "cadence", label: "Cadence" }, { id: "hr", label: "Custom Heart Rate" }, { id: "power", label: "Custom Power" }, { id: "rpe", label: "Effort (RPE)" },
];
const metricUnit = (t: TargetType, sp: Sport) => (t === "pace" ? paceUnit(sp) : t === "cadence" ? (sp === "bike" ? "rpm" : "spm") : t === "hr" ? "bpm" : t === "power" ? "W" : t === "rpe" ? "/10" : "");
const targetMetricName: Record<Exclude<TargetType, "none">, CardioTarget["metric"]> = { pace: "pace", cadence: "cadence", hr: "hr", power: "power", rpe: "rpe" };
const STROKE_OPTS: { id: Stroke; label: string }[] = [ { id: "", label: "—" }, { id: "freestyle", label: "Freestyle" }, { id: "backstroke", label: "Backstroke" }, { id: "breaststroke", label: "Breaststroke" }, { id: "butterfly", label: "Butterfly" }, { id: "im", label: "IM" }, { id: "choice", label: "Choice" }, { id: "drill", label: "Drill" } ];
const EQUIP_OPTS: { id: Equipment; label: string }[] = [ { id: "", label: "None" }, { id: "kickboard", label: "Kickboard" }, { id: "pull_buoy", label: "Pull buoy" }, { id: "paddles", label: "Paddles" }, { id: "fins", label: "Fins" }, { id: "snorkel", label: "Snorkel" } ];
const POOL_OPTS: { label: string; m: number; unit: "m" | "yd" }[] = [ { label: "25 m", m: 25, unit: "m" }, { label: "50 m", m: 50, unit: "m" }, { label: "25 yd", m: 22.86, unit: "yd" } ];

const PACE_RANGE: Record<Sport, [number, number]> = { run: [150, 540], bike: [60, 240], swim: [45, 210] };
function genPaceOptions(sp: Sport): string[] { const [lo, hi] = PACE_RANGE[sp]; const out: string[] = []; for (let x = lo; x <= hi; x += 5) out.push(secToMMSS(x)); return out; }
function speedFromPace(mmss: string): string { const sec = mmssToSec(mmss); return sec && sec > 0 ? String(Math.round(3600 / sec)) : ""; }
function paceFromSpeed(kmh: string): string { const k = num(kmh); return k && k > 0 ? secToMMSS(Math.round(3600 / k)) : ""; }
function uiTargetFromUnified(tg?: CardioTarget): UITarget {
  if (!tg) return { type: "none", lo: "", hi: "", speed: false };
  const tt: TargetType = ["pace", "cadence", "hr", "power", "rpe"].includes(String(tg.metric)) ? (tg.metric as TargetType) : "none";
  const back = (v?: number | null) => (v == null ? "" : tt === "pace" ? secToMMSS(v) : String(v));
  return { type: tt, lo: back(tg.low), hi: back(tg.high), speed: false };
}
function describeTarget(t: UITarget, sport: Sport): string {
  if (t.type === "none") return "";
  if (t.type === "pace") {
    if (sport === "bike" && t.speed) return `${speedFromPace(t.lo) || "?"}–${speedFromPace(t.hi) || "?"} km/h`;
    return `${t.lo || "?"}–${t.hi || "?"}${paceUnit(sport)}`;
  }
  if (t.type === "rpe") return `RPE ${t.lo || "?"}–${t.hi || "?"}`;
  return `${t.lo || "?"}–${t.hi || "?"} ${metricUnit(t.type, sport)}`;
}
function readPool(struct: CardioStructure | undefined): { m: number; unit: "m" | "yd" } {
  const anyS = struct as unknown as { pool_length_m?: number; pool_unit?: string };
  if (anyS?.pool_length_m && isFinite(Number(anyS.pool_length_m))) return { m: Number(anyS.pool_length_m), unit: anyS.pool_unit === "yd" ? "yd" : "m" };
  return { m: 25, unit: "m" };
}

function blankStep(stepType: StepType = "active"): UIStep {
  const durType: DurType = stepType === "active" ? "distance" : "time";
  return { uid: uid(), stepType, durType, secs: stepType === "warmup" || stepType === "cooldown" ? 600 : 120, dist: "", distUnit: "m", target: { type: "none", lo: "", hi: "", speed: false }, target2: { type: "none", lo: "", hi: "", speed: false }, stroke: "", equipment: "", drill: "" };
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
  const targets: CardioTarget[] = [];
  for (const t of (st.target.type === "none" ? [] : [st.target, st.target2])) {
    if (t.type === "none") continue;
    const metric = targetMetricName[t.type];
    const conv = (v: string) => (t.type === "pace" ? mmssToSec(v) : num(v));
    const lo = conv(t.lo), hi = conv(t.hi);
    const tg: CardioTarget = { metric };
    if (lo != null) tg.low = lo; if (hi != null) tg.high = hi;
    if (lo != null || hi != null) targets.push(tg);
  }
  if (targets.length) out.targets = targets.slice(0, 4);
  if (st.stepType === "walk") out.label = "Walk";
  else if (st.stepType === "other") out.label = "Other";
  if (sport === "swim") {
    if (st.stroke) (out as unknown as { stroke?: string }).stroke = st.stroke;
    if (st.equipment) (out as unknown as { equipment?: string }).equipment = st.equipment;
    if (st.stroke === "drill" && st.drill.trim()) out.notes = st.drill.trim().slice(0, 120);
  }
  return out;
}
function itemToUnified(it: UIItem, sport: Sport): CardioStepOrLoop {
  if (isRepeat(it)) {
    const reps = Math.max(1, Math.round(it.reps || 1));
    const loop: Record<string, unknown> = { block_type: "loop", repeat: reps, steps: it.steps.map((s) => itemToUnified(s, sport)) };
    if (it.skipLast) loop.skip_last_recovery = true;
    if (it.prog && it.prog.on) {
      const kind = progKind(it.prog.apply_to, it.prog.metric);
      const pr: Record<string, unknown> = { mode: it.prog.mode, apply_to: it.prog.apply_to, metric: it.prog.metric };
      if (it.prog.mode === "list") { const vals = it.prog.values.slice(0, reps).map((v) => progParse(kind, v)).filter((x): x is number => x != null); if (vals.length) { pr.values = vals; loop.progression = pr; } }
      else { const step = progParse(kind, it.prog.step); if (step != null) { pr.step = step; loop.progression = pr; } }
    }
    return loop as unknown as CardioStepOrLoop;
  }
  return stepToUnified(it, sport);
}
function remindersToUnified(rs: UIReminder[]): CardioReminder[] {
  return rs.map((r) => {
    const mins = num(r.everyMin);
    const o: CardioReminder = { type: r.type };
    if (mins != null && mins > 0) o.every_s = Math.round(mins * 60);
    if (r.note.trim()) o.note = r.note.trim();
    if (r.sport && r.sport !== "all") o.sport = r.sport;
    return o;
  }).filter((o) => o.every_s != null);
}
function buildStructure(items: UIItem[], sport: Sport, reminders: UIReminder[], pool?: { m: number; unit: "m" | "yd" }): CardioStructure {
  const blocks = items.map((it) => itemToUnified(it, sport));
  const out: CardioStructure = { schema_version: 1, blocks };
  const rem = remindersToUnified(reminders);
  if (rem.length) out.reminders = rem;
  if (sport === "swim" && pool) { const o = out as unknown as { pool_length_m?: number; pool_unit?: string }; o.pool_length_m = pool.m; o.pool_unit = pool.unit; }
  return out;
}
function stepFromUnified(b: CardioStep): UIStep {
  const m = b.measure || ({ type: "time", seconds: 0 } as CardioMeasure);
  const durType: DurType = m.type === "distance" ? "distance" : m.type === "lap" ? "lap" : "time";
  const meters = m.type === "distance" ? m.meters : 0;
  const km = meters >= 1000;
  const anyB = b as unknown as { stroke?: string; equipment?: string; sport?: string };
  const isSwim = String(anyB.sport || "") === "swim";
  const stroke: Stroke = isSwim && STROKE_OPTS.some((o) => o.id === anyB.stroke) ? (anyB.stroke as Stroke) : "";
  const equipment: Equipment = isSwim && EQUIP_OPTS.some((o) => o.id === anyB.equipment) ? (anyB.equipment as Equipment) : "";
  const drill = stroke === "drill" ? String(b.notes || "").slice(0, 120) : "";
  return {
    uid: uid(),
    stepType: kindRoleToStepType(b.kind, b.role, b.label),
    durType,
    secs: m.type === "time" ? (m.seconds || 0) : 0,
    dist: m.type === "distance" ? String(km ? +(meters / 1000).toFixed(2) : meters) : "",
    distUnit: km ? "km" : "m",
    target: uiTargetFromUnified((b.targets || [])[0]),
    target2: uiTargetFromUnified((b.targets || [])[1]),
    stroke, equipment, drill,
  };
}
function remindersFromUnified(rs?: CardioReminder[] | null): UIReminder[] {
  return (rs || []).map((r) => ({ uid: uid(), type: (r.type === "hydrate" ? "hydrate" : "fuel") as "fuel" | "hydrate", everyMin: r.every_s ? String(Math.round(r.every_s / 60)) : "", note: r.note || "", sport: (r.sport && ["run", "bike", "swim"].includes(String(r.sport)) ? normSport(String(r.sport)) : "all") as "all" | Sport })).filter((r) => r.everyMin);
}
function isStepBlock(b: CardioStepOrLoop): b is CardioStep { return (b as CardioStep).block_type === "step"; }
function blockToItem(b: CardioStepOrLoop): UIItem {
  if (isStepBlock(b)) return stepFromUnified(b);
  const lp = b as { repeat?: number; steps?: CardioStepOrLoop[]; skip_last_recovery?: boolean; progression?: { mode?: string; apply_to?: string; metric?: string; step?: number; values?: number[] } };
  const rep = Math.max(1, Math.round(lp.repeat || 1));
  const inner = (lp.steps || []).map(blockToItem);
  if (inner.length === 1 && rep === 1 && !isRepeat(inner[0])) return inner[0];
  let prog: UIProg | undefined;
  const pgr = lp.progression;
  if (pgr && (pgr.apply_to === "measure" || pgr.apply_to === "target") && pgr.metric) {
    const apply_to = pgr.apply_to as ProgApply; const metric = String(pgr.metric); const kind = progKind(apply_to, metric);
    prog = { on: true, apply_to, metric, mode: pgr.mode === "linear" ? "linear" : "list", step: pgr.step != null ? progFmt(kind, Number(pgr.step)) : "", values: Array.isArray(pgr.values) ? pgr.values.map((v) => progFmt(kind, Number(v))) : [] };
  }
  return { uid: uid(), loop: true, reps: rep, steps: inner.length ? inner : [blankStep("active")], skipLast: lp.skip_last_recovery === true, prog };
}
function loadStructure(struct: CardioStructure | undefined): { items: UIItem[]; rem: UIReminder[] } {
  const blks = (struct?.blocks || []) as CardioStepOrLoop[];
  const items: UIItem[] = blks.map(blockToItem);
  return { items, rem: remindersFromUnified(struct?.reminders) };
}

// ---------- estimate ----------
function paceOf(st: UIStep): number | null {
  for (const t of [st.target, st.target2]) {
    if (t.type !== "pace") continue;
    const lo = mmssToSec(t.lo), hi = mmssToSec(t.hi);
    if (lo != null && hi != null) return (lo + hi) / 2;
    if (lo != null) return lo; if (hi != null) return hi;
  }
  return null;
}
function estimateTotals(items: UIItem[], sport: Sport, fallbackPace?: number): { secs: number; meters: number; complete: boolean; estimated: boolean } {
  let secs = 0, meters = 0, complete = true, estimated = false;
  const addDist = (mtr: number, st: UIStep) => {
    meters += mtr;
    let p = paceOf(st);
    if ((p == null || p <= 0) && fallbackPace && fallbackPace > 0) { p = fallbackPace; estimated = true; }
    if (p != null && p > 0) secs += (sport === "swim" ? mtr / 100 : mtr / 1000) * p; else complete = false;
  };
  const one = (st: UIStep, mult: number) => {
    if (st.durType === "time") secs += (st.secs || 0) * mult;
    else if (st.durType === "distance") addDist((st.distUnit === "km" ? (num(st.dist) || 0) * 1000 : (num(st.dist) || 0)) * mult, st);
    else complete = false;
  };
  const measProg = (it: UIRepeat) => !!(it.prog && it.prog.on && it.prog.apply_to === "measure" && firstStepOf(it));
  const walk = (nodes: UIItem[], mult: number) => {
    for (const it of nodes) {
      if (!isRepeat(it)) { one(it, mult); continue; }
      const reps = Math.max(1, it.reps || 1);
      if (measProg(it)) {
        const first = firstStepOf(it) as UIStep;
        const ladder = progLadder(it.prog as UIProg, reps, progBase(first, "measure", (it.prog as UIProg).metric));
        ladder.forEach((val) => { if ((it.prog as UIProg).metric === "distance") addDist(val * mult, first); else secs += val * mult; });
        it.steps.forEach((child, ci) => { if (ci === 0) return; if (isRepeat(child)) walk([child], mult * reps); else one(child, mult * reps); });
      } else walk(it.steps, mult * reps);
    }
  };
  walk(items, 1);
  return { secs: Math.round(secs), meters, complete, estimated };
}

// ---------- multisport ----------
type Leg = { uid: string; sport: Sport; items: UIItem[] };
function transitionStep(toSport: Sport): CardioStep {
  return { block_type: "step", kind: "transition", sport: toSport, role: "transition", measure: { type: "time", seconds: 60 }, label: "Transition" };
}
function buildMultiStructure(legs: Leg[], transitions: boolean, reminders: UIReminder[], pool?: { m: number; unit: "m" | "yd" }): CardioStructure {
  const blocks: CardioStepOrLoop[] = [];
  legs.forEach((leg, i) => {
    if (i > 0 && transitions) blocks.push(transitionStep(leg.sport));
    leg.items.forEach((it) => blocks.push(itemToUnified(it, leg.sport)));
  });
  const out: CardioStructure = { schema_version: 1, blocks };
  const rem = remindersToUnified(reminders);
  if (rem.length) out.reminders = rem;
  if (pool && legs.some((l) => l.sport === "swim")) { const o = out as unknown as { pool_length_m?: number; pool_unit?: string }; o.pool_length_m = pool.m; o.pool_unit = pool.unit; }
  return out;
}
function firstStepSport(b: CardioStepOrLoop): Sport {
  if (isStepBlock(b)) return normSport(b.sport);
  const lp = b as { steps?: CardioStepOrLoop[] };
  for (const s of (lp.steps || [])) { const r = firstStepSport(s); if (r) return r; }
  return "run";
}
function isMultiStructure(struct: CardioStructure | undefined): boolean {
  const sports = new Set<string>(); let hasT = false;
  const scan = (bs: CardioStepOrLoop[]) => bs.forEach((b) => {
    if (isStepBlock(b)) { if (b.kind === "transition") hasT = true; else sports.add(normSport(b.sport)); }
    else scan((b as { steps?: CardioStepOrLoop[] }).steps || []);
  });
  scan((struct?.blocks || []) as CardioStepOrLoop[]);
  return hasT || sports.size > 1;
}
function splitToLegs(struct: CardioStructure | undefined): { legs: Leg[]; transitions: boolean } {
  const blks = (struct?.blocks || []) as CardioStepOrLoop[];
  const legs: Leg[] = []; let transitions = false; let cur: Leg | null = null;
  for (const b of blks) {
    if (isStepBlock(b) && b.kind === "transition") { transitions = true; if (cur) { legs.push(cur); cur = null; } continue; }
    const sp = firstStepSport(b);
    if (!cur || cur.sport !== sp) { if (cur) legs.push(cur); cur = { uid: uid(), sport: sp, items: [] }; }
    cur.items.push(blockToItem(b));
  }
  if (cur) legs.push(cur);
  return { legs: legs.length ? legs : [{ uid: uid(), sport: "run", items: [blankStep("active")] }], transitions };
}
function multiTotals(legs: Leg[], transitions: boolean, paceBy: Partial<Record<Sport, number>>): { secs: number; meters: number; complete: boolean; estimated: boolean } {
  let secs = 0, meters = 0, complete = true, estimated = false;
  legs.forEach((leg) => { const t = estimateTotals(leg.items, leg.sport, paceBy[leg.sport]); secs += t.secs; meters += t.meters; if (!t.complete) complete = false; if (t.estimated) estimated = true; });
  if (transitions && legs.length > 1) secs += (legs.length - 1) * 60;
  return { secs, meters, complete, estimated };
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
  const [view, setView] = useState<"pick" | "overview" | "build" | "step">("pick");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [sport, setSport] = useState<Sport>(normSport(sportHint));
  const [items, setItems] = useState<UIItem[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [activeLegUid, setActiveLegUid] = useState<string | null>(null);
  const [transitions, setTransitions] = useState(true);
  const [addLegOpen, setAddLegOpen] = useState(false);
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
  const [typicalPace, setTypicalPace] = useState<Partial<Record<Sport, number>>>({});
  const [poolM, setPoolM] = useState(25);
  const [poolUnit, setPoolUnit] = useState<"m" | "yd">("m");

  useEffect(() => { cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [msg]);

  // recent typical pace per sport (native units: s/km for run+bike, s/100m for swim) for realistic time estimates
  useEffect(() => {
    let alive = true;
    cardioActivities().then((acts) => {
      if (!alive) return;
      const cutoff = Date.now() - 90 * 86400 * 1000;
      const bySport: Record<Sport, number[]> = { run: [], bike: [], swim: [] };
      const bounds: Record<Sport, [number, number]> = { run: [150, 720], bike: [50, 360], swim: [50, 300] };
      for (const a of acts) {
        const ss = (a.sport || "").toLowerCase();
        const sp: Sport | null = ss.includes("swim") ? "swim" : (ss.includes("cyc") || ss.includes("bik") || ss.includes("rid")) ? "bike" : ss.includes("run") ? "run" : null;
        if (!sp) continue;
        if (a.date && new Date(a.date).getTime() < cutoff) continue;
        const km = a.distance_km || 0, mins = a.duration_mins || 0;
        if (km < 0.2 || mins < 1) continue;
        const secs = mins * 60;
        const pace = sp === "swim" ? secs / (km * 10) : secs / km;
        if (pace >= bounds[sp][0] && pace <= bounds[sp][1]) bySport[sp].push(pace);
      }
      const med = (arr: number[]): number | undefined => { if (!arr.length) return undefined; const a2 = [...arr].sort((x, y) => x - y); const m = Math.floor(a2.length / 2); return a2.length % 2 ? a2[m] : (a2[m - 1] + a2[m]) / 2; };
      const tp: Partial<Record<Sport, number>> = {};
      (["run", "bike", "swim"] as Sport[]).forEach((sp) => { const v = med(bySport[sp]); if (v != null) tp[sp] = v; });
      setTypicalPace(tp);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // ---- current editing context (single workout, or the active multisport leg) ----
  const activeLeg = mode === "multi" ? (legs.find((l) => l.uid === activeLegUid) || null) : null;
  const curSport: Sport = mode === "multi" ? (activeLeg ? activeLeg.sport : "run") : sport;
  const curItems: UIItem[] = mode === "multi" ? (activeLeg ? activeLeg.items : []) : items;
  const setCurItems = (updater: (arr: UIItem[]) => UIItem[]) => {
    if (mode === "multi" && activeLegUid) setLegs((ls) => ls.map((l) => (l.uid === activeLegUid ? { ...l, items: updater(l.items) } : l)));
    else setItems(updater);
  };

  // ---- item helpers ----
  const mapStep = (u: string, fn: (s: UIStep) => UIStep) => setCurItems((arr) => walkMapStep(arr, u, fn));
  const removeItem = (u: string) => setCurItems((arr) => walkRemove(arr, u));
  const patchRepeat = (u: string, patch: Partial<UIRepeat>) => setCurItems((arr) => walkPatchRepeat(arr, u, patch));
  const addToRepeat = (repeatUid: string, node: UIItem) => setCurItems((arr) => walkAddToRepeat(arr, repeatUid, node));
  const findStep = (u: string): UIStep | null => walkFindStep(curItems, u);
  const moveItem = (u: string, dir: -1 | 1) => setCurItems((arr) => walkMove(arr, u, dir));
  const dupItem = (u: string) => setCurItems((arr) => walkDuplicate(arr, u));
  const patchProg = (u: string, patch: Partial<UIProg>) => setCurItems((arr) => walkPatchProg(arr, u, patch));

  function pickSport(sp: Sport) {
    setMode("single"); setSport(sp);
    if (startMode === "describe") { setItems([]); setShowDescribe(true); }
    else setItems([blankStep("active")]);
    setView("build");
  }
  function pickMulti() { setMode("multi"); setLegs([]); setTransitions(true); setActiveLegUid(null); setAddLegOpen(true); setView("overview"); }
  function addLeg(sp: Sport) { setLegs((ls) => [...ls, { uid: uid(), sport: sp, items: [blankStep("active")] }]); setAddLegOpen(false); }
  function openLeg(u: string) { setActiveLegUid(u); setShowDescribe(false); setView("build"); }
  function removeLeg(u: string) { setLegs((ls) => ls.filter((l) => l.uid !== u)); }
  function moveLeg(u: string, dir: -1 | 1) { setLegs((ls) => { const i = ls.findIndex((l) => l.uid === u); const j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return ls; const c = ls.slice(); const [m] = c.splice(i, 1); c.splice(j, 0, m); return c; }); }
  function dupLeg(u: string) { setLegs((ls) => { const i = ls.findIndex((l) => l.uid === u); if (i < 0) return ls; const src = ls[i]; const c = ls.slice(); c.splice(i + 1, 0, { uid: uid(), sport: src.sport, items: src.items.map(cloneItem) }); return c; }); }
  function setLegSport(u: string, sp: Sport) { setLegs((ls) => ls.map((l) => (l.uid === u ? { ...l, sport: sp } : l))); }

  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setDErr(null); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const r: CardioParsed = await cardioParse(text.trim(), curSport);
      if (r.ok && r.structure) {
        const { items: its, rem } = loadStructure(r.structure);
        setCurItems(() => (its.length ? its : [blankStep("active")]));
        if (mode === "single") { setReminders(rem); setEditingId(null); if (r.name) setName(r.name); const p = readPool(r.structure); setPoolM(p.m); setPoolUnit(p.unit); }
        setShowDescribe(false);
      } else setDErr(r.error || "Kai couldn't turn that into a workout — try rephrasing.");
    } catch { setDErr("Something went wrong creating that."); } finally { setBusy(false); }
  }

  const structure = mode === "multi" ? buildMultiStructure(legs, transitions, reminders, { m: poolM, unit: poolUnit }) : buildStructure(items, sport, reminders, { m: poolM, unit: poolUnit });
  const est = mode === "multi" ? multiTotals(legs, transitions, typicalPace) : estimateTotals(items, sport, typicalPace[sport]);
  const curEst = estimateTotals(curItems, curSport, typicalPace[curSport]);
  const hasBlocks = mode === "multi" ? legs.some((l) => l.items.length > 0) : items.length > 0;

  async function doSave(asCopy?: boolean) {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null); setSavedOk(false);
    try {
      const updating = !asCopy && !!editingId;
      const nm = (name.trim() || (mode === "multi" ? "Multisport session" : "Custom session")) + (asCopy ? " (copy)" : "");
      const r = await cardioSave({ id: updating ? editingId as string : undefined, name: nm, sport: mode === "multi" ? "multisport" : sport, structure });
      if (r.ok) {
        setSavedOk(true);
        if (r.id) setEditingId(r.id);
        setMsg(updating ? "Updated — changes saved to this routine." : "Saved — find it in Saved routines below, or tap Back to finish.");
        if (r.validator) setValidator(r.validator);
      } else setErr(r.error || "Couldn't save.");
    } catch { setErr("Couldn't save."); } finally { setBusy(false); }
  }
  function startNew() {
    if (mode === "multi") { setLegs([]); setActiveLegUid(null); setTransitions(true); setAddLegOpen(true); }
    else setItems([blankStep("active")]);
    setReminders([]); setEditingId(null); setName(""); setSavedOk(false); setValidator(null); setMsg(null); setErr(null); setShowDescribe(false);
  }
  async function doPrescribe() {
    if (!hasBlocks || busy) return;
    setBusy(true); setMsg(null); setErr(null); setValidator(null);
    try {
      const r = await cardioPrescribe({ sport: mode === "multi" ? "multisport" : sport, date, structure, name: name.trim() });
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
    try {
      if (isMultiStructure(rt.structure) || rt.sport === "multisport") {
        const { legs: lg, transitions: tr } = splitToLegs(rt.structure);
        setMode("multi"); setLegs(lg); setTransitions(tr); setActiveLegUid(null); setAddLegOpen(false);
        setReminders(remindersFromUnified(rt.structure && rt.structure.reminders)); setEditingId(rt.id); setName(rt.name); { const p = readPool(rt.structure); setPoolM(p.m); setPoolUnit(p.unit); } setShowDescribe(false); setView("overview");
      } else {
        const sp = normSport(rt.sport || sport); setMode("single"); setSport(sp);
        const { items: its, rem } = loadStructure(rt.structure); setItems(its.length ? its : [blankStep("active")]); setReminders(rem); setEditingId(rt.id); setName(rt.name); { const p = readPool(rt.structure); setPoolM(p.m); setPoolUnit(p.unit); } setShowDescribe(false); setView("build");
      }
    } finally { setBusy(false); }
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
  const ctrlBtn: React.CSSProperties = { background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 12, padding: "2px 3px", lineHeight: 1 };

  // ---- shared render blocks ----
  const poolRow = () => (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
      <span style={rowLabel}>Pool length</span>
      <select value={`${poolM}|${poolUnit}`} onChange={(e) => { const [pm, pu] = e.target.value.split("|"); setPoolM(Number(pm)); setPoolUnit(pu === "yd" ? "yd" : "m"); }} style={{ ...sel, minWidth: 110 }}>
        {POOL_OPTS.map((o) => <option key={o.label} value={`${o.m}|${o.unit}`}>{o.label}</option>)}
      </select>
    </label>
  );
  const describeBlock = () => (
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
  );

  const remindersBlock = () => {
    const legSports = Array.from(new Set(legs.map((l) => l.sport)));
    return (
      <div>
        <div className="eyebrow" style={{ marginTop: 16, marginBottom: 6 }}>Fueling & hydration</div>
        <div className="subtle tiny" style={{ marginBottom: 6 }}>In-app cues during the session — not sent to Garmin.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reminders.map((r) => (
            <div key={r.uid} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 8px", borderRadius: 8, background: "rgba(240,180,80,0.08)", border: "1px solid rgba(240,180,80,0.18)" }}>
              <select value={r.type} onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, type: e.target.value as "fuel" | "hydrate" } : x)))} style={sel}>
                <option value="fuel">Fuel</option><option value="hydrate">Hydrate</option>
              </select>
              {mode === "multi" && legSports.length > 1 ? (
                <select value={r.sport} onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, sport: e.target.value as "all" | Sport } : x)))} style={sel}>
                  <option value="all">All legs</option>
                  {legSports.map((sp) => <option key={sp} value={sp}>{sportName(sp)}</option>)}
                </select>
              ) : null}
              <span className="subtle tiny">every</span>
              <input type="number" min={1} value={r.everyMin} placeholder="20" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, everyMin: e.target.value } : x)))} style={{ ...mini, width: 52 }} />
              <span className="subtle tiny">min</span>
              <input value={r.note} placeholder="note (optional)" onChange={(e) => setReminders((a) => a.map((x) => (x.uid === r.uid ? { ...x, note: e.target.value } : x)))} style={{ ...sel, flex: 1, minWidth: 80 }} />
              <button onClick={() => setReminders((a) => a.filter((x) => x.uid !== r.uid))} title="Remove" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "fuel", everyMin: "20", note: "", sport: "all" }])} style={dashBtn("rgba(240,180,80,0.5)")}>+ fuel reminder</button>
          <button onClick={() => setReminders((a) => [...a, { uid: uid(), type: "hydrate", everyMin: "15", note: "", sport: "all" }])} style={dashBtn("rgba(120,180,240,0.5)")}>+ hydrate reminder</button>
        </div>
      </div>
    );
  };

  const actionsBlock = () => (
    <div>
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

  // ---------- PICK VIEW ----------
  if (view === "pick") {
    const active: Sport[] = ["run", "bike", "swim"];
    const soon = [{ label: "Yoga", icon: "🧘" }, { label: "HIIT", icon: "⚡" }];
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Create a Workout</div>
          <button className="trn-sub" onClick={() => { if (onExit) onExit(); }}>‹ Back</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {active.map((sp) => (
            <button key={sp} onClick={() => pickSport(sp)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 20 }}>{sportIcon(sp)}</span><span style={{ fontSize: 14, fontWeight: 700 }}>{sp === "swim" ? "Pool Swim" : sportName(sp)}</span>
            </button>
          ))}
          <button onClick={pickMulti} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(162,116,255,0.35)", background: "rgba(162,116,255,0.08)", color: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 20 }}>🔗</span><span style={{ fontSize: 14, fontWeight: 700 }}>Multisport</span>
            <span className="subtle tiny" style={{ marginLeft: "auto" }}>swim · bike · run + transitions</span>
          </button>
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

  // ---------- OVERVIEW VIEW (multisport root) ----------
  if (view === "overview") {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button className="trn-sub" onClick={() => setView("pick")}>‹ Multisport</button>
          <button onClick={() => doSave()} disabled={busy || !hasBlocks} className="trn-sub" style={savedOk ? { color: "#79e0a8" } : { color: "#a274ff" }}>{savedOk ? (editingId ? "UPDATED ✓" : "SAVED ✓") : editingId ? "UPDATE" : "SAVE"}</button>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
          <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{est.secs ? `${est.estimated && est.complete ? "~" : ""}${fmtDur(est.secs)}` : "—"}{est.secs && !est.complete ? "+" : ""}</div><div className="subtle tiny">Total Time</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{est.meters ? fmtDist(est.meters) : "—"}</div><div className="subtle tiny">Est Distance</div></div>
        </div>
        {est.secs ? (!est.complete ? <div className="subtle tiny" style={{ marginTop: 4, opacity: 0.8 }}>+ some legs need a pace target to time their distance steps</div> : est.estimated ? <div className="subtle tiny" style={{ marginTop: 4, opacity: 0.8 }}>~ time estimated from your recent pace</div> : null) : null}

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...field, fontWeight: 700, marginTop: 12 }} />

        <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>Legs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {legs.map((leg, i) => {
            const lt = estimateTotals(leg.items, leg.sport, typicalPace[leg.sport]);
            const nSteps = leg.items.length;
            return (
              <div key={leg.uid}>
                {i > 0 && transitions ? (
                  <div style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 9px", borderRadius: 999, background: "rgba(240,180,80,0.14)", color: "#f0c060" }}>T{i} · transition</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "stretch", gap: 0, borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ width: 4, background: stepAccent.active, flex: "0 0 auto" }} />
                  <div style={{ flex: 1, padding: "10px 12px", minWidth: 0, cursor: "pointer" }} onClick={() => openLeg(leg.uid)}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{sportIcon(leg.sport)} Leg {i + 1} · {sportName(leg.sport)}</div>
                    <div className="subtle tiny tnum" style={{ marginTop: 2 }}>{nSteps} {nSteps === 1 ? "block" : "blocks"}{lt.secs ? ` · ${lt.estimated && lt.complete ? "~" : ""}${fmtDur(lt.secs)}` : ""}{lt.meters ? ` · ${fmtDist(lt.meters)}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 4 }}>
                    <button onClick={() => moveLeg(leg.uid, -1)} title="Move up" style={ctrlBtn}>▲</button>
                    <button onClick={() => moveLeg(leg.uid, 1)} title="Move down" style={ctrlBtn}>▼</button>
                    <button onClick={() => dupLeg(leg.uid)} title="Duplicate leg" style={ctrlBtn}>⧉</button>
                  </div>
                  <select value={leg.sport} onChange={(e) => setLegSport(leg.uid, e.target.value as Sport)} style={{ ...sel, alignSelf: "center", marginRight: 6 }}>
                    <option value="run">Run</option><option value="bike">Bike</option><option value="swim">Swim</option>
                  </select>
                  <button onClick={() => removeLeg(leg.uid)} title="Remove leg" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 16, paddingRight: 10 }}>×</button>
                </div>
              </div>
            );
          })}
          {legs.length === 0 ? <div className="subtle tiny">No legs yet — add your first below (e.g. Swim → Bike → Run).</div> : null}
        </div>

        <div style={{ marginTop: 10 }}>
          {!addLegOpen ? (
            <button onClick={() => setAddLegOpen(true)} style={{ ...pill(ACCENT), width: "100%", padding: 11 }}>+ Add Leg</button>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 10, borderRadius: 10, background: "rgba(95,125,255,0.06)", border: "1px solid rgba(95,125,255,0.2)" }}>
              {(["run", "bike", "swim"] as Sport[]).map((sp) => (
                <button key={sp} onClick={() => addLeg(sp)} style={{ ...pill("rgba(95,125,255,0.9)"), flex: 1, minWidth: 80 }}>{sportIcon(sp)} {sp === "swim" ? "Pool Swim" : sportName(sp)}</button>
              ))}
              <button onClick={() => setAddLegOpen(false)} className="trn-sub" style={{ width: "100%", textAlign: "center", marginTop: 2 }}>Cancel</button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
          <div>
            <div style={rowLabel}>Auto transitions (T1 / T2…)</div>
            <div className="subtle tiny">Adds a transition between each leg</div>
          </div>
          <button onClick={() => setTransitions((t) => !t)} style={{ width: 46, height: 26, borderRadius: 999, background: transitions ? "#5f9dff" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", flex: "0 0 auto" }}>
            <span style={{ position: "absolute", top: 3, left: transitions ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left 0.15s" }} />
          </button>
        </div>

        {legs.some((l) => l.sport === "swim") ? poolRow() : null}
        {remindersBlock()}
        {actionsBlock()}
      </div>
    );
  }

  // ---------- STEP DETAIL VIEW ----------
  const editStep = editUid ? findStep(editUid) : null;
  if (view === "step" && editStep && editUid) {
    const st = editStep;
    const paceOpts = genPaceOptions(curSport);
    const set = (patch: Partial<UIStep>) => mapStep(editUid, (s) => ({ ...s, ...patch }));
    const setTarget = (patch: Partial<UITarget>) => mapStep(editUid, (s) => ({ ...s, target: { ...s.target, ...patch } }));
    const setTarget2 = (patch: Partial<UITarget>) => mapStep(editUid, (s) => ({ ...s, target2: { ...s.target2, ...patch } }));
    const targetTypeSelect = (t: UITarget, setT: (p: Partial<UITarget>) => void) => (
      <select value={t.type} onChange={(e) => setT({ type: e.target.value as TargetType, lo: "", hi: "", speed: e.target.value === "pace" && curSport === "bike" })} style={{ ...sel, minWidth: 150 }}>
        {TARGET_TYPES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        <option value="__hrz" disabled>HR Zone (needs thresholds)</option>
        <option value="__pwz" disabled>Power Zone (needs thresholds)</option>
      </select>
    );
    const targetValueRow = (t: UITarget, setT: (p: Partial<UITarget>) => void) => {
      if (t.type === "none") return null;
      const bikeSpeed = t.type === "pace" && curSport === "bike" && !!t.speed;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {t.type === "pace" && !bikeSpeed ? (
            <>
              <select value={t.lo} onChange={(e) => setT({ lo: e.target.value })} style={{ ...sel, width: 84 }}><option value="">—</option>{paceOpts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <span className="subtle tiny">–</span>
              <select value={t.hi} onChange={(e) => setT({ hi: e.target.value })} style={{ ...sel, width: 84 }}><option value="">—</option>{paceOpts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <span className="subtle tiny">{paceUnit(curSport)}</span>
              {curSport === "bike" ? <button onClick={() => setT({ speed: true })} style={{ background: "none", border: "none", color: "#a274ff", cursor: "pointer", fontSize: 11 }}>km/h</button> : null}
            </>
          ) : bikeSpeed ? (
            <>
              <input type="number" min={1} value={speedFromPace(t.lo)} placeholder="min" onChange={(e) => setT({ lo: paceFromSpeed(e.target.value) })} style={{ ...mini, width: 64 }} />
              <span className="subtle tiny">–</span>
              <input type="number" min={1} value={speedFromPace(t.hi)} placeholder="max" onChange={(e) => setT({ hi: paceFromSpeed(e.target.value) })} style={{ ...mini, width: 64 }} />
              <span className="subtle tiny">km/h</span>
              <button onClick={() => setT({ speed: false })} style={{ background: "none", border: "none", color: "#a274ff", cursor: "pointer", fontSize: 11 }}>/km</button>
            </>
          ) : (
            <>
              <input type="number" min={t.type === "rpe" ? 1 : 0} max={t.type === "rpe" ? 10 : undefined} value={t.lo} placeholder={t.type === "rpe" ? "1" : "min"} onChange={(e) => setT({ lo: e.target.value })} style={{ ...mini, width: 68 }} />
              <span className="subtle tiny">–</span>
              <input type="number" min={t.type === "rpe" ? 1 : 0} max={t.type === "rpe" ? 10 : undefined} value={t.hi} placeholder={t.type === "rpe" ? "10" : "max"} onChange={(e) => setT({ hi: e.target.value })} style={{ ...mini, width: 68 }} />
              <span className="subtle tiny">{metricUnit(t.type, curSport)}</span>
            </>
          )}
        </div>
      );
    };
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button className="trn-sub" onClick={() => setView("build")}>‹ {stepTypeLabel(st.stepType, curSport)}</button>
          <button onClick={() => { removeItem(editUid); setView("build"); }} className="trn-sub" style={{ color: "#ff8a8a" }}>REMOVE</button>
        </div>

        <div className="eyebrow" style={{ marginTop: 14 }}>Step info</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={rowLabel}>Step Type</span>
          <select value={st.stepType} onChange={(e) => set({ stepType: e.target.value as StepType })} style={{ ...sel, minWidth: 140 }}>
            {STEP_TYPES.map((t) => <option key={t} value={t}>{stepTypeLabel(t, curSport)}</option>)}
          </select>
        </label>
        {curSport === "swim" ? (
          <>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={rowLabel}>Stroke</span>
              <select value={st.stroke} onChange={(e) => set({ stroke: e.target.value as Stroke })} style={{ ...sel, minWidth: 140 }}>{STROKE_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={rowLabel}>Equipment</span>
              <select value={st.equipment} onChange={(e) => set({ equipment: e.target.value as Equipment })} style={{ ...sel, minWidth: 140 }}>{EQUIP_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
            {st.stroke === "drill" ? (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
                <span style={rowLabel}>Drill name</span>
                <input value={st.drill} onChange={(e) => set({ drill: e.target.value })} placeholder="e.g. catch-up" style={{ ...field, flex: 1, maxWidth: 180 }} />
              </label>
            ) : null}
          </>
        ) : null}

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
          <>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
            <span style={rowLabel}>Distance</span>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <input type="number" min={0} value={st.dist} placeholder="0" onChange={(e) => set({ dist: e.target.value })} style={{ ...mini, width: 80 }} />
              <select value={st.distUnit} onChange={(e) => set({ distUnit: e.target.value as "m" | "km" })} style={sel}><option value="m">m</option><option value="km">km</option></select>
            </span>
          </label>
          {curSport === "swim" && st.dist ? (() => { const meters = st.distUnit === "km" ? (num(st.dist) || 0) * 1000 : (num(st.dist) || 0); const laps = meters / poolM; const whole = Math.abs(laps - Math.round(laps)) < 0.02; return meters > 0 ? <div className="subtle tiny" style={{ marginTop: 6, textAlign: "right", opacity: 0.8 }}>{whole ? `= ${Math.round(laps)} laps` : `≈ ${laps.toFixed(1)} laps`}</div> : null; })() : null}
          </>
        ) : null}
        {st.durType === "lap" ? <div className="subtle tiny" style={{ marginTop: 10 }}>Ends when you press the lap button.</div> : null}

        <div className="eyebrow" style={{ marginTop: 16 }}>Intensity target</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={rowLabel}>Target Type</span>
          {targetTypeSelect(st.target, setTarget)}
        </label>
        {targetValueRow(st.target, setTarget)}
        {st.target.type !== "none" ? (
          st.target2.type === "none" ? (
            <button onClick={() => setTarget2({ type: curSport === "bike" ? "cadence" : "hr", lo: "", hi: "" })} style={{ ...dashBtn("rgba(162,116,255,0.4)"), marginTop: 10, fontSize: 11 }}>+ Add a secondary target</button>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                <span style={rowLabel}>Secondary</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {targetTypeSelect(st.target2, setTarget2)}
                  <button onClick={() => setTarget2({ type: "none", lo: "", hi: "" })} title="Remove secondary" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
                </span>
              </label>
              {targetValueRow(st.target2, setTarget2)}
            </>
          )
        ) : null}
        <div className="subtle tiny" style={{ marginTop: 12, opacity: 0.7 }}>Effort (RPE) works now. HR/Power zone targets unlock once your thresholds are computed.</div>

        {wheelUid === editUid ? <DurationWheel initial={st.secs || 0} onCancel={() => setWheelUid(null)} onOk={(secs) => { set({ secs }); setWheelUid(null); }} /> : null}
      </div>
    );
  }

  // ---------- BUILD VIEW (single workout, or one multisport leg) ----------
  const inLeg = mode === "multi";

  const stepRow = (st: UIStep, insideRepeat: boolean) => {
    const tgt = [describeTarget(st.target, curSport), st.target2.type !== "none" ? describeTarget(st.target2, curSport) : ""].filter(Boolean).join(" + ");
    const dur = st.durType === "lap" ? "Lap" : st.durType === "time" ? fmtDur(st.secs) : (st.dist ? `${st.dist} ${st.distUnit}` : "—");
    return (
      <div key={st.uid} onClick={() => { setEditUid(st.uid); setView("step"); }} style={{ display: "flex", alignItems: "stretch", gap: 0, borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", overflow: "hidden", marginLeft: insideRepeat ? 10 : 0 }}>
        <div style={{ width: 4, background: stepAccent[st.stepType], flex: "0 0 auto" }} />
        <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{stepTypeLabel(st.stepType, curSport)}</div>
          <div className="subtle tiny tnum" style={{ marginTop: 2 }}>{dur}{tgt ? ` · ${tgt}` : ""}{st.stroke ? ` · ${STROKE_OPTS.find((o) => o.id === st.stroke)?.label}` : ""}{st.equipment ? ` · ${EQUIP_OPTS.find((o) => o.id === st.equipment)?.label}` : ""}</div>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 1, paddingRight: 4 }}>
          <button onClick={() => moveItem(st.uid, -1)} title="Move up" style={ctrlBtn}>▲</button>
          <button onClick={() => moveItem(st.uid, 1)} title="Move down" style={ctrlBtn}>▼</button>
          <button onClick={() => dupItem(st.uid)} title="Duplicate" style={ctrlBtn}>⧉</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", paddingRight: 12, color: "#5c6070", fontSize: 18 }}>›</div>
      </div>
    );
  };

  const progBlock = (it: UIRepeat) => {
    const first = firstStepOf(it);
    if (!first) return null;
    const dims = progDimsForStep(first);
    if (!dims.length) return null;
    const p = it.prog;
    const on = !!(p && p.on);
    return (
      <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 8, background: "rgba(95,125,255,0.05)", border: "1px dashed rgba(95,125,255,0.25)" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: on ? "#9db0e0" : "#8a90a6", cursor: "pointer" }}>
          <input type="checkbox" checked={on} onChange={(e) => { if (e.target.checked) { const d = dims[0]; patchProg(it.uid, { on: true, apply_to: d.apply_to, metric: d.metric, mode: "list", step: "", values: [] }); } else patchProg(it.uid, { on: false }); }} style={{ accentColor: "#5f9dff" }} />
          Progression ladder
        </label>
        {on && p ? (() => {
          const kind = progKind(p.apply_to, p.metric);
          const ladder = progLadder(p, it.reps, progBase(first, p.apply_to, p.metric));
          return (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="subtle tiny">Change</span>
                <select value={`${p.apply_to}|${p.metric}`} onChange={(e) => { const [a, m] = e.target.value.split("|"); patchProg(it.uid, { apply_to: a as ProgApply, metric: m, values: [], step: "" }); }} style={sel}>
                  {dims.map((d) => <option key={`${d.apply_to}|${d.metric}`} value={`${d.apply_to}|${d.metric}`}>{d.label}</option>)}
                </select>
                <select value={p.mode} onChange={(e) => patchProg(it.uid, { mode: e.target.value as "list" | "linear" })} style={sel}>
                  <option value="list">by list</option><option value="linear">by step</option>
                </select>
              </div>
              {p.mode === "linear" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="subtle tiny">each rep</span>
                  <input value={p.step} onChange={(e) => patchProg(it.uid, { step: e.target.value })} placeholder={kind === "pace" || kind === "sec" ? "±m:ss" : "±"} style={{ ...mini, width: 74 }} />
                  <span className="subtle tiny">{progUnit(kind, curSport)}</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {Array.from({ length: Math.max(1, it.reps) }, (_, i) => i).map((i) => (
                    <input key={i} value={p.values[i] || ""} onChange={(e) => { const nv = p.values.slice(); nv[i] = e.target.value; patchProg(it.uid, { values: nv }); }} placeholder={`#${i + 1}`} style={{ ...mini, width: 56 }} />
                  ))}
                  <span className="subtle tiny">{progUnit(kind, curSport)}</span>
                </div>
              )}
              <div className="subtle tiny" style={{ opacity: 0.85 }}>{ladderPreview(ladder, kind, curSport) || "set values to preview"}</div>
            </div>
          );
        })() : null}
      </div>
    );
  };

  const renderNode = (it: UIItem, depth: number): JSX.Element => {
    if (!isRepeat(it)) return stepRow(it, depth > 0);
    return (
      <div key={it.uid} style={{ borderRadius: 10, border: "1px solid rgba(162,116,255,0.28)", background: "rgba(162,116,255,0.05)", padding: 8, marginLeft: depth > 0 ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <select value={it.reps} onChange={(e) => patchRepeat(it.uid, { reps: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ ...sel, width: 62, color: "#a274ff", fontWeight: 800 }}>{Array.from({ length: Math.max(20, it.reps) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#a274ff" }}>Times{depth > 0 ? " · nested" : ""}</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8a90a6", cursor: "pointer", marginLeft: 8 }}><input type="checkbox" checked={it.skipLast} onChange={(e) => patchRepeat(it.uid, { skipLast: e.target.checked })} style={{ accentColor: "#a274ff" }} /> skip last recovery</label>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 1 }}>
            <button onClick={() => moveItem(it.uid, -1)} title="Move up" style={ctrlBtn}>▲</button>
            <button onClick={() => moveItem(it.uid, 1)} title="Move down" style={ctrlBtn}>▼</button>
            <button onClick={() => dupItem(it.uid)} title="Duplicate" style={ctrlBtn}>⧉</button>
            <button onClick={() => removeItem(it.uid)} title="Remove repeat" style={{ background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{it.steps.map((child) => renderNode(child, depth + 1))}</div>
        {depth === 0 ? progBlock(it) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button onClick={() => addToRepeat(it.uid, blankStep("active"))} style={{ ...dashBtn("rgba(162,116,255,0.4)"), fontSize: 11, padding: "5px 10px" }}>+ step</button>
          {depth < 1 ? <button onClick={() => addToRepeat(it.uid, { uid: uid(), loop: true, reps: 4, steps: [blankStep("active")], skipLast: false })} style={{ ...dashBtn("rgba(162,116,255,0.4)"), fontSize: 11, padding: "5px 10px" }}>+ nested repeat</button> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button className="trn-sub" onClick={() => setView(inLeg ? "overview" : "pick")}>‹ {inLeg ? "Legs" : `${curSport === "swim" ? "Pool Swim" : sportName(curSport)} Workout`}</button>
        {inLeg ? (
          <button onClick={() => setView("overview")} className="trn-sub" style={{ color: "#a274ff" }}>DONE</button>
        ) : (
          <button onClick={() => doSave()} disabled={busy || !hasBlocks} className="trn-sub" style={savedOk ? { color: "#79e0a8" } : { color: "#a274ff" }}>{savedOk ? (editingId ? "UPDATED ✓" : "SAVED ✓") : editingId ? "UPDATE" : "SAVE"}</button>
        )}
      </div>

      {inLeg ? <div className="subtle tiny" style={{ marginTop: 6 }}>{sportIcon(curSport)} {sportName(curSport)} leg</div> : null}

      {/* totals */}
      <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
        <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{curEst.secs ? `${curEst.estimated && curEst.complete ? "~" : ""}${fmtDur(curEst.secs)}` : "—"}{curEst.secs && !curEst.complete ? "+" : ""}</div><div className="subtle tiny">{inLeg ? "Leg Time" : "Total Time"}</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{curEst.meters ? fmtDist(curEst.meters) : "—"}</div><div className="subtle tiny">Est Distance</div></div>
      </div>
      {curEst.secs ? (!curEst.complete ? <div className="subtle tiny" style={{ marginTop: 4, opacity: 0.8 }}>+ set a pace target on distance steps to estimate their time</div> : curEst.estimated ? <div className="subtle tiny" style={{ marginTop: 4, opacity: 0.8 }}>~ time estimated from your recent {curSport} pace</div> : null) : null}

      {!inLeg && curSport === "swim" ? poolRow() : null}
      {!inLeg ? <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...field, fontWeight: 700, marginTop: 12 }} /> : null}

      {describeBlock()}

      {/* steps */}
      <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>Steps</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {curItems.map((it) => renderNode(it, 0))}
      </div>

      {/* add step / repeat */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setCurItems((a) => [...a, blankStep("active")])} style={{ ...pill("rgba(95,125,255,0.9)"), flex: 1, padding: 11 }}>+ Add Step</button>
        <button onClick={() => setCurItems((a) => [...a, { uid: uid(), loop: true, reps: 6, steps: [blankStep("active"), blankStep("recover")], skipLast: false }])} style={{ ...pill("rgba(162,116,255,0.9)"), flex: 1, padding: 11 }}>⟳ Add Repeat</button>
      </div>

      {inLeg ? (
        <div style={{ marginTop: 14 }}><button onClick={() => setView("overview")} style={{ ...pill(ACCENT), width: "100%", padding: 11 }}>Done — back to legs</button></div>
      ) : (
        <>
          {remindersBlock()}
          {actionsBlock()}
        </>
      )}
    </div>
  );
}
