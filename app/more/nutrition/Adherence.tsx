"use client";
import Icon from "../../components/Icon";

import { useEffect, useState, type CSSProperties } from "react";
import { nutriAdherence } from "../../lib/api";

const CARD = "var(--surface)", INSET = "var(--bg)", CB = "var(--line)", IB = "var(--line-2)";
const H = "var(--text)", BODY = "var(--text)", MUTED = "var(--text-2)", FAINT = "var(--muted)", FAINTER = "var(--faint)";
const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)", CHIP_SEL = "var(--ember-tint)", CHIP_SEL_B = "color-mix(in srgb, var(--ember) 35%, transparent)", CHIP_IDLE = "var(--surface-2)", CHIP_IDLE_B = "var(--line-2)";
const PROT = "#4a86e8", CARB = "#cf8a2e", FAT = "#d85c42", FIBR = "#3aa17e", TRACK = "var(--surface-2)";
const ON = "var(--success)", PARTIAL = "var(--gold)", MISS = "var(--danger)";

type MacroStat = { avg: number; target: number; pct: number; days_on_target: number };
type MicroStat = { avg: number; rda: number; pct: number };
type Adh = { window: number; today: string; days_logged: number; days_total: number; streak: number; targets: { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> }; macros: Record<string, MacroStat>; micros: Record<string, MicroStat> };

const MACRO_META: [string, string, string, string][] = [["calories", "Calories", "kcal", "#cdd5e3"], ["protein", "Protein", "g", PROT], ["carbs", "Carbs", "g", CARB], ["fats", "Fat", "g", FAT], ["fiber", "Fiber", "g", FIBR]];
const MICRO_META: [string, string, string][] = [["b12_ug", "Vitamin B12", "µg"], ["vit_d_ug", "Vitamin D", "µg"], ["iron_mg", "Iron", "mg"], ["omega3_mg", "Omega-3", "mg"]];

const tiny: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
function pctColor(p: number): string { return p >= 90 ? ON : p >= 60 ? PARTIAL : MISS; }
function readPill(p: number): { t: string; c: string } { return p >= 100 ? { t: "on track", c: ON } : p >= 70 ? { t: "a bit low", c: PARTIAL } : { t: "low", c: MISS }; }

function Ring({ pct, color }: { pct: number; color: string }) {
  const R = 52, C = 2 * Math.PI * R, fill = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 120 120" style={{ width: 132, height: 132 }}>
      <circle cx="60" cy="60" r={R} fill="none" stroke={TRACK} strokeWidth="11" />
      <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill / 100)} transform="rotate(-90 60 60)" />
    </svg>
  );
}

export default function Adherence({ onClose }: { onClose: () => void }) {
  const [window, setWindow] = useState<number>(7);
  const [data, setData] = useState<Adh | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setData(null); nutriAdherence<Adh>(window).then(setData).catch((e) => setErr(e.message)); }, [window]);

  const prot = data ? data.macros.protein : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 48 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "16px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: H }}>Adherence</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[7, 30].map((w) => <button key={w} onClick={() => setWindow(w)} style={{ flex: 1, padding: "8px 0", borderRadius: 11, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: "1px solid " + (window === w ? CHIP_SEL_B : CHIP_IDLE_B), background: window === w ? CHIP_SEL : CHIP_IDLE, color: window === w ? ACCENT_LT : MUTED }}>Last {w} days</button>)}
        </div>

        {err && <div style={{ padding: 10, borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 12 }}>{err}</div>}
        {!data && !err && <div style={{ color: FAINT, fontSize: 12.5, textAlign: "center", padding: 24 }}>Loading…</div>}

        {data && (
          <>
            {data.days_logged === 0 ? (
              <div style={{ color: FAINT, fontSize: 12.5, textAlign: "center", padding: 24 }}>Nothing logged in this window yet. Log a few days and your adherence shows up here.</div>
            ) : (
              <>
                {/* protein ring */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                  <div style={{ position: "relative", width: 132, height: 132, flexShrink: 0 }}>
                    <Ring pct={prot ? prot.pct : 0} color={pctColor(prot ? prot.pct : 0)} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{prot ? prot.pct : 0}%</div>
                      <div style={{ ...tiny, marginTop: 4 }}>avg protein</div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: MUTED }}>You averaged <span style={{ color: H, fontWeight: 800 }}>{prot ? prot.avg : 0}g</span> protein/day vs your <span style={{ color: H, fontWeight: 800 }}>{prot ? prot.target : 0}g</span> goal.</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ON, background: "color-mix(in srgb, var(--success) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)", borderRadius: 999, padding: "4px 9px" }}><Icon name="fire" size={11} /> {data.streak}-day streak</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_LT, background: CHIP_SEL, border: "1px solid " + CHIP_SEL_B, borderRadius: 999, padding: "4px 9px" }}>{prot ? prot.days_on_target : 0}/{data.days_total} days on target</span>
                    </div>
                    <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>Logged {data.days_logged} of {data.days_total} days</div>
                  </div>
                </div>

                {/* macro adherence */}
                <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14, marginBottom: 12 }}>
                  <div style={{ ...tiny, marginBottom: 10 }}>Macro adherence · avg/day</div>
                  {MACRO_META.map(([key, lbl, unit, color]) => {
                    const m = data.macros[key]; if (!m) return null; const fill = Math.min(100, m.pct);
                    return (
                      <div key={key} style={{ marginBottom: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: BODY }}>{lbl}</span>
                          <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: "tabular-nums" }}><span style={{ color: H, fontWeight: 700 }}>{m.avg}</span> / {m.target} {unit} · <span style={{ color: pctColor(m.pct), fontWeight: 700 }}>{m.pct}%</span></span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: TRACK, overflow: "hidden" }}><div style={{ width: fill + "%", height: "100%", background: color }} /></div>
                      </div>
                    );
                  })}
                </div>

                {/* micronutrients */}
                <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14 }}>
                  <div style={{ ...tiny, marginBottom: 4 }}>Micronutrients · avg/day vs RDA</div>
                  <div style={{ fontSize: 10.5, color: FAINTER, marginBottom: 12 }}>The handful that matter most on a plant-leaning diet. Only counts foods carrying micro data.</div>
                  {MICRO_META.map(([key, lbl, unit]) => {
                    const mi = data.micros[key]; if (!mi) return null; const fill = Math.min(100, mi.pct); const pill = readPill(mi.pct);
                    return (
                      <div key={key} style={{ marginBottom: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: BODY }}>{lbl} <span style={{ fontSize: 10.5, fontWeight: 700, color: pill.c, marginLeft: 4 }}>· {pill.t}</span></span>
                          <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: "tabular-nums" }}><span style={{ color: H, fontWeight: 700 }}>{mi.avg}</span> / {mi.rda} {unit}</span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: TRACK, overflow: "hidden" }}><div style={{ width: fill + "%", height: "100%", background: pill.c }} /></div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
