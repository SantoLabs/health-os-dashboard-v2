"use client";
import Icon from "../components/Icon";

import { useEffect, useState, useCallback } from "react";
import {
  composeWorkout, composeGetDraft, composeCommit, composeSaveRoutine, composeDiscard,
} from "../lib/api";
import type { ComposeWorkout, ComposeValidator, ComposeStep, ComposeLoop, ComposeTarget, ComposeMeasure } from "../lib/api";

// Kai's composition surface (Phase 4 · U2a): describe a session in plain language, Kai builds a
// validated, threshold-aware structured workout (paces/power come from YOUR thresholds, not the LLM),
// then Add to plan (a date) or Save as a routine. The proposal persists so reopening shows the same
// workout — no silent re-roll.

const GRAD = "var(--t-grad)";
const EXAMPLES = [
  "6×800m at 5k effort off 90s jog",
  "90min bike, 3×12min threshold",
  "Easy 40min Z2 run",
  "Swim: 8×100m at CSS on 20s rest",
];

function pace(s: number): string { const m = Math.floor(s / 60); const r = Math.round(s % 60); return `${m}:${String(r).padStart(2, "0")}`; }
function fmtDur(s: number): string { if (s % 60 === 0 && s >= 60) return `${s / 60} min`; const m = Math.floor(s / 60); const r = s % 60; return m ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`; }
function fmtMeasure(m: ComposeMeasure): string {
  if (m.type === "distance" && m.meters != null) return m.meters >= 1000 ? `${(m.meters / 1000).toFixed(m.meters % 1000 ? 1 : 0)}km` : `${m.meters}m`;
  if (m.type === "time" && m.seconds != null) return fmtDur(m.seconds);
  if (m.type === "lap") return "lap";
  return "open";
}
function fmtTarget(t?: ComposeTarget): string {
  if (!t) return "";
  const { metric, low, high, unit } = t;
  if (metric === "pace" && unit === "s_per_km") return low && high ? `${pace(low)}–${pace(high)}/km` : low ? `${pace(low)}/km` : "";
  if (metric === "pace" && unit === "s_per_100m") return low && high ? `${pace(low)}–${pace(high)}/100m` : low ? `${pace(low)}/100m` : "";
  if (metric === "power") return low && high ? `${low}–${high} W` : low ? `${low} W` : "";
  if (metric === "hr") return low && high ? `${low}–${high} bpm` : low ? `${low} bpm` : "";
  if (metric === "cadence") return low && high ? `${low}–${high} rpm` : "";
  return "";
}
function stepLine(s: ComposeStep): string {
  const label = s.kind === "warmup" ? "Warm-up" : s.kind === "cooldown" ? "Cool-down" : s.kind === "rest" ? "Rest" : "";
  const tgt = fmtTarget(s.targets?.[0]);
  const parts = [label, fmtMeasure(s.measure), tgt].filter(Boolean);
  return parts.join(" · ");
}

export default function ComposePanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [workout, setWorkout] = useState<ComposeWorkout | null>(null);
  const [why, setWhy] = useState("");
  const [validator, setValidator] = useState<ComposeValidator | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("proposed");
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [done, setDone] = useState<string | null>(null);

  // restore the last proposal so it's stable across reopen (no re-roll)
  useEffect(() => {
    let live = true;
    composeGetDraft().then((r) => {
      if (!live || !r.draft) return;
      if (r.draft.status === "proposed") {
        setWorkout(r.draft.workout); setWhy(r.draft.why); setValidator(r.draft.validator);
        setDraftId(r.draft.id); setStatus(r.draft.status); setText(r.draft.request_text || "");
      }
    }).catch(() => { /* first run: no draft */ });
    return () => { live = false; };
  }, []);

  const run = useCallback(async (q: string) => {
    const body = q.trim(); if (!body || busy) return;
    setBusy(true); setErr(null); setDone(null); setShowDate(false);
    try {
      const r = await composeWorkout(body);
      if (!r.ok || !r.workout) { setErr(r.error || "Kai couldn't build that one — try rephrasing."); }
      else { setWorkout(r.workout); setWhy(r.why || ""); setValidator(r.validator || null); setDraftId(r.draft_id || null); setStatus("proposed"); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }, [busy]);

  async function addToPlan() {
    if (!draftId) return; setBusy(true); setErr(null);
    try { const r = await composeCommit(draftId, date); if (r.ok) { setStatus("committed"); setDone(`Added to your plan on ${new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}.`); setShowDate(false); } else setErr(r.error || "Couldn't add to plan"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add to plan"); }
    finally { setBusy(false); }
  }
  async function saveRoutine() {
    if (!draftId) return; setBusy(true); setErr(null);
    try { const r = await composeSaveRoutine(draftId); if (r.ok) { setStatus("saved"); setDone("Saved to your routines."); } else setErr(r.error || "Couldn't save"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function discard() {
    if (draftId) { try { await composeDiscard(draftId); } catch { /* */ } }
    setWorkout(null); setWhy(""); setValidator(null); setDraftId(null); setDone(null); setErr(null); setShowDate(false);
  }

  const repairs = validator?.repairs || [];
  const warnings = validator?.warnings || [];
  const invalid = validator && validator.valid === false;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Build a session with Kai</div>
        {workout ? <button className="trn-sub" onClick={discard} disabled={busy}>Clear</button> : null}
      </div>
      <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
        Describe a workout in your words — Kai structures it and fills paces, power and HR from your own thresholds.
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. 6×800m at 5k effort off 90 seconds jog recovery, with a warm-up and cool-down"
        rows={2}
        disabled={busy}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 10, background: "var(--surface-2)", color: "inherit", border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="trn-sub" disabled={busy} onClick={() => { setText(ex); run(ex); }}>{ex}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button disabled={busy || !text.trim()} onClick={() => run(text)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: busy || !text.trim() ? "default" : "pointer", opacity: busy || !text.trim() ? 0.6 : 1, color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}>
          {busy && !workout ? "Kai is composing…" : workout ? "Compose another" : "Compose"}
        </button>
      </div>

      {err ? <div className="tiny" style={{ marginTop: 10, color: "var(--danger)" }}>{err}</div> : null}

      {workout ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{workout.name}</div>
            <div className="tiny" style={{ opacity: 0.55, whiteSpace: "nowrap", textTransform: "capitalize" }}>{workout.sport}{workout.type === "brick" ? " · brick" : ""}</div>
          </div>

          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {workout.blocks.map((b, i) => {
              if (b.block_type === "loop") {
                const lp = b as ComposeLoop;
                const w = lp.steps[0]; const rec = lp.steps[1];
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "var(--ember)", minWidth: 26 }}>{lp.repeat}×</div>
                    <div style={{ fontSize: 13 }}>
                      {w ? `${fmtMeasure(w.measure)}${fmtTarget(w.targets?.[0]) ? ` @ ${fmtTarget(w.targets[0])}` : ""}` : ""}
                      {rec ? <span style={{ opacity: 0.6 }}>{`  /  ${fmtMeasure(rec.measure)}${fmtTarget(rec.targets?.[0]) ? ` @ ${fmtTarget(rec.targets[0])}` : ""} recovery`}</span> : null}
                    </div>
                  </div>
                );
              }
              const s = b as ComposeStep;
              return <div key={i} style={{ fontSize: 13, opacity: s.kind === "warmup" || s.kind === "cooldown" ? 0.75 : 1 }}>{stepLine(s)}</div>;
            })}
          </div>

          {why ? <div className="subtle tiny" style={{ marginTop: 10, lineHeight: 1.5, fontStyle: "italic" }}>“{why}”</div> : null}

          {repairs.map((r, j) => <div key={"r" + j} className="tiny" style={{ marginTop: 6, color: "var(--ember)" }}>↺ Kai adjusted: {r}</div>)}
          {warnings.map((w, j) => <div key={"w" + j} className="tiny" style={{ marginTop: 6, color: "var(--gold)" }}><Icon name="warning" size={11} /> {w}</div>)}
          {invalid ? <div className="tiny" style={{ marginTop: 6, color: "var(--danger)" }}>This one didn&apos;t fully validate — try rephrasing.</div> : null}

          {done ? (
            <div className="tiny" style={{ marginTop: 12, color: "var(--success)", fontWeight: 700 }}>✓ {done}</div>
          ) : showDate ? (
            <div style={{ marginTop: 12 }}>
              <div className="tiny subtle" style={{ marginBottom: 6 }}>Which day?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy}
                  style={{ flex: 1, background: "var(--surface-2)", color: "inherit", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                <button disabled={busy} onClick={addToPlan} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}>{busy ? "Adding…" : "Confirm"}</button>
                <button disabled={busy} onClick={() => setShowDate(false)} className="trn-sub">Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={busy || invalid === true} onClick={() => setShowDate(true)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD, opacity: invalid ? 0.5 : 1 }}>Add to plan</button>
              <button disabled={busy || invalid === true} onClick={saveRoutine} className="trn-sub" style={{ flex: 1 }}>Save as routine</button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
