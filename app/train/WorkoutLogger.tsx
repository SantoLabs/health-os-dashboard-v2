"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  wkActive, wkStart, wkAddSet, wkCompleteSet, wkEditSet, wkDeleteSet, wkAddExercise, wkFinish, wkDiscard,
  wkRoutines, wkRoutine, wkSaveRoutine, wkDeleteRoutine, wkExercises, planWeek, fmtVolume, wkRename,
} from "../lib/api";
import type { WkBundle, WkSet, WkFinish, WkRoutineSummary, WkRoutineItem, WkExercise, WkPrevSet } from "../lib/api";

type View = "home" | "log" | "celebrate" | "build";
type PlanToday = { id: string; session_type: string; activity: string; session_date: string; committed: boolean; completed: boolean; skipped: boolean; is_rest_day: boolean };

const ACCENT = "linear-gradient(135deg,#5f7dff,#a274ff)";
const btn = (bg: string): React.CSSProperties => ({ padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
const inp: React.CSSProperties = { width: 50, textAlign: "center", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 4px", fontSize: 14, fontVariantNumeric: "tabular-nums" };
const todayISO = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
const isStrength = (t?: string) => /strength/i.test(t || "");
const isTemp = (id: string) => id.startsWith("temp:");
const tmpId = () => "temp:" + Math.random().toString(36).slice(2, 9);

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

function ExercisePicker({ onPick, placeholder }: { onPick: (e: { name: string; muscle_group: string }) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<WkExercise[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!open) return;
    const t = setTimeout(() => { wkExercises(q).then((r) => alive && setOpts(r.exercises || [])).catch(() => {}); }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open]);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder || "Add exercise…"}
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        {q.trim() ? <button className="trn-sub" onClick={() => { onPick({ name: q.trim(), muscle_group: "" }); setQ(""); setOpen(false); }}>Add</button> : null}
      </div>
      {open && opts.length > 0 ? (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opts.slice(0, 8).map((o) => (
            <button key={o.name} className="trn-sub" onClick={() => { onPick({ name: o.name, muscle_group: o.muscle_group }); setQ(""); setOpen(false); }}>{o.name}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkoutLogger() {
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bundle, setBundle] = useState<WkBundle | null>(null);
  const [routines, setRoutines] = useState<WkRoutineSummary[]>([]);
  const [planToday, setPlanToday] = useState<PlanToday[]>([]);
  const [celebrate, setCelebrate] = useState<WkFinish | null>(null);
  const [inputs, setInputs] = useState<Record<string, { kg: string; reps: string }>>({});
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [, force] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const seedInputs = useCallback((sets: WkSet[]) => {
    const m: Record<string, { kg: string; reps: string }> = {};
    for (const s of sets) m[s.id] = { kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "" };
    setInputs(m);
  }, []);
  const mergeSeed = useCallback((sets: WkSet[]) => {
    setInputs((prev) => {
      const m: Record<string, { kg: string; reps: string }> = {};
      for (const s of sets) m[s.id] = prev[s.id] || { kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "" };
      return m;
    });
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, wk] = await Promise.all([
        wkActive(),
        wkRoutines().catch(() => ({ routines: [] as WkRoutineSummary[] })),
        planWeek<{ today: string; sessions: PlanToday[] }>().catch(() => null),
      ]);
      setBundle(b); setRoutines(r.routines || []);
      const t = todayISO();
      // Manual "start" is only for strength — cardio (Swim/Run/Cycle) is auto-detected from the tracker.
      setPlanToday(((wk?.sessions) || []).filter((s) => s.session_date === t && s.committed && !s.completed && !s.skipped && !s.is_rest_day && isStrength(s.session_type)));
      if (b.session) seedInputs(b.sets);
    } finally { setLoading(false); }
  }, [seedInputs]);

  useEffect(() => { loadHome(); }, [loadHome]);

  useEffect(() => {
    if (view === "log" && bundle?.session?.started_at) {
      tick.current = setInterval(() => force((n) => n + 1), 1000);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
  }, [view, bundle?.session?.started_at]);

  function patchSets(fn: (s: WkSet[]) => WkSet[]) { setBundle((b) => (b && b.session ? { ...b, sets: fn(b.sets) } : b)); }
  const reloadActive = useCallback(async () => { const b = await wkActive(); setBundle(b); mergeSeed(b.sets); }, [mergeSeed]);

  async function startFrom(opts: { plan_id?: string; routine_id?: string; title?: string }) {
    setBusy(true);
    try { const b = await wkStart(opts); setBundle(b); seedInputs(b.sets); setView("log"); } finally { setBusy(false); }
  }

  // ---- optimistic set ops (instant local update, background persist) ----
  async function addSetRow(g: { idx: number; name: string; muscle: string | null | undefined; sets: WkSet[] }) {
    if (!bundle?.session) return;
    const sid = bundle.session.id;
    const nextNum = (g.sets[g.sets.length - 1]?.set_number || 0) + 1;
    const id = tmpId();
    const row: WkSet = { id, session_id: sid, exercise_name: g.name, muscle_group: g.muscle ?? null, exercise_index: g.idx, set_number: nextNum, set_type: "normal", weight_kg: null, reps: null, rpe: null, rir: null, target_reps: null, target_weight_kg: null, completed: false };
    patchSets((s) => [...s, row]);
    setInputs((m) => ({ ...m, [id]: { kg: "", reps: "" } }));
    try {
      const r = await wkAddSet({ session_id: sid, exercise_name: g.name, muscle_group: g.muscle ?? null });
      if (r.ok && r.set) {
        const real = r.set;
        patchSets((s) => s.map((x) => (x.id === id ? real : x)));
        setInputs((m) => { const cur = m[id] || { kg: "", reps: "" }; const cp = { ...m }; delete cp[id]; cp[real.id] = cur; return cp; });
      } else patchSets((s) => s.filter((x) => x.id !== id));
    } catch { patchSets((s) => s.filter((x) => x.id !== id)); }
  }
  async function toggleComplete(s: WkSet) {
    if (isTemp(s.id)) return;
    const v = inputs[s.id] || { kg: "", reps: "" };
    const target = !s.completed;
    patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, completed: target, weight_kg: v.kg === "" ? x.weight_kg : Number(v.kg), reps: v.reps === "" ? x.reps : Number(v.reps) } : x)));
    try {
      if (target) await wkCompleteSet({ id: s.id, weight_kg: v.kg === "" ? null : Number(v.kg), reps: v.reps === "" ? null : Number(v.reps) });
      else await wkEditSet({ id: s.id, completed: false });
    } catch { patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, completed: !target } : x))); }
  }
  function commitEdit(s: WkSet) {
    if (isTemp(s.id) || !s.completed) return;
    const v = inputs[s.id]; if (!v) return;
    const kg = v.kg === "" ? null : Number(v.kg); const reps = v.reps === "" ? null : Number(v.reps);
    patchSets((list) => list.map((x) => (x.id === s.id ? { ...x, weight_kg: kg, reps } : x)));
    wkEditSet({ id: s.id, weight_kg: kg, reps }).catch(() => {});
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
    setInputs((m) => ({ ...m, [id]: { kg: "", reps: "" } }));
    try { await wkAddExercise({ session_id: sid, exercise_name: e.name, muscle_group: e.muscle_group || null }); await reloadActive(); }
    catch { patchSets((s) => s.filter((x) => x.id !== id)); }
  }
  async function doFinish(rpe: number | null) {
    if (!bundle?.session) return;
    setBusy(true);
    try { const r = await wkFinish({ session_id: bundle.session.id, session_rpe: rpe }); setCelebrate(r); setFinishing(false); setView("celebrate"); } finally { setBusy(false); }
  }
  async function doDiscard() {
    if (!bundle?.session) return;
    setBusy(true);
    try { await wkDiscard(bundle.session.id); setDiscarding(false); setView("home"); await loadHome(); } finally { setBusy(false); }
  }
  async function saveTitle() {
    const t = (titleEdit || "").trim();
    setTitleEdit(null);
    if (!bundle?.session || !t || t === bundle.session.title) return;
    setBundle((b) => (b && b.session ? { ...b, session: { ...b.session, title: t } } : b));
    try { await wkRename({ session_id: bundle.session.id, title: t }); } catch { /* best-effort */ }
  }

  const groups = useMemo(() => {
    const sets = bundle?.sets || [];
    const map = new Map<number, WkSet[]>();
    for (const s of sets) { const k = s.exercise_index ?? 0; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([idx, ss]) => ({ idx, name: ss[0].exercise_name, muscle: ss[0].muscle_group, sets: ss.sort((a, b) => a.set_number - b.set_number) }));
  }, [bundle]);

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
    const liveVol = doneSets.filter((x) => x.set_type === "normal").reduce((a, x) => a + ((Number(x.weight_kg) || 0) * (Number(x.reps) || 0)), 0);

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0b0d12", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0b0d12" }}>
          <button onClick={() => { setView("home"); loadHome(); }} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 auto", cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          {titleEdit !== null ? (
            <input autoFocus value={titleEdit} onChange={(e) => setTitleEdit(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "7px 10px", fontSize: 15, fontWeight: 800, fontFamily: "inherit" }} />
          ) : (
            <button onClick={() => setTitleEdit(bundle.session.title || "Workout")} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "text", color: "inherit", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: 0 }}>{bundle.session.title || "Workout"}<span className="subtle" style={{ fontSize: 12, marginLeft: 6, fontWeight: 400 }}>✎</span></button>
          )}
          <button onClick={() => setFinishing(true)} style={btn("rgba(121,224,168,0.9)")} disabled={busy}>Finish</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 14, width: "100%", maxWidth: 480, margin: "0 auto" }}>

        <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 12 }}>
          <div className="trn-cell"><div className="v tnum" style={{ color: "#8ab4ff" }}>{fmtClock(bundle.session.started_at)}</div><div className="l">duration</div></div>
          <div className="trn-cell"><div className="v tnum" style={{ fontSize: 15 }}>{fmtVolume(liveVol)}</div><div className="l">volume</div></div>
          <div className="trn-cell"><div className="v tnum">{done}</div><div className="l">sets</div></div>
        </div>

        {groups.length === 0 ? <div className="subtle tiny" style={{ marginTop: 12 }}>Add your first exercise below.</div> : null}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => {
            const prevList: WkPrevSet[] = prevMap[g.name] || [];
            return (
              <div key={g.idx} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}{g.muscle ? <span className="subtle tiny" style={{ fontWeight: 400 }}> · {g.muscle}</span> : null}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, opacity: 0.5 }}>
                  <span className="tiny" style={{ width: 16 }}>#</span>
                  <span className="tiny" style={{ width: 52 }}>prev</span>
                  <span className="tiny" style={{ width: 50, textAlign: "center" }}>kg</span>
                  <span className="tiny" style={{ width: 10 }} />
                  <span className="tiny" style={{ width: 50, textAlign: "center" }}>reps</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {g.sets.map((s, si) => {
                    const v = inputs[s.id] || { kg: "", reps: "" };
                    const pv = prevList[si];
                    const prevTxt = pv && pv.weight_kg != null ? `${pv.weight_kg}×${pv.reps ?? "—"}` : "–";
                    const kgPh = pv?.weight_kg != null ? String(pv.weight_kg) : "kg";
                    const repsPh = pv?.reps != null ? String(pv.reps) : "reps";
                    const temp = isTemp(s.id);
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: temp ? 0.55 : 1 }}>
                        <span className="tnum subtle" style={{ width: 16, fontSize: 12 }}>{si + 1}</span>
                        <span onClick={() => { if (pv) setInputs((m) => ({ ...m, [s.id]: { kg: pv.weight_kg != null ? String(pv.weight_kg) : "", reps: pv.reps != null ? String(pv.reps) : "" } })); }} className="tnum" style={{ width: 52, fontSize: 12, opacity: 0.55, cursor: pv ? "pointer" : "default", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prevTxt}</span>
                        <input inputMode="decimal" value={v.kg} placeholder={kgPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, kg: e.target.value } }))} onBlur={() => commitEdit(s)}
                          style={{ ...inp, fontWeight: v.kg ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
                        <span className="subtle" style={{ fontSize: 12, width: 10, textAlign: "center" }}>×</span>
                        <input inputMode="numeric" value={v.reps} placeholder={repsPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, reps: e.target.value } }))} onBlur={() => commitEdit(s)}
                          style={{ ...inp, fontWeight: v.reps ? 700 : 400, background: s.completed ? "rgba(121,224,168,0.10)" : (inp.background as string) }} />
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
          <ExercisePicker onPick={addExercise} />
        </div>

        {finishing ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="tiny" style={{ fontWeight: 700, marginBottom: 8 }}>How hard was that? (session RPE)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[6, 7, 8, 9, 10].map((r) => (<button key={r} className="trn-sub" disabled={busy} onClick={() => doFinish(r)}>{r}</button>))}
              <button className="trn-sub" disabled={busy} onClick={() => doFinish(null)}>Skip</button>
            </div>
            <button className="trn-sub" style={{ marginTop: 8 }} onClick={() => setFinishing(false)}>Keep logging</button>
          </div>
        ) : null}

        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          {discarding ? (
            <div>
              <div className="tiny" style={{ color: "#ff8a8a", marginBottom: 8 }}>Discard this workout? It won&apos;t be saved and can&apos;t be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy} onClick={doDiscard} style={{ ...btn("rgba(255,111,94,0.9)"), flex: 1, padding: 10 }}>{busy ? "Discarding…" : "Discard"}</button>
                <button disabled={busy} onClick={() => setDiscarding(false)} className="trn-sub" style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDiscarding(true)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#ff8a8a", fontSize: 12, fontWeight: 600, padding: 4 }}>Discard workout</button>
          )}
        </div>
        </div>
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

          <div className="eyebrow" style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Saved routines</span>
            <button className="trn-sub" style={{ padding: "4px 10px" }} onClick={() => { setBuildId(null); setView("build"); }}>+ New</button>
          </div>
          {routines.length === 0 ? (
            <div className="subtle tiny" style={{ padding: "4px 2px 8px" }}>No routines yet. Build one to start workouts in a tap.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {routines.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                    <div className="subtle tiny">{r.item_count} exercise{r.item_count === 1 ? "" : "s"}{r.focus ? ` · ${r.focus}` : ""}{r.est_duration_mins ? ` · ${r.est_duration_mins}m` : ""}</div>
                  </div>
                  <button className="trn-sub" disabled={busy || !!bundle?.session} onClick={() => startFrom({ routine_id: r.id })}>Start</button>
                  <button className="trn-sub" onClick={() => { setBuildId(r.id); setView("build"); }}>Edit</button>
                </div>
              ))}
            </div>
          )}
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

  useEffect(() => {
    if (!routineId) return;
    wkRoutine(routineId).then((r) => {
      if (r.routine) { setName(r.routine.name); setFocus(r.routine.focus || ""); }
      setItems((r.items || []).map((it) => ({ exercise_name: it.exercise_name, muscle_group: it.muscle_group, target_sets: it.target_sets ?? 3, target_reps: it.target_reps ?? "", target_weight_kg: it.target_weight_kg ?? null })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [routineId]);

  function addItem(e: { name: string; muscle_group: string }) {
    setItems((xs) => [...xs, { exercise_name: e.name, muscle_group: e.muscle_group || null, target_sets: 3, target_reps: "8-12", target_weight_kg: null }]);
  }
  function upd(i: number, patch: Partial<WkRoutineItem>) { setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x))); }
  function remove(i: number) { setItems((xs) => xs.filter((_, j) => j !== i)); }
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try { await wkSaveRoutine({ id: routineId || undefined, name: name.trim(), focus: focus.trim() || null, items }); onExit(); } finally { setSaving(false); }
  }
  async function del() { if (!routineId) return; setSaving(true); try { await wkDeleteRoutine(routineId); onExit(); } finally { setSaving(false); } }

  if (loading) return <div className="muted center pad">Loading…</div>;
  const field: React.CSSProperties = { background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" };

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

      <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>Exercises</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{it.exercise_name}</div>
              <button className="trn-sub" onClick={() => remove(i)} style={{ padding: "4px 8px" }}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input inputMode="numeric" value={String(it.target_sets ?? "")} onChange={(e) => upd(i, { target_sets: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ ...inp, width: 46 }} />
              <span className="subtle tiny">sets ×</span>
              <input value={it.target_reps ?? ""} onChange={(e) => upd(i, { target_reps: e.target.value })} placeholder="8-12" style={{ ...inp, width: 64 }} />
              <span className="subtle tiny">reps</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}><ExercisePicker onPick={addItem} placeholder="Add an exercise…" /></div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving || !name.trim() || items.length === 0} style={{ ...btn(ACCENT), flex: 1, padding: 12 }}>{saving ? "Saving…" : "Save routine"}</button>
        {routineId ? <button onClick={del} disabled={saving} className="trn-sub" style={{ padding: "0 14px" }}>Delete</button> : null}
      </div>
    </div>
  );
}
