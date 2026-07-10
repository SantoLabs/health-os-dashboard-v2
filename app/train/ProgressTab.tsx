"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrain, planRange, strengthSessions, cardioActivities, type TrnPrs, type TrnProgress, type TrnGoal, type TrnRecord, type StrengthSession, type CardioActivityLite } from "../lib/api";
import { Spark, SubPills, kg, dShort } from "./ui";
import KaiDailyCard from "../components/KaiDailyCard";
import ExerciseDetail from "./ExerciseDetail";
import { CardioActivityDetail } from "./CardioTab";

const goalIcon = (label: string): string => {
  const k = label.toLowerCase();
  if (k.includes("tri")) return "🏊";
  if (k.includes("cycl")) return "🚴";
  if (k.includes("fat") || k.includes("loss")) return "🔥";
  if (k.includes("body") || k.includes("composition")) return "⚖️";
  if (k.includes("build")) return "🏗️";
  if (k.includes("race") || k.includes("hm") || k.includes("marathon") || k.includes("run") || k.includes("tmm")) return "🏃";
  return "🎯";
};
const achIcon = (c: string): string => (c === "running" ? "🏃" : c === "swim" ? "🏊" : "🏆");
const statusChip = (s: string) =>
  s === "in_progress"
    ? <span className="trn-gstatus ip">In progress</span>
    : <span className="trn-gstatus ns">Upcoming</span>;

function Goals({ p, prs }: { p: TrnProgress; prs: TrnPrs | null }) {
  const race = p.next_race;
  const hm = prs?.projections?.find((x) => x.distance === "HM");
  return (
    <div>
      {race && (
        <div className="trn-race">
          <div className="top"><span>🏁 Next race</span><span>{dShort(race.target_date)}</span></div>
          <div className="nm">{race.label}</div>
          <div className="meta">{statusChip(race.status)}</div>
          <div className="days tnum">{race.days_to_go}<small>days to go</small></div>
          {hm && <div className="subtle tiny" style={{ marginTop: 10 }}>Neutral projection · ~{hm.projected_time} @ {hm.projected_pace_min_km.toFixed(2)}/km (Riegel; goal-verdict lands with the race hub)</div>}
        </div>
      )}
      <div className="eyebrow">All goals · {p.goals.length}</div>
      {p.goals.map((g: TrnGoal, i) => (
        <div className="trn-goal" key={i}>
          <span className="ic">{goalIcon(g.label)}</span>
          <div className="main">
            <div className="tt">{g.label}</div>
            <div className="dt">{dShort(g.target_date)} · {g.days_to_go} days</div>
          </div>
          {statusChip(g.status)}
        </div>
      ))}
    </div>
  );
}

function History({ prs }: { prs: TrnPrs }) {
  const [tab, setTab] = useState<"PRs & milestones" | "Adherence">("PRs & milestones");
  const strengthPRs = (prs.records.strength || []).filter((r) => r.metric === "peak_e1rm");
  const allPRs: TrnRecord[] = [...strengthPRs, ...(prs.records.running || []), ...(prs.records.swim || [])];
  const prs2026 = allPRs.filter((r) => r.achieved_on?.startsWith("2026")).length;
  const timeline = [...allPRs].sort((a, b) => (b.achieved_on || "").localeCompare(a.achieved_on || "")).slice(0, 12);

  return (
    <div>
      <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="trn-cell hl"><div className="v tnum">{prs2026}</div><div className="l">PRs · 2026</div></div>
        <div className="trn-cell"><div className="v tnum">{prs.stats.total_workouts}</div><div className="l">workouts</div></div>
        <div className="trn-cell good"><div className="v tnum">🔥 {prs.stats.week_streak}</div><div className="l">wk streak</div></div>
      </div>

      <SubPills items={["PRs & milestones", "Adherence"] as const} value={tab} onChange={setTab} />

      {tab === "PRs & milestones" ? (
        <div>
          <div className="eyebrow" style={{ marginTop: 0 }}>Recent achievements</div>
          {timeline.map((r, i) => (
            <div className="trn-ach" key={i}>
              <div className="rail"><span className="dot" />{i < timeline.length - 1 && <span className="line" />}</div>
              <div className="body">
                <span style={{ fontSize: 17 }}>{achIcon(r.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tt">{r.scope_label} · {r.category === "strength" ? `${kg(r.value)} ${r.unit}` : `${r.value} ${r.unit}`}</div>
                  <div className="dd">{dShort(r.achieved_on)}</div>
                </div>
                <span className="trn-prbadge">PR</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Plan adherence</div>
            <span className="trn-soon">Phase 2</span>
          </div>
          <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
            Adherence measures completed sessions against a committed weekly plan. It activates once the planner ships and starts committing plans — the layout below is a preview.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">80%</div><div className="l">on plan · 30d</div></div>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">4.2</div><div className="l">sessions · wk</div></div>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">96%</div><div className="l">volume hit</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Body({ p }: { p: TrnProgress }) {
  const b = p.body_latest;
  const trend = p.body_trend || [];
  const weight = trend.map((x) => x.weight_kg);
  const bf = trend.map((x) => x.body_fat_pct);
  return (
    <div>
      <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="trn-cell"><div className="v tnum">{b?.weight_kg != null ? b.weight_kg.toFixed(1) : "—"}</div><div className="l">weight kg</div></div>
        <div className="trn-cell hl"><div className="v tnum">{b?.body_fat_pct != null ? `${b.body_fat_pct.toFixed(1)}%` : "—"}</div><div className="l">body fat</div></div>
        <div className="trn-cell good"><div className="v tnum">{b?.lean_mass_kg != null ? b.lean_mass_kg.toFixed(1) : "—"}</div><div className="l">lean kg</div></div>
      </div>
      <div className="card">
        <div className="trn-eyebrow">Weight · kg</div>
        <Spark values={weight} color="#6d8bff" height={100} />
      </div>
      <div className="card">
        <div className="trn-eyebrow">Body fat · %</div>
        <Spark values={bf} color="#ffb547" height={100} />
      </div>
      {b?.date && <div className="subtle tiny center">Last measured {dShort(b.date)}</div>}
    </div>
  );
}

/* ═══════════════ Summary (Chunk 7 · §6) ═══════════════
   Week/Month toggle over one dynamic grid + dynamic-by-sport blocks + cached AI card.
   Actuals (strength sessions ∪ cardio activities) render solid & tappable; planned
   future sessions render pale (same hue); empty days = ⭐ rest. Strength counted only
   from strengthSessions and cardio sports normalised so Garmin strength_training never
   double-counts. Week-grid duplication across Coach/Schedule/Progress is accepted per plan. */
type Sport = "run" | "cycle" | "swim" | "walk" | "strength";
const SPORT: Record<Sport, { label: string; emoji: string; color: string }> = {
  run: { label: "Run", emoji: "🏃", color: "#34d399" },
  cycle: { label: "Cycle", emoji: "🚴", color: "#a78bfa" },
  swim: { label: "Swim", emoji: "🏊", color: "#38bdf8" },
  walk: { label: "Walk", emoji: "🚶", color: "#2dd4bf" },
  strength: { label: "Strength", emoji: "🏋️", color: "#fbbf24" },
};
function normCardio(s: string): Sport | null {
  const k = (s || "").toLowerCase();
  if (k.startsWith("run")) return "run";
  if (k.startsWith("cycl") || k.startsWith("bik") || k.startsWith("rid")) return "cycle";
  if (k.startsWith("swim")) return "swim";
  if (k.startsWith("walk") || k.startsWith("hik")) return "walk";
  return null; // strength_training / other → excluded from cardio (dedupe vs native)
}
function normPlan(t: string, rest: boolean): Sport | null {
  if (rest) return null;
  const k = (t || "").toLowerCase().replace(/[^a-z]/g, "");
  if (k.startsWith("run")) return "run";
  if (k.startsWith("swim")) return "swim";
  if (k.startsWith("strength") || k === "gym" || k === "lift" || k === "hiit") return "strength";
  if (k.startsWith("cycl") || k === "bike" || k === "ride") return "cycle";
  if (k.startsWith("walk")) return "walk";
  return null;
}
function hexA(h: string, a: number): string { const x = h.replace("#", ""); const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }

function istTodayISO(): string { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
function isoAdd(s: string, n: number): string { const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }
function isoAddMonths(s: string, n: number): string { const [y, m] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); }
function mondayOf(s: string): string { const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); }
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dnum(s: string): number { return Number(s.slice(8, 10)); }
function moni(s: string): number { return Number(s.slice(5, 7)) - 1; }

type PlanSession = { session_date: string; session_type: string; completed: boolean; skipped?: boolean; is_rest_day: boolean };
type Cell = { key: string; sport: Sport; stat: string; planned: boolean; cardioId?: string; strength?: StrengthSession };

function buildCells(from: string, to: string, str: StrengthSession[], car: CardioActivityLite[], plan: PlanSession[], today: string): Map<string, Cell[]> {
  const map = new Map<string, Cell[]>();
  const push = (d: string, c: Cell) => { if (d < from || d > to) return; const a = map.get(d) || []; a.push(c); map.set(d, a); };
  for (const s of str) push(s.date, { key: "s" + s.id, sport: "strength", stat: s.volume ? `${Math.round(s.volume).toLocaleString("en-US")} kg` : `${s.sets} sets`, planned: false, strength: s });
  for (const a of car) {
    const sp = normCardio(a.sport); if (!sp) continue;
    const stat = a.distance_km != null && a.distance_km > 0 ? `${a.distance_km.toFixed(1)} km` : a.duration_mins != null ? `${Math.round(a.duration_mins)} min` : SPORT[sp].label;
    push(a.date, { key: "c" + a.activity_id, sport: sp, stat, planned: false, cardioId: a.activity_id });
  }
  for (const p of plan) {
    const d = p.session_date; if (!d || d <= today || p.completed || p.skipped) continue;
    const sp = normPlan(p.session_type, p.is_rest_day); if (!sp) continue;
    if ((map.get(d) || []).some((c) => c.sport === sp)) continue; // don't shadow an actual of same sport
    push(d, { key: "p" + d + sp, sport: sp, stat: "planned", planned: true });
  }
  return map;
}

function Chip({ c, onOpen }: { c: Cell; onOpen: (c: Cell) => void }) {
  const s = SPORT[c.sport];
  const tappable = !c.planned && !!(c.cardioId || c.strength);
  return (
    <button onClick={() => tappable && onOpen(c)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 10, background: c.planned ? hexA(s.color, 0.05) : hexA(s.color, 0.16), border: `1px ${c.planned ? "dashed" : "solid"} ${hexA(s.color, c.planned ? 0.3 : 0.5)}`, color: c.planned ? hexA(s.color, 0.8) : "#eef", cursor: tappable ? "pointer" : "default", font: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left" }}>
      <span style={{ fontSize: 13 }}>{s.emoji}</span>
      <span>{s.label}</span>
      <span className="tnum" style={{ opacity: 0.85, fontWeight: 500 }}>{c.stat}</span>
    </button>
  );
}

function WeekGrid({ start, cells, today, onOpen }: { start: string; cells: Map<string, Cell[]>; today: string; onOpen: (c: Cell) => void }) {
  return (
    <div className="card" style={{ padding: "4px 4px" }}>
      {Array.from({ length: 7 }, (_, i) => isoAdd(start, i)).map((d, i) => {
        const cs = cells.get(d) || [];
        const isToday = d === today;
        return (
          <div key={d} style={{ display: "flex", gap: 10, padding: "8px", alignItems: "flex-start", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ width: 40, flex: "none", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "#a274ff" : "#8a90a6" }}>{DOW[i]}</div>
              <div className="tnum" style={{ fontSize: 15, fontWeight: 700, color: isToday ? "#fff" : "#c9cede" }}>{dnum(d)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
              {cs.length === 0 ? <span style={{ fontSize: 13, color: "#6b7080" }}>⭐ Rest</span> : cs.map((c) => <Chip key={c.key} c={c} onOpen={onOpen} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ start, cells, today, onDay }: { start: string; cells: Map<string, Cell[]>; today: string; onDay: (d: string) => void }) {
  const gridStart = mondayOf(start);
  const mon = start.slice(0, 7);
  return (
    <div className="card" style={{ padding: "8px 6px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#6b7080" }}>{d[0]}</div>)}
      </div>
      {Array.from({ length: 6 }, (_, w) => w).map((w) => (
        <div key={w} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {Array.from({ length: 7 }, (_, i) => isoAdd(gridStart, w * 7 + i)).map((d) => {
            const inMonth = d.slice(0, 7) === mon;
            const cs = cells.get(d) || [];
            const isToday = d === today;
            return (
              <button key={d} onClick={() => cs.length && onDay(d)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0 0", borderRadius: 8, border: isToday ? "1px solid #a274ff" : "1px solid transparent", background: inMonth ? "rgba(255,255,255,0.02)" : "transparent", cursor: cs.length ? "pointer" : "default", opacity: inMonth ? 1 : 0.3, font: "inherit" }}>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: isToday ? "#fff" : "#9aa0b0" }}>{dnum(d)}</span>
                <span style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                  {cs.slice(0, 4).map((c) => <span key={c.key} style={{ width: 5, height: 5, borderRadius: 999, background: SPORT[c.sport].color, opacity: c.planned ? 0.45 : 1 }} />)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SportBlocks({ from, to, str, car }: { from: string; to: string; str: StrengthSession[]; car: CardioActivityLite[] }) {
  const blocks = useMemo(() => {
    const acc: Partial<Record<Sport, { sport: Sport; sessions: number; vol: number; km: number }>> = {};
    const bump = (sp: Sport) => (acc[sp] ??= { sport: sp, sessions: 0, vol: 0, km: 0 });
    for (const s of str) if (s.date >= from && s.date <= to) { const b = bump("strength"); b.sessions++; b.vol += s.volume || 0; }
    for (const a of car) { if (a.date < from || a.date > to) continue; const sp = normCardio(a.sport); if (!sp) continue; const b = bump(sp); b.sessions++; b.km += a.distance_km || 0; }
    return (["strength", "run", "cycle", "swim", "walk"] as Sport[]).map((o) => acc[o]).filter((b): b is { sport: Sport; sessions: number; vol: number; km: number } => !!b);
  }, [from, to, str, car]);
  if (!blocks.length) return <div className="subtle tiny center" style={{ padding: "16px 0" }}>No sessions logged in this window yet.</div>;
  return (
    <div>
      <div className="eyebrow">By sport</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {blocks.map((b) => {
          const s = SPORT[b.sport];
          const val = b.sport === "strength" ? `${Math.round(b.vol).toLocaleString("en-US")} kg` : `${b.km.toFixed(1)} km`;
          return (
            <div key={b.sport} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 0 }}>
              <span style={{ fontSize: 22, width: 30, textAlign: "center" }}>{s.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</div>
                <div className="subtle tiny">{b.sessions} session{b.sessions === 1 ? "" : "s"}</div>
              </div>
              <div className="tnum" style={{ fontWeight: 700, fontSize: 15, color: s.color }}>{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrengthSessionDetail({ s, onBack }: { s: StrengthSession; onBack: () => void }) {
  const [ex, setEx] = useState<string | null>(null);
  if (ex) return <ExerciseDetail title={ex} onBack={() => setEx(null)} />;
  const dt = new Date(s.date + "T00:00:00");
  return (
    <div>
      <div className="trn-back">
        <button onClick={onBack} aria-label="Back">‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{s.name}</h3>
          <div className="sub">{dt.getDate()} {MON[dt.getMonth()]} {dt.getFullYear()} · {s.sets} sets{s.volume ? ` · ${Math.round(s.volume).toLocaleString("en-US")} kg` : ""}</div>
        </div>
      </div>
      <div className="eyebrow" style={{ marginTop: 0 }}>Exercises · tap for history</div>
      {s.exercises.map((e, i) => (
        <button key={e.title + i} onClick={() => setEx(e.title)} className="card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", marginBottom: 6, border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
            <div className="subtle tiny" style={{ textTransform: "capitalize" }}>{e.muscle_group.replace(/_/g, " ")}</div>
          </div>
          <div className="subtle tiny tnum">{e.sets} sets{e.volume ? ` · ${Math.round(e.volume).toLocaleString("en-US")} kg` : ""}</div>
          <span style={{ color: "#6b7080", fontSize: 16 }}>›</span>
        </button>
      ))}
    </div>
  );
}

type Open = { kind: "strength"; s: StrengthSession } | { kind: "cardio"; id: string; sport: string } | null;
const CARDIO_API: Record<Sport, string> = { run: "running", cycle: "cycling", swim: "swimming", walk: "walking", strength: "strength" };

function Summary() {
  const [mode, setMode] = useState<"Week" | "Month">("Week");
  const [off, setOff] = useState(0); // 0 = current window; + = older, − = future
  const [str, setStr] = useState<StrengthSession[] | null>(null);
  const [car, setCar] = useState<CardioActivityLite[] | null>(null);
  const [plan, setPlan] = useState<PlanSession[]>([]);
  const [open, setOpen] = useState<Open>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const today = istTodayISO();

  useEffect(() => {
    let a = true;
    strengthSessions().then((d) => a && setStr(d)).catch(() => a && setStr([]));
    cardioActivities().then((d) => a && setCar(d)).catch(() => a && setCar([]));
    return () => { a = false; };
  }, []);

  const { from, to } = useMemo(() => {
    if (mode === "Week") { const st = isoAdd(mondayOf(today), -off * 7); return { from: st, to: isoAdd(st, 6) }; }
    const st = isoAddMonths(today.slice(0, 8) + "01", -off); return { from: st, to: isoAdd(isoAddMonths(st, 1), -1) };
  }, [mode, off, today]);

  useEffect(() => {
    let a = true;
    planRange<{ sessions: PlanSession[] }>(from, to).then((r) => a && setPlan(r.sessions || [])).catch(() => a && setPlan([]));
    return () => { a = false; };
  }, [from, to]);

  if (open?.kind === "cardio") return <CardioActivityDetail id={open.id} sport={open.sport} onBack={() => setOpen(null)} />;
  if (open?.kind === "strength") return <StrengthSessionDetail s={open.s} onBack={() => setOpen(null)} />;

  const loading = str == null || car == null;
  const cells = loading ? new Map<string, Cell[]>() : buildCells(from, to, str ?? [], car ?? [], plan, today);
  const onOpen = (c: Cell) => { if (c.cardioId) setOpen({ kind: "cardio", id: c.cardioId, sport: CARDIO_API[c.sport] }); else if (c.strength) setOpen({ kind: "strength", s: c.strength }); };
  const label = mode === "Week" ? `${dnum(from)} ${MON[moni(from)]} – ${dnum(to)} ${MON[moni(to)]}` : `${MON[moni(from)]} ${from.slice(0, 4)}`;

  return (
    <div>
      <KaiDailyCard scope="training" />

      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 10px" }}>
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
          {(["Week", "Month"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setOff(0); }} style={{ padding: "6px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === m ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: mode === m ? "#fff" : "#8a90a6" }}>{m}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", marginBottom: 8 }}>
        <button aria-label="Older" onClick={() => setOff((o) => Math.min(o + 1, 104))} style={{ background: "none", border: "none", color: "#c9b6ff", fontSize: 18, cursor: "pointer", padding: "0 12px", lineHeight: 1 }}>◀</button>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        <button aria-label="Newer" disabled={off <= -4} onClick={() => setOff((o) => Math.max(o - 1, -4))} style={{ background: "none", border: "none", color: off <= -4 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 18, cursor: off <= -4 ? "default" : "pointer", padding: "0 12px", lineHeight: 1 }}>▶</button>
      </div>

      {loading ? <div className="muted center pad">Loading…</div> : (
        <>
          {mode === "Week"
            ? <WeekGrid start={from} cells={cells} today={today} onOpen={onOpen} />
            : <MonthGrid start={from} cells={cells} today={today} onDay={setDaySheet} />}
          <div style={{ height: 10 }} />
          <SportBlocks from={from} to={to} str={str ?? []} car={car ?? []} />
        </>
      )}

      {daySheet && (
        <div onClick={() => setDaySheet(null)} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 480, margin: 0, borderRadius: "18px 18px 0 0", padding: 16, maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{DOW[(new Date(daySheet + "T00:00:00").getDay() + 6) % 7]} {dnum(daySheet)} {MON[moni(daySheet)]}</div>
              <button onClick={() => setDaySheet(null)} aria-label="Close" style={{ background: "none", border: "none", color: "#8a90a6", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(cells.get(daySheet) || []).length === 0
                ? <div className="subtle tiny">⭐ Rest day</div>
                : (cells.get(daySheet) || []).map((c) => <Chip key={c.key} c={c} onOpen={(cc) => { setDaySheet(null); onOpen(cc); }} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProgressTab() {
  const [sub, setSub] = useState<"Summary" | "Goals" | "History" | "Body">("Summary");
  const { data: prs, error: e1 } = useTrain<TrnPrs>("prs");
  const { data: prog, error: e2 } = useTrain<TrnProgress>("progress");
  const error = e1 || e2;

  return (
    <div>
      <SubPills items={["Summary", "Goals", "History", "Body"] as const} value={sub} onChange={setSub} />
      {error ? (
        <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>
      ) : sub === "Summary" ? (
        <Summary />
      ) : sub === "Goals" ? (
        prog ? <Goals p={prog} prs={prs} /> : <div className="muted center pad">Loading…</div>
      ) : sub === "History" ? (
        prs ? <History prs={prs} /> : <div className="muted center pad">Loading…</div>
      ) : (
        prog ? <Body p={prog} /> : <div className="muted center pad">Loading…</div>
      )}
    </div>
  );
}
