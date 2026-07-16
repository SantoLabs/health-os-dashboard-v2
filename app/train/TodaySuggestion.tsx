"use client";
import { useEffect, useState } from "react";
import { strengthSuggest, strengthCommitSuggestion, strengthSwap, type StrSuggest } from "../lib/api";

const INT: Record<string, { label: string; bg: string; fg: string }> = {
  push: { label: "Progress", bg: "rgba(52,211,153,0.15)", fg: "#34d399" },
  maintain: { label: "Maintain", bg: "rgba(95,125,255,0.15)", fg: "#9db0ff" },
  ease: { label: "Easy", bg: "rgba(255,181,71,0.15)", fg: "#ffb547" },
};
const TONE: Record<string, string> = { good: "#34d399", warn: "#ffb547", bad: "#fb7185", neutral: "#8a90a6" };

const SWAP_REASONS = ["Feeling fresh", "Want variety", "Prefer this today", "Coach pick felt off"];
const DECLINE_REASONS = ["Too tired", "Need rest", "Short on time", "Active enough today"];

type Chip = { label: string; tone: string };
type Pending = { kind: "swap"; to: string; toLabel: string } | { kind: "decline" } | null;

function chipsFor(d: StrSuggest): Chip[] {
  const s: any = d.signals || {};
  const chips: Chip[] = [];
  if (s.race_days != null) chips.push({ label: `${s.race_days}d to race`, tone: s.race_days <= 10 ? "bad" : s.race_days <= 21 ? "warn" : "neutral" });
  if (Number(s.leg_mins) >= 70) chips.push({ label: "legs worked yesterday", tone: "warn" });
  if (s.big_next2 === 1) chips.push({ label: "long session ahead", tone: "warn" });
  if (s.tsb != null) chips.push({ label: `form ${Math.round(Number(s.tsb))}`, tone: s.tsb > 5 ? "good" : s.tsb >= -10 ? "neutral" : s.tsb >= -20 ? "warn" : "bad" });
  if (Number(s.s7d) >= 4) chips.push({ label: `${s.s7d} strength days`, tone: "warn" });
  return chips;
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

export default function TodaySuggestion({ onStartPlan }: { onStartPlan: (planId: string) => void }) {
  const [d, setD] = useState<StrSuggest | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let a = true;
    strengthSuggest().then((x) => a && setD(x)).catch(() => a && setErr(true));
    return () => { a = false; };
  }, []);

  if (err || !d) return null;

  async function start() {
    if (!d || !d.workout || swapOpen) return;
    setBusy(true); setCErr(null);
    try {
      const r = await strengthCommitSuggestion({ workout: d.workout, why: d.why, label: d.label });
      if (r.plan_id) onStartPlan(r.plan_id);
      else setCErr("Couldn't start — try again.");
    } catch { setCErr("Couldn't start — try again."); }
    finally { setBusy(false); }
  }

  async function chooseReason(reason: string) {
    if (!d || !pending) return;
    setWorking(true);
    try {
      if (pending.kind === "swap") {
        await strengthSwap({ action: "swap", from_split: d.split, to_split: pending.to, reason });
        const nx = await strengthSuggest(pending.to);
        setD(nx); setSwapOpen(false); setPending(null);
      } else {
        await strengthSwap({ action: "decline", from_split: d.split, reason });
        setDeclined(true); setSwapOpen(false); setPending(null);
      }
    } catch { /* soft-fail: keep panel open */ }
    finally { setWorking(false); }
  }

  const eyebrow = <div className="eyebrow" style={{ marginTop: 4 }}>Today&apos;s suggestion</div>;

  if (declined) {
    return (
      <div>
        {eyebrow}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>Strength set aside for today</div>
          <div className="subtle tiny">Kai logged that — it&apos;ll factor into what gets suggested next.</div>
        </div>
      </div>
    );
  }

  if (d.blocked) {
    return (
      <div>
        {eyebrow}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>{d.declined ? "Strength set aside for today" : "Skip strength today"}</div>
          <div className="subtle tiny" style={{ lineHeight: 1.45 }}>{d.reason}</div>
        </div>
      </div>
    );
  }

  const c = INT[d.intensity || "maintain"] || INT.maintain;
  const nEx = (d.exercises || []).length;
  const chosen = (d.splits || []).find((x) => x.split === d.split);
  const chips = chipsFor(d);
  const headline = chosen ? `Last trained ${chosen.days_since} day${chosen.days_since === 1 ? "" : "s"} ago` : "Up next in your rotation";
  const alts = d.alt_splits || [];
  const reasons = pending?.kind === "decline" ? DECLINE_REASONS : SWAP_REASONS;

  return (
    <div>
      {eyebrow}
      <div
        onClick={() => { if (!busy && !swapOpen) start(); }}
        style={{ padding: 12, borderRadius: 12, cursor: busy || swapOpen ? "default" : "pointer", background: "rgba(139,124,246,0.08)", border: "1px solid rgba(162,116,255,0.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{d.label}</div>
          <span className="pill" style={{ background: c.bg, color: c.fg, fontSize: 10.5, fontWeight: 700 }}>{c.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#c9b6ff" }}>{busy ? "Starting…" : "Start ›"}</span>
        </div>
        <div className="subtle tiny" style={{ marginTop: 3 }}>{headline} · {nEx} exercise{nEx === 1 ? "" : "s"}{d.est_duration_min ? ` · ~${d.est_duration_min} min` : ""}</div>
        {chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {chips.map((ch, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: TONE[ch.tone] || "#8a90a6", background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: "3px 9px" }}>{ch.label}</span>
            ))}
          </div>
        )}
        {cErr && <div className="subtle tiny" style={{ color: "#fb7185", marginTop: 6 }}>{cErr}</div>}

        {!swapOpen ? (
          <button onClick={(e) => { stop(e); setSwapOpen(true); }} style={{ marginTop: 10, background: "none", border: "none", color: "#9aa0b4", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>Not feeling it? Swap ▾</button>
        ) : (
          <div onClick={stop} style={{ marginTop: 11, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
            {!pending ? (
              <>
                <div className="subtle tiny" style={{ marginBottom: 7 }}>Do a different split instead:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alts.map((a) => (
                    <button key={a.split} onClick={() => setPending({ kind: "swap", to: a.split, toLabel: a.label })}
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "inherit", cursor: "pointer" }}>
                      {a.label}<span style={{ color: "#8a90a6", fontWeight: 500 }}> · {a.days_since}d{a.leg_blocked ? " · legs" : ""}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
                  <button onClick={() => setPending({ kind: "decline" })} style={{ background: "none", border: "none", color: "#ffb0b0", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>Not today</button>
                  <button onClick={() => setSwapOpen(false)} style={{ background: "none", border: "none", color: "#8a90a6", fontSize: 12, padding: 0, cursor: "pointer" }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="subtle tiny" style={{ marginBottom: 7 }}>{pending.kind === "swap" ? `Switching to ${pending.toLabel} — why?` : "Setting strength aside — why?"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {reasons.map((r) => (
                    <button key={r} disabled={working} onClick={() => chooseReason(r)}
                      style={{ background: "rgba(139,124,246,0.12)", border: "1px solid rgba(162,116,255,0.3)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#c9b6ff", cursor: working ? "default" : "pointer", opacity: working ? 0.6 : 1 }}>{r}</button>
                  ))}
                </div>
                <button onClick={() => setPending(null)} disabled={working} style={{ background: "none", border: "none", color: "#8a90a6", fontSize: 12, padding: 0, marginTop: 9, cursor: "pointer" }}>← Back</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
