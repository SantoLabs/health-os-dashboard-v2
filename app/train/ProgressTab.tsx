"use client";

import { useEffect, useState } from "react";
import { useTrain, planHistory, type TrnPrs, type TrnProgress, type TrnGoal, type TrnRecord } from "../lib/api";
import { Spark, SubPills, kg, dShort } from "./ui";

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

type OvType = {
  strength: { weekly: { week_start: string; sessions: number; volume_kg: number; total_sets: number; duration_mins: number }[] };
  cardio: { weekly: Record<string, { week_start: string; distance_km: number; duration_mins: number; sessions: number }[]> };
};
type PlanHist = { windows: { week: { planned: number; completed: number; pct: number | null; planned_min: number; completed_min: number } }; current_streak: number };

function mondayISO(): string { const n = new Date(Date.now() + 5.5 * 3600000); const d = (n.getUTCDay() + 6) % 7; n.setUTCDate(n.getUTCDate() - d); return n.toISOString().slice(0, 10); }
function addDaysISO(s: string, n: number): string { const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }

function WeeklyRecap({ ov }: { ov: OvType }) {
  const [hist, setHist] = useState<PlanHist | null>(null);
  useEffect(() => { let a = true; planHistory<PlanHist>().then((h) => { if (a) setHist(h); }).catch(() => {}); return () => { a = false; }; }, []);

  const sWeekly = ov.strength?.weekly || [];
  const cur = sWeekly.length ? sWeekly[sWeekly.length - 1] : null;
  const prev = sWeekly.length > 1 ? sWeekly[sWeekly.length - 2] : null;
  const curWk = cur?.week_start || mondayISO();
  const volDelta = cur && prev ? cur.volume_kg - prev.volume_kg : null;

  let cDist = 0, cMin = 0, cSess = 0;
  const cw = ov.cardio?.weekly || {};
  for (const sp of Object.keys(cw)) { for (const r of cw[sp]) { if (r.week_start === curWk) { cDist += r.distance_km || 0; cMin += r.duration_mins || 0; cSess += r.sessions || 0; } } }

  const wkAdh = hist?.windows?.week || null;
  const streak = hist?.current_streak ?? 0;
  const end = addDaysISO(curWk, 6);

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>This week</div>
          <div className="subtle tiny">{dShort(curWk)} – {dShort(end)}</div>
        </div>
        {wkAdh && wkAdh.planned > 0 ? (
          <div className="subtle tiny" style={{ marginTop: 4 }}>{wkAdh.completed}/{wkAdh.planned} planned sessions done{wkAdh.pct != null ? ` · ${wkAdh.pct}%` : ""}</div>
        ) : (
          <div className="subtle tiny" style={{ marginTop: 4 }}>No committed plan this week — log freely, or send sessions from Coach.</div>
        )}
      </div>

      <div className="trn-statgrid">
        <div className="trn-cell hl"><div className="v tnum">{cur ? Math.round(cur.volume_kg).toLocaleString() : "—"}</div><div className="l">strength kg{volDelta != null && Math.round(volDelta) !== 0 ? ` (${volDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(volDelta)).toLocaleString()})` : ""}</div></div>
        <div className="trn-cell"><div className="v tnum">{cur ? cur.sessions : 0}</div><div className="l">lift sessions</div></div>
        <div className="trn-cell"><div className="v tnum">{cDist > 0 ? cDist.toFixed(1) : "—"}</div><div className="l">cardio km</div></div>
        <div className="trn-cell good"><div className="v tnum">🔥 {streak}</div><div className="l">wk streak</div></div>
      </div>

      <div className="card">
        <div className="trn-eyebrow">Week at a glance</div>
        <div className="subtle tiny" style={{ lineHeight: 1.6 }}>{cur ? `${cur.sessions} lift session${cur.sessions === 1 ? "" : "s"} · ${cur.total_sets} sets · ${Math.round(cur.volume_kg).toLocaleString()} kg moved${cur.duration_mins ? ` · ${Math.round(cur.duration_mins)} min` : ""}.` : "No strength logged yet this week."} {cDist > 0 ? `${cSess} cardio session${cSess === 1 ? "" : "s"} · ${cDist.toFixed(1)} km · ${Math.round(cMin)} min.` : "No cardio logged yet this week."}</div>
      </div>
    </div>
  );
}

export default function ProgressTab() {
  const [sub, setSub] = useState<"Recap" | "Goals" | "History" | "Body">("Recap");
  const { data: prs, error: e1 } = useTrain<TrnPrs>("prs");
  const { data: prog, error: e2 } = useTrain<TrnProgress>("progress");
  const { data: ov, error: e3 } = useTrain<OvType>(sub === "Recap" ? "overview" : null);
  const error = e1 || e2 || e3;

  return (
    <div>
      <SubPills items={["Recap", "Goals", "History", "Body"] as const} value={sub} onChange={setSub} />
      {error ? (
        <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>
      ) : sub === "Recap" ? (
        ov ? <WeeklyRecap ov={ov} /> : <div className="muted center pad">Loading…</div>
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
