"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  wkActive, wkStart, wkAddSet, wkCompleteSet, wkEditSet, wkDeleteSet, wkAddExercise, wkFinish, wkDiscard,
  wkRoutines, wkRoutine, wkSaveRoutine, wkDeleteRoutine, wkParseRoutine, wkExercises, planWeek, fmtVolume, wkRename, cardioList, cardioPrescribe, recoveryGet, wkSession, wkRecompute, wkReorder, wkSetSuperset,
} from "../lib/api";
import type { WkBundle, WkSession, WkSet, WkFinish, WkRoutineSummary, WkRoutineItem, WkExercise, WkFacets, WkPrevSet, CardioRoutine } from "../lib/api";
import ExerciseDetail from "./ExerciseDetail";

type View = "home" | "log" | "celebrate" | "build";
type PlanToday = { id: string; session_type: string; activity: string; session_date: string; committed: boolean; completed: boolean; skipped: boolean; is_rest_day: boolean };

const ACCENT = "linear-gradient(135deg,#5f7dff,#a274ff)";
const btn = (bg: string): React.CSSProperties => ({ padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
const inp: React.CSSProperties = { width: 50, textAlign: "center", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 4px", fontSize: 14, fontVariantNumeric: "tabular-nums" };
const todayISO = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
const isStrength = (t?: string) => /strength/i.test(t || "");
const isTemp = (id: string) => id.startsWith("temp:");
const tmpId = () => "temp:" + Math.random().toString(36).slice(2, 9);
const REST_DEFAULT_S = 90;
const REST_LS_KEY = "hos_rest_default";
// Rest-timer picker stops: Off, then 5s steps to 2:00, then 15s steps to 5:00 (37 stops). hos_rest_default persists the pick.
const REST_STOPS: number[] = [0, ...Array.from({ length: 24 }, (_, i) => (i + 1) * 5), ...Array.from({ length: 12 }, (_, i) => 120 + (i + 1) * 15)];

function elapsed(startTs?: string | null): string {
  if (!startTs) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(startTs)) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}
function fmtClock(startTs?: string | null): string {
  if (!startTs) return "0:00";
  let s = Math.max(0, Math.floor((Date.now() - Date.parse(startTs)) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); const ss = s - m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
function fmtSecs(s: number): string { const m = Math.floor(s / 60); const ss = s % 60; return `${m}:${String(ss).padStart(2, "0")}`; }
function parseMMSS(str: string): number { const t = (str || "").trim(); if (!t) return 0; if (t.includes(":")) { const p = t.split(":"); const mm = parseInt(p[0], 10) || 0; const sv = parseInt(p[1], 10) || 0; return Math.max(0, mm * 60 + sv); } return Math.max(0, Math.round(Number(t) || 0)); }
function emptyInput() { return { kg: "", reps: "", secs: "", dist: "" }; }
function ttPayload(tt: string | undefined, v: { kg: string; reps: string; secs: string; dist: string }): { weight_kg?: number | null; reps?: number | null; duration_s?: number | null; distance_m?: number | null } {
  const n = (x: string) => (x === "" ? null : Number(x));
  if (tt === "reps") return { reps: n(v.reps) };
  if (tt === "time") return { duration_s: n(v.secs) };
  if (tt === "distance") return { distance_m: n(v.dist) };
  return { weight_kg: n(v.kg), reps: n(v.reps) };
}
function DetailOverlay({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0b0d12", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 14 }}>
        <ExerciseDetail title={title} onBack={onClose} />
      </div>
    </div>
  );
}

const REX_KEY = "hos_ex_recents";
const TYPE_OPTS: { v: string; label: string }[] = [
  { v: "strength", label: "Strength" },
  { v: "mobility", label: "Mobility" },
  { v: "dynamic_stretch", label: "Dynamic stretch" },
  { v: "static_stretch", label: "Static stretch" },
  { v: "warmup", label: "Warm-up" },
  { v: "recovery_rehab", label: "Recovery / rehab" },
  { v: "cardio", label: "Cardio" },
];
function loadRecents(): { name: string; muscle_group: string }[] {
  try { const a = JSON.parse(localStorage.getItem(REX_KEY) || "[]"); return Array.isArray(a) ? a.slice(0, 20) : []; } catch { return []; }
}
function pushRecents(items: { name: string; muscle_group: string }[]) {
  try {
    const seen = new Set<string>();
    const merged: { name: string; muscle_group: string }[] = [];
    for (const it of [...items, ...loadRecents()]) { const k = (it.name || "").toLowerCase(); if (!it.name || seen.has(k)) continue; seen.add(k); merged.push({ name: it.name, muscle_group: it.muscle_group || "" }); }
    localStorage.setItem(REX_KEY, JSON.stringify(merged.slice(0, 20)));
  } catch { /* ignore */ }
}

function ExercisePicker({ onPick, onPickMany, placeholder }: { onPick: (e: { name: string; muscle_group: string }) => void; onPickMany?: (list: { name: string; muscle_group: string }[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<WkExercise[]>([]);
  const [facets, setFacets] = useState<WkFacets | null>(null);
  const [open, setOpen] = useState(false);
  const [fType, setFType] = useState<string | null>(null);
  const [fEquip, setFEquip] = useState<string | null>(null);
  const [fMuscle, setFMuscle] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "type" | "equipment" | "muscle">(null);
  const [sel, setSel] = useState<{ name: string; muscle_group: string }[]>([]);
  const [recents, setRecents] = useState<{ name: string; muscle_group: string }[]>([]);
  const filtered = !!(q.trim() || fType || fEquip || fMuscle);
  useEffect(() => { if (open) setRecents(loadRecents()); }, [open]);
  useEffect(() => {
    let alive = true;
    if (!open) return;
    const t = setTimeout(() => {
      wkExercises(q, { type: fType || undefined, equipment: fEquip || undefined, muscle: fMuscle || undefined })
        .then((r) => { if (!alive) return; setOpts(r.exercises || []); if (r.facets) setFacets(r.facets); })
        .catch(() => {});
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, fType, fEquip, fMuscle]);
  const reset = () => { setQ(""); setOpen(false); setFType(null); setFEquip(null); setFMuscle(null); setSheet(null); setSel([]); };
  const isSel = (name: string) => sel.some((x) => x.name === name);
  const toggleSel = (e: { name: string; muscle_group: string }) => setSel((s) => (s.some((x) => x.name === e.name) ? s.filter((x) => x.name !== e.name) : [...s, { name: e.name, muscle_group: e.muscle_group || "" }]));
  const commit = (chosen: { name: string; muscle_group: string }[]) => {
    if (chosen.length === 0) return;
    pushRecents(chosen);
    if (onPickMany && chosen.length > 1) onPickMany(chosen);
    else chosen.forEach((e) => onPick(e));
    reset();
  };
  const filterBtn = (label: string, val: string | null, key: "type" | "equipment" | "muscle") => (
    <button className="trn-sub" style={{ padding: "5px 10px", fontSize: 11, border: val ? "1px solid rgba(162,116,255,0.6)" : undefined }} onClick={() => setSheet(sheet === key ? null : key)}>{val ? `${label}: ${val}` : label} ▾</button>
  );
  const sheetOpts = sheet === "type" ? TYPE_OPTS.map((t) => t.v) : sheet === "equipment" ? (facets?.equipment || []) : sheet === "muscle" ? (facets?.muscle || []) : [];
  const applySheet = (v: string) => {
    if (sheet === "type") setFType((p) => (p === v ? null : v));
    else if (sheet === "equipment") setFEquip((p) => (p === v ? null : v));
    else if (sheet === "muscle") setFMuscle((p) => (p === v ? null : v));
    setSheet(null);
  };
  const listItems = filtered ? opts.map((o) => ({ name: o.name, muscle_group: o.muscle_group })) : recents;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder || "Search exercises…"}
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        {q.trim() && !listItems.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) ? <button className="trn-sub" onClick={() => commit([{ name: q.trim(), muscle_group: "" }])}>Add</button> : null}
      </div>
      {open ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {filterBtn("Type", fType, "type")}
            {filterBtn("Equipment", fEquip, "equipment")}
            {filterBtn("Muscle", fMuscle, "muscle")}
            {(fType || fEquip || fMuscle) ? <button className="subtle tiny" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "2px 4px" }} onClick={() => { setFType(null); setFEquip(null); setFMuscle(null); }}>Clear</button> : null}
          </div>
          {sheet ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
              {sheetOpts.length ? sheetOpts.map((o) => {
                const on = (sheet === "type" && fType === o) || (sheet === "equipment" && fEquip === o) || (sheet === "muscle" && fMuscle === o);
                const lbl = sheet === "type" ? (TYPE_OPTS.find((t) => t.v === o)?.label || o) : o;
                return <button key={o} onClick={() => applySheet(o)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", border: on ? "1px solid rgba(162,116,255,0.6)" : "1px solid rgba(255,255,255,0.12)", background: on ? "rgba(162,116,255,0.18)" : "rgba(255,255,255,0.04)", color: "inherit", textTransform: "capitalize" }}>{lbl}</button>;
              }) : <span className="subtle tiny">No options</span>}
            </div>
          ) : null}
          <div className="subtle tiny" style={{ textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7 }}>{filtered ? "All" : "Recent"}</div>
          {listItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
              {listItems.map((o) => {
                const on = isSel(o.name);
                return (
                  <button key={o.name} onClick={() => toggleSel(o)} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: on ? "1px solid rgba(162,116,255,0.6)" : "1px solid rgba(255,255,255,0.08)", background: on ? "rgba(162,116,255,0.14)" : "rgba(255,255,255,0.03)", color: "inherit" }}>
                    <span style={{ flex: "0 0 auto", width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: on ? ACCENT : "rgba(255,255,255,0.08)", color: "#fff" }}>{on ? "✓" : ""}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{o.name}</span>
                    {o.muscle_group ? <span className="subtle tiny" style={{ textTransform: "capitalize" }}>{o.muscle_group}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : <div className="subtle tiny" style={{ padding: "4px 2px" }}>{filtered ? "No matches — type a name and tap Add for a custom exercise." : "No recent exercises yet — search to add your first."}</div>}
          {sel.length > 0 ? (
            <button onClick={() => commit(sel)} style={{ ...btn(ACCENT), width: "100%", padding: 11, marginTop: 2 }}>Add {sel.length} exercise{sel.length === 1 ? "" : "s"}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkoutLogger({ editSessionId, onExitEdit }: { editSessionId?: string; onExitEdit?: () => void } = {}) {
  const [view, setView] = useState<View>(editSessionId ? "log" : "home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<WkBundle | null>(null);
  const [routines, setRoutines] = useState<WkRoutineSummary[]>([]);
  const [cardioRoutines, setCardioRoutines] = useState<CardioRoutine[]>([]);
  const [recoveryIds, setRecoveryIds] = useState<Set<string>>(new Set());
  const [plannedCardio, setPlannedCardio] = useState<Record<string, boolean>>({});
  const [planToday, setPlanToday] = useState<PlanToday[]>([]);
  const [celebrate, setCelebrate] = useState<WkFinish | null>(null);
  const [inputs, setInputs] = useState<Record<string, { kg: string; reps: string; secs: string; dist: string }>>({});
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [restLen, setRestLen] = useState<number>(REST_DEFAULT_S);
  const [restMap, setRestMap] = useState<Record<string, number>>({});
  const [buildId, setBuildId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [restPickerOpen, setRestPickerOpen] = useState(false);
  const [liveTimer, setLiveTimer] = useState<{ id: string; startedAt: number } | null>(null);
  const [editSecs, setEditSecs] = useState<string | null>(null);
  const [finishConfirm, setFinishConfirm] = useState<{ type: "empty" | "partial"; n: number } | null>(null);
  const [, force] = useState(0);
  const [dragG, setDragG] = useState<number | null>(null);
  const [overG, setOverG] = useState<number | null>(null);
  const [ssFor, setSsFor] = useState<number | null>(null);
  const [ssPick, setSsPick] = useState<number[]>([]);
  const [exMenu, setExMenu] = useState<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<any>(null);

  const seedInputs = useCallback((sets: WkSet[]) => {
    const m: Record<string, { kg: string; reps: string; secs: string; dist: string }> = {};
    for (const s of sets) m[s.id] = { kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "", secs: s.duration_s != null ? String(s.duration_s) : "", dist: s.distance_m != null ? String(s.distance_m) : "" };
    setInputs(m);
  }, []);
  const mergeSeed = useCallback((sets: WkSet[]) => {
    setInputs((prev) => {
      const m: Record<string, { kg: string; reps: string; secs: string; dist: string }> = {};
      for (const s of sets) m[s.id] = prev[s.id] || { kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "", secs: s.duration_s != null ? String(s.duration_s) : "", dist: s.distance_m != null ? String(s.distance_m) : "" };
      return m;
    });
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, cr, rec, wk] = await Promise.all([
        wkActive(),
        wkRoutines().catch(() => ({ routines: [] as WkRoutineSummary[] })),
        cardioList().catch(() => ({ routines: [] as CardioRoutine[] })),
        recoveryGet().catch(() => ({ routines: [] as { id: string }[] })),
        planWeek<{ today: string; sessions: PlanToday[] }>().catch(() => null),
      ]);
      setBundle(b); setRoutines(r.routines || []); setCardioRoutines(cr.routines || []);
      setRecoveryIds(new Set(((rec as { routines?: { id: string }[] }).routines || []).map((x) => x.id)));
      const t = todayISO();
      // Manual "start" is only for strength — cardio (Swim/Run/Cycle) is auto-detected from the tracker.
      setPlanToday(((wk?.sessions) || []).filter((s) => s.session_date === t && s.committed && !s.completed && !s.skipped && !s.is_rest_day && isStrength(s.session_type)));
      if (b.session) { seedInputs(b.sets); try { const rm = JSON.parse(localStorage.getItem(`hos_rest_map:${b.session.id}`) || "{}"); if (rm && typeof rm === "object") setRestMap(rm as Record<string, number>); } catch { /* ignore */ } }
    } finally { setLoading(false); }
  }, [seedInputs]);

  const loadEditSession = useCallback(async () => {
    if (!editSessionId) return;
    setLoading(true);
    try { const b = await wkSession(editSessionId); setBundle(b); seedInputs(b.sets); setView("log"); } finally { setLoading(false); }
  }, [editSessionId, seedInputs]);
  useEffect(() => { if (editSessionId) loadEditSession(); else loadHome(); }, [editSessionId, loadEditSession, loadHome]);

  useEffect(() => {
    if (view === "log" && !editSessionId && bundle?.session?.started_at) {
      tick.current = setInterval(() => force((n) => n + 1), 1000);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
  }, [view, bundle?.session?.started_at]);

  // Hydrate the persisted default rest length (client-only; localStorage is unavailable during SSR).
  useEffect(() => {
    try { const v = Number(localStorage.getItem(REST_LS_KEY)); if (Number.isFinite(v) && v >= 0 && v <= 600) setRestLen(v); } catch { /* ignore */ }
  }, []);

  // Auto-dismiss the rest timer at 0: fire a haptic buzz (if supported) and clear. Re-arms on every restEnd change
  // (new set completed, ±15, skip), so there is exactly one buzz per rest and none on skip/uncomplete.
  useEffect(() => {
    if (restEnd == null) return;
    const ms = restEnd - Date.now();
    const buzz = () => { try { navigator.vibrate?.(200); } catch { /* ignore */ } setRestEnd(null); };
    if (ms <= 0) { buzz(); return; }
    const to = setTimeout(buzz, ms);
    return () => clearTimeout(to);
  }, [restEnd]);

  // Rest picker: set the default rest length, persist it, and (if a timer is running) re-arm to the new length.
  function pickRest(v: number) {
    setRestLen(v);
    try { localStorage.setItem(REST_LS_KEY, String(v)); } catch { /* ignore */ }
    setRestEnd((e) => (e == null ? e : v > 0 ? Date.now() + v * 1000 : null));
    setRestPickerOpen(false);
  }

  // Keep the screen awake while logging (best-effort; unsupported browsers no-op). Re-acquire when the tab returns to foreground.
  useEffect(() => {
    if (view !== "log") return;
    let released = false;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> } };
    const acquire = async () => {
      try { if (!nav.wakeLock || document.visibilityState !== "visible") return; wakeRef.current = await nav.wakeLock.request("screen"); } catch { /* ignore */ }
    };
    const onVis = () => { if (!released && document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => { released = true; document.removeEventListener("visibilitychange", onVis); try { wakeRef.current?.release?.(); } catch { /* ignore */ } wakeRef.current = null; };
  }, [view]);

  function patchSets(fn: (s: WkSet[]) => WkSet[]) { setBundle((b) => (b && b.session ? { ...b, sets: fn(b.sets) } : b)); }
  const reloadActive = useCallback(async () => { const b = editSessionId ? await wkSession(editSessionId) : await wkActive(); setBundle(b); mergeSeed(b.sets); }, [mergeSeed, editSessionId]);

  async function startFrom(opts: { plan_id?: string; routine_id?: string; title?: string }) {
    setBusy(true);
    try {
      const b = await wkStart(opts); setBundle(b); seedInputs(b.sets); setView("log");
      if (opts.routine_id && b.session) {
        try {
          const rt = await wkRoutine(opts.routine_id);
          const map: Record<string, number> = {};
          for (const it of (rt.items || [])) { if (it.rest_s != null && it.rest_s > 0) map[it.exercise_name] = it.rest_s; }
          setRestMap(map);
          try { localStorage.setItem(`hos_rest_map:${b.session.id}`, JSON.stringify(map)); } catch { /* ignore */ }
        } catch { /* ignore */ }
      }
    } finally { setBusy(false); }
  }

  // ---- optimistic set ops (instant local update, background persist) ----
  async function addSetRow(g: { idx: number; name: string; muscle: string | null | undefined; sets: WkSet[] }) {
    if (!bundle?.session) return;
    const sid = bundle.session.id;
    const nextNum = (g.sets[g.sets.length - 1]?.set_number || 0) + 1;
    const id = tmpId();
    const row: WkSet = { id, session_id: sid, exercise_name: g.name, muscle_group: g.muscle ?? null, exercise_index: g.idx, set_number: nextNum, set_type: "normal", weight_kg: null, reps: null, rpe: null, rir: null, target_reps: null, target_weight_kg: null, completed: false };
    patchSets((s) => [...s, row]);
    setInputs((m) => ({ ...m, [id]: emptyInput() }));
    try {
      const r = await wkAddSet({ session_id: sid, exercise_name: g.name, muscle_group: g.muscle ?? null });
      if (r.ok && r.set) {
        const real = r.set;
        patchSets((s) => s.map((x) => (x.id === id ? real : x)));
        setInputs((m) => { const cur = m[id] || emptyInput(); const cp = { ...m }; delete cp[id]; cp[real.id] = cur; return cp; });
      } else patchSets((s) => s.filter((x) => x.id !== id));
    } catch { patchSets((s) => s.filter((x) => x.id !== id)); }
  }
  const startTimer = (id: string) => {
    setLiveTimer((cur) => {
      if (cur && cur.id !== id) { const el = Math.max(0, Math.floor((Date.now() - cur.startedAt) / 1000)); setInputs((m) => ({ ...m, [cur.id]: { ...(m[cur.id] || emptyInput()), secs: String(Number(m[cur.id]?.secs || 0) + el) } })); }
      return { id, startedAt: Date.now() };
    });
  };
  const pauseTimer = (s: WkSet) => {
    const cur = liveTimer; if (!cur || cur.id !== s.id) { setLiveTimer(null); return; }
    const el = Math.max(0, Math.floor((Date.now() - cur.startedAt) / 1000));
    setInputs((m) => { const total = Number(m[s.id]?.secs || 0) + el; if (s.completed) wkEditSet({ id: s.id, duration_s: total }).catch(() => {}); return { ...m, [s.id]: { ...(m[s.id] || emptyInput()), secs: String(total) } }; });
    setLiveTimer(null);
  };
  async function toggleComplete(s: WkSet) {
    if (isTemp(s.id)) return;
    let v = inputs[s.id] || emptyInput();
    if (s.tracking_type === "time" && liveTimer?.id === s.id) {
      const el = Math.max(0, Math.floor((Date.now() - liveTimer.startedAt) / 1000));
      v = { ...v, secs: String(Number(v.secs || 0) + el) };
      setInputs((m) => ({ ...m, [s.id]: v }));
      setLiveTimer(null);
    }
    const target = !s.completed;
    if (target) {
      const sets = bundle?.sets || [];
      const moreLeft = sets.some((x) => x.id !== s.id && !x.completed && !isTemp(x.id));
      const rl = restMap[s.exercise_name] ?? restLen;
      setRestEnd(moreLeft && rl > 0 ? Date.now() + rl * 1000 : null);
    } else setRestEnd(null);
    const pl = ttPayload(s.tracking_type, v);
    patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, completed: target, ...pl } : x)));
    try {
      if (target) await wkCompleteSet({ id: s.id, ...pl });
      else await wkEditSet({ id: s.id, completed: false });
    } catch { patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, completed: !target } : x))); }
  }
  function commitEdit(s: WkSet) {
    if (isTemp(s.id) || !s.completed) return;
    const v = inputs[s.id]; if (!v) return;
    const pl = ttPayload(s.tracking_type, v);
    patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, ...pl } : x)));
    wkEditSet({ id: s.id, ...pl }).catch(() => {});
  }
  async function deleteSetRow(s: WkSet) {
    if (isTemp(s.id) || !bundle) return;
    const snap = bundle.sets;
    patchSets((list) => list.filter((x) => x.id !== s.id));
    try { await wkDeleteSet(s.id); } catch { setBundle((b) => (b ? { ...b, sets: snap } : b)); }
  }
  async function addExercise(e: { name: string; muscle_group: string }) {
    if (!bundle?.session) return;
    const sid = bundle.session.id;
    const maxIdx = (bundle.sets || []).reduce((mx, x) => Math.max(mx, x.exercise_index ?? 0), -1);
    const id = tmpId();
    const row: WkSet = { id, session_id: sid, exercise_name: e.name, muscle_group: e.muscle_group || null, exercise_index: maxIdx + 1, set_number: 1, set_type: "normal", weight_kg: null, reps: null, rpe: null, rir: null, target_reps: null, target_weight_kg: null, completed: false };
    patchSets((s) => [...s, row]);
    setInputs((m) => ({ ...m, [id]: emptyInput() }));
    try { await wkAddExercise({ session_id: sid, exercise_name: e.name, muscle_group: e.muscle_group || null }); await reloadActive(); }
    catch { patchSets((s) => s.filter((x) => x.id !== id)); }
  }
  async function addExercises(picks: { name: string; muscle_group: string }[]) {
    if (!bundle?.session || picks.length === 0) return;
    if (picks.length === 1) return addExercise(picks[0]);
    const sid = bundle.session.id;
    let maxIdx = (bundle.sets || []).reduce((mx, x) => Math.max(mx, x.exercise_index ?? 0), -1);
    const temps: string[] = [];
    const rows: WkSet[] = [];
    for (const e of picks) {
      maxIdx += 1;
      const id = tmpId(); temps.push(id);
      rows.push({ id, session_id: sid, exercise_name: e.name, muscle_group: e.muscle_group || null, exercise_index: maxIdx, set_number: 1, set_type: "normal", weight_kg: null, reps: null, rpe: null, rir: null, target_reps: null, target_weight_kg: null, completed: false });
    }
    patchSets((s) => [...s, ...rows]);
    setInputs((m) => { const cp = { ...m }; for (const id of temps) cp[id] = emptyInput(); return cp; });
    try { for (const e of picks) await wkAddExercise({ session_id: sid, exercise_name: e.name, muscle_group: e.muscle_group || null }); await reloadActive(); }
    catch { const ids = new Set(temps); patchSets((s) => s.filter((x) => !ids.has(x.id))); }
  }
  async function doFinish(rpe: number | null) {
    if (!bundle?.session) return;
    setBusy(true);
    try { const r = await wkFinish({ session_id: bundle.session.id, session_rpe: rpe }); setCelebrate(r); setFinishing(false); setView("celebrate"); } finally { setBusy(false); }
  }
  async function doDone() {
    if (!editSessionId) return;
    setBusy(true);
    try { await wkRecompute(editSessionId); onExitEdit?.(); } finally { setBusy(false); }
  }
  async function doDiscard() {
    if (!bundle?.session) return;
    setBusy(true);
    try { await wkDiscard(bundle.session.id); setDiscarding(false); if (editSessionId) { onExitEdit?.(); } else { setView("home"); await loadHome(); } } finally { setBusy(false); }
  }
  async function saveTitle() {
    const t = (titleEdit || "").trim();
    setTitleEdit(null);
    const sess = bundle?.session;
    if (!sess || !t || t === sess.title) return;
    setBundle((b) => (b && b.session ? { ...b, session: { ...b.session, title: t } } : b));
    try { await wkRename({ session_id: sess.id, title: t }); } catch { /* best-effort */ }
  }

  const groups = useMemo(() => {
    const sets = bundle?.sets || [];
    const map = new Map<number, WkSet[]>();
    for (const s of sets) { const k = s.exercise_index ?? 0; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([idx, ss]) => ({ idx, name: ss[0].exercise_name, muscle: ss[0].muscle_group, tt: ss[0].tracking_type || "weight_reps", ssg: ss[0].superset_group ?? null, sets: ss.sort((a, b) => a.set_number - b.set_number) }));
  }, [bundle]);

  function moveGroup(from: number, to: number) {
    if (from === to || to < 0 || to >= groups.length) return;
    const order = groups.map((g) => g.idx);
    const [m] = order.splice(from, 1); order.splice(to, 0, m);
    const pos: Record<number, number> = {}; order.forEach((oi, np) => { pos[oi] = np; });
    patchSets((sets) => sets.map((x) => ({ ...x, exercise_index: pos[x.exercise_index ?? 0] ?? (x.exercise_index ?? 0) })));
    const sid = bundle?.session?.id;
    if (sid) wkReorder(sid, order).catch(() => { if (editSessionId) loadEditSession(); else reloadActive(); });
  }
  async function applySuperset(indexes: number[], group: number | null) {
    const sid = bundle?.session?.id; if (!sid) return;
    patchSets((sets) => sets.map((x) => (indexes.includes(x.exercise_index ?? 0) ? { ...x, superset_group: group } : x)));
    try { await wkSetSuperset(sid, indexes, group); } catch { if (editSessionId) loadEditSession(); else reloadActive(); }
  }

  if (editSessionId && (loading || !bundle?.session)) {
    return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0b0d12", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="muted">Loading&hellip;</div></div>;
  }

  // ---------------- CELEBRATE ----------------
  if (view === "celebrate" && celebrate) {
    const s = celebrate.summary;
    return (
      <div className="card" style={{ background: "linear-gradient(160deg,rgba(95,125,255,0.12),rgba(162,116,255,0.06))", border: "1px solid rgba(162,116,255,0.25)" }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Workout complete 💪</div>
        <div className="subtle tiny" style={{ marginTop: 2 }}>{celebrate.title || "Session logged"}</div>
        <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 12 }}>
          <div className="trn-cell"><div className="v tnum">{s.duration_mins ?? "—"}<span style={{ fontSize: 11 }}>m</span></div><div className="l">time</div></div>
          <div className="trn-cell"><div className="v tnum">{s.exercises}</div><div className="l">exercises</div></div>
          <div className="trn-cell"><div className="v tnum">{s.sets}</div><div className="l">sets</div></div>
          <div className="trn-cell"><div className="v tnum" style={{ fontSize: 14 }}>{fmtVolume(s.volume_kg)}</div><div className="l">volume</div></div>
        </div>
        {celebrate.prs.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {celebrate.prs.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(255,202,122,0.1)", border: "1px solid rgba(255,202,122,0.3)", marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>New {p.type} PR — {p.exercise}</div>
                  <div className="tiny subtle">{p.value}{p.unit}{p.prev != null ? ` · beat ${p.prev}${p.unit}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="subtle tiny" style={{ marginTop: 12 }}>No PRs this time — consistency is what compounds. Logged and counted.</div>}
        <button onClick={() => { setCelebrate(null); setView("home"); loadHome(); }} style={{ ...btn(ACCENT), width: "100%", marginTop: 14, padding: 12 }}>Done</button>
      </div>
    );
  }

  // ---------------- BUILD ----------------
  if (view === "build") {
    return <RoutineBuilder routineId={buildId} onExit={() => { setBuildId(null); setView("home"); loadHome(); }} />;
  }

  // ---------------- LOG ----------------
  if (view === "log" && bundle?.session) {
    const prevMap = bundle.prev || {};
    const doneSets = (bundle.sets || []).filter((x) => x.completed);
    const done = doneSets.length;
    const sessTitle = bundle.session.title || "Workout";
    const liveVol = doneSets.filter((x) => x.set_type === "normal").reduce((a, x) => a + ((Number(x.weight_kg) || 0) * (Number(x.reps) || 0)), 0);
    const restRemain = restEnd ? Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)) : 0;
    const resting = restRemain > 0;
    const upNext = (() => { for (const g of groups) { const gi = g.sets.findIndex((x) => !x.completed && !isTemp(x.id)); if (gi >= 0) return { name: g.name, n: gi + 1 }; } return null; })();
    const SS_COLORS = ["#a274ff", "#79e0a8", "#5f9dff", "#ffb454", "#ff6f9e", "#4fd1c5"];
    const ssColor = (v: number | null | undefined) => (v == null ? null : SS_COLORS[((v % SS_COLORS.length) + SS_COLORS.length) % SS_COLORS.length]);

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0b0d12", display: "flex", flexDirection: "column" }}>
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0b0d12" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <button onClick={() => { if (editSessionId) { onExitEdit?.(); } else { setView("home"); loadHome(); } }} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 auto", cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            {titleEdit !== null ? (
              <input autoFocus value={titleEdit} onChange={(e) => setTitleEdit(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "7px 10px", fontSize: 15, fontWeight: 800, fontFamily: "inherit" }} />
            ) : (
              <button onClick={() => setTitleEdit(sessTitle)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "text", color: "inherit", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: 0 }}>{sessTitle}<span className="subtle" style={{ fontSize: 12, marginLeft: 6, fontWeight: 400 }}>✎</span></button>
            )}
            <button onClick={() => { if (editSessionId) { doDone(); return; } const un = (bundle.sets || []).filter((x) => !x.completed && !isTemp(x.id)).length; if (done === 0) { setFinishConfirm({ type: "empty", n: 0 }); } else if (un > 0) { setFinishConfirm({ type: "partial", n: un }); } else { setFinishing(true); } }} style={btn("rgba(121,224,168,0.9)")} disabled={busy}>{editSessionId ? "Done" : "Finish"}</button>
            <div style={{ position: "relative", flex: "0 0 auto" }}>
              <button onClick={() => setMenuOpen((o) => !o)} aria-label="More" style={{ width: 34, height: 34, borderRadius: 9, cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
              {menuOpen ? (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 410 }} />
                  <div style={{ position: "absolute", top: 40, right: 0, zIndex: 411, minWidth: 160, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                    <button onClick={() => { setMenuOpen(false); setDiscarding(true); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#ff8a8a", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>{editSessionId ? "Delete workout" : "Discard workout"}</button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 14, width: "100%", maxWidth: 480, margin: "0 auto" }}>

        <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 12 }}>
          <div className="trn-cell"><div className="v tnum" style={{ color: "#8ab4ff" }}>{editSessionId ? (bundle.session.duration_mins != null ? bundle.session.duration_mins + "m" : "—") : fmtClock(bundle.session.started_at)}</div><div className="l">duration</div></div>
          <div className="trn-cell"><div className="v tnum" style={{ fontSize: 15 }}>{fmtVolume(liveVol)}</div><div className="l">volume</div></div>
          <div className="trn-cell"><div className="v tnum">{done}</div><div className="l">sets</div></div>
        </div>

        {groups.length === 0 ? <div className="subtle tiny" style={{ marginTop: 12 }}>Add your first exercise below.</div> : null}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g, gi) => {
            const prevList: WkPrevSet[] = prevMap[g.name] || [];
            const sc = ssColor(g.ssg);
            return (
              <div key={g.idx} data-gidx={gi} style={{ padding: 12, borderRadius: 12, background: dragG !== null && overG === gi ? "rgba(162,116,255,0.14)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: sc ? `3px solid ${sc}` : "1px solid rgba(255,255,255,0.06)", opacity: dragG === gi ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span onPointerDown={(e) => { setDragG(gi); setOverG(gi); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (dragG === null) return; const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-gidx]") as HTMLElement | null; if (el && el.dataset.gidx != null) setOverG(Number(el.dataset.gidx)); }} onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); if (dragG !== null && overG !== null) moveGroup(dragG, overG); setDragG(null); setOverG(null); }} style={{ cursor: "grab", touchAction: "none", userSelect: "none", color: "var(--muted)", fontSize: 15, padding: "0 2px", flex: "0 0 auto" }} aria-label="Drag to reorder">⠿</span>
                  <button onClick={() => setDetail(g.name)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>{g.name}<span className="subtle" style={{ fontSize: 11, fontWeight: 400 }}>ⓘ</span>{g.muscle ? <span className="subtle tiny" style={{ fontWeight: 400 }}> · {g.muscle}</span> : null}</button>
                  {sc ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: sc, border: `1px solid ${sc}`, borderRadius: 5, padding: "1px 5px", flex: "0 0 auto" }}>Superset</span> : null}
                  <div style={{ position: "relative", flex: "0 0 auto" }}>
                    <button aria-label="Exercise options" onClick={() => setExMenu(exMenu === g.idx ? null : g.idx)} style={{ width: 26, height: 26, borderRadius: 7, cursor: "pointer", background: "none", border: "none", color: "#8a90a6", fontSize: 16, lineHeight: 1 }}>⋯</button>
                    {exMenu === g.idx ? (<>
                      <div onClick={() => setExMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 420 }} />
                      <div style={{ position: "absolute", top: 28, right: 0, zIndex: 421, minWidth: 168, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                        <button onClick={() => { setExMenu(null); setSsPick(groups.filter((x) => x.ssg != null && x.ssg === g.ssg && x.idx !== g.idx).map((x) => x.idx)); setSsFor(g.idx); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#e6e9f2", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>Add to superset</button>
                        {g.ssg != null ? <button onClick={() => { setExMenu(null); applySuperset([g.idx], null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#ff8a8a", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>Remove from superset</button> : null}
                      </div>
                    </>) : null}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, opacity: 0.5 }}>
                  <span className="tiny" style={{ width: 16 }}>#</span>
                  <span className="tiny" style={{ width: 52 }}>prev</span>
                  {g.tt === "weight_reps" ? (<><span className="tiny" style={{ width: 50, textAlign: "center" }}>kg</span><span className="tiny" style={{ width: 10 }} /><span className="tiny" style={{ width: 50, textAlign: "center" }}>reps</span></>) : g.tt === "reps" ? (<span className="tiny" style={{ width: 60, textAlign: "center" }}>reps</span>) : g.tt === "time" ? (<span className="tiny" style={{ width: 120, textAlign: "center" }}>time</span>) : (<span className="tiny" style={{ width: 90, textAlign: "center" }}>metres</span>)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {g.sets.map((s, si) => {
                    const v = inputs[s.id] || emptyInput();
                    const pv = prevList[si];
                    const prevTxt = pv && pv.weight_kg != null ? `${pv.weight_kg}×${pv.reps ?? "—"}` : "–";
                    const kgPh = pv?.weight_kg != null ? String(pv.weight_kg) : "kg";
                    const repsPh = pv?.reps != null ? String(pv.reps) : "reps";
                    const temp = isTemp(s.id);
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: temp ? 0.55 : 1 }}>
                        <span className="tnum subtle" style={{ width: 16, fontSize: 12 }}>{si + 1}</span>
                        <span onClick={() => { if (pv) setInputs((m) => ({ ...m, [s.id]: { ...emptyInput(), kg: pv.weight_kg != null ? String(pv.weight_kg) : "", reps: pv.reps != null ? String(pv.reps) : "" } })); }} className="tnum" style={{ width: 52, fontSize: 12, opacity: 0.55, cursor: pv ? "pointer" : "default", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prevTxt}</span>
                        {g.tt === "weight_reps" ? (<>
                          <input inputMode="decimal" value={v.kg} placeholder={kgPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, kg: e.target.value } }))} onBlur={() => commitEdit(s)} style={{ ...inp, fontWeight: v.kg ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
                          <span className="subtle" style={{ fontSize: 12, width: 10, textAlign: "center" }}>×</span>
                          <input inputMode="numeric" value={v.reps} placeholder={repsPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, reps: e.target.value } }))} onBlur={() => commitEdit(s)} style={{ ...inp, fontWeight: v.reps ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
                        </>) : g.tt === "reps" ? (
                          <input inputMode="numeric" value={v.reps} placeholder={repsPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, reps: e.target.value } }))} onBlur={() => commitEdit(s)} style={{ ...inp, width: 60, fontWeight: v.reps ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
                        ) : g.tt === "time" ? (() => {
                          const running = liveTimer?.id === s.id;
                          const base = Number(v.secs || 0);
                          const shown = base + (running ? Math.max(0, Math.floor((Date.now() - (liveTimer as { startedAt: number }).startedAt) / 1000)) : 0);
                          return (<>
                            <button aria-label={running ? "pause timer" : "start timer"} onClick={() => (running ? pauseTimer(s) : startTimer(s.id))} style={{ width: 30, height: 30, borderRadius: "50%", flex: "0 0 auto", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "2px solid #4f8cff", color: "#8ab4ff", padding: 0 }}>
                              {running ? (<span style={{ display: "flex", gap: 2 }}><span style={{ width: 3, height: 11, background: "currentColor", borderRadius: 1 }} /><span style={{ width: 3, height: 11, background: "currentColor", borderRadius: 1 }} /></span>) : (<span style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid currentColor", marginLeft: 2 }} />)}
                            </button>
                            {editSecs === s.id ? (
                              <input autoFocus inputMode="text" defaultValue={base ? fmtSecs(base) : ""} placeholder="m:ss" onBlur={(e) => { const n = e.target.value.trim() === "" ? "" : String(parseMMSS(e.target.value)); setInputs((m) => ({ ...m, [s.id]: { ...(m[s.id] || emptyInput()), secs: n } })); setEditSecs(null); if (s.completed) { const dv = n === "" ? null : Number(n); patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, duration_s: dv } : x))); wkEditSet({ id: s.id, duration_s: dv }).catch(() => {}); } }} style={{ ...inp, width: 72, textAlign: "left", fontWeight: 700 }} />
                            ) : (
                              <button onClick={() => { if (!running) setEditSecs(s.id); }} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: running ? "default" : "text", padding: "0 8px", color: running ? "#8ab4ff" : (shown ? "#e6e9f2" : "#6b7180"), fontSize: 21, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtSecs(shown)}</button>
                            )}
                          </>);
                        })() : (
                          <input inputMode="decimal" value={v.dist} placeholder="m" onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, dist: e.target.value } }))} onBlur={() => commitEdit(s)} style={{ ...inp, width: 80, fontWeight: v.dist ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
                        )}
                        <button aria-label="complete set" onClick={() => toggleComplete(s)} disabled={temp}
                          style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, cursor: temp ? "default" : "pointer", flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: s.completed ? "#04110a" : "#8a90a6", background: s.completed ? "#79e0a8" : "rgba(255,255,255,0.05)", border: s.completed ? "none" : "1px solid rgba(255,255,255,0.18)" }}>
                          {s.completed ? "✓" : ""}
                        </button>
                        <button aria-label="delete set" onClick={() => deleteSetRow(s)} disabled={temp}
                          style={{ width: 24, height: 30, borderRadius: 8, cursor: temp ? "default" : "pointer", flex: "0 0 auto", background: "none", border: "none", color: "rgba(255,138,138,0.7)", fontSize: 13 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
                <button className="trn-sub" style={{ marginTop: 8 }} onClick={() => addSetRow(g)}>+ Set</button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Add exercise</div>
          <ExercisePicker onPick={addExercise} onPickMany={addExercises} />
        </div>

        {finishConfirm ? (
          <div onClick={() => setFinishConfirm(null)} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18 }}>
              {finishConfirm.type === "empty" ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>You haven&apos;t logged any values.</div>
                  <button onClick={() => setFinishConfirm(null)} style={{ ...btn(ACCENT), width: "100%", padding: 11 }}>OK</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{finishConfirm.n} exercise set{finishConfirm.n > 1 ? "s" : ""} without logging</div>
                  <div className="subtle tiny" style={{ marginBottom: 14 }}>They won&apos;t be saved. Finish without them?</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setFinishConfirm(null)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>No</button>
                    <button onClick={() => { setFinishConfirm(null); setFinishing(true); }} style={{ ...btn("rgba(121,224,168,0.9)"), flex: 1, padding: 11 }}>Yes</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
        {finishing ? (
          <div onClick={() => !busy && setFinishing(false)} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18 }}>
              <div className="tiny" style={{ fontWeight: 700, marginBottom: 10 }}>How hard was that? (session RPE)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[6, 7, 8, 9, 10].map((r) => (<button key={r} className="trn-sub" disabled={busy} onClick={() => doFinish(r)}>{r}</button>))}
                <button className="trn-sub" disabled={busy} onClick={() => doFinish(null)}>Skip</button>
              </div>
              <button className="trn-sub" style={{ marginTop: 10 }} onClick={() => setFinishing(false)}>Keep logging</button>
            </div>
          </div>
        ) : null}

        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0b0d12", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 480, margin: "0 auto" }}>
          {resting ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tnum" style={{ fontSize: 19, fontWeight: 800, color: "#8ab4ff" }}>Rest {fmtSecs(restRemain)}</div>
                <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,0.08)", marginTop: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (restRemain / restLen) * 100)}%`, background: ACCENT }} />
                </div>
              </div>
              <button onClick={() => setRestPickerOpen(true)} className="trn-sub" style={{ padding: "7px 11px", fontVariantNumeric: "tabular-nums" }}>{restLen > 0 ? fmtSecs(restLen) : "Off"}</button>
              <button onClick={() => setRestEnd(null)} style={btn("rgba(121,224,168,0.9)")}>Skip</button>
            </>
          ) : (
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div className="tiny" style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#8a90a6" }}>
                {upNext ? <span>Up next · <span style={{ color: "#cdd3e6", fontWeight: 700 }}>{upNext.name}</span> · set {upNext.n}</span> : "Last set — nice work 💪"}
              </div>
              <button onClick={() => setRestPickerOpen(true)} className="subtle tiny tnum" style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}>rest {restLen > 0 ? fmtSecs(restLen) : "off"} ✎</button>
            </div>
          )}
        </div>
        {detail ? <DetailOverlay title={detail} onClose={() => setDetail(null)} /> : null}
        {discarding ? (
          <div onClick={() => !busy && setDiscarding(false)} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 16 }}>
              <div className="tiny" style={{ color: "#ff8a8a", marginBottom: 12, fontWeight: 600 }}>Discard this workout? It won&apos;t be saved and can&apos;t be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy} onClick={doDiscard} style={{ ...btn("rgba(255,111,94,0.9)"), flex: 1, padding: 10 }}>{busy ? "Discarding…" : "Discard"}</button>
                <button disabled={busy} onClick={() => setDiscarding(false)} className="trn-sub" style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        ) : null}
        {restPickerOpen ? (
          <div onClick={() => setRestPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "60vh", overflowY: "auto", background: "#12151d", borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTop: "1px solid rgba(255,255,255,0.1)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Rest timer</div>
                <button onClick={() => setRestPickerOpen(false)} className="trn-sub" style={{ padding: "4px 12px" }}>Done</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {REST_STOPS.map((s) => (
                  <button key={s} onClick={() => pickRest(s)} className="trn-sub" style={{ padding: "10px 0", fontWeight: restLen === s ? 800 : 500, color: restLen === s ? "#fff" : undefined, background: restLen === s ? ACCENT : undefined, border: restLen === s ? "none" : undefined }}>{s === 0 ? "Off" : fmtSecs(s)}</button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {ssFor != null ? (() => {
          const forG = groups.find((x) => x.idx === ssFor);
          const others = groups.filter((x) => x.idx !== ssFor);
          const existing = forG?.ssg ?? null;
          const grp = existing != null ? existing : (groups.reduce((mx, x) => Math.max(mx, x.ssg ?? -1), -1) + 1);
          const col = ssColor(grp) || SS_COLORS[0];
          return (
            <div onClick={() => { setSsFor(null); setSsPick([]); }} style={{ position: "fixed", inset: 0, zIndex: 460, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "75vh", background: "#12151d", borderTopLeftRadius: 16, borderTopRightRadius: 16, border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Superset with {forG?.name}</div>
                  <div className="subtle tiny" style={{ marginTop: 2 }}>Pick the exercises to group together.</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                  {others.length === 0 ? <div className="subtle tiny" style={{ padding: 10 }}>Add another exercise first.</div> : others.map((x) => { const on = ssPick.includes(x.idx); return (
                    <button key={x.idx} onClick={() => setSsPick((p) => (on ? p.filter((i) => i !== x.idx) : [...p, x.idx]))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#fff", textAlign: "left" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, flex: "0 0 auto", border: on ? "none" : "1px solid rgba(255,255,255,0.3)", background: on ? col : "transparent", color: "#04110a", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{x.name}</span>
                      {x.ssg != null && x.ssg !== existing ? <span className="subtle tiny" style={{ flex: "0 0 auto" }}>in another</span> : null}
                    </button>
                  ); })}
                </div>
                <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8 }}>
                  <button onClick={() => { setSsFor(null); setSsPick([]); }} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  <button disabled={ssPick.length === 0} onClick={() => { applySuperset([ssFor, ...ssPick], grp); setSsFor(null); setSsPick([]); }} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: ssPick.length ? col : "rgba(255,255,255,0.12)", color: ssPick.length ? "#04110a" : "#8a90a6", fontWeight: 800, fontSize: 13, cursor: ssPick.length ? "pointer" : "default" }}>{existing != null ? "Update superset" : "Create superset"}</button>
                </div>
              </div>
            </div>
          );
        })() : null}
      </div>
    );
  }

  // ---------------- HOME ----------------
  return (
    <div>
      {loading ? <div className="muted center pad">Loading…</div> : (
        <>
          {bundle?.session ? (
            <button className="trn-continue" type="button" onClick={() => setView("log")}>
              <span className="play"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5l11 7-11 7z" /></svg></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">Resume: {bundle.session.title || "Workout"}</div>
                <div className="s">{(bundle.sets || []).filter((x) => x.completed).length} sets in · {elapsed(bundle.session.started_at)}</div>
              </div>
            </button>
          ) : (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Start a workout</div>
              {planToday.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {planToday.map((p) => (
                    <button key={p.id} onClick={() => startFrom({ plan_id: p.id })} disabled={busy} style={{ ...btn(ACCENT), width: "100%", padding: 12, textAlign: "left" }}>
                      Start today&apos;s plan — {p.session_type}: {p.activity}
                    </button>
                  ))}
                </div>
              ) : null}
              <button onClick={() => startFrom({ title: "Quick workout" })} disabled={busy} className="trn-sub" style={{ marginTop: 10, width: "100%", padding: 11 }}>+ Empty workout</button>
              <div className="subtle tiny" style={{ marginTop: 8, opacity: 0.75 }}>Cardio the coach scheduled (swim, run, ride) is detected automatically from your watch — no need to log it here.</div>
            </div>
          )}


          <div className="eyebrow" style={{ marginTop: 4 }}>Saved routines</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {routines.map((r) => {
              const locked = busy || !!bundle?.session;
              return (
                <div key={r.id} className="card" style={{ padding: 12, minHeight: 96, display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: locked ? "default" : "pointer", opacity: locked ? 0.6 : 1 }} onClick={() => { if (!locked) startFrom({ routine_id: r.id }); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    {recoveryIds.has(r.id)
                    ? <span aria-hidden style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 7px", borderRadius: 6, background: "rgba(52,211,153,0.16)", color: "#7fe3b8" }}>RECOVERY</span>
                    : <span aria-hidden style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 7px", borderRadius: 6, background: "rgba(162,116,255,0.16)", color: "#c9b6ff" }}>LIFT</span>}
                    <button aria-label="Edit routine" className="subtle" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2, fontSize: 13, opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); setBuildId(r.id); setView("build"); }}>✎</button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div className="subtle tiny">{r.item_count} exercise{r.item_count === 1 ? "" : "s"}{r.est_duration_mins ? ` · ${r.est_duration_mins}m` : ""}{r.focus ? ` · ${r.focus}` : ""}</div>
                  </div>
                </div>
              );
            })}
            {cardioRoutines.map((c) => {
              const km = c.total_distance_m ? (c.total_distance_m / 1000).toFixed(1) + "km" : null;
              const mins = c.total_duration_s ? Math.round(c.total_duration_s / 60) + "m" : null;
              const meta = [c.sport, km, mins].filter(Boolean).join(" · ");
              const done = !!plannedCardio[c.id];
              return (
                <div key={c.id} className="card" style={{ padding: 12, minHeight: 96, display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: busy || done ? "default" : "pointer", opacity: busy ? 0.6 : 1 }} onClick={() => { if (!busy && !done) { setBusy(true); cardioPrescribe({ routine_id: c.id }).then(() => setPlannedCardio((p) => ({ ...p, [c.id]: true }))).finally(() => setBusy(false)); } }}>
                  <span aria-hidden style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 7px", borderRadius: 6, background: "rgba(52,211,153,0.16)", color: "#7fe3b8" }}>CARDIO</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div className="subtle tiny" style={{ textTransform: "capitalize" }}>{done ? "Planned ✓ for today" : (meta || "cardio routine")}</div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => { setBuildId(null); setView("build"); }} className="card" style={{ padding: 12, minHeight: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", border: "1px dashed rgba(255,255,255,0.18)", background: "transparent", color: "inherit" }}>
              <span style={{ fontSize: 22, lineHeight: 1, opacity: 0.8 }}>+</span>
              <span className="subtle tiny">New routine</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ================= Routine builder =================
function RoutineBuilder({ routineId, onExit }: { routineId: string | null; onExit: () => void }) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [items, setItems] = useState<WkRoutineItem[]>([]);
  const [loading, setLoading] = useState(!!routineId);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [ssFor, setSsFor] = useState<number | null>(null);
  const [ssPick, setSsPick] = useState<number[]>([]);
  const [exMenu, setExMenu] = useState<number | null>(null);

  useEffect(() => {
    if (!routineId) return;
    wkRoutine(routineId).then((r) => {
      if (r.routine) { setName(r.routine.name); setFocus(r.routine.focus || ""); }
      setItems((r.items || []).map((it) => ({ exercise_name: it.exercise_name, muscle_group: it.muscle_group, target_sets: it.target_sets ?? 3, target_reps: it.target_reps ?? "", target_weight_kg: it.target_weight_kg ?? null, superset_group: it.superset_group ?? null })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [routineId]);

  function addItem(e: { name: string; muscle_group: string }) {
    setItems((xs) => [...xs, { exercise_name: e.name, muscle_group: e.muscle_group || null, target_sets: 3, target_reps: "8-12", target_weight_kg: null }]);
  }
  function upd(i: number, patch: Partial<WkRoutineItem>) { setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x))); }
  function remove(i: number) { setItems((xs) => xs.filter((_, j) => j !== i)); }
  function move(from: number, to: number) { setItems((xs) => { if (to < 0 || to >= xs.length || from === to) return xs; const a = xs.slice(); const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; }); }
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try { await wkSaveRoutine({ id: routineId || undefined, name: name.trim(), focus: focus.trim() || null, items }); onExit(); } finally { setSaving(false); }
  }
  async function del() { if (!routineId) return; setSaving(true); try { await wkDeleteRoutine(routineId); onExit(); } finally { setSaving(false); } }
  async function doParse() {
    const t = rawText.trim();
    if (!t || parsing) return;
    setParsing(true); setParseErr(null); setUnmatched([]);
    try {
      const r = await wkParseRoutine(t);
      if (!r.ok || !r.items || r.items.length === 0) { setParseErr(r.error || "Kai couldn't read that — try one exercise per line."); return; }
      if (!name.trim() && r.name) setName(r.name);
      if (!focus.trim() && r.focus) setFocus(r.focus);
      setItems(r.items.map((it) => ({ exercise_name: it.exercise_name, muscle_group: it.muscle_group ?? null, target_sets: it.target_sets ?? 3, target_reps: it.target_reps ?? "8-12", target_weight_kg: it.target_weight_kg ?? null })));
      setUnmatched(r.unmatched || []);
    } catch { setParseErr("Something went wrong reading that."); } finally { setParsing(false); }
  }

  if (loading) return <div className="muted center pad">Loading…</div>;
  const field: React.CSSProperties = { background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" };
  const SS_COLORS = ["#a274ff", "#79e0a8", "#5f9dff", "#ffb454", "#ff6f9e", "#4fd1c5"];
  const ssColor = (v: number | null | undefined) => (v == null ? null : SS_COLORS[((v % SS_COLORS.length) + SS_COLORS.length) % SS_COLORS.length]);
  function applySS(indices: number[], group: number | null) { setItems((xs) => xs.map((x, j) => (indices.includes(j) ? { ...x, superset_group: group } : x))); }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{routineId ? "Edit routine" : "New routine"}</div>
        <button className="trn-sub" onClick={onExit}>Cancel</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Routine name (e.g. Upper Push A)" style={field} />
        <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (optional, e.g. push / legs)" style={field} />
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(162,116,255,0.06)", border: "1px solid rgba(162,116,255,0.18)" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Describe it — Kai builds the list</div>
        <div className="subtle tiny" style={{ marginTop: 2 }}>e.g. &quot;Push day: bench 4×8, incline DB press 3×10, cable fly 3×12, lateral raises 4×15&quot;</div>
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={2} placeholder="Type or paste your routine…" style={{ ...field, width: "100%", marginTop: 8, resize: "vertical" }} />
        <button onClick={doParse} disabled={parsing || !rawText.trim()} style={{ ...btn(ACCENT), marginTop: 8, padding: "9px 12px", fontSize: 12 }}>{parsing ? "Kai is reading…" : "Parse with Kai"}</button>
        {parseErr ? <div className="subtle tiny" style={{ marginTop: 8, color: "#ff8a8a" }}>{parseErr}</div> : null}
        {unmatched.length > 0 ? <div className="subtle tiny" style={{ marginTop: 8, color: "#fbbf24" }}>Couldn&apos;t match: {unmatched.join(", ")} — edit or swap those below.</div> : null}
      </div>

      <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>Exercises</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} data-ridx={i} style={{ padding: 10, borderRadius: 10, background: dragIdx !== null && overIdx === i ? "rgba(162,116,255,0.14)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: ssColor(it.superset_group) ? `3px solid ${ssColor(it.superset_group)}` : "1px solid rgba(255,255,255,0.06)", opacity: dragIdx === i ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span onPointerDown={(e) => { setDragIdx(i); setOverIdx(i); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (dragIdx === null) return; const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-ridx]") as HTMLElement | null; if (el && el.dataset.ridx != null) setOverIdx(Number(el.dataset.ridx)); }} onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); if (dragIdx !== null && overIdx !== null) move(dragIdx, overIdx); setDragIdx(null); setOverIdx(null); }} style={{ cursor: "grab", touchAction: "none", userSelect: "none", color: "var(--muted)", fontSize: 15, padding: "0 4px", flex: "0 0 auto" }} aria-label="Drag to reorder">⠿</span>
              <button onClick={() => setDetail(it.exercise_name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>{it.exercise_name}<span className="subtle" style={{ fontSize: 11, fontWeight: 400 }}>ⓘ</span></button>
              {it.superset_group != null ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: ssColor(it.superset_group)!, border: `1px solid ${ssColor(it.superset_group)}`, borderRadius: 5, padding: "1px 5px", flex: "0 0 auto" }}>SS</span> : null}
              <div style={{ position: "relative", flex: "0 0 auto" }}>
                <button aria-label="Superset options" onClick={() => setExMenu(exMenu === i ? null : i)} style={{ width: 26, height: 26, borderRadius: 7, cursor: "pointer", background: "none", border: "none", color: "#8a90a6", fontSize: 16, lineHeight: 1 }}>⋯</button>
                {exMenu === i ? (<>
                  <div onClick={() => setExMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 420 }} />
                  <div style={{ position: "absolute", top: 28, right: 0, zIndex: 421, minWidth: 168, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                    <button onClick={() => { setExMenu(null); setSsPick(items.map((x, j) => (x.superset_group != null && x.superset_group === it.superset_group && j !== i ? j : -1)).filter((j) => j >= 0)); setSsFor(i); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#e6e9f2", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>Add to superset</button>
                    {it.superset_group != null ? <button onClick={() => { setExMenu(null); applySS([i], null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#ff8a8a", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8 }}>Remove from superset</button> : null}
                  </div>
                </>) : null}
              </div>
              <button className="trn-sub" onClick={() => remove(i)} style={{ padding: "4px 8px" }}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input inputMode="numeric" value={String(it.target_sets ?? "")} onChange={(e) => upd(i, { target_sets: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ ...inp, width: 46 }} />
              <span className="subtle tiny">sets ×</span>
              <input value={it.target_reps ?? ""} onChange={(e) => upd(i, { target_reps: e.target.value })} placeholder="8-12" style={{ ...inp, width: 64 }} />
              <span className="subtle tiny">reps</span>
              <input inputMode="decimal" value={it.target_weight_kg == null ? "" : String(it.target_weight_kg)} onChange={(e) => upd(i, { target_weight_kg: e.target.value === "" ? null : Number(e.target.value) })} placeholder="kg" style={{ ...inp, width: 52 }} />
              <span className="subtle tiny">kg</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}><ExercisePicker onPick={addItem} placeholder="Add an exercise…" /></div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving || !name.trim() || items.length === 0} style={{ ...btn(ACCENT), flex: 1, padding: 12 }}>{saving ? "Saving…" : "Save routine"}</button>
        {routineId ? <button onClick={del} disabled={saving} className="trn-sub" style={{ padding: "0 14px" }}>Delete</button> : null}
      </div>
      {detail ? <DetailOverlay title={detail} onClose={() => setDetail(null)} /> : null}
      {ssFor != null ? (() => {
        const forIt = items[ssFor];
        const existing = forIt?.superset_group ?? null;
        const grp = existing != null ? existing : (items.reduce((mx, x) => Math.max(mx, x.superset_group ?? -1), -1) + 1);
        const col = ssColor(grp) || SS_COLORS[0];
        return (
          <div onClick={() => { setSsFor(null); setSsPick([]); }} style={{ position: "fixed", inset: 0, zIndex: 460, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "75vh", background: "#12151d", borderTopLeftRadius: 16, borderTopRightRadius: 16, border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Superset with {forIt?.exercise_name}</div>
                <div className="subtle tiny" style={{ marginTop: 2 }}>Pick the exercises to group together.</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                {items.map((x, j) => { if (j === ssFor) return null; const on = ssPick.includes(j); return (
                  <button key={j} onClick={() => setSsPick((p) => (on ? p.filter((k) => k !== j) : [...p, j]))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#fff", textAlign: "left" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, flex: "0 0 auto", border: on ? "none" : "1px solid rgba(255,255,255,0.3)", background: on ? col : "transparent", color: "#04110a", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>{x.exercise_name}</span>
                    {x.superset_group != null && x.superset_group !== existing ? <span className="subtle tiny" style={{ flex: "0 0 auto" }}>in another</span> : null}
                  </button>
                ); })}
              </div>
              <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8 }}>
                <button onClick={() => { setSsFor(null); setSsPick([]); }} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button disabled={ssPick.length === 0} onClick={() => { applySS([ssFor, ...ssPick], grp); setSsFor(null); setSsPick([]); }} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: ssPick.length ? col : "rgba(255,255,255,0.12)", color: ssPick.length ? "#04110a" : "#8a90a6", fontWeight: 800, fontSize: 13, cursor: ssPick.length ? "pointer" : "default" }}>{existing != null ? "Update superset" : "Create superset"}</button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
