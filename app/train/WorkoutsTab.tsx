"use client";

import { useEffect, useRef, useState } from "react";
import CardioBuilder from "./CardioBuilder";
import WorkoutLogger from "./WorkoutLogger";
import { cardioList, cardioDelete, cardioPrescribe, wkRoutines, wkDeleteRoutine } from "../lib/api";
import type { CardioRoutine, WkRoutineSummary } from "../lib/api";

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
  | { k: "cardio"; intent: "workout" | "routine"; start: "describe" | "build" }
  | { k: "strength" };

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

export default function WorkoutsTab() {
  const [discipline, setDiscipline] = useState<Discipline>("cardio");
  const [surface, setSurface] = useState<Surface>({ k: "home" });

  const [cardio, setCardio] = useState<CardioRoutine[] | null>(null);
  const [strength, setStrength] = useState<WkRoutineSummary[] | null>(null);
  const [reload, setReload] = useState(0);

  const [openTray, setOpenTray] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const lpTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    cardioList().then((r) => { if (alive) setCardio(r.routines || []); }).catch(() => { if (alive) setCardio([]); });
    wkRoutines().then((r) => { if (alive) setStrength(r.routines || []); }).catch(() => { if (alive) setStrength([]); });
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

  // ---------- sub-surfaces (delegate to existing builders/loggers) ----------
  if (surface.k === "cardio") {
    return <CardioBuilder onExit={backHome} intent={surface.intent} startMode={surface.start} />;
  }
  if (surface.k === "strength") {
    return (
      <div>
        <button className="trn-sub" onClick={backHome} style={{ marginBottom: 10 }}>‹ Workouts</button>
        <WorkoutLogger onOpenCardio={(intent, start) => setSurface({ k: "cardio", intent, start })} />
      </div>
    );
  }

  // ---------- home ----------
  const isCardio = discipline === "cardio";

  const editAction = (id: string) => {
    if (isCardio) setSurface({ k: "cardio", intent: "routine", start: "build" });
    else setSurface({ k: "strength" });
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
    ? { title: "Start cardio now", sub: "Pick a session — record on your watch", go: () => setSurface({ k: "cardio", intent: "workout", start: "build" }) }
    : { title: "Start strength now", sub: "Log your sets as you go", go: () => setSurface({ k: "strength" }) };
  const build = isCardio
    ? { title: "Build a session", sub: "Author · save · schedule", go: () => setSurface({ k: "cardio", intent: "routine", start: "build" }) }
    : { title: "Build a routine", sub: "Author · save · reuse", go: () => setSurface({ k: "strength" }) };

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

      {/* zone 3 — Presets (placeholder until Phase 3) */}
      <span className="eyebrow">Presets</span>
      <div style={{ border: "1.5px dashed var(--line-2)", borderRadius: "var(--r-md)", padding: 18, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>Curated presets are coming soon</div>
        <div style={{ marginTop: 5, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          For now, {isCardio ? "build a session above" : "build a routine above"} — anything you save lands in Your routines.
        </div>
      </div>

      <div style={{ margin: "16px 4px 4px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
        Want a full plan? <span style={{ fontWeight: 700, color: "var(--ember-strong)" }}>Ask your coach</span> in the Coach tab.
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
