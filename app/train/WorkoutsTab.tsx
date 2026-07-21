"use client";

import { useEffect, useRef, useState } from "react";
import CardioBuilder from "./CardioBuilder";
import CardioLive from "./CardioLive";
import CardioFree from "./CardioFree";
import CardioSwim from "./CardioSwim";
import WorkoutLogger, { RoutineBuilder } from "./WorkoutLogger";
import TodaySuggestion from "./TodaySuggestion";
import FuelToday from "./FuelToday";
import { CARDIO_PRESETS, STRENGTH_PRESETS, type CardioPreset, type PresetSport, type GlyphKey, type StrengthPreset } from "./presets";
import { cardioList, cardioDelete, cardioPrescribe, cardioGet, wkRoutines, wkDeleteRoutine, wkActive } from "../lib/api";
import type { CardioRoutine, WkRoutineSummary, WkBundle, WkRoutineItem } from "../lib/api";

/* ------------------------------------------------------------------ *
 * Workouts — four-zone home (Phase 1)
 *
 * Strength | Cardio toggle is the spine; the page fully reflows per
 * discipline (never a shared scroll). Zones per discipline:
 *   1. Do now / Build   — Variant A entry pair
 *   2. Your routines     — ghost-glyph tiles + ⋯ / long-press four-action tray
 *   3. Presets           — placeholder until Phase 3
 * Build / edit / execute delegate to the existing CardioBuilder and
 * WorkoutLogger surfaces — this file owns presentation + the cardio
 * edit/delete wiring that closes the day-one gap.
 * Push-to-device is honestly SOON until its backend lands (Phase 2+).
 * ------------------------------------------------------------------ */

type Discipline = "strength" | "cardio";

type Surface =
  | { k: "home" }
  | { k: "cardio"; intent: "workout" | "routine"; start: "describe" | "build"; editRoutineId?: string; preset?: CardioPreset }
  | { k: "cardioLive"; routine: CardioRoutine }
  | { k: "cardioPick" }
  | { k: "cardioFree" }
  | { k: "cardioSwim"; routine: CardioRoutine | null }
  | { k: "presets" }
  | { k: "strengthLogger"; autoStart: { plan_id?: string; routine_id?: string; title?: string; items?: WkRoutineItem[] } | null; resume?: boolean }
  | { k: "strengthBuild"; routineId: string | null; preset?: StrengthPreset }
  | { k: "strengthPresets" };

type GlyphKind = "run" | "bike" | "swim" | "brick" | "strength" | "mobility";
type SportKey = "run" | "bike" | "swim" | "brick";

const SPORTS: { key: SportKey; label: string; title: string; hue: string; glyph: GlyphKind }[] = [
  { key: "run", label: "RUN", title: "Run", hue: "#c98a2d", glyph: "run" },
  { key: "bike", label: "BIKE", title: "Bike", hue: "#97934b", glyph: "bike" },
  { key: "swim", label: "SWIM", title: "Swim", hue: "#5e93a6", glyph: "swim" },
  { key: "brick", label: "BRICK", title: "Multisport", hue: "var(--muted)", glyph: "brick" },
];
const SPORT_BY_KEY: Record<SportKey, (typeof SPORTS)[number]> = {
  run: SPORTS[0], bike: SPORTS[1], swim: SPORTS[2], brick: SPORTS[3],
};

function elapsedLabel(startTs?: string | null): string {
  if (!startTs) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(startTs)) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function sportOf(s: string | null | undefined): SportKey {
  const k = (s || "").toLowerCase();
  if (k.includes("multi") || k.includes("brick")) return "brick";
  if (k.includes("swim")) return "swim";
  if (k.includes("bik") || k.includes("cycl") || k.includes("rid")) return "bike";
  return "run";
}

function cardioMeta(r: CardioRoutine): string {
  const s = SPORT_BY_KEY[sportOf(r.sport)];
  const parts: string[] = [s.title];
  if (r.total_distance_m && r.total_distance_m > 0) parts.push(`${(r.total_distance_m / 1000).toFixed(1)} km`);
  if (r.total_duration_s && r.total_duration_s > 0) parts.push(`~${Math.round(r.total_duration_s / 60)} min`);
  return parts.join(" · ");
}

function strengthKind(r: WkRoutineSummary): GlyphKind {
  const f = `${r.focus || ""} ${r.name || ""}`.toLowerCase();
  return /mobilit|recover|stretch|cooldown|warm|yoga|hip|spine|foam/.test(f) ? "mobility" : "strength";
}
function strengthMeta(r: WkRoutineSummary): string {
  const parts: string[] = [`${r.item_count} exercise${r.item_count === 1 ? "" : "s"}`];
  if (r.focus) parts.push(r.focus);
  else if (r.est_duration_mins) parts.push(`~${r.est_duration_mins} min`);
  return parts.join(" · ");
}

// ---- ghost glyph (decoration only; ~14% opacity, hue = discipline) ----
function Glyph({ kind, hue }: { kind: GlyphKind; hue: string }) {
  const common = {
    width: 96, height: 96, viewBox: "0 0 24 24", fill: "none", stroke: hue,
    strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    style: { position: "absolute" as const, top: -14, right: -18, opacity: 0.14, transform: "rotate(-8deg)", pointerEvents: "none" as const },
  };
  switch (kind) {
    case "bike":
      return (<svg {...common}><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-8h5M15 9l3 8M9 9h5M13 8h3" /></svg>);
    case "brick":
      return (<svg {...common}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
    case "swim":
      return (<svg {...common}><path d="M3 12h4l2.5-6 5 12 2.5-8h4" /></svg>);
    case "run":
      return (<svg {...common}><path d="M4 20c8 0 2-14 10-14 5 0 4 7 6 7" /><circle cx="3" cy="20" r="1.3" /><circle cx="20" cy="13" r="1.3" /></svg>);
    case "mobility":
      return (<svg {...common}><path d="M3 8h10a3 3 0 1 0-3-3M3 13h14a3 3 0 1 1-3 3M3 18h7" /></svg>);
    default: // strength
      return (<svg {...common}><path d="M6.5 7v10M17.5 7v10M3 9.5v5M21 9.5v5M6.5 12h11" /></svg>);
  }
}

// ---- small icons ----
const IC = { width: 15, height: 15, viewBox: "0 0 24 24" };
const PlayIcon = () => (<svg {...IC} fill="var(--on-ember)"><path d="M8 5l11 7-11 7z" /></svg>);
const PencilIcon = () => (<svg {...IC} fill="none" stroke="var(--ember-strong)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4L8 20H4v-4L17 3z" /></svg>);
const Dumbbell = ({ c }: { c: string }) => (<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round"><path d="M6.5 7v10M17.5 7v10M3 9.5v5M21 9.5v5M6.5 12h11" /></svg>);
const Wave = ({ c }: { c: string }) => (<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5-6 5 12 2.5-8h4" /></svg>);

const trayIco = (c: string) => ({ width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

// ---- preset library ----
const PRESET_HUE: Record<PresetSport, string> = { run: "#c98a2d", bike: "#97934b", swim: "#5e93a6", brick: "var(--muted)" };
const PRESET_GLYPH: Record<string, JSX.Element> = {
  run: (<><path d="M4 20c8 0 2-14 10-14 5 0 4 7 6 7" /><circle cx="3" cy="20" r="1.6" /><circle cx="21" cy="13" r="1.6" /></>),
  runEasy: (<path d="M2 14c3-4 5-4 8 0s5 4 8 0" />),
  bike: (<><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-8h5M15 9l3 8M9 9h5M13 6h3" /></>),
  swim: (<><path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /></>),
  brick: (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>),
  stopwatch: (<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M10 2h4" /></>),
  bolt: (<path d="M13 2L5 13h5l-1 9 8-11h-5z" />),
  hill: (<path d="M3 18l5-9 4 5 3-6 6 10" />),
  strength: (<path d="M6.5 7v10M17.5 7v10M3 9.5v5M21 9.5v5M6.5 12h11" />),
  mobility: (<path d="M3 8h10a3 3 0 1 0-3-3M3 13h14a3 3 0 1 1-3 3M3 18h7" />),
};

function PresetTile({ name, meta, glyphKey, hue, onLoad }: { name: string; meta: string; glyphKey: string; hue: string; onLoad: () => void }) {
  return (
    <button onClick={onLoad}
      style={{ position: "relative", overflow: "hidden", textAlign: "left", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: 14, minHeight: 136, display: "flex", flexDirection: "column", cursor: "pointer", color: "inherit" }}>
      <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={hue} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", top: -16, right: -20, opacity: 0.14, transform: "rotate(-8deg)", pointerEvents: "none" }}>{PRESET_GLYPH[glyphKey]}</svg>
      <div style={{ flex: 1, minHeight: 44 }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{meta}</div>
      </div>
      <div style={{ position: "relative", marginTop: 10 }}>
        <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 800, color: "var(--on-inverse)", background: "var(--inverse-surface)", borderRadius: 999, padding: "6px 14px" }}>Load</span>
      </div>
    </button>
  );
}
const strengthHue = (p: StrengthPreset) => (p.glyph === "mobility" ? "var(--success)" : "var(--ember-strong)");

const PRESET_SECTIONS: { sport: PresetSport; label: string }[] = [
  { sport: "run", label: "RUN" }, { sport: "bike", label: "BIKE" }, { sport: "swim", label: "SWIM" }, { sport: "brick", label: "BRICK" },
];

function PresetLibrary({ onExit, onLoad }: { onExit: () => void; onLoad: (p: CardioPreset) => void }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onExit} style={{ width: 36, height: 36, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 auto" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Preset library</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Load a preset and make it yours — it opens in the builder, ready to tweak and save.</div>
      {PRESET_SECTIONS.map((sec) => {
        const list = CARDIO_PRESETS.filter((p) => p.sport === sec.sport);
        if (!list.length) return null;
        return (
          <div key={sec.sport}>
            <div className="eyebrow" style={{ marginTop: 18, marginBottom: 8 }}>{sec.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {list.map((p) => <PresetTile key={p.id} name={p.name} meta={p.meta} glyphKey={p.glyph} hue={PRESET_HUE[p.sport]} onLoad={() => onLoad(p)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STRENGTH_SECTIONS: { glyph: "strength" | "mobility"; label: string }[] = [
  { glyph: "strength", label: "STRENGTH" }, { glyph: "mobility", label: "MOBILITY" },
];

function StrengthPresetLibrary({ onExit, onLoad }: { onExit: () => void; onLoad: (p: StrengthPreset) => void }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onExit} style={{ width: 36, height: 36, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 auto" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Preset library</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Load a preset and make it yours — it opens in the builder, ready to tweak and save.</div>
      {STRENGTH_SECTIONS.map((sec) => {
        const list = STRENGTH_PRESETS.filter((p) => p.glyph === sec.glyph);
        if (!list.length) return null;
        return (
          <div key={sec.glyph}>
            <div className="eyebrow" style={{ marginTop: 18, marginBottom: 8 }}>{sec.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {list.map((p) => <PresetTile key={p.id} name={p.name} meta={p.meta} glyphKey={p.glyph} hue={strengthHue(p)} onLoad={() => onLoad(p)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WorkoutsTab({ onAskCoach }: { onAskCoach?: () => void }) {
  const [discipline, setDiscipline] = useState<Discipline>("cardio");
  const [surface, setSurface] = useState<Surface>({ k: "home" });
  const [presetFilter, setPresetFilter] = useState<"all" | PresetSport>("all");
  const [strengthPresetFilter, setStrengthPresetFilter] = useState<"all" | "strength" | "mobility">("all");

  const [cardio, setCardio] = useState<CardioRoutine[] | null>(null);
  const [strength, setStrength] = useState<WkRoutineSummary[] | null>(null);
  const [reload, setReload] = useState(0);

  const [openTray, setOpenTray] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<WkBundle | null>(null);

  const lpTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    cardioList().then((r) => { if (alive) setCardio(r.routines || []); }).catch(() => { if (alive) setCardio([]); });
    wkRoutines().then((r) => { if (alive) setStrength(r.routines || []); }).catch(() => { if (alive) setStrength([]); });
    wkActive().then((b) => { if (alive) setActive(b && b.session ? b : null); }).catch(() => { if (alive) setActive(null); });
    return () => { alive = false; };
  }, [reload]);

  const backHome = () => { setSurface({ k: "home" }); setOpenTray(null); setConfirmDel(null); setReload((n) => n + 1); };
  const switchDiscipline = (d: Discipline) => { setDiscipline(d); setOpenTray(null); setConfirmDel(null); };

  const startLP = (id: string) => { lpTimer.current = window.setTimeout(() => setOpenTray((t) => (t === id ? t : id)), 450); };
  const cancelLP = () => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null; } };

  async function deleteCardio(id: string) {
    setBusyId(id);
    try { await cardioDelete(id); setCardio((l) => (l || []).filter((x) => x.id !== id)); setNote("Routine deleted."); }
    catch { setNote("Couldn't delete — try again."); }
    finally { setBusyId(null); setConfirmDel(null); setOpenTray(null); }
  }
  async function deleteStrength(id: string) {
    setBusyId(id);
    try { await wkDeleteRoutine(id); setStrength((l) => (l || []).filter((x) => x.id !== id)); setNote("Routine deleted."); }
    catch { setNote("Couldn't delete — try again."); }
    finally { setBusyId(null); setConfirmDel(null); setOpenTray(null); }
  }
  async function scheduleCardio(id: string, name: string) {
    setBusyId(id);
    try {
      const r = await cardioPrescribe({ routine_id: id });
      setNote(r.ok ? `${name} — ready on your watch${r.date ? ` (${r.date})` : ""}.` : "Couldn't schedule.");
    } catch { setNote("Couldn't schedule — try again."); }
    finally { setBusyId(null); setOpenTray(null); }
  }
  async function startLive(id: string) {
    setBusyId(id);
    try {
      const r = await cardioGet(id);
      if (r.routine && (r.routine.structure?.blocks?.length ?? 0) > 0) {
        setOpenTray(null);
        if ((r.routine.sport || "").toLowerCase().includes("swim")) setSurface({ k: "cardioSwim", routine: r.routine });
        else setSurface({ k: "cardioLive", routine: r.routine });
      }
      else setNote("This session has no steps to run yet.");
    } catch { setNote("Couldn't start — try again."); }
    finally { setBusyId(null); }
  }

  // ---------- sub-surfaces (delegate to existing builders/loggers) ----------
  if (surface.k === "cardio") {
    return <CardioBuilder onExit={backHome} intent={surface.intent} startMode={surface.start} editRoutineId={surface.editRoutineId} presetStructure={surface.preset?.structure} presetName={surface.preset?.name} presetSport={surface.preset?.sport} />;
  }
  if (surface.k === "cardioLive") {
    return <CardioLive routine={surface.routine} onExit={backHome} />;
  }
  if (surface.k === "cardioFree") {
    return <CardioFree onExit={backHome} />;
  }
  if (surface.k === "cardioSwim") {
    return <CardioSwim routine={surface.routine} onExit={backHome} />;
  }
  if (surface.k === "cardioPick") {
    return (
      <div style={{ padding: "18px 16px 28px", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={backHome} className="trn-sub" style={{ marginBottom: 14 }}>‹ Back</button>
        <span className="eyebrow">Start cardio now</span>
        <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 16px" }}>Run or ride freely, or start a saved session with live coaching.</div>
        <button onClick={() => setSurface({ k: "cardioFree" })}
          style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", background: "var(--ember)", border: "none", borderRadius: "var(--r-md)", padding: "16px", cursor: "pointer", marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 999, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8V4z" /></svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#fff" }}>Free run / ride</span>
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.82)", marginTop: 1 }}>No plan · GPS · auto 1 km laps</span>
          </span>
        </button>
        <button onClick={() => setSurface({ k: "cardioSwim", routine: null })}
          style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "16px", cursor: "pointer", marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" strokeWidth="2" strokeLinecap="round"><path d="M2 16c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" /><path d="M2 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" /><circle cx="16" cy="6" r="1.6" /></svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Pool swim</span>
            <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Tap per length · rest timers</span>
          </span>
        </button>
        <span className="eyebrow">Saved sessions</span>
        {cardio && cardio.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {cardio.map((r) => (
              <button key={r.id} disabled={busyId === r.id} onClick={() => startLive(r.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "14px 16px", cursor: busyId === r.id ? "default" : "pointer" }}>
                <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--ember)"><path d="M7 4l13 8-13 8V4z" /></svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{cardioMeta(r)}</span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: busyId === r.id ? "var(--muted)" : "var(--ember)" }}>{busyId === r.id ? "…" : "START"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginTop: 8 }}>No saved sessions yet — build one to run it with coaching.</div>
        )}
      </div>
    );
  }
  if (surface.k === "presets") {
    return <PresetLibrary onExit={backHome} onLoad={(p) => setSurface({ k: "cardio", intent: "routine", start: "build", preset: p })} />;
  }
  if (surface.k === "strengthLogger") {
    return (
      <div>
        <button className="trn-sub" onClick={backHome} style={{ marginBottom: 10 }}>‹ Workouts</button>
        <WorkoutLogger autoStart={surface.autoStart} resume={surface.resume} onExit={backHome} onOpenCardio={(intent, start) => setSurface({ k: "cardio", intent, start })} />
      </div>
    );
  }
  if (surface.k === "strengthBuild") {
    return (
      <div>
        <button className="trn-sub" onClick={backHome} style={{ marginBottom: 10 }}>‹ Workouts</button>
        <RoutineBuilder routineId={surface.routineId} onExit={backHome} preset={surface.preset ? { name: surface.preset.name, focus: surface.preset.focus, items: surface.preset.items } : undefined} />
      </div>
    );
  }
  if (surface.k === "strengthPresets") {
    return <StrengthPresetLibrary onExit={backHome} onLoad={(p) => setSurface({ k: "strengthLogger", autoStart: { title: p.name, items: p.items } })} />;
  }

  // ---------- home ----------
  const isCardio = discipline === "cardio";

  const editAction = (id: string) => {
    if (isCardio) setSurface({ k: "cardio", intent: "routine", start: "build", editRoutineId: id });
    else setSurface({ k: "strengthBuild", routineId: id });
  };

  const tray = (id: string, name: string) => {
    if (confirmDel === id) {
      return (
        <div style={{ marginTop: 9, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: "var(--text-2)" }}>Delete this routine?</span>
          <button onClick={() => setConfirmDel(null)} className="trn-sub">Cancel</button>
          <button disabled={busyId === id} onClick={() => (isCardio ? deleteCardio(id) : deleteStrength(id))}
            className="trn-sub" style={{ color: "var(--on-ember)", background: "var(--danger)", borderColor: "transparent" }}>
            {busyId === id ? "…" : "Delete"}
          </button>
        </div>
      );
    }
    const cell = (label: string, danger: boolean, disabled: boolean, onClick: (() => void) | null, glyph: JSX.Element, hint?: string) => {
      const col = disabled ? "var(--faint)" : danger ? "var(--danger)" : "var(--text-2)";
      return (
        <button disabled={disabled || !onClick} onClick={onClick || undefined}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: disabled || !onClick ? "default" : "pointer", padding: 0 }}>
          <span style={{ width: 27, height: 27, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}>{glyph}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: col, lineHeight: 1 }}>{label}</span>
          {hint ? <span style={{ fontSize: 6.5, fontWeight: 800, letterSpacing: "0.06em", color: "var(--faint)" }}>{hint}</span> : null}
        </button>
      );
    };
    return (
      <div style={{ marginTop: 9, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
        {cell("Edit", false, false, () => editAction(id),
          <svg {...trayIco("var(--text-2)")}><path d="M17 3l4 4L8 20H4v-4L17 3z" /></svg>)}
        {cell("Schedule", false, !isCardio, isCardio ? () => scheduleCardio(id, name) : null,
          <svg {...trayIco(isCardio ? "var(--text-2)" : "var(--faint)")}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
          isCardio ? undefined : "SOON")}
        {isCardio ? cell("Start", false, busyId === id, () => startLive(id),
          <svg {...trayIco("var(--ember)")}><path d="M7 4l13 8-13 8V4z" /></svg>, "LIVE") : null}
        {cell("Push to device", false, true, null,
          <svg {...trayIco("var(--faint)")}><rect x="7" y="6.5" width="10" height="11" rx="3" /><path d="M9.5 6.5L10 3h4l.5 3.5M9.5 17.5L10 21h4l.5-3.5" /></svg>, "SOON")}
        {cell("Delete", true, false, () => setConfirmDel(id),
          <svg {...trayIco("var(--danger)")}><path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 13h9l1-13" /></svg>)}
      </div>
    );
  };

  const RoutineTile = ({ id, tag, tagHue, title, meta, glyph, glyphHue }:
    { id: string; tag: string; tagHue: string; title: string; meta: string; glyph: GlyphKind; glyphHue: string }) => {
    const open = openTray === id;
    return (
      <div style={{ position: "relative", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 14, display: "flex", flexDirection: "column", minHeight: open ? undefined : 112 }}
        onPointerDown={() => startLP(id)} onPointerUp={cancelLP} onPointerLeave={cancelLP} onContextMenu={(e) => { e.preventDefault(); setOpenTray(id); }}>
        <Glyph kind={glyph} hue={glyphHue} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: tagHue, background: "var(--surface-2)", borderRadius: 999, padding: "3px 8px" }}>{tag}</span>
          <button aria-label="Actions" onClick={() => { setConfirmDel(null); setOpenTray(open ? null : id); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, margin: -4, color: "var(--faint)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 16 }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{meta}</div>
        </div>
        {open ? tray(id, title) : null}
      </div>
    );
  };

  // entry pair (honest copy; destinations wired minimally — full intent routing is Phase 2)
  const doNow = isCardio
    ? { title: "Start cardio now", sub: "Pick a saved session to run", go: () => setSurface({ k: "cardioPick" }) }
    : { title: "Start strength now", sub: "Log your sets as you go", go: () => setSurface({ k: "strengthLogger", autoStart: { title: "Quick workout" } }) };
  const build = isCardio
    ? { title: "Build a session", sub: "Author · save · schedule", go: () => setSurface({ k: "cardio", intent: "routine", start: "build" }) }
    : { title: "Build a routine", sub: "Author · save · reuse", go: () => setSurface({ k: "strengthBuild", routineId: null }) };

  const cardioGroups = SPORTS
    .map((s) => ({ s, list: (cardio || []).filter((r) => sportOf(r.sport) === s.key) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="trainv2">
      {/* toggle spine */}
      <div style={{ margin: "14px 0 2px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 5, display: "flex", gap: 5 }}>
        {(["strength", "cardio"] as Discipline[]).map((d) => {
          const on = discipline === d;
          const c = on ? "var(--on-inverse)" : "var(--muted)";
          return (
            <button key={d} onClick={() => switchDiscipline(d)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 0", fontSize: 14, fontWeight: on ? 800 : 600, cursor: "pointer", color: c, background: on ? "var(--inverse-surface)" : "transparent", border: "none", borderRadius: "var(--r-sm)" }}>
              {d === "strength" ? <Dumbbell c={c} /> : <Wave c={c} />}
              {d === "strength" ? "Strength" : "Cardio"}
            </button>
          );
        })}
      </div>

      {note ? (
        <div onClick={() => setNote(null)} style={{ marginTop: 10, background: "var(--ember-tint)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "9px 12px", fontSize: 12, fontWeight: 600, color: "var(--text-2)", cursor: "pointer" }}>{note}</div>
      ) : null}

      {!isCardio && active && active.session ? (
        <button className="trn-continue" type="button" onClick={() => setSurface({ k: "strengthLogger", autoStart: null, resume: true })} style={{ marginTop: 12 }}>
          <span className="play"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5l11 7-11 7z" /></svg></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t">Resume: {active.session.title || "Workout"}</div>
            <div className="s">{(active.sets || []).filter((x) => x.completed).length} sets in · {elapsedLabel(active.session.started_at)}</div>
          </div>
        </button>
      ) : null}

      {/* zone 1 — Do now / Build */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={doNow.go} style={{ flex: 1.35, textAlign: "left", background: "var(--ember)", color: "var(--on-ember)", border: "none", borderRadius: "var(--r-md)", padding: 16, cursor: "pointer", boxShadow: "var(--shadow-fab)", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><PlayIcon /></span>
          <span style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 15.5, fontWeight: 800 }}>{doNow.title}</span>
            <span style={{ display: "block", fontSize: 11.5, opacity: 0.88, marginTop: 3, lineHeight: 1.4 }}>{doNow.sub}</span>
          </span>
        </button>
        <button onClick={build.go} style={{ flex: 1, textAlign: "left", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--ember-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><PencilIcon /></span>
          <span style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 15.5, fontWeight: 800 }}>{build.title}</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{build.sub}</span>
          </span>
        </button>
      </div>

      {/* zone 2 — Your routines */}
      <span className="eyebrow">Your routines</span>
      {isCardio ? (
        cardio === null ? (
          <div className="muted center pad">Loading…</div>
        ) : cardio.length === 0 ? (
          <EmptyRoutines label="cardio" />
        ) : (
          <div>
            {cardioGroups.map((g) => (
              <div key={g.s.key} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--faint)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: g.s.hue }} />{g.s.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {g.list.map((r) => (
                    <RoutineTile key={r.id} id={r.id} tag="CARDIO" tagHue="var(--gold)" title={r.name} meta={cardioMeta(r)} glyph={g.s.glyph} glyphHue={g.s.hue} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : strength === null ? (
        <div className="muted center pad">Loading…</div>
      ) : strength.length === 0 ? (
        <EmptyRoutines label="strength" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {strength.map((r) => {
            const kind = strengthKind(r);
            const hue = kind === "mobility" ? "var(--success)" : "var(--ember-strong)";
            return (
              <RoutineTile key={r.id} id={r.id} tag={kind === "mobility" ? "MOBILITY" : "STRENGTH"} tagHue={hue} title={r.name} meta={strengthMeta(r)} glyph={kind} glyphHue={hue} />
            );
          })}
        </div>
      )}

      {/* zone 3 — Presets */}
      <span className="eyebrow">Presets</span>
      {isCardio ? (
        cardio && cardio.length > 0 ? (
          <button onClick={() => setSurface({ k: "presets" })}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "13px 16px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 34, height: 34, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>Browse presets</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Intervals · tempo · long · threshold · brick</span>
            </span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ) : (
          <>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {(["all", "swim", "bike", "run", "brick"] as const).map((f) => {
                const on = presetFilter === f;
                const dot = f === "swim" ? "#5e93a6" : f === "bike" ? "#97934b" : f === "run" ? "#c98a2d" : f === "brick" ? "var(--muted)" : null;
                return (
                  <button key={f} onClick={() => setPresetFilter(f)}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: on ? 800 : 600, cursor: "pointer", borderRadius: 999, padding: "7px 14px", border: on ? "none" : "1px solid var(--line)", background: on ? "var(--inverse-surface)" : "var(--surface-2)", color: on ? "var(--on-inverse)" : "var(--text-2)" }}>
                    {dot ? <span style={{ width: 7, height: 7, borderRadius: 2.5, background: dot }} /> : null}
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {CARDIO_PRESETS.filter((p) => presetFilter === "all" || p.sport === presetFilter).map((p) => (
                <PresetTile key={p.id} name={p.name} meta={p.meta} glyphKey={p.glyph} hue={PRESET_HUE[p.sport]} onLoad={() => setSurface({ k: "cardio", intent: "routine", start: "build", preset: p })} />
              ))}
            </div>
          </>
        )
      ) : strength && strength.length > 0 ? (
        <button onClick={() => setSurface({ k: "strengthPresets" })}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "13px 16px", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 34, height: 34, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>Browse presets</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Push · pull · legs · upper/lower · mobility</span>
          </span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            {(["all", "strength", "mobility"] as const).map((f) => {
              const on = strengthPresetFilter === f;
              const dot = f === "strength" ? "var(--ember-strong)" : f === "mobility" ? "var(--success)" : null;
              return (
                <button key={f} onClick={() => setStrengthPresetFilter(f)}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: on ? 800 : 600, cursor: "pointer", borderRadius: 999, padding: "7px 14px", border: on ? "none" : "1px solid var(--line)", background: on ? "var(--inverse-surface)" : "var(--surface-2)", color: on ? "var(--on-inverse)" : "var(--text-2)" }}>
                  {dot ? <span style={{ width: 7, height: 7, borderRadius: 2.5, background: dot }} /> : null}
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {STRENGTH_PRESETS.filter((p) => strengthPresetFilter === "all" || p.glyph === strengthPresetFilter).map((p) => (
              <PresetTile key={p.id} name={p.name} meta={p.meta} glyphKey={p.glyph} hue={strengthHue(p)} onLoad={() => setSurface({ k: "strengthLogger", autoStart: { title: p.name, items: p.items } })} />
            ))}
          </div>
        </>
      )}

      {!isCardio ? (
        <div style={{ marginTop: 4 }}>
          <TodaySuggestion onStartPlan={(planId) => setSurface({ k: "strengthLogger", autoStart: { plan_id: planId } })} />
          <FuelToday />
        </div>
      ) : null}

      <div style={{ margin: "16px 4px 4px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
        Want a full plan? <button onClick={() => onAskCoach?.()} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: "var(--ember-strong)", cursor: "pointer" }}>Ask your coach →</button>
      </div>
    </div>
  );
}

function EmptyRoutines({ label }: { label: string }) {
  return (
    <div style={{ border: "1.5px dashed var(--line-2)", borderRadius: "var(--r-md)", padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-2)" }}>No saved {label} routines yet</div>
      <div style={{ marginTop: 5, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Build one above and it lands here — ready to edit, schedule, or delete.</div>
    </div>
  );
}
