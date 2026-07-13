"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { strengthStats, strengthSessions, wkSession, wkRename, wkAddSet, wkEditSet, wkDeleteSet, wkDiscard, wkRecompute, wkExercises, type StrengthStats, type RadarAxis, type StrengthSession, type WkSet, type WkExercise } from "../lib/api";
import { muscleTint } from "./ui";
import ExerciseDetail from "./ExerciseDetail";

const AXES = ["Chest", "Back", "Core", "Legs", "Shoulders", "Arms"];
const WIN: [string, string][] = [["30d", "30 days"], ["60d", "60 days"], ["90d", "90 days"], ["lifetime", "Lifetime"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (d === 0) return <span className="subtle tiny"> ±0</span>;
  const up = d > 0;
  const pct = Math.round((d / prev) * 100);
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#34d399" : "#fb7185" }}> {up ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Radar({ data }: { data: RadarAxis[] }) {
  const byAxis: Record<string, RadarAxis> = {};
  data.forEach((d) => { byAxis[d.axis] = d; });
  const showPrev = data.some((d) => d.previous != null && d.previous > 0);
  const max = Math.max(1, ...data.flatMap((d) => [d.current, d.previous ?? 0]));
  const cx = 130, cy = 130, R = 88;
  const pt = (i: number, v: number): [number, number] => { const a = ((-90 + i * 60) * Math.PI) / 180; const r = (v / max) * R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = (sel: "current" | "previous") => AXES.map((a, i) => pt(i, (byAxis[a]?.[sel] ?? 0) as number).join(",")).join(" ");
  const gridPoly = (f: number) => AXES.map((a, i) => { const an = ((-90 + i * 60) * Math.PI) / 180; return [cx + f * R * Math.cos(an), cy + f * R * Math.sin(an)].join(","); }).join(" ");
  return (
    <svg viewBox="0 0 260 260" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={gridPoly(f)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />)}
      {AXES.map((a, i) => { const [x, y] = pt(i, max); return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />; })}
      {showPrev ? <polygon points={poly("previous")} fill="rgba(148,163,184,0.14)" stroke="rgba(148,163,184,0.55)" strokeWidth={1.5} /> : null}
      <polygon points={poly("current")} fill="rgba(139,124,246,0.22)" stroke="#a274ff" strokeWidth={2} />
      {AXES.map((a, i) => { const an = ((-90 + i * 60) * Math.PI) / 180; const lx = cx + (R + 20) * Math.cos(an), ly = cy + (R + 20) * Math.sin(an); return <text key={a} x={lx} y={ly} fill="#8a90a6" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="middle">{a}</text>; })}
    </svg>
  );
}

function fmtDate(d: string) { const dt = new Date(d + "T00:00:00"); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; }

function fmtSecsE(s: number) { const m = Math.floor(s / 60); const ss = s % 60; return `${m}:${String(ss).padStart(2, "0")}`; }
function parseMMSSE(str: string) { const t = (str || "").trim(); if (!t) return 0; if (t.includes(":")) { const p = t.split(":"); return Math.max(0, (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0)); } return Math.max(0, Math.round(Number(t) || 0)); }

type DraftSet = { id: string; tt: string; kg: string; reps: string; secs: string; dist: string };
type DraftEx = { key: string; name: string; muscle: string | null; tt: string; sets: DraftSet[] };
const einp: CSSProperties = { width: 62, padding: "7px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 14, textAlign: "center", fontVariantNumeric: "tabular-nums" };
function ebtn(bg: string): CSSProperties { return { padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#0b0d12", background: bg }; }

function ExercisePickerLite({ onPick, onClose }: { onPick: (e: WkExercise) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<WkExercise[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { let alive = true; setLoading(true); const t = setTimeout(() => { wkExercises(q).then((r) => { if (alive) setRes(r.exercises || []); }).catch(() => {}).finally(() => alive && setLoading(false)); }, 220); return () => { alive = false; clearTimeout(t); }; }, [q]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 460, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "80vh", background: "#12151d", borderTopLeftRadius: 16, borderTopRightRadius: 16, border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 14 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && res.length === 0 ? <div className="subtle tiny" style={{ padding: 10 }}>Searching…</div> : res.map((ex) => (
            <button key={ex.name} onClick={() => onPick(ex)} style={{ width: "100%", textAlign: "left", padding: "11px 10px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#fff" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
              <div className="subtle tiny" style={{ textTransform: "capitalize" }}>{(ex.muscle_group || "").replace(/_/g, " ")}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionEditor({ sessionId, onClose, onCommitted }: { sessionId: string; onClose: () => void; onCommitted: () => void }) {
  const [title, setTitle] = useState("");
  const [origTitle, setOrigTitle] = useState("");
  const [exs, setExs] = useState<DraftEx[]>([]);
  const [delIds, setDelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [picker, setPicker] = useState(false);
  const [guard, setGuard] = useState<{ type: "empty" } | { type: "partial"; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await wkSession(sessionId);
        if (!alive) return;
        setOrigTitle(b.session?.title || ""); setTitle(b.session?.title || "");
        const map = new Map<number, WkSet[]>();
        for (const s of b.sets) { const k = s.exercise_index ?? 0; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
        setExs(Array.from(map.entries()).sort((a, c) => a[0] - c[0]).map(([idx, ss]) => ({
          key: "e" + idx, name: ss[0].exercise_name, muscle: ss[0].muscle_group ?? null, tt: ss[0].tracking_type || "weight_reps",
          sets: ss.sort((a, c) => a.set_number - c.set_number).map((s) => ({ id: s.id, tt: s.tracking_type || "weight_reps", kg: s.weight_kg != null ? String(s.weight_kg) : "", reps: s.reps != null ? String(s.reps) : "", secs: s.duration_s != null ? String(s.duration_s) : "", dist: s.distance_m != null ? String(s.distance_m) : "" })),
        })));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  const dirty = title.trim() !== origTitle.trim() || delIds.length > 0 || exs.some((e) => e.sets.some((s) => s.id.startsWith("tmp-")));
  const setVal = (ek: string, sid: string, f: keyof DraftSet, v: string) => setExs((l) => l.map((e) => (e.key === ek ? { ...e, sets: e.sets.map((s) => (s.id === sid ? { ...s, [f]: v } : s)) } : e)));
  const hasVal = (s: DraftSet) => (s.tt === "weight_reps" ? s.kg !== "" || s.reps !== "" : s.tt === "reps" ? s.reps !== "" : s.tt === "time" ? s.secs !== "" : s.dist !== "");
  const rand = () => "tmp-" + Math.random().toString(36).slice(2, 9);
  const addSet = (ek: string) => setExs((l) => l.map((e) => (e.key === ek ? { ...e, sets: [...e.sets, { id: rand(), tt: e.tt, kg: "", reps: "", secs: "", dist: "" }] } : e)));
  const rmSet = (ek: string, sid: string) => { if (!sid.startsWith("tmp-")) setDelIds((d) => [...d, sid]); setExs((l) => l.map((e) => (e.key === ek ? { ...e, sets: e.sets.filter((s) => s.id !== sid) } : e)).filter((e) => e.sets.length > 0)); };
  const pick = (ex: WkExercise) => { const tt = ((ex as { tracking_type?: string }).tracking_type) || "weight_reps"; setExs((l) => [...l, { key: "n" + rand(), name: ex.name, muscle: ex.muscle_group || null, tt, sets: [{ id: rand(), tt, kg: "", reps: "", secs: "", dist: "" }] }]); setPicker(false); };

  async function commit(skipEmpty: boolean) {
    setBusy(true);
    try {
      if (title.trim() !== origTitle.trim()) await wkRename({ session_id: sessionId, title: title.trim() });
      for (const id of delIds) await wkDeleteSet(id);
      for (const e of exs) {
        for (const s of e.sets) {
          const filled = hasVal(s);
          if (!filled) { if (skipEmpty && !s.id.startsWith("tmp-")) await wkDeleteSet(s.id); if (skipEmpty) continue; }
          const p: { weight_kg?: number | null; reps?: number | null; duration_s?: number | null; distance_m?: number | null } = {};
          if (s.tt === "weight_reps") { p.weight_kg = s.kg === "" ? null : Number(s.kg); p.reps = s.reps === "" ? null : Number(s.reps); }
          else if (s.tt === "reps") p.reps = s.reps === "" ? null : Number(s.reps);
          else if (s.tt === "time") p.duration_s = s.secs === "" ? null : Number(s.secs);
          else p.distance_m = s.dist === "" ? null : Number(s.dist);
          if (s.id.startsWith("tmp-")) { const r = await wkAddSet({ session_id: sessionId, exercise_name: e.name, muscle_group: e.muscle || undefined }); if (r.ok && r.set) await wkEditSet({ id: r.set.id, completed: true, ...p }); }
          else await wkEditSet({ id: s.id, completed: true, ...p });
        }
      }
      await wkRecompute(sessionId);
      onCommitted();
    } finally { setBusy(false); }
  }
  function onSave() {
    const all = exs.flatMap((e) => e.sets);
    const filled = all.filter(hasVal).length;
    const empty = all.length - filled;
    if (filled === 0) { setGuard({ type: "empty" }); return; }
    if (empty > 0) { setGuard({ type: "partial", n: empty }); return; }
    commit(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button aria-label="Back" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 auto", cursor: "pointer", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, lineHeight: 1 }}>‹</button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Workout name" style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 15, fontWeight: 700 }} />
        <button disabled={busy || !dirty} onClick={onSave} style={{ ...ebtn(dirty ? "#79e0a8" : "rgba(255,255,255,0.12)"), color: dirty ? "#04110a" : "#8a90a6", opacity: busy ? 0.6 : 1 }}>Save</button>
        <button aria-label="Delete workout" onClick={() => setConfirmDel(true)} style={ebtn("rgba(255,111,94,0.92)")}>Delete</button>
      </div>

      {loading ? <div className="muted center pad">Loading…</div> : (
        <>
          {exs.map((e) => (
            <div key={e.key} className="card" style={{ marginBottom: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{e.name}{e.muscle ? <span className="tiny" style={{ marginLeft: 6, color: muscleTint(e.muscle), textTransform: "capitalize", fontWeight: 500 }}>{e.muscle.replace(/_/g, " ")}</span> : null}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {e.sets.map((s, si) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tnum subtle" style={{ width: 16, fontSize: 12 }}>{si + 1}</span>
                    {e.tt === "weight_reps" ? (<>
                      <input inputMode="decimal" value={s.kg} placeholder="kg" onChange={(ev) => setVal(e.key, s.id, "kg", ev.target.value)} style={einp} />
                      <span className="subtle" style={{ fontSize: 12 }}>×</span>
                      <input inputMode="numeric" value={s.reps} placeholder="reps" onChange={(ev) => setVal(e.key, s.id, "reps", ev.target.value)} style={einp} />
                    </>) : e.tt === "reps" ? (
                      <input inputMode="numeric" value={s.reps} placeholder="reps" onChange={(ev) => setVal(e.key, s.id, "reps", ev.target.value)} style={{ ...einp, width: 80 }} />
                    ) : e.tt === "time" ? (
                      <input inputMode="text" value={s.secs && !s.secs.includes(":") ? fmtSecsE(Number(s.secs)) : s.secs} placeholder="m:ss" onChange={(ev) => setVal(e.key, s.id, "secs", ev.target.value)} onBlur={(ev) => setVal(e.key, s.id, "secs", ev.target.value.trim() === "" ? "" : String(parseMMSSE(ev.target.value)))} style={{ ...einp, width: 84 }} />
                    ) : (
                      <input inputMode="decimal" value={s.dist} placeholder="m" onChange={(ev) => setVal(e.key, s.id, "dist", ev.target.value)} style={{ ...einp, width: 84 }} />
                    )}
                    <button aria-label="remove set" onClick={() => rmSet(e.key, s.id)} style={{ marginLeft: "auto", width: 26, height: 30, borderRadius: 8, background: "none", border: "none", color: "rgba(255,138,138,0.75)", fontSize: 14, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addSet(e.key)} className="trn-sub" style={{ marginTop: 8, padding: "6px 12px" }}>+ Set</button>
            </div>
          ))}
          <button onClick={() => setPicker(true)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.03)", color: "#8ab4ff", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 20 }}>+ Add exercise</button>
        </>
      )}

      {picker ? <ExercisePickerLite onPick={pick} onClose={() => setPicker(false)} /> : null}
      {guard ? (
        <div onClick={() => setGuard(null)} style={{ position: "fixed", inset: 0, zIndex: 470, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 18 }}>
            {guard.type === "empty" ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>You haven&apos;t logged any values.</div>
                <button onClick={() => setGuard(null)} style={{ ...ebtn("#79e0a8"), width: "100%", padding: 11 }}>OK</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{guard.n} set{guard.n > 1 ? "s" : ""} without values</div>
                <div className="subtle tiny" style={{ marginBottom: 14 }}>They won&apos;t be saved. Save without them?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={busy} onClick={() => setGuard(null)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>No</button>
                  <button disabled={busy} onClick={() => { setGuard(null); commit(true); }} style={{ ...ebtn("#79e0a8"), flex: 1, padding: 11 }}>Yes</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {confirmDel ? (
        <div onClick={() => !busy && setConfirmDel(false)} style={{ position: "fixed", inset: 0, zIndex: 470, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#12151d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 16 }}>
            <div className="tiny" style={{ color: "#ff8a8a", marginBottom: 12, fontWeight: 600 }}>Delete this workout permanently? This can&apos;t be undone.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={async () => { setBusy(true); try { await wkDiscard(sessionId); onCommitted(); } finally { setBusy(false); } }} style={{ ...ebtn("rgba(255,111,94,0.92)"), flex: 1, padding: 10, color: "#fff" }}>{busy ? "Deleting…" : "Delete"}</button>
              <button disabled={busy} onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function StrengthTab() {
  const [sel, setSel] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [stats, setStats] = useState<StrengthStats | null>(null);
  const [win, setWin] = useState<string>("30d");
  const [sessions, setSessions] = useState<StrengthSession[] | null>(null);
  const [serr, setSerr] = useState(false);
  const [monthIdx, setMonthIdx] = useState(0);
  const [exp, setExp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    strengthStats().then((s) => alive && setStats(s)).catch(() => {});
    strengthSessions().then((s) => alive && setSessions(s)).catch(() => { if (alive) { setSerr(true); setSessions([]); } });
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => {
    if (!sessions) return [];
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [sessions]);
  const curMonth = months[monthIdx] || null;
  const monthSessions = useMemo(() => (sessions && curMonth ? sessions.filter((s) => s.date.slice(0, 7) === curMonth) : []), [sessions, curMonth]);

  if (sel) return <ExerciseDetail title={sel} onBack={() => setSel(null)} />;
  if (editId) return <SessionEditor sessionId={editId} onClose={() => setEditId(null)} onCommitted={() => { setEditId(null); strengthSessions().then(setSessions).catch(() => {}); }} />;

  const w = stats?.windows.find((x) => x.key === win) || null;
  const radar = stats?.radar?.[win] || [];
  const winLabel = (WIN.find(([k]) => k === win) || ["", ""])[1].toLowerCase();
  const monthLabel = curMonth ? `${MONTHS[parseInt(curMonth.slice(5, 7), 10) - 1]} ${curMonth.slice(0, 4)}` : "";

  return (
    <div>
      {stats && w ? (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Training volume</div>
            <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
              {WIN.map(([k]) => <button key={k} onClick={() => setWin(k)} style={{ padding: "4px 9px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: win === k ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: win === k ? "#fff" : "#8a90a6" }}>{k === "lifetime" ? "All" : k}</button>)}
            </div>
          </div>
          <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="trn-cell"><div className="v tnum">{w.sessions}</div><div className="l">sessions<Delta cur={w.sessions} prev={w.prev_sessions} /></div></div>
            <div className="trn-cell"><div className="v tnum" style={{ fontSize: 17 }}>{w.vol.toLocaleString("en-US")}<span style={{ fontSize: 11, fontWeight: 600 }}> kg</span></div><div className="l">volume<Delta cur={w.vol} prev={w.prev_vol} /></div></div>
            <div className="trn-cell"><div className="v tnum">{w.sets}</div><div className="l">sets<Delta cur={w.sets} prev={w.prev_sets} /></div></div>
          </div>
        </div>
      ) : null}

      {stats && radar.length ? (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Muscle balance</div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#a274ff" }} />{win === "lifetime" ? "Lifetime" : "Selected"}</span>
              {win !== "lifetime" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a90a6" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(148,163,184,0.55)" }} />Prior</span> : null}
            </div>
          </div>
          <Radar data={radar} />
          <div className="subtle tiny" style={{ textAlign: "center", opacity: 0.7 }}>Sets per muscle region{win !== "lifetime" ? ` · ${winLabel} vs the prior ${winLabel}` : " · all time"}</div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 8, padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button aria-label="Older month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} style={{ background: "none", border: "none", color: monthIdx >= months.length - 1 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 22, cursor: monthIdx >= months.length - 1 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>‹</button>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{monthLabel || "—"}</div>
          <button aria-label="Newer month" disabled={monthIdx <= 0} onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} style={{ background: "none", border: "none", color: monthIdx <= 0 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 22, cursor: monthIdx <= 0 ? "default" : "pointer", padding: "0 10px", lineHeight: 1 }}>›</button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 0 }}>Sessions · tap to expand</div>
      {sessions == null ? <div className="muted center pad">Loading…</div> :
        serr ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>Couldn&apos;t load sessions.</div> :
          monthSessions.length === 0 ? <div className="subtle tiny" style={{ padding: "8px 2px" }}>No sessions this month.</div> :
            monthSessions.map((s) => {
              const open = exp[s.id] ?? false;
              return (
                <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
                  <button onClick={() => setExp((o) => ({ ...o, [s.id]: !open }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                    <span className="subtle" style={{ fontSize: 15, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}{s.source === "hevy" ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#8a90a6", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, padding: "1px 5px", verticalAlign: "middle" }}>hevy</span> : null}</div>
                      <div className="subtle tiny">{fmtDate(s.date)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tnum" style={{ fontWeight: 700, fontSize: 14 }}>{s.sets} sets</div>
                      {s.volume ? <div className="subtle tiny">{s.volume.toLocaleString("en-US")} kg</div> : null}
                    </div>
                  </button>
                  {open ? (
                    <div style={{ padding: "0 8px 6px" }}>
                      {s.exercises.map((ex, i) => (
                        <button key={ex.title + i} onClick={() => setSel(ex.title)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{ex.title}</span>{" "}
                            <span className="tiny" style={{ color: muscleTint(ex.muscle_group), textTransform: "capitalize" }}>{ex.muscle_group.replace(/_/g, " ")}</span>
                          </div>
                          <div className="subtle tiny tnum">{ex.sets} sets{ex.volume ? ` · ${ex.volume.toLocaleString("en-US")}kg` : ""}</div>
                        </button>
                      ))}
                      {s.source === "app" ? (
                        <button onClick={() => setEditId(s.id)} style={{ width: "100%", marginTop: 4, padding: "9px 8px", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", color: "#8ab4ff", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Edit workout</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
    </div>
  );
}
