"use client";

import { useEffect, useState } from "react";
import { cardioParse, cardioList, cardioSave, cardioPrescribe, type CardioParsed, type CardioRoutine, type CardioSegment, type CardioBlock, type CardioStructure } from "../lib/api";

const cdToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
function fmtDist(m?: number | null): string { if (!m) return ""; return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km` : `${Math.round(m)} m`; }
function fmtDur(s?: number | null): string { if (!s) return ""; return s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`; }

const ROLES = ["warmup", "work", "recovery", "cooldown", "rest"];
const roleBg = (role?: string | null) =>
  role === "work" ? "rgba(255,138,138,0.14)" : role === "recovery" || role === "rest" ? "rgba(121,224,168,0.12)" : "rgba(255,255,255,0.06)";

function num(v: string): number | null { const n = parseFloat(v); return isFinite(n) ? n : null; }

export default function CardioBuilder({ sportHint = "running", onExit, intent = "workout", startMode = "build" }: { sportHint?: string; onExit?: () => void; intent?: "workout" | "routine"; startMode?: "describe" | "build" }) {
  const [open, setOpen] = useState(!!onExit);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<CardioParsed | null>(null);
  const [edited, setEdited] = useState<CardioStructure | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [date, setDate] = useState(cdToday());
  const [routines, setRoutines] = useState<CardioRoutine[]>([]);

  useEffect(() => { if (!open) return; cardioList().then((r) => setRoutines(r.routines || [])).catch(() => {}); }, [open, msg]);
  // Embedded build-mode: drop straight into the editor with one empty block.
  useEffect(() => { if (onExit && startMode === "build" && !parsed && !edited) addBlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (parsed?.structure) { setEdited(JSON.parse(JSON.stringify(parsed.structure)) as CardioStructure); setName(parsed?.name || "Custom session"); }
    else setEdited(null);
  }, [parsed]);

  async function doParse() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null); setMsg(null); setParsed(null);
    try { const r = await cardioParse(text.trim(), sportHint); if (r.ok && r.structure) setParsed(r); else setErr(r.error || "Kai couldn't turn that into a workout — try rephrasing."); }
    catch { setErr("Something went wrong creating that."); } finally { setBusy(false); }
  }
  async function doSave() {
    if (!edited || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioSave({ name: name || "Custom session", sport: parsed?.sport || sportHint, structure: edited }); if (r.ok) setMsg("Saved to your workouts."); else setErr(r.error || "Couldn't save."); }
    finally { setBusy(false); }
  }
  async function doPrescribe() {
    if (!edited || busy) return;
    setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ sport: parsed?.sport || sportHint, date, structure: edited, name }); if (r.ok) setMsg(`Added to your calendar on ${date} — it'll auto-complete when the activity uploads.`); else setErr(r.error || "Couldn't add."); }
    finally { setBusy(false); }
  }
  async function prescribeRoutine(rt: CardioRoutine) {
    if (busy) return; setBusy(true); setMsg(null); setErr(null);
    try { const r = await cardioPrescribe({ routine_id: rt.id, date }); if (r.ok) setMsg(`${rt.name} added to your calendar on ${date}.`); } finally { setBusy(false); }
  }

  // ---- structure editing ----
  function updateBlock(bi: number, patch: Partial<CardioBlock>) {
    setEdited((st) => { if (!st) return st; const blocks = st.blocks.slice(); blocks[bi] = { ...blocks[bi], ...patch }; return { ...st, blocks }; });
  }
  function updateSeg(bi: number, si: number, patch: Partial<CardioSegment>) {
    setEdited((st) => { if (!st) return st; const blocks = st.blocks.slice(); const segs = blocks[bi].segments.slice(); segs[si] = { ...segs[si], ...patch }; blocks[bi] = { ...blocks[bi], segments: segs }; return { ...st, blocks }; });
  }
  function removeSeg(bi: number, si: number) {
    setEdited((st) => { if (!st) return st; const blocks = st.blocks.slice(); blocks[bi] = { ...blocks[bi], segments: blocks[bi].segments.filter((_, i) => i !== si) }; return { ...st, blocks: blocks.filter((b) => b.segments.length > 0) }; });
  }
  function addSeg(bi: number) {
    setEdited((st) => { if (!st) return st; const blocks = st.blocks.slice(); blocks[bi] = { ...blocks[bi], segments: [...blocks[bi].segments, { role: "work", duration_s: 60 }] }; return { ...st, blocks }; });
  }
  function addBlock() {
    setEdited((st) => { const base = st || { blocks: [] }; return { ...base, blocks: [...base.blocks, { reps: 1, segments: [{ role: "work", duration_s: 60 }] }] }; });
  }
  function removeBlock(bi: number) {
    setEdited((st) => { if (!st) return st; return { ...st, blocks: st.blocks.filter((_, i) => i !== bi) }; });
  }

  const fieldStyle: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", resize: "vertical" };
  const miniInput: React.CSSProperties = { width: 52, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontFamily: "inherit" };
  const selStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", textTransform: "capitalize" };
  const pillBtn = (bg: string): React.CSSProperties => ({ padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: bg });

  if (!open) {
    return (
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Create a workout</div>
          <div className="subtle tiny" style={{ marginTop: 2 }}>Describe an interval session — Kai turns it into structured, editable steps to save or add to your calendar.</div>
        </div>
        <button onClick={() => setOpen(true)} style={pillBtn("linear-gradient(135deg,#5f7dff,#a274ff)")}>Create</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{onExit ? (intent === "routine" ? "New cardio routine" : "New cardio workout") : "Create a workout"}</div>
        <button className="trn-sub" onClick={() => { if (onExit) { onExit(); return; } setOpen(false); setParsed(null); setErr(null); setMsg(null); }}>{onExit ? "‹ Back" : "Close"}</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. 10 min warmup, then 1 km hard + 2 min easy jog ×5, 10 min cooldown" style={{ ...fieldStyle, marginTop: 10 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={doParse} disabled={busy || !text.trim()} style={pillBtn("linear-gradient(135deg,#5f7dff,#a274ff)")}>{busy ? "Creating…" : "Create workout"}</button>
      </div>

      {err ? <div className="subtle tiny" style={{ marginTop: 10, color: "#ff8a8a" }}>{err}</div> : null}
      {msg ? <div className="subtle tiny" style={{ marginTop: 10, color: "#79e0a8" }}>{msg}</div> : null}

      {edited ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name" style={{ ...fieldStyle, fontWeight: 700, marginBottom: 10 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {edited.blocks.map((b, bi) => (
              <div key={bi} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input type="number" min={1} value={b.reps} onChange={(e) => updateBlock(bi, { reps: Math.max(1, Math.round(num(e.target.value) || 1)) })} style={{ ...miniInput, width: 42, color: b.reps > 1 ? "#a274ff" : "inherit", fontWeight: 800 }} />
                  <span className="subtle tiny">× reps</span>
                  <button onClick={() => removeBlock(bi)} title="Remove block" style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 15 }}>×</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {b.segments.map((s, si) => (
                    <div key={si} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "5px 6px", borderRadius: 8, background: roleBg(s.role) }}>
                      <select value={s.role || "work"} onChange={(e) => updateSeg(bi, si, { role: e.target.value })} style={selStyle}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <input type="number" min={0} value={s.distance_m ?? ""} placeholder="m" onChange={(e) => updateSeg(bi, si, { distance_m: num(e.target.value) })} style={miniInput} />
                      <span className="subtle tiny">m</span>
                      <input type="number" min={0} step={0.5} value={s.duration_s != null ? +(s.duration_s / 60).toFixed(2) : ""} placeholder="min" onChange={(e) => { const mn = num(e.target.value); updateSeg(bi, si, { duration_s: mn != null ? Math.round(mn * 60) : null }); }} style={miniInput} />
                      <span className="subtle tiny">min</span>
                      <button onClick={() => removeSeg(bi, si)} title="Remove step" style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7080", cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addSeg(bi)} style={{ marginTop: 6, background: "none", border: "1px dashed rgba(255,255,255,0.15)", color: "#8a90a6", cursor: "pointer", fontSize: 11, borderRadius: 6, padding: "3px 8px" }}>+ step</button>
              </div>
            ))}
          </div>
          <button onClick={addBlock} style={{ marginTop: 8, background: "none", border: "1px dashed rgba(162,116,255,0.4)", color: "#a274ff", cursor: "pointer", fontSize: 12, borderRadius: 8, padding: "5px 10px", fontWeight: 600 }}>+ block</button>

          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 9px", fontSize: 12, fontFamily: "inherit" }} />
            <button onClick={doPrescribe} disabled={busy || !edited.blocks.length} style={pillBtn("rgba(121,224,168,0.9)")}>Add to calendar</button>
            <button onClick={doSave} disabled={busy || !edited.blocks.length} className="trn-sub">Save workout</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <button disabled title="Garmin push is coming soon" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#6b7080", fontSize: 12, fontWeight: 600, cursor: "not-allowed" }}>
              Push to Garmin
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: "1px 6px", borderRadius: 999, background: "rgba(240,136,62,0.16)", color: "#f0a35e" }}>SOON</span>
            </button>
          </div>
        </div>
      ) : null}

      {routines.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Saved workouts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routines.map((rt) => (
              <div key={rt.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{rt.name}</div>
                  <div className="subtle tiny tnum">{fmtDist(rt.total_distance_m)}{rt.total_distance_m && rt.total_duration_s ? " · " : ""}{fmtDur(rt.total_duration_s)}{rt.source === "kai" ? " · from Kai" : ""}</div>
                </div>
                <button className="trn-sub" disabled={busy} onClick={() => prescribeRoutine(rt)}>Add</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// segLabel retained for potential reuse by callers rendering read-only summaries.
export function segLabel(s: CardioSegment): string {
  const parts: string[] = [];
  const d = fmtDist(s.distance_m); if (d) parts.push(d);
  const t = fmtDur(s.duration_s); if (t) parts.push(t);
  if (s.intensity) parts.push(s.intensity);
  return parts.join(" · ") || (s.role || "");
}
