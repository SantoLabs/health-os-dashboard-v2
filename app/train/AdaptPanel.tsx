"use client";

import { useEffect, useState, useCallback } from "react";
import { adaptState, adaptPropose, getAdaptDraft, applyAdapt, discardAdapt } from "../lib/api";
import type { AdaptState, AdaptChange } from "../lib/api";

// Kai check-in (Phase 4 · U2c): a deterministic detector reads plan-vs-actual + form (missed sessions,
// over/under duration, load, TSB) and surfaces a nudge when the week has drifted. Ask Kai to adjust and it
// proposes the SMALLEST set of changes to your UPCOMING sessions only (ease / shorten / move / rest),
// guardrail-checked — you accept or dismiss. It never rewrites the past and never auto-applies.

const GRAD = "linear-gradient(135deg,#5f7dff,#a274ff)";
const SEV: Record<string, string> = { high: "#e06a6a", med: "#e0b15a", low: "#8ab4ff" };
const ACTION: Record<string, { label: string; color: string }> = {
  ease: { label: "Ease", color: "#6fb0d6" },
  shorten: { label: "Shorten", color: "#e0b15a" },
  move: { label: "Move", color: "#a274ff" },
  rest: { label: "Rest", color: "#6b7180" },
};

function cap(s?: string): string { return s ? s[0].toUpperCase() + s.slice(1) : ""; }
function dow(iso?: string): string { return iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) : ""; }
function dmon(iso?: string): string { return iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }) : ""; }

function changeDetail(c: AdaptChange): string {
  const sport = cap(c.from?.sport);
  if (c.action === "ease") return `${sport} · ${cap(c.from?.role)} → ${cap(String(c.to?.role || "endurance"))}`;
  if (c.action === "shorten") return `${sport} · ${c.from?.duration_min ?? "?"}min → ${c.to?.duration_min ?? "?"}min`;
  if (c.action === "move") return `${sport} · ${dmon(c.from?.date)} → ${dmon(String(c.to?.date || ""))}`;
  if (c.action === "rest") return `${sport} · ${cap(c.from?.role)} → Rest`;
  return "";
}

type Draft = { id: string | null; summary: string; changes: AdaptChange[]; guard: string[] };

export default function AdaptPanel() {
  const [state, setState] = useState<AdaptState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [onTrack, setOnTrack] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await getAdaptDraft();
      if (d.draft && d.draft.status === "proposed") {
        setDraft({ id: d.draft.id, summary: d.draft.summary, changes: d.draft.changes || [], guard: [] });
        setState(d.draft.signals || null);
      } else {
        const s = await adaptState();
        setState(s.state || null);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't reach Kai"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function propose() {
    setBusy(true); setErr(null); setOnTrack(null); setDone(null);
    try {
      const r = await adaptPropose();
      if (!r.ok) { setErr(r.error || "Kai couldn't review your plan just now."); return; }
      if (r.signals) setState(r.signals);
      if (r.no_change || !r.changes || r.changes.length === 0) {
        setOnTrack(r.summary || "Your plan looks on track — nothing to change right now.");
        setDraft(null);
      } else {
        setDraft({ id: r.draft_id || null, summary: r.summary || "", changes: r.changes, guard: r.guard_notes || [] });
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!draft?.id) return; setBusy(true); setErr(null);
    try {
      const r = await applyAdapt(draft.id);
      if (r.ok) { setDone(`Updated ${r.applied ?? 0} session${(r.applied ?? 0) === 1 ? "" : "s"} in your plan.`); setDraft(null); }
      else setErr(r.error || "Couldn't apply the changes");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't apply the changes"); }
    finally { setBusy(false); }
  }

  async function dismiss() {
    if (draft?.id) { try { await discardAdapt(draft.id); } catch { /* */ } }
    setDraft(null); setOnTrack(null); setErr(null);
  }

  const signals = state?.signals || [];
  const attention = !!state?.needs_attention;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Kai check-in</div>
        {state?.tsb != null ? <div className="tiny" style={{ opacity: 0.55 }}>Form {Math.round(state.tsb)}{state.tsb_delta != null && state.tsb_delta !== 0 ? ` · ${state.tsb_delta > 0 ? "+" : ""}${state.tsb_delta}/wk` : ""}</div> : null}
      </div>
      <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
        Kai watches how your week actually goes and adjusts the days ahead — never the past.
      </div>

      {loading ? <div className="subtle tiny" style={{ marginTop: 12 }}>Reading your recent sessions and form…</div> : null}
      {err ? <div className="tiny" style={{ marginTop: 12, color: "#ff8a8a" }}>{err} · <button className="trn-sub" onClick={load}>retry</button></div> : null}

      {!loading && !draft && !done ? (
        <div style={{ marginTop: 12 }}>
          {attention && signals.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {signals.map((s, i) => (
                <div key={i} className="tiny" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: SEV[s.severity] || "#8ab4ff", flexShrink: 0, transform: "translateY(-1px)" }} />
                  <span style={{ opacity: 0.85 }}>{s.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="subtle tiny" style={{ opacity: 0.75 }}>Nothing looks off right now. You can still ask Kai to sanity-check the days ahead.</div>
          )}
          {onTrack ? <div className="tiny" style={{ marginTop: 10, color: "#79e0a8" }}>✓ {onTrack}</div> : null}
          <button
            disabled={busy}
            onClick={propose}
            style={{ marginTop: 12, width: "100%", padding: 10, borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}
          >
            {busy ? "Kai is reviewing…" : attention ? "Adjust my plan" : "How am I tracking?"}
          </button>
        </div>
      ) : null}

      {draft ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {draft.summary ? <div className="subtle tiny" style={{ lineHeight: 1.5, fontStyle: "italic", marginBottom: 10 }}>“{draft.summary}”</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {draft.changes.map((c, i) => {
              const a = ACTION[c.action] || { label: c.action, color: "#8a90a3" };
              return (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="tiny" style={{ width: 30, opacity: 0.6, fontWeight: 700 }}>{dow(c.from?.date)}</div>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: a.color, flexShrink: 0, transform: "translateY(1px)" }} />
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: a.color }}>{a.label}</span>
                    <span style={{ opacity: 0.8 }}> · {changeDetail(c)}</span>
                    {c.reason ? <div className="tiny" style={{ opacity: 0.55, marginTop: 2 }}>{c.reason}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {draft.guard.map((r, j) => <div key={j} className="tiny" style={{ marginTop: 6, color: "#8ab4ff" }}>↺ {r}</div>)}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button disabled={busy} onClick={apply} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: GRAD }}>{busy ? "Applying…" : "Apply changes"}</button>
            <button disabled={busy} onClick={dismiss} className="trn-sub" style={{ flex: 1 }}>Dismiss</button>
          </div>
          <div className="tiny subtle" style={{ marginTop: 8, opacity: 0.5 }}>Only your upcoming sessions change. Nothing already done is touched.</div>
        </div>
      ) : null}

      {done ? (
        <div style={{ marginTop: 12 }}>
          <div className="tiny" style={{ color: "#79e0a8", fontWeight: 700 }}>✓ {done}</div>
          <button className="trn-sub" style={{ marginTop: 10 }} onClick={() => { setDone(null); load(); }}>Check in again</button>
        </div>
      ) : null}
    </div>
  );
}
