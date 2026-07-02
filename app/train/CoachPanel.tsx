"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import KaiDailyCard from "../components/KaiDailyCard";
import { planPropose, planAccept, planDecline } from "../lib/api";
import type { TrnProposal, TrnProposeResp } from "../lib/api";

// Coach = the existing Kai (reuse, don't fork). Phase 2 "recommend home": Kai proposes the
// next sessions with a grounded "why", a thin validator eases anything unsafe, and every
// prescription is confirm-first — Accept commits it to the plan + calendar, Decline captures
// a reason that Kai remembers and adapts to next time. Daily card + chat entry are reused.
const DECLINE_REASONS = ["Too hard today", "No time", "Not feeling it", "Doing something else"];

function fmtDay(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }); }
function fmtDate(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }); }

export default function CoachPanel() {
  const router = useRouter();
  const [resp, setResp] = useState<TrnProposeResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "accepted" | "declined">>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const r = await planPropose(3); setResp(r); setDone({}); setDeclineFor(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't reach Kai"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function ask(seed?: string) {
    if (seed && typeof window !== "undefined") { try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ } }
    router.push("/more/ask");
  }
  async function accept(p: TrnProposal) {
    if (!p.id) return; setBusyId(p.id);
    try { await planAccept(p.id); setDone((d) => ({ ...d, [p.id as string]: "accepted" })); } catch { /* ignore */ } finally { setBusyId(null); }
  }
  async function decline(p: TrnProposal, reason: string) {
    if (!p.id) return; setBusyId(p.id);
    try { await planDecline(p.id, reason); setDone((d) => ({ ...d, [p.id as string]: "declined" })); setDeclineFor(null); } catch { /* ignore */ } finally { setBusyId(null); }
  }

  const proposals = resp?.proposals || [];
  const ctx = resp?.context;

  return (
    <div className="trainv2">
      <KaiDailyCard />

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Kai&apos;s plan for you</div>
          <button className="trn-sub" onClick={load} disabled={loading}>{loading ? "Thinking…" : "↻ Refresh"}</button>
        </div>
        {resp?.summary ? <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>{resp.summary}</div> : null}
        {ctx && (ctx.readiness != null || ctx.next_race) ? (
          <div className="tiny" style={{ marginTop: 6, opacity: 0.65 }}>
            {ctx.readiness != null ? `Readiness ${ctx.readiness}` : ""}
            {ctx.readiness != null && ctx.next_race ? " · " : ""}
            {ctx.next_race ? `${ctx.next_race.label} in ${ctx.next_race.days_to_go}d` : ""}
          </div>
        ) : null}

        {loading ? <div className="subtle tiny" style={{ marginTop: 12 }}>Kai is reading your recovery, load and race calendar…</div> : null}
        {err ? <div className="tiny" style={{ marginTop: 12, color: "#ff8a8a" }}>{err} · <button className="trn-sub" onClick={load}>retry</button></div> : null}
        {!loading && !err && proposals.length === 0 ? (
          <div className="subtle tiny" style={{ marginTop: 12 }}>Everything ahead this week is already set. Check back after your next session.</div>
        ) : null}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.map((p, i) => {
            const st = p.id ? done[p.id] : undefined;
            const flags = p.validator || [];
            return (
              <div key={p.id || i} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", opacity: st ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDay(p.session_date)} · {p.is_rest_day ? "Rest" : p.session_type}</div>
                  <div className="tiny" style={{ opacity: 0.55, whiteSpace: "nowrap" }}>
                    {fmtDate(p.session_date)}{p.planned_duration ? ` · ${p.planned_duration}m` : ""}{p.intensity && !p.is_rest_day ? ` · ${p.intensity}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{p.activity}</div>
                {p.rationale ? <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>“{p.rationale}”</div> : null}
                {flags.map((f, j) => (
                  <div key={j} className="tiny" style={{ marginTop: 6, color: f.severity === "warn" ? "#ffca7a" : "#8ab4ff" }}>⚠ {f.message}</div>
                ))}

                {st ? (
                  <div className="tiny" style={{ marginTop: 10, fontWeight: 700, color: st === "accepted" ? "#79e0a8" : "#9aa4b2" }}>
                    {st === "accepted" ? (p.is_rest_day ? "✓ Rest day locked in" : "✓ Added to your plan & calendar") : "Declined — Kai will adapt next time"}
                  </div>
                ) : declineFor === p.id ? (
                  <div style={{ marginTop: 10 }}>
                    <div className="tiny subtle" style={{ marginBottom: 6 }}>Why skip it? (helps Kai adapt)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {DECLINE_REASONS.map((r) => (
                        <button key={r} className="trn-sub" disabled={busyId === p.id} onClick={() => decline(p, r)}>{r}</button>
                      ))}
                      <button className="trn-sub" disabled={busyId === p.id} onClick={() => decline(p, "")}>Just skip</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button disabled={busyId === p.id} onClick={() => accept(p)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: "linear-gradient(135deg,#5f7dff,#a274ff)" }}>
                      {p.is_rest_day ? "Accept rest" : "Add to plan"}
                    </button>
                    <button disabled={busyId === p.id} onClick={() => setDeclineFor(p.id || null)} className="trn-sub" style={{ flex: 1 }}>Not today</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Your coach, across everything</div>
        <div className="subtle tiny" style={{ marginTop: 4, lineHeight: 1.5 }}>
          Kai reads your training, recovery, sleep and race calendar together — ask about a session, a tweak to the week, or why a number moved.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {["Was that session smart?", "Tweak this week", "How's my recovery?"].map((q) => (
            <button key={q} className="trn-sub" onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
        <button onClick={() => ask()} style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 13, background: "linear-gradient(135deg,#5f7dff,#a274ff)" }}>
          Open coach chat →
        </button>
      </div>
    </div>
  );
}
