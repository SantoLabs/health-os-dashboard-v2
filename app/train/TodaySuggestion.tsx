"use client";
import { useEffect, useState } from "react";
import { strengthSuggest, strengthCommitSuggestion, strengthSwap, type StrSuggest } from "../lib/api";

const INT: Record<string, { label: string; bg: string; fg: string }> = {
  push: { label: "Progress", bg: "color-mix(in srgb, var(--success) 15%, transparent)", fg: "var(--success)" },
  maintain: { label: "Maintain", bg: "color-mix(in srgb, var(--ember) 15%, transparent)", fg: "var(--ember)" },
  ease: { label: "Easy", bg: "color-mix(in srgb, var(--gold) 15%, transparent)", fg: "var(--gold)" },
};
const TONE: Record<string, string> = { good: "var(--success)", warn: "var(--gold)", bad: "var(--danger)", neutral: "var(--muted)" };
const FEELS: { k: string; label: string }[] = [{ k: "fresh", label: "Fresh" }, { k: "normal", label: "Normal" }, { k: "beat", label: "Beat" }];

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
  if (s.tsb != null) { const tsb = Number(s.tsb); const fr = Math.sign(tsb) * Math.round(Math.abs(tsb)); chips.push({ label: `form ${fr}`, tone: tsb > 5 ? "good" : tsb >= -10 ? "neutral" : tsb >= -20 ? "warn" : "bad" }); }
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
  const [feel, setFeel] = useState<string | null>(null);
  const [feeling, setFeeling] = useState(false);

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
      const r = await strengthCommitSuggestion({ workout: d.workout, why: d.why, label: d.label, feel: feel || undefined });
      if (r.plan_id) onStartPlan(r.plan_id);
      else setCErr("Couldn't start — try again.");
    } catch { setCErr("Couldn't start — try again."); }
    finally { setBusy(false); }
  }

  async function pickFeel(f: string) {
    if (!d || feeling) return;
    setFeeling(true); setCErr(null);
    try {
      const nx = await strengthSuggest(d.forced ? d.split : undefined, f);
      setFeel(f); setD(nx);
    } catch { /* keep current */ }
    finally { setFeeling(false); }
  }

  async function chooseReason(reason: string) {
    if (!d || !pending) return;
    setWorking(true);
    try {
      if (pending.kind === "swap") {
        await strengthSwap({ action: "swap", from_split: d.split, to_split: pending.to, reason });
        const nx = await strengthSuggest(pending.to, feel || undefined);
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
        style={{ padding: 12, borderRadius: 12, cursor: busy || swapOpen ? "default" : "pointer", background: "color-mix(in srgb, var(--ember) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--ember) 35%, transparent)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{d.label}</div>
          <span className="pill" style={{ background: c.bg, color: c.fg, fontSize: 10.5, fontWeight: 700 }}>{c.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--ember)" }}>{busy ? "Starting…" : "Start ›"}</span>
        </div>
        <div className="subtle tiny" style={{ marginTop: 3 }}>{headline} · {nEx} exercise{nEx === 1 ? "" : "s"}{d.est_duration_min ? ` · ~${d.est_duration_min} min` : ""}</div>
        {chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {chips.map((ch, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: TONE[ch.tone] || "var(--muted)", background: "var(--surface-2)", borderRadius: 999, padding: "3px 9px" }}>{ch.label}</span>
            ))}
          </div>
        )}

        <div onClick={stop} style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span className="subtle tiny">Feeling today?</span>
          {FEELS.map((f) => {
            const on = feel === f.k;
            return (
              <button key={f.k} disabled={feeling} onClick={() => pickFeel(f.k)}
                style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 11px", borderRadius: 999, border: `1px solid ${on ? "color-mix(in srgb, var(--ember) 55%, transparent)" : "var(--line)"}`, background: on ? "color-mix(in srgb, var(--ember) 18%, transparent)" : "transparent", color: on ? "var(--ember)" : "var(--muted)", cursor: feeling ? "default" : "pointer" }}>{f.label}</button>
            );
          })}
          {feeling && <span className="subtle tiny" style={{ opacity: 0.8 }}>updating…</span>}
        </div>

        {cErr && <div className="subtle tiny" style={{ color: "var(--danger)", marginTop: 6 }}>{cErr}</div>}

        {!swapOpen ? (
          <button onClick={(e) => { stop(e); setSwapOpen(true); }} style={{ marginTop: 10, background: "none", border: "none", color: "var(--muted)", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>Not feeling it? Swap ▾</button>
        ) : (
          <div onClick={stop} style={{ marginTop: 11, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            {!pending ? (
              <>
                <div className="subtle tiny" style={{ marginBottom: 7 }}>Do a different split instead:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alts.map((a) => (
                    <button key={a.split} onClick={() => setPending({ kind: "swap", to: a.split, toLabel: a.label })}
                      style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "inherit", cursor: "pointer" }}>
                      {a.label}<span style={{ color: "var(--muted)", fontWeight: 500 }}> · {a.days_since}d{a.leg_blocked ? " · legs" : ""}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
                  <button onClick={() => setPending({ kind: "decline" })} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: 12, fontWeight: 600, padding: 0, cursor: "pointer" }}>Not today</button>
                  <button onClick={() => setSwapOpen(false)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, padding: 0, cursor: "pointer" }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="subtle tiny" style={{ marginBottom: 7 }}>{pending.kind === "swap" ? `Switching to ${pending.toLabel} — why?` : "Setting strength aside — why?"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {reasons.map((r) => (
                    <button key={r} disabled={working} onClick={() => chooseReason(r)}
                      style={{ background: "color-mix(in srgb, var(--ember) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--ember) 30%, transparent)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "var(--ember)", cursor: working ? "default" : "pointer", opacity: working ? 0.6 : 1 }}>{r}</button>
                  ))}
                </div>
                <button onClick={() => setPending(null)} disabled={working} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, padding: 0, marginTop: 9, cursor: "pointer" }}>← Back</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
