"use client";

import { useEffect, useState } from "react";
import { recoveryGet, planWeek, wkStart, type RecMuscle, type RecMobility, type RecRoutine } from "../lib/api";
import MuscleFigure from "./MuscleFigure";

type Mode = "recovery" | "load";
type Ctx = { readiness: number | null; readiness_label: string | null; acwr: number | null } | null;
type Sel = { mg: string; label: string; fig: string | null } | null;

// muscle_group (from muscle_recovery) -> aliases used to filter the mobility library
const MUS: Record<string, { label: string; aliases: string[] }> = {
  shoulders: { label: "Shoulders", aliases: ["Shoulders", "Front Delts", "Side Delts", "Rear Delts"] },
  chest: { label: "Chest", aliases: ["Chest", "Upper Chest", "Lower Chest"] },
  biceps: { label: "Biceps", aliases: ["Biceps"] },
  triceps: { label: "Triceps", aliases: ["Triceps"] },
  forearms: { label: "Forearms", aliases: ["Forearms", "Wrists"] },
  abdominals: { label: "Abs / Core", aliases: ["Core", "Abs", "Obliques", "Serratus"] },
  upper_back: { label: "Upper back", aliases: ["Upper Back", "Back"] },
  lats: { label: "Lats", aliases: ["Lats"] },
  traps: { label: "Traps", aliases: ["Traps", "Neck"] },
  lower_back: { label: "Lower back", aliases: ["Lower Back", "Spine"] },
  glutes: { label: "Glutes", aliases: ["Glutes", "Hips"] },
  quadriceps: { label: "Quads", aliases: ["Quads", "Hip Flexors"] },
  hamstrings: { label: "Hamstrings", aliases: ["Hamstrings"] },
  calves: { label: "Calves", aliases: ["Calves", "Ankles"] },
  adductors: { label: "Adductors", aliases: ["Adductors"] },
  abductors: { label: "Abductors", aliases: ["Abductors", "IT Band"] },
  full_body: { label: "Full body", aliases: [] },
};

// figure key -> backing muscle_group (which RecMuscle row colors it)
const FKEY_MG: Record<string, string> = {
  neck: "traps", traps: "traps", delts: "shoulders", chest: "chest", biceps: "biceps",
  forearms: "forearms", abs: "abdominals", obliques: "abdominals", quads: "quadriceps",
  calves: "calves", lats: "lats", midback: "upper_back", triceps: "triceps",
  lowerback: "lower_back", glutes: "glutes", hamstrings: "hamstrings",
};
const FIG_LABEL: Record<string, string> = {
  neck: "Neck", traps: "Traps", delts: "Shoulders", chest: "Chest", biceps: "Biceps",
  forearms: "Forearms", abs: "Abs", obliques: "Obliques", quads: "Quads", calves: "Calves",
  lats: "Lats", midback: "Upper back", triceps: "Triceps", lowerback: "Lower back",
  glutes: "Glutes", hamstrings: "Hamstrings",
};

const REC_PAL: Record<string, string> = { fresh: "var(--success)", recovering: "var(--gold)", fatigued: "var(--danger)" };
const LOAD_PAL: Record<string, string> = { neglected: "var(--muted)", light: "var(--gold)", heavy: "var(--ember)", peak: "var(--danger)" };
const HINTS: Record<string, string> = {
  fatigued: "give it another day", recovering: "light work is fine", fresh: "ready to train",
  neglected: "no recent volume", light: "low recent volume", heavy: "high recent volume", peak: "highest recent volume",
};
const recState = (pct: number) => (pct >= 70 ? "fresh" : pct >= 50 ? "recovering" : "fatigued");
const loadState = (pct: number) => (pct >= 80 ? "peak" : pct >= 50 ? "heavy" : pct >= 20 ? "light" : "neglected");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function MobRow({ x }: { x: RecMobility }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid var(--line)" }}><span style={{ fontSize: 14 }}>🧘</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{x.name}</div><div className="subtle tiny">{[x.primary_muscle, x.default_prescription].filter(Boolean).join(" · ")}</div></div></div>;
}

export default function RecoveryPanel({ onGoWorkouts }: { onGoWorkouts?: () => void }) {
  const [muscles, setMuscles] = useState<RecMuscle[]>([]);
  const [mobility, setMobility] = useState<RecMobility[]>([]);
  const [ctx, setCtx] = useState<Ctx>(null);
  const [mode, setMode] = useState<Mode>("recovery");
  const [sel, setSel] = useState<Sel>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [routines, setRoutines] = useState<RecRoutine[]>([]);
  const [recentSport, setRecentSport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    recoveryGet()
      .then((r) => { if (alive) { setMuscles(r.muscles || []); setMobility(r.mobility || []); setRoutines(r.routines || []); setRecentSport(r.recent_sport || null); } })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    planWeek<{ context?: { readiness: number | null; readiness_label: string | null; acwr: number | null } }>()
      .then((w) => { if (alive) setCtx(w.context || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const M: Record<string, RecMuscle> = {};
  muscles.forEach((m) => { M[m.muscle_group] = m; });

  const stateOf = (m: RecMuscle | undefined): string | null => {
    if (!m || m.days_ago == null) return null;
    return mode === "recovery" ? recState(m.freshness) : loadState(m.load_pct);
  };

  // figure-key -> state string (omit when no data -> figure paints it with base)
  const states: Record<string, string> = {};
  for (const fk of Object.keys(FKEY_MG)) {
    const st = stateOf(M[FKEY_MG[fk]]);
    if (st) states[fk] = st;
  }
  const palette = mode === "recovery" ? REC_PAL : LOAD_PAL;

  const selM = sel ? (M[sel.mg] || null) : null;
  const selState = selM ? stateOf(selM) : null;
  const selColor = selState ? palette[selState] : "var(--muted)";
  const selPct = selM ? (mode === "recovery" ? selM.freshness : selM.load_pct) : 0;
  const selAliases = sel ? (MUS[sel.mg]?.aliases || []) : [];
  const selMob = sel ? mobility.filter((x) => x.primary_muscle != null && selAliases.includes(x.primary_muscle)).slice(0, 6) : [];

  const pickFig = (fk: string) => setSel((s) => (s && s.fig === fk ? null : { mg: FKEY_MG[fk], label: FIG_LABEL[fk], fig: fk }));

  const legend = mode === "recovery"
    ? [["var(--danger)", "Fatigued"], ["var(--gold)", "Recovering"], ["var(--success)", "Fresh"]]
    : [["var(--muted)", "Neglected"], ["var(--gold)", "Light"], ["var(--ember)", "Heavy"], ["var(--danger)", "Peak"]];

  return (
    <div>
      {ctx && (ctx.readiness != null || ctx.acwr != null) ? (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "center", minWidth: 46 }}>
            <div className="tnum" style={{ fontSize: 24, fontWeight: 800, color: ctx.readiness != null && ctx.readiness < 40 ? "var(--danger)" : ctx.readiness != null && ctx.readiness < 65 ? "var(--gold)" : "var(--success)" }}>{ctx.readiness ?? "—"}</div>
            <div className="subtle tiny">readiness</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{ctx.readiness_label || "Recovery snapshot"}</div>
            <div className="subtle tiny" style={{ marginTop: 2 }}>{ctx.acwr != null ? `Training-load ratio (ACWR) ${ctx.acwr.toFixed(2)}` : "Based on your training recency and volume"}</div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Muscle map</div>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", borderRadius: 999, padding: 3 }}>
            {(["recovery", "load"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "capitalize", background: mode === m ? "var(--t-grad)" : "transparent", color: mode === m ? "#fff" : "var(--muted)" }}>{m}</button>
            ))}
          </div>
        </div>
        {err ? <div className="subtle tiny" style={{ color: "var(--danger)" }}>{err}</div> : null}
        {loading ? <div className="muted center pad">Loading…</div> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-evenly" }}>
              <div style={{ width: 150, height: 285 }}><MuscleFigure view="front" states={states} palette={palette} base="var(--muted)" selected={sel?.fig ?? null} onSelect={pickFig} /></div>
              <div style={{ width: 150, height: 285 }}><MuscleFigure view="back" states={states} palette={palette} base="var(--muted)" selected={sel?.fig ?? null} onSelect={pickFig} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-evenly" }}>
              <span className="subtle tiny">Front</span><span className="subtle tiny">Back</span>
            </div>

            {sel ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{sel.label}</span>
                    {selState ? <span style={{ background: `color-mix(in srgb, ${selColor} 16%, transparent)`, color: selColor, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>{cap(selState)}</span> : null}
                  </div>
                  <div className="subtle tiny">
                    {selM && selM.days_ago != null ? `Last trained ${selM.days_ago === 0 ? "today" : selM.days_ago + "d ago"}${selState ? " · " + HINTS[selState] : ""}` : "Never trained — no recent volume."}
                  </div>
                  {selM ? <div className="subtle tiny" style={{ opacity: 0.8 }}>{selM.sets_14d} sets · {Math.round(selM.vol_14d).toLocaleString("en-US")} kg / 14d</div> : null}
                  <div style={{ height: 5, borderRadius: 999, background: "var(--line-2)", overflow: "hidden", marginTop: 2 }}>
                    <div style={{ height: "100%", borderRadius: 999, background: selColor, width: selPct + "%" }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{ color: selColor, fontSize: 18, fontWeight: 800 }} className="tnum">{selPct}%</span>
                  <span onClick={() => setSel(null)} style={{ color: "var(--muted)", fontSize: 11, cursor: "pointer" }}>Close</span>
                </div>
              </div>
            ) : null}

            {selMob.length > 0 ? (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Mobility for {sel?.label}</div>
                {selMob.map((x) => <MobRow key={x.name} x={x} />)}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {legend.map(([c, t]) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />{t}</span>
              ))}
            </div>
            <div className="subtle tiny" style={{ textAlign: "center", opacity: 0.7, lineHeight: 1.5 }}>Tap a muscle for detail. Derived from your training recency and volume — not soreness sensors.</div>
          </>
        )}
      </div>

      {routines.length > 0 ? (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Recovery routines</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...routines].sort((a, b) => Number(b.recommended) - Number(a.recommended)).map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, background: "var(--surface-2)", border: r.recommended ? "1px solid color-mix(in srgb, var(--ember) 40%, transparent)" : "1px solid var(--line)" }}>
                <span aria-hidden style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 7px", borderRadius: 6, background: "color-mix(in srgb, var(--success) 16%, transparent)", color: "var(--success)" }}>RECOVERY</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span>
                    {r.recommended ? <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: "color-mix(in srgb, var(--ember) 18%, transparent)", color: "var(--ember)" }}>Recommended</span> : null}
                  </div>
                  <div className="subtle tiny">{r.item_count} move{r.item_count === 1 ? "" : "s"}{r.est_duration_mins ? ` · ${r.est_duration_mins}m` : ""}{r.focus ? ` · ${r.focus}` : ""}</div>
                </div>
                <button className="trn-sub" disabled={busy} onClick={async () => { setBusy(true); try { await wkStart({ routine_id: r.id }); onGoWorkouts?.(); } finally { setBusy(false); } }}>Start</button>
              </div>
            ))}
          </div>
          {recentSport ? <div className="subtle tiny" style={{ marginTop: 8, opacity: 0.75 }}>Recommended after your recent {recentSport === "bike" ? "ride" : recentSport}.</div> : null}
        </div>
      ) : null}

    </div>
  );
}
