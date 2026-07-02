"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  wkActive, wkStart, wkLogSet, wkCompleteSet, wkEditSet, wkDeleteSet, wkAddExercise, wkFinish, wkDiscard,
  wkRoutines, wkRoutine, wkSaveRoutine, wkDeleteRoutine, wkExercises, planWeek,
} from "../lib/api";
import type { WkBundle, WkSet, WkFinish, WkRoutineSummary, WkRoutineItem, WkExercise, WkPrevSet } from "../lib/api";

type View = "home" | "log" | "celebrate" | "build";
type PlanToday = { id: string; session_type: string; activity: string; session_date: string; committed: boolean; completed: boolean; skipped: boolean; is_rest_day: boolean };

const ACCENT = "linear-gradient(135deg,#5f7dff,#a274ff)";
const btn = (bg: string): React.CSSProperties => ({ padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });
const inp: React.CSSProperties = { width: 52, textAlign: "center", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 4px", fontSize: 14, fontVariantNumeric: "tabular-nums" };
const todayISO = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];

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

// -------- Exercise autocomplete --------
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
  const [buildId, setBuildId] = useState<string | null>(null);
  const [, force] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const seedInputs = useCallback((sets: WkSet[]) => {
    const m: Record<string, { kg: string; reps: string }> = {};
    for (const s of sets) m[s.id] = { kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "" };
    setInputs(m);
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
      setPlanToday(((wk?.sessions) || []).filter((s) => s.session_date === t && s.committed && !s.completed && !s.skipped && !s.is_rest_day));
      if (b.session) { seedInputs(b.sets); }
    } finally { setLoading(false); }
  }, [seedInputs]);

  useEffect(() => { loadHome(); }, [loadHome]);

  // live 1s timer while logging
  useEffect(() => {
    if (view === "log" && bundle?.session?.started_at) {
      tick.current = setInterval(() => force((n) => n + 1), 1000);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
  }, [view, bundle?.session?.started_at]);

  const refresh = useCallback(async () => { const b = await wkActive(); setBundle(b); seedInputs(b.sets); }, [seedInputs]);

  async function startFrom(opts: { plan_id?: string; routine_id?: string; title?: string }) {
    setBusy(true);
    try { const b = await wkStart(opts); setBundle(b); seedInputs(b.sets); setView("log"); } finally { setBusy(false); }
  }
  async function completeSet(s: WkSet) {
    const v = inputs[s.id] || { kg: "", reps: "" };
    setBusy(true);
    try { await wkCompleteSet({ id: s.id, weight_kg: v.kg === "" ? null : Number(v.kg), reps: v.reps === "" ? null : Number(v.reps) }); await refresh(); } finally { setBusy(false); }
  }
  async function editSet(s: WkSet) {
    const v = inputs[s.id]; if (!v) return;
    await wkEditSet({ id: s.id, weight_kg: v.kg === "" ? null : Number(v.kg), reps: v.reps === "" ? null : Number(v.reps) }).catch(() => {});
  }
  async function addSet(exName: string, muscle: string | null | undefined, lastId?: string) {
    const last = lastId ? inputs[lastId] : undefined;
    setBusy(true);
    try {
      await wkLogSet({ session_id: bundle!.session!.id, exercise_name: exName, muscle_group: muscle || null, weight_kg: last?.kg ? Number(last.kg) : null, reps: last?.reps ? Number(last.reps) : null });
      await refresh();
    } finally { setBusy(false); }
  }
  async function addExercise(e: { name: string; muscle_group: string }) {
    setBusy(true);
    try { await wkAddExercise({ session_id: bundle!.session!.id, exercise_name: e.name, muscle_group: e.muscle_group || null }); await refresh(); } finally { setBusy(false); }
  }
  async function delSet(id: string) { setBusy(true); try { await wkDeleteSet(id); await refresh(); } finally { setBusy(false); } }
  async function doFinish(rpe: number | null) {
    setBusy(true);
    try { const r = await wkFinish({ session_id: bundle!.session!.id, session_rpe: rpe }); setCelebrate(r); setFinishing(false); setView("celebrate"); } finally { setBusy(false); }
  }
  async function doDiscard() {
    if (!bundle?.session) return;
    setBusy(true);
    try { await wkDiscard(bundle.session.id); setDiscarding(false); setView("home"); await loadHome(); } finally { setBusy(false); }
  }

  // group sets by exercise_index (ordered)
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
          <div className="trn-cell"><div className="v tnum">{(s.volume_kg / 1000).toFixed(1)}<span style={{ fontSize: 11 }}>t</span></div><div className="l">volume</div></div>
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

  // ---------------- BUILD (routine builder) ----------------
  if (view === "build") {
    return <RoutineBuilder routineId={buildId} onExit={() => { setBuildId(null); setView("home"); loadHome(); }} />;
  }

  // ---------------- LOG (live logger) ----------------
  if (view === "log" && bundle?.session) {
    const prevMap = bundle.prev || {};
    const doneSets = (bundle.sets || []).filter((x) => x.completed);
    const done = doneSets.length;
    const liveVol = doneSets.filter((x) => x.set_type === "normal").reduce((a, x) => a + ((Number(x.weight_kg) || 0) * (Number(x.reps) || 0)), 0);
    const volVal = liveVol >= 1000 ? (liveVol / 1000).toFixed(1) : String(Math.round(liveVol));
    const volUnit = liveVol >= 1000 ? "t" : "kg";
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bundle.session.title || "Workout"}</div>
          <button onClick={() => setFinishing(true)} style={btn("rgba(121,224,168,0.9)")} disabled={busy}>Finish</button>
        </div>

        {/* Live Duration · Volume · Sets (ticks every second) */}
        <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 12 }}>
          <div className="trn-cell"><div className="v tnum" style={{ color: "#8ab4ff" }}>{fmtClock(bundle.session.started_at)}</div><div className="l">duration</div></div>
          <div className="trn-cell"><div className="v tnum">{volVal}<span style={{ fontSize: 11 }}>{volUnit}</span></div><div className="l">volume</div></div>
          <div className="trn-cell"><div className="v tnum">{done}</div><div className="l">sets</div></div>
        </div>

        {groups.length === 0 ? <div className="subtle tiny" style={{ marginTop: 12 }}>Add your first exercise below.</div> : null}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {groups.map((g) => {
            const prevList: WkPrevSet[] = prevMap[g.name] || [];
            return (
              <div key={g.idx} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}{g.muscle ? <span className="subtle tiny" style={{ fontWeight: 400 }}> · {g.muscle}</span> : null}</div>
                {/* column header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, opacity: 0.5 }}>
                  <span className="tiny" style={{ width: 16 }}>#</span>
                  <span className="tiny" style={{ width: 62 }}>prev</span>
                  <span className="tiny" style={{ width: 52, textAlign: "center" }}>kg</span>
                  <span className="tiny" style={{ width: 12 }} />
                  <span className="tiny" style={{ width: 52, textAlign: "center" }}>reps</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {g.sets.map((s) => {
                    const v = inputs[s.id] || { kg: "", reps: "" };
                    const pv = prevList.find((p) => p.set_number === s.set_number);
                    const prevTxt = pv && pv.weight_kg != null ? `${pv.weight_kg}×${pv.reps ?? "—"}` : "–";
                    const kgPh = pv?.weight_kg != null ? String(pv.weight_kg) : (s.target_weight_kg != null ? String(s.target_weight_kg) : "kg");
                    const repsPh = pv?.reps != null ? String(pv.reps) : (s.target_reps != null ? String(s.target_reps) : "reps");
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="tnum subtle" style={{ width: 16, fontSize: 12 }}>{s.set_number}</span>
                        <span className="tnum" style={{ width: 62, fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prevTxt}</span>
                        <input inputMode="decimal" value={v.kg} placeholder={kgPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, kg: e.target.value } }))} onBlur={() => s.completed && editSet(s)} style={inp} />
                        <span className="subtle" style={{ fontSize: 12, width: 12, textAlign: "center" }}>×</span>
                        <input inputMode="numeric" value={v.reps} placeholder={repsPh} onChange={(e) => setInputs((m) => ({ ...m, [s.id]: { ...v, reps: e.target.value } }))} onBlur={() => s.completed && editSet(s)} style={inp} />
                        {s.completed ? (
                          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#79e0a8", fontWeight: 700 }}>✓</span>
                            <button className="trn-sub" onClick={() => delSet(s.id)} style={{ padding: "4px 8px" }}>✕</button>
                          </span>
                        ) : (
                          <button onClick={() => completeSet(s)} disabled={busy} style={{ ...btn(ACCENT), marginLeft: "auto", padding: "7px 12px" }}>Log</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className="trn-sub" style={{ marginTop: 8 }} disabled={busy} onClick={() => addSet(g.name, g.muscle, g.sets[g.sets.length - 1]?.id)}>+ Set</button>
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
              {[6, 7, 8, 9, 10].map((r) => (
                <button key={r} className="trn-sub" disabled={busy} onClick={() => doFinish(r)}>{r}</button>
              ))}
              <button className="trn-sub" disabled={busy} onClick={() => doFinish(null)}>Skip</button>
            </div>
            <button className="trn-sub" style={{ marginTop: 8 }} onClick={() => setFinishing(false)}>Keep logging</button>
          </div>
        ) : null}

        {/* Discard */}
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
            <button onClick={() => setDiscarding(true)} disabled={busy} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#ff8a8a", fontSize: 12, fontWeight: 600, padding: 4 }}>Discard workout</button>
          )}
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

// ================= Routine builder (2c) =================
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
