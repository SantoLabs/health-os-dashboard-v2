"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import KaiDailyCard from "../components/KaiDailyCard";
import { planPropose, planAccept, planDecline, planWeek } from "../lib/api";
import type { TrnProposal, TrnProposeResp } from "../lib/api";

// Coach = the existing Kai (reuse, don't fork). Phase 2 "recommend home": Kai proposes the
// next sessions with a grounded "why"; Accept commits them (plan + calendar) AND moves them
// into the "On your calendar" list right here so you never have to leave for the calendar.
// Decline takes a free-text reason and Kai swaps in an adapted session in place.
const REASON_HINTS = ["Too hard today", "No time — keep it short", "Doing a swim instead", "Not feeling it"];

type WeekSession = {
  id: string; session_date: string; session_type: string; activity: string;
  planned_duration: number; intensity: string; is_rest_day: boolean;
  committed: boolean; completed: boolean; skipped: boolean;
};

function fmtDay(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }); }
function fmtDate(iso: string) { return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }); }

export default function CoachPanel() {
  const router = useRouter();
  const [resp, setResp] = useState<TrnProposeResp | null>(null);
  const [locked, setLocked] = useState<WeekSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState("");
  const [swapped, setSwapped] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [pr, wk] = await Promise.all([
        planPropose(3),
        planWeek<{ today: string; sessions: WeekSession[] }>().catch(() => null),
      ]);
      setResp(pr);
      if (wk?.sessions) {
        setLocked(wk.sessions
          .filter((s) => (s.committed || s.completed) && !s.skipped && s.session_date >= wk.today)
          .sort((a, b) => a.session_date.localeCompare(b.session_date)));
      } else {
        setLocked([]);
      }
      setSwapped(new Set()); setDeclineFor(null); setDeclineText("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't reach Kai"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function ask(seed?: string) {
    if (seed && typeof window !== "undefined") { try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ } }
    router.push("/more/ask");
  }
  function openDecline(p: TrnProposal) { setDeclineFor(p.id || null); setDeclineText(""); }

  async function accept(p: TrnProposal) {
    if (!p.id) return; setBusyId(p.id);
    try {
      await planAccept(p.id);
      const nl: WeekSession = { id: p.id, session_date: p.session_date, session_type: p.session_type, activity: p.activity, planned_duration: p.planned_duration, intensity: p.intensity, is_rest_day: p.is_rest_day, committed: true, completed: false, skipped: false };
      setLocked((L) => [...L.filter((x) => x.id !== p.id), nl].sort((a, b) => a.session_date.localeCompare(b.session_date)));
      setResp((prev) => (prev ? { ...prev, proposals: prev.proposals.filter((x) => x.id !== p.id) } : prev));
    } catch { /* ignore */ } finally { setBusyId(null); }
  }
  async function decline(p: TrnProposal, reason: string) {
    if (!p.id) return; setBusyId(p.id);
    try {
      const r = await planDecline(p.id, reason);
      if (r.replacement && r.replacement.id) {
        const rep = r.replacement;
        setResp((prev) => (prev ? { ...prev, proposals: prev.proposals.map((x) => (x.id === p.id ? rep : x)) } : prev));
        setSwapped((s) => { const n = new Set(s); n.add(rep.id as string); return n; });
      } else {
        setResp((prev) => (prev ? { ...prev, proposals: prev.proposals.filter((x) => x.id !== p.id) } : prev));
      }
      setDeclineFor(null); setDeclineText("");
    } catch { /* ignore */ } finally { setBusyId(null); }
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

        {locked.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="tiny subtle" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>On your calendar</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {locked.map((s) => (
                <div key={s.id} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(121,224,168,0.06)", border: "1px solid rgba(121,224,168,0.18)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDay(s.session_date)} · {s.is_rest_day ? "Rest" : s.session_type}</div>
                    <div className="tiny" style={{ whiteSpace: "nowrap", fontWeight: 700, color: s.completed ? "#79e0a8" : "#8ab4ff" }}>{s.completed ? "✓ Done" : "✓ On calendar"}</div>
                  </div>
                  {!s.is_rest_day ? <div className="tiny" style={{ marginTop: 2, opacity: 0.75 }}>{s.activity}{s.planned_duration ? ` · ${s.planned_duration}m` : ""}{s.intensity ? ` · ${s.intensity}` : ""}</div> : null}
                  <div className="tiny" style={{ marginTop: 2, opacity: 0.5 }}>{fmtDate(s.session_date)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? <div className="subtle tiny" style={{ marginTop: 12 }}>Kai is reading your recovery, load and race calendar…</div> : null}
        {err ? <div className="tiny" style={{ marginTop: 12, color: "#ff8a8a" }}>{err} · <button className="trn-sub" onClick={load}>retry</button></div> : null}
        {!loading && !err && proposals.length === 0 ? (
          <div className="subtle tiny" style={{ marginTop: 12 }}>{locked.length > 0 ? "That's your plan for the days ahead — nothing else to add right now." : "Everything ahead this week is already set. Check back after your next session."}</div>
        ) : null}

        {proposals.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {locked.length > 0 ? <div className="tiny subtle" style={{ marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Kai suggests</div> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {proposals.map((p, i) => {
                const wasSwapped = p.id ? swapped.has(p.id) : false;
                const adapting = busyId === p.id && declineFor === p.id;
                const flags = p.validator || [];
                return (
                  <div key={p.id || i} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {wasSwapped ? <div className="tiny" style={{ marginBottom: 6, color: "#8ab4ff", fontWeight: 700 }}>↺ Kai swapped this in</div> : null}
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

                    {declineFor === p.id ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="tiny subtle" style={{ marginBottom: 6 }}>Tell Kai why — it&apos;ll swap in something else for this day.</div>
                        <textarea
                          value={declineText}
                          onChange={(e) => setDeclineText(e.target.value)}
                          placeholder="e.g. I'm doing a swim instead of the bike today"
                          rows={2}
                          disabled={adapting}
                          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", color: "inherit", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 8, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {REASON_HINTS.map((rz) => (
                            <button key={rz} className="trn-sub" disabled={adapting} onClick={() => setDeclineText(rz)}>{rz}</button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button disabled={adapting} onClick={() => decline(p, declineText.trim())} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: "linear-gradient(135deg,#5f7dff,#a274ff)" }}>
                            {adapting ? "Kai's swapping…" : "Send & swap"}
                          </button>
                          <button disabled={adapting} onClick={() => { setDeclineFor(null); setDeclineText(""); }} className="trn-sub" style={{ flex: 1 }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button disabled={busyId === p.id} onClick={() => accept(p)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 12, background: "linear-gradient(135deg,#5f7dff,#a274ff)" }}>
                          {busyId === p.id ? "Adding…" : (p.is_rest_day ? "Accept rest" : "Add to plan")}
                        </button>
                        <button disabled={busyId === p.id} onClick={() => openDecline(p)} className="trn-sub" style={{ flex: 1 }}>Not today</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
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
