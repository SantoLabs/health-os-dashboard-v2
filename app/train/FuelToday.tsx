"use client";
import { useEffect, useState } from "react";
import { fuelDay, type FuelDay } from "../lib/api";

const BUCKET: Record<string, { label: string; accent: string; bg: string }> = {
  rest: { label: "Rest day", accent: "#8a90a6", bg: "rgba(138,144,166,0.10)" },
  easy: { label: "Easy day", accent: "#7fb0ff", bg: "rgba(127,176,255,0.08)" },
  moderate: { label: "Moderate day", accent: "#5f9dff", bg: "rgba(95,157,255,0.09)" },
  long_hard: { label: "Big day", accent: "#ffb547", bg: "rgba(255,181,71,0.10)" },
};

function istToday(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }

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
  const around = d.around || null;
  const aroundLines = around ? [around.pre, around.during, around.post].filter(Boolean) as string[] : [];

  return (
    <div>
      <div className="eyebrow" style={{ marginTop: 4 }}>Fuel for today</div>
      <div style={{ padding: 12, borderRadius: 12, background: m.bg, border: `1px solid ${m.accent}44` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pill" style={{ background: `${m.accent}22`, color: m.accent, fontSize: 10.5, fontWeight: 700 }}>{m.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{Math.round(d.kcal)}<span className="subtle" style={{ fontSize: 11, fontWeight: 600 }}> kcal</span></span>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 11, alignItems: "flex-end" }}>
          <Macro label="Carbs" val={d.carbs_g} color="#ffb547" strong />
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />
          <Macro label="Protein" val={d.protein_g} color="#9db0ff" />
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />
          <Macro label="Fat" val={d.fat_g} color="#c6ccda" />
        </div>

        {d.why && <div className="subtle tiny" style={{ marginTop: 10, lineHeight: 1.45 }}>{d.why}</div>}

        {aroundLines.length > 0 && (
          !open ? (
            <button onClick={() => setOpen(true)} style={{ marginTop: 10, background: "none", border: "none", color: m.accent, fontSize: 12, fontWeight: 700, padding: 0, cursor: "pointer" }}>Around your session ▾</button>
          ) : (
            <div style={{ marginTop: 11, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
              {aroundLines.map((line, i) => (
                <div key={i} className="tiny" style={{ lineHeight: 1.5, color: "#cfd4e0" }}>{line}</div>
              ))}
              <button onClick={() => setOpen(false)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#8a90a6", fontSize: 12, padding: 0, marginTop: 1, cursor: "pointer" }}>Hide ▴</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
