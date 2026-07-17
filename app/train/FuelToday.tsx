"use client";
import { useEffect, useState } from "react";
import { fuelDay, type FuelDay, type FuelSession } from "../lib/api";

const BUCKET: Record<string, { label: string; accent: string; bg: string }> = {
  rest: { label: "Rest day", accent: "var(--muted)", bg: "color-mix(in srgb, var(--muted) 10%, transparent)" },
  easy: { label: "Easy day", accent: "var(--success)", bg: "color-mix(in srgb, var(--success) 9%, transparent)" },
  moderate: { label: "Moderate day", accent: "var(--ember)", bg: "color-mix(in srgb, var(--ember) 9%, transparent)" },
  long_hard: { label: "Big day", accent: "var(--gold)", bg: "color-mix(in srgb, var(--gold) 10%, transparent)" },
};
const SPORTC: Record<string, string> = { swim: "var(--ember)", bike: "var(--gold)", run: "var(--success)", strength: "var(--ember-strong)", session: "var(--muted)" };

function istToday(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function sportKey(s: FuelSession): string {
  const t = `${s.sport || ""} ${s.focus || ""}`.toLowerCase();
  if (/swim/.test(t)) return "swim";
  if (/bike|cycl|ride/.test(t)) return "bike";
  if (/run/.test(t)) return "run";
  if (/strength|lift|gym|upper|lower|push|pull|squat|hinge|leg/.test(t)) return "strength";
  return "session";
}
function chipLabel(s: FuelSession): string {
  const k = sportKey(s);
  const name = k === "session" ? "Session" : k[0].toUpperCase() + k.slice(1);
  const min = s.min ? Math.round(s.min) : 0;
  return min > 0 ? `${name} · ${min}m` : name;
}

function Macro({ label, val, color, strong }: { label: string; val: number; color: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: strong ? 18 : 16, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{Math.round(val)}<span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>g</span></div>
      <div className="subtle" style={{ fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", marginTop: 1 }}>{label}</div>
    </div>
  );
}

export default function FuelToday() {
  const [d, setD] = useState<FuelDay | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let a = true;
    fuelDay(istToday()).then((x) => a && setD(x)).catch(() => a && setErr(true));
    return () => { a = false; };
  }, []);

  if (err || !d) return null;
  const m = BUCKET[d.bucket] || BUCKET.moderate;
  const sessions = d.sessions || [];
  const around = d.around || null;
  const aroundLines = around ? [around.pre, around.during, around.post].filter(Boolean) as string[] : [];

  return (
    <div>
      <div className="eyebrow" style={{ marginTop: 4 }}>Fuel for today</div>
      <div style={{ padding: 12, borderRadius: 12, background: m.bg, border: `1px solid color-mix(in srgb, ${m.accent} 34%, transparent)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pill" style={{ background: `color-mix(in srgb, ${m.accent} 16%, transparent)`, color: m.accent, fontSize: 10.5, fontWeight: 700 }}>{m.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{Math.round(d.kcal)}<span className="subtle" style={{ fontSize: 11, fontWeight: 600 }}> kcal</span></span>
        </div>

        {sessions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {sessions.map((s, i) => { const k = sportKey(s); const col = SPORTC[k]; return (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: col, background: `color-mix(in srgb, ${col} 13%, transparent)`, borderRadius: 999, padding: "3px 9px" }}>{chipLabel(s)}</span>
            ); })}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 11, alignItems: "flex-end" }}>
          <Macro label="Carbs" val={d.carbs_g} color="var(--gold)" strong />
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
          <Macro label="Protein" val={d.protein_g} color="var(--ember)" />
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />
          <Macro label="Fat" val={d.fat_g} color="var(--text-2)" />
        </div>

        {d.why && <div className="subtle tiny" style={{ marginTop: 10, lineHeight: 1.45 }}>{d.why}</div>}

        {aroundLines.length > 0 && (
          !open ? (
            <button onClick={() => setOpen(true)} style={{ marginTop: 10, background: "none", border: "none", color: m.accent, fontSize: 12, fontWeight: 700, padding: 0, cursor: "pointer" }}>Around your session ▾</button>
          ) : (
            <div style={{ marginTop: 11, borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
              {aroundLines.map((line, i) => (
                <div key={i} className="tiny" style={{ lineHeight: 1.5, color: "var(--text-2)" }}>{line}</div>
              ))}
              <button onClick={() => setOpen(false)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--muted)", fontSize: 12, padding: 0, marginTop: 1, cursor: "pointer" }}>Hide ▴</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
