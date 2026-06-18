"use client";

import { useState, useEffect } from "react";
import { useApi, actionGet } from "../lib/api";
import { Screen } from "../components/Screen";

type Seg = { stage: string; mins: number };
type Latest = {
  date: string; total: number; deep: number; light: number; rem: number; awake: number;
  score: number; bed: string; wake: string; hrv: number; debt: number; need: number;
  hypnogram: Seg[];
};
type Pt = { date: string; v: number | null; label?: string };
type StagePt = { date: string; deep: number; light: number; rem: number; total: number };
type Insight = { title: string; tone: string; detail: string };
type Nap = { date: string; start: string; mins: number; note: string };
type Sleep = {
  latest: Latest;
  averages: {
    total_h: number; score: number; deep_pct: number; rem_pct: number; debt: number;
    hrv: number; bedtime: string; waketime: string; bedtime_var_min: number;
  };
  series: { hours: Pt[]; bedtime: Pt[]; stages: StagePt[] };
  insights: Insight[];
  naps: { per_week: number; avg_mins: number; recent: Nap[]; coach: string[] };
};

const STAGE_COLOR: Record<string, string> = {
  deep: "#1e40af", light: "#3b82f6", rem: "#8b5cf6", awake: "#f59e0b", unmeasurable: "#475569",
};
const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  const ap = h < 12 || h === 24 ? "a" : "p";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ap}`;
};
const hrsLabel = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;
const dayLetter = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })[0];
const hoursColor = (v: number) => (v < 6 ? "#f87171" : v < 7 ? "#fbbf24" : "#34d399");

export default function SleepPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useApi<Sleep>(`sleep&days=${days}`);
  const [targetHr, setTargetHr] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    actionGet<{ target_hour?: number }>("bedtime_goal")
      .then((d) => { if (alive && d?.target_hour != null) setTargetHr(Number(d.target_hour)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const last14 = <T,>(a: T[]) => a.slice(-14);
  // bedtime hours are stored on a 21→30 scale (9pm → 6am); map to 0–100% of the strip.
  const bedLeft = (v: number) => Math.min(100, Math.max(0, ((v - 21) / 9) * 100));
  const hrClock = (v: number) => {
    let h = Math.floor(v) % 24; const m = Math.round((v - Math.floor(v)) * 60);
    const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")}${ap}`;
  };

  return (
    <Screen title="Sleep" error={error} loading={!data && !error}>
      {data && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div className="seg seg-sm">
              {[7, 30, 90].map((d) => (
                <button key={d} className={d === days ? "seg-opt active" : "seg-opt"} onClick={() => setDays(d)}>{d}d</button>
              ))}
            </div>
          </div>

          {/* Last night hero */}
          <section className="card sleep-hero">
            <div className="sleep-score" style={{ ["--c" as string]: data.latest.score >= 75 ? "#34d399" : data.latest.score >= 50 ? "#fbbf24" : "#f87171" }}>
              <span className="ring-num">{data.latest.score}</span>
              <span className="tiny subtle">score</span>
            </div>
            <div className="sleep-hero-main">
              <div className="sleep-total">{hrsLabel(data.latest.total)}</div>
              <div className="subtle tiny">{hm(data.latest.bed)} → {hm(data.latest.wake)}</div>
              <div className="stage-chips">
                <span className="chip"><i style={{ background: STAGE_COLOR.deep }} />Deep {data.latest.deep}m</span>
                <span className="chip"><i style={{ background: STAGE_COLOR.rem }} />REM {data.latest.rem}m</span>
                <span className="chip"><i style={{ background: STAGE_COLOR.light }} />Light {data.latest.light}m</span>
                <span className="chip"><i style={{ background: STAGE_COLOR.awake }} />Awake {data.latest.awake}m</span>
              </div>
            </div>
          </section>

          {/* Hypnogram */}
          <h2 className="section-title">Last night&apos;s stages</h2>
          <section className="card">
            <div className="hypnogram">
              {data.latest.hypnogram.map((s, i) => (
                <div key={i} className="hyp-seg" style={{ flexGrow: s.mins, background: STAGE_COLOR[s.stage] || "#475569" }} title={`${s.stage} ${s.mins}m`} />
              ))}
            </div>
            <div className="hyp-axis subtle tiny"><span>{hm(data.latest.bed)}</span><span>{hm(data.latest.wake)}</span></div>
          </section>

          {/* Averages */}
          <h2 className="section-title">{days}-day averages</h2>
          <section className="stats-row">
            <div className="card stat"><div className="stat-num">{data.averages.total_h}<span className="stat-of">h</span></div><div className="stat-label">avg sleep</div></div>
            <div className="card stat"><div className="stat-num">{data.averages.score}</div><div className="stat-label">avg score</div></div>
            <div className="card stat"><div className="stat-num">{data.averages.deep_pct}<span className="stat-of">%</span></div><div className="stat-label">deep</div></div>
            <div className="card stat"><div className="stat-num">{data.averages.rem_pct}<span className="stat-of">%</span></div><div className="stat-label">rem</div></div>
            <div className="card stat"><div className="stat-num">{data.averages.debt}<span className="stat-of">m</span></div><div className="stat-label">debt</div></div>
          </section>

          {/* Bedtime consistency — biggest lever */}
          <h2 className="section-title">Bedtime consistency</h2>
          <section className="card">
            <div className="lever-top">
              <span>Typical lights-out <strong>{data.averages.bedtime}</strong></span>
              <span className="pill warn">±{data.averages.bedtime_var_min} min</span>
            </div>
            <div className="bedstrip">
              {["9p", "11p", "1a", "3a", "5a"].map((t) => <span key={t} className="bedtick subtle tiny">{t}</span>)}
              {targetHr != null && (
                <div title={`target ${hrClock(targetHr)}`}
                  style={{ position: "absolute", left: `${bedLeft(targetHr)}%`, top: 2, bottom: 16, width: 2, marginLeft: -1, background: "#34d399", opacity: 0.65, borderRadius: 2, zIndex: 1 }} />
              )}
              {(() => {
                const bd = last14(data.series.bedtime);
                let lastIdx = -1;
                for (let i = bd.length - 1; i >= 0; i--) { if (bd[i].v != null) { lastIdx = i; break; } }
                return bd.map((p, i) =>
                  p.v == null ? null : (
                    <div key={i} className="beddot" title={`${p.label}${i === lastIdx ? " · last night" : ""}`}
                      style={i === lastIdx
                        ? { left: `${bedLeft(p.v)}%`, background: "#22d3ee", width: 11, height: 11, boxShadow: "0 0 0 3px rgba(34,211,238,0.25)", zIndex: 2 }
                        : { left: `${bedLeft(p.v)}%` }} />
                  )
                );
              })()}
            </div>
            <div className="subtle tiny mt8">
              {targetHr != null
                ? <><span style={{ color: "#34d399" }}>▮</span> target {hrClock(targetHr)} · <span style={{ color: "#22d3ee" }}>●</span> last night. Tightening into a 30-min window is your highest-leverage fix.</>
                : <>Tightening this into a 30-min window is your highest-leverage sleep fix.</>}
            </div>
          </section>

          {/* Hours per night */}
          <h2 className="section-title">Hours per night · 14d</h2>
          <section className="card">
            <div className="barchart">
              {last14(data.series.hours).map((p, i) => (
                <div key={i} className="barcol">
                  <div className="bar" style={{ height: `${Math.min(100, ((p.v ?? 0) / 9) * 100)}%`, background: hoursColor(p.v ?? 0) }} />
                  <span className="barlbl subtle tiny">{dayLetter(p.date)}</span>
                </div>
              ))}
            </div>
            <div className="ref7 subtle tiny">— 7h target</div>
          </section>

          {/* Stage composition */}
          <h2 className="section-title">Stage mix · 14d</h2>
          <section className="card">
            <div className="barchart">
              {last14(data.series.stages).map((s, i) => {
                const max = 540;
                return (
                  <div key={i} className="barcol">
                    <div className="stackbar">
                      <div style={{ height: `${(s.deep / max) * 100}%`, background: STAGE_COLOR.deep }} />
                      <div style={{ height: `${(s.rem / max) * 100}%`, background: STAGE_COLOR.rem }} />
                      <div style={{ height: `${(s.light / max) * 100}%`, background: STAGE_COLOR.light }} />
                    </div>
                    <span className="barlbl subtle tiny">{dayLetter(s.date)}</span>
                  </div>
                );
              })}
            </div>
            <div className="legend tiny subtle">
              <span><i style={{ background: STAGE_COLOR.deep }} />deep</span>
              <span><i style={{ background: STAGE_COLOR.rem }} />rem</span>
              <span><i style={{ background: STAGE_COLOR.light }} />light</span>
            </div>
          </section>

          {/* Insights */}
          <h2 className="section-title">What stands out</h2>
          <section className="list">
            {data.insights.map((ins, i) => (
              <div key={i} className={`card insight tone-${ins.tone}`}>
                <div className="insight-title">{ins.title}</div>
                <div className="subtle">{ins.detail}</div>
              </div>
            ))}
          </section>

          {/* Naps */}
          <h2 className="section-title">Naps</h2>
          <section className="card">
            <div className="lever-top">
              <span><strong>{data.naps.per_week}</strong>/week · avg <strong>{data.naps.avg_mins}m</strong></span>
            </div>
            {data.naps.coach.map((c, i) => (
              <div key={i} className="subtle tiny mt8">• {c}</div>
            ))}
          </section>
        </>
      )}
    </Screen>
  );
}
