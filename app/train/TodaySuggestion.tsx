"use client";
import { useEffect, useState } from "react";
import { strengthSuggest, strengthCommitSuggestion, type StrSuggest } from "../lib/api";

const INT: Record<string, { label: string; bg: string; fg: string }> = {
  push: { label: "Progress", bg: "rgba(52,211,153,0.15)", fg: "#34d399" },
  maintain: { label: "Maintain", bg: "rgba(95,125,255,0.15)", fg: "#9db0ff" },
  ease: { label: "Easy", bg: "rgba(255,181,71,0.15)", fg: "#ffb547" },
};
const TONE: Record<string, string> = { good: "#34d399", warn: "#ffb547", bad: "#fb7185", neutral: "#8a90a6" };
const SHORT: Record<string, string> = { upper_push: "push", upper_pull: "pull", lower_quad: "quads", lower_posterior: "posterior" };

type Chip = { label: string; tone: string };

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

export default function TodaySuggestion({ onStartPlan }: { onStartPlan: (planId: string) => void }) {
  const [d, setD] = useState<StrSuggest | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);

  useEffect(() => {
    let a = true;
    strengthSuggest().then((x) => a && setD(x)).catch(() => a && setErr(true));
    return () => { a = false; };
  }, []);

  if (err || !d) return null;

  async function start() {
    if (!d || !d.workout) return;
    setBusy(true); setCErr(null);
    try {
      const r = await strengthCommitSuggestion({ workout: d.workout, why: d.why, label: d.label });
      if (r.plan_id) onStartPlan(r.plan_id);
      else setCErr("Couldn't start — try again.");
    } catch { setCErr("Couldn't start — try again."); }
    finally { setBusy(false); }
  }

  const eyebrow = <div className="eyebrow" style={{ marginTop: 4 }}>Today&apos;s suggestion</div>;

  if (d.blocked) {
    return (
      <div>
        {eyebrow}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>Skip strength today</div>
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

  return (
    <div>
      {eyebrow}
      <div
        onClick={() => { if (!busy) start(); }}
        style={{ padding: 12, borderRadius: 12, cursor: busy ? "default" : "pointer", background: "rgba(139,124,246,0.08)", border: "1px solid rgba(162,116,255,0.35)" }}
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
      </div>
    </div>
  );
}
