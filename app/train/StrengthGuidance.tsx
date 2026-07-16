"use client";
import { useEffect, useState } from "react";
import { strengthGuidance, type StrGuidance } from "../lib/api";

const VERDICT: Record<string, { bg: string; fg: string; ring: string }> = {
  push: { bg: "rgba(52,211,153,0.12)", fg: "#34d399", ring: "rgba(52,211,153,0.4)" },
  maintain: { bg: "rgba(95,125,255,0.12)", fg: "#9db0ff", ring: "rgba(95,125,255,0.4)" },
  ease: { bg: "rgba(255,181,71,0.12)", fg: "#ffb547", ring: "rgba(255,181,71,0.4)" },
};
const TONE: Record<string, string> = { good: "#34d399", warn: "#ffb547", bad: "#fb7185", neutral: "#8a90a6" };
const TREND: Record<string, string> = { up: "\u25b2", flat: "\u2192", down: "\u25bc" };
const TRENDC: Record<string, string> = { up: "#34d399", flat: "#8a90a6", down: "#fb7185" };

export default function StrengthGuidance() {
  const [d, setD] = useState<StrGuidance | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let a = true;
    strengthGuidance().then((x) => a && setD(x)).catch(() => a && setErr(true));
    return () => { a = false; };
  }, []);

  if (err) return null;
  if (!d) return <div className="muted center pad">Checking your readiness&hellip;</div>;
  const v = VERDICT[d.verdict] || VERDICT.maintain;

  return (
    <div className="card" style={{ marginBottom: 10, border: `1px solid ${v.ring}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span className="eyebrow" style={{ margin: 0 }}>Today&apos;s strength guidance</span>
        <span className="pill" style={{ marginLeft: "auto", background: v.bg, color: v.fg, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{d.verdict_label}</span>
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "#cdd3e6" }}>{d.verdict_why}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 2px" }}>
        {d.signals.map((s) => (
          <span key={s.key} style={{ fontSize: 11, fontWeight: 600, color: TONE[s.tone] || "#8a90a6", background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: "3px 9px" }}>{s.label}</span>
        ))}
      </div>
      {d.lifts.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
          <div className="subtle tiny" style={{ marginBottom: 6 }}>Suggested loads next time</div>
          {d.lifts.map((l) => (
            <div key={l.title} style={{ padding: "5px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {l.title} <span style={{ color: TRENDC[l.trend] || "#8a90a6", fontSize: 10.5 }}>{TREND[l.trend] || ""}</span>
              </div>
              <div className="subtle tiny">last: {l.last_weight} kg &times; {l.last_reps} &middot; {l.last_sets} sets</div>
              <div style={{ fontSize: 12, color: "#c9b6ff", marginTop: 1 }}>{l.suggestion}</div>
            </div>
          ))}
        </div>
      )}
      <div className="subtle tiny" style={{ marginTop: 8, lineHeight: 1.4 }}>{d.note}</div>
    </div>
  );
}
