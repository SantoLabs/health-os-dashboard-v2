"use client";
import { useEffect, useState } from "react";
import { strengthSuggest, strengthCommitSuggestion, type StrSuggest } from "../lib/api";

const INT: Record<string, { label: string; bg: string; fg: string }> = {
  push: { label: "Progress", bg: "rgba(52,211,153,0.15)", fg: "#34d399" },
  maintain: { label: "Maintain", bg: "rgba(95,125,255,0.15)", fg: "#9db0ff" },
  ease: { label: "Easy", bg: "rgba(255,181,71,0.15)", fg: "#ffb547" },
};

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
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#c9b6ff" }}>{busy ? "Starting\u2026" : "Start \u203a"}</span>
        </div>
        <div className="subtle tiny" style={{ marginTop: 3 }}>{nEx} exercise{nEx === 1 ? "" : "s"}{d.est_duration_min ? ` \u00b7 ~${d.est_duration_min} min` : ""} \u00b7 Kai composed \u2014 opens in the builder</div>
        <div style={{ fontSize: 12.5, color: "#cdd3e6", marginTop: 7, lineHeight: 1.45 }}>{d.why}</div>
        {cErr && <div className="subtle tiny" style={{ color: "#fb7185", marginTop: 6 }}>{cErr}</div>}
      </div>
    </div>
  );
}
