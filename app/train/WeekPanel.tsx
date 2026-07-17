"use client";

import { useEffect, useState, useCallback } from "react";
import { composeWeek, getWeekDraft, commitWeek, discardWeek } from "../lib/api";
import type { WeekDay, ComposeWorkout, ComposeStep, ComposeLoop, ComposeTarget } from "../lib/api";

// Kai's week planner (Phase 4 · U2b): describe your week in plain language, Kai designs the whole
// week's shape (which days, which sessions, rest) and composes each session — threshold-aware, with a
// deterministic guardrail layer that keeps it sound (a rest day, no stacked hard days, no hard-after-long).
// The week persists so reopening shows the same plan; commit writes it into your schedule in one go.

const GRAD = "var(--t-grad)";
const EXAMPLES = ["Balanced 5-day week", "Easy base week, low intensity", "3 runs + 2 rides, one long day", "Beginner week, 4 days"];
const ROLE_COLOR: Record<string, string> = {
  recovery: "var(--success)", easy: "var(--success)", endurance: "#6fb0d6", technique: "#6fb0d6",
  tempo: "var(--gold)", threshold: "var(--ember)", intervals: "var(--danger)", vo2: "var(--danger)", rep: "var(--danger)",
  long: "var(--ember-strong)", brick: "var(--ember-strong)", strength: "var(--muted)", rest: "var(--muted)",
};

function pace(s: number): string { const m = Math.floor(s / 60); const r = Math.round(s % 60); return `${m}:${String(r).padStart(2, "0")}`; }
function fmtTarget(t?: ComposeTarget): string {
  if (!t) return "";
  const { metric, low, high, unit } = t;
  if (metric === "pace" && unit === "s_per_km") return low && high ? `${pace(low)}–${pace(high)}/km` : "";
  if (metric === "pace" && unit === "s_per_100m") return low && high ? `${pace(low)}–${pace(high)}/100m` : "";
  if (metric === "power") return low && high ? `${low}–${high} W` : "";
  if (metric === "hr") return low && high ? `${low}–${high} bpm` : "";
  return "";
}
// pull a representative target: the first loop's work step, else the first segment carrying a target
function headline(w: ComposeWorkout | null): string {
  if (!w) return "";
  for (const b of w.blocks) {
    if (b.block_type === "loop") { const lp = b as ComposeLoop; const t = lp.steps?.[0]?.targets?.[0]; const s = fmtTarget(t); if (s) return `${lp.repeat}× · ${s}`; }
  }
  for (const b of w.blocks) {
    if (b.block_type === "step") { const s = b as ComposeStep; if (s.kind === "segment") { const t = fmtTarget(s.targets?.[0]); if (t) return t; } }
  }
  return "";
}
function dow(iso: string): string { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }); }
function weekLabel(iso: string): string { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }); }
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export default function WeekPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState<WeekDay[] | null>(null);
  const [weekWhy, setWeekWhy] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [repairs, setRepairs] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getWeekDraft().then((r) => {
      if (!live || !r.draft || r.draft.status !== "proposed") return;
      setDays(r.draft.days); setWeekWhy(r.draft.week_why); setWeekStart(r.draft.week_start);
      setRepairs(r.draft.repairs || []); setDraftId(r.draft.id); setText(r.draft.request_text || "");
    }).catch(() => { /* first run */ });
    return () => { live = false; };
  }, []);

  const run = useCallback(async (q: string) => {
    const body = q.trim(); if (!body || busy) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await composeWeek(body);
      if (!r.ok || !r.days) setErr(r.error || "Kai couldn't plan that week — try rephrasing.");
      else { setDays(r.days); setWeekWhy(r.week_why || ""); setWeekStart(r.week_start || ""); setRepairs(r.repairs || []); setDraftId(r.draft_id || null); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }, [busy]);

  async function commit() {
    if (!draftId) return; setBusy(true); setErr(null);
    try {
      const r = await commitWeek(draftId);
      if (r.ok) setDone(`Added ${r.created ?? 0} session${(r.created ?? 0) === 1 ? "" : "s"} to your schedule${r.skipped ? ` · ${r.skipped} day${r.skipped === 1 ? "" : "s"} already booked, left as-is` : ""}.`);
      else setErr(r.error || "Couldn't add the week");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the week"); }
    finally { setBusy(false); }
  }
  async function discard() {
    if (draftId) { try { await discardWeek(draftId); } catch { /* */ } }
    setDays(null); setWeekWhy(""); setRepairs([]); setDraftId(null); setDone(null); setErr(null);
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Plan my week with Kai</div>
        {days ? <button className="trn-sub" onClick={discard} disabled={busy}>Clear</button> : null}
      </div>
      <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
        Tell Kai your goal, days available and disciplines — it designs the whole week and composes each session from your thresholds.
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. balanced 5-day week, I've got a bike and pool plus I run, easing back into structure"
        rows={2}
        disabled={busy}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 10, background: "var(--surface-2)", color: "inherit", border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {EXAMPLES.map((ex) => <button key={ex} className="trn-sub" disabled={busy} onClick={() => { setText(ex); run(ex); }}>{ex}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button disabled={busy || !text.trim()} onClick={() => run(text)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: busy || !text.trim() ? "default" : "pointer", opacity: busy || !text.trim() ? 0.6 : 1, color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}>
          {busy && !days ? "Kai is planning your week…" : days ? "Plan another week" : "Plan my week"}
        </button>
      </div>

      {err ? <div className="tiny" style={{ marginTop: 10, color: "var(--danger)" }}>{err}</div> : null}

      {days ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {weekStart ? <div className="tiny" style={{ opacity: 0.55, marginBottom: 8 }}>Week of {weekLabel(weekStart)}</div> : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {days.map((d) => {
              const color = ROLE_COLOR[(d.role || "").toLowerCase()] || "var(--muted)";
              const hl = d.rest ? "" : d.strength ? "Supportive strength" : headline(d.workout);
              return (
                <div key={d.day_offset} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 0", opacity: d.rest ? 0.55 : 1, borderBottom: "1px solid var(--line)" }}>
                  <div className="tiny" style={{ width: 30, opacity: 0.6, fontWeight: 700 }}>{dow(d.session_date)}</div>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: color, flexShrink: 0, transform: "translateY(1px)" }} />
                  <div style={{ flex: 1, fontSize: 13 }}>
                    {d.rest ? <span style={{ opacity: 0.7 }}>Rest</span> : (
                      <>
                        <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{d.sport}</span>
                        <span style={{ opacity: 0.7 }}> · {cap(d.role)}</span>
                        {d.duration_min ? <span style={{ opacity: 0.5 }}> · {d.duration_min}min</span> : null}
                        {hl ? <span style={{ opacity: 0.55 }}> · {hl}</span> : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {weekWhy ? <div className="subtle tiny" style={{ marginTop: 10, lineHeight: 1.5, fontStyle: "italic" }}>“{weekWhy}”</div> : null}
          {repairs.map((r, j) => <div key={j} className="tiny" style={{ marginTop: 6, color: "var(--ember)" }}>↺ {r}</div>)}

          {done ? (
            <div className="tiny" style={{ marginTop: 12, color: "var(--success)", fontWeight: 700 }}>✓ {done}</div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={commit} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}>{busy ? "Adding…" : "Add week to schedule"}</button>
            </div>
          )}
          <div className="tiny subtle" style={{ marginTop: 8, opacity: 0.5 }}>Days you&apos;ve already scheduled are left untouched.</div>
        </div>
      ) : null}
    </div>
  );
}
