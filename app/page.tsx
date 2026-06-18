"use client";

import { useState, useEffect } from "react";
import { useApi, actionGet, fetchApi } from "./lib/api";
import { Screen } from "./components/Screen";

type Goal = { id: string; label: string; when_text?: string; target_date: string | null; days_away: number | null };

function racePhase(days: number): { label: string; color: string } {
  if (days <= 7) return { label: "Race week — taper & rest", color: "#f472b6" };
  if (days <= 21) return { label: "Peak — sharpen, cut volume", color: "#fbbf24" };
  if (days <= 56) return { label: "Build — push key sessions", color: "#34d399" };
  return { label: "Base — consistency & volume", color: "#60a5fa" };
}

function RaceCountdown() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  useEffect(() => {
    let alive = true;
    actionGet<{ goals: Goal[] }>("goals_list").then((d) => { if (alive) setGoals(d.goals); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!goals) return null;
  const next = goals
    .filter((g) => g.target_date && (g.days_away ?? -1) >= 0)
    .sort((a, b) => (a.days_away ?? 0) - (b.days_away ?? 0))[0];
  if (!next || next.days_away == null) return null;
  const days = next.days_away;
  const weeks = Math.floor(days / 7);
  const phase = racePhase(days);
  return (
    <section className="card" style={{ borderLeft: `3px solid ${phase.color}` }}>
      <div className="lever-top">
        <span className="subtle tiny">NEXT RACE</span>
        <span className="subtle tiny">{next.target_date}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>{days}</span>
        <span className="subtle">days · {next.label}</span>
      </div>
      <div className="tiny" style={{ marginTop: 6, color: phase.color }}>
        {phase.label}{weeks >= 2 ? ` · ~${weeks} wks out` : ""}
      </div>
    </section>
  );
}

type Factor = {
  emoji: string;
  label: string;
  value: string;
  detail?: string;
  impact?: "positive" | "negative" | "neutral" | string;
  note?: string;
};

type Today = {
  date: string; score: number; label: string; verdict: string;
  training: string; nutrition: string; factors: Factor[];
  vo2max?: number; sleep_nudge?: string; last_synced?: string;
};

type Pt = { date: string; v: number | null };
type SleepPt = { date: string; total: number | null };
type Trends = { sleep: SleepPt[]; hrv: Pt[]; steps: Pt[]; acwr: Pt[] };

function scoreColor(s: number): string { return s >= 75 ? "#34d399" : s >= 50 ? "#fbbf24" : "#f87171"; }
function impactColor(i?: string): string { return i === "positive" ? "#34d399" : i === "negative" ? "#f87171" : "#94a3b8"; }

// Map a factor to a recent numeric series (oldest→newest) for the sparkline.
function seriesFor(label: string, t: Trends | null): { data: number[]; unit: string } | null {
  if (!t) return null;
  const clean = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
  const take = (a: number[], unit: string) => (a.length >= 4 ? { data: a.slice(-14), unit } : null);
  const l = label.toLowerCase();
  if (l.startsWith("sleep") && !l.includes("debt")) return take(clean(t.sleep.map((s) => (s.total != null ? Math.round((s.total / 60) * 10) / 10 : null))), "h");
  if (l.includes("hrv")) return take(clean(t.hrv.map((p) => p.v)), "ms");
  if (l.includes("steps")) return take(clean(t.steps.map((p) => p.v)), "");
  if (l.includes("training load")) return take(clean(t.acwr.map((p) => p.v)), "");
  return null;
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 240, h = 42, pad = 5;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1, n = data.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(n - 1).toFixed(1)} ${h - pad} L${x(0).toFixed(1)} ${h - pad} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.12" stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(data[n - 1])} r="2.8" fill={color} />
    </svg>
  );
}

export default function TodayPage() {
  const { data, error } = useApi<Today>("today");
  const [trends, setTrends] = useState<Trends | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchApi<Trends>("trends&days=14").then((t) => { if (alive) setTrends(t); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <Screen title="Today" error={error} loading={!data && !error}>
      {data && (
        <>
          <section className="card readiness">
            <div className="ring" style={{ ["--c" as string]: scoreColor(data.score), ["--p" as string]: data.score / 100 }}>
              <span className="ring-num">{data.score}</span>
            </div>
            <div className="readiness-text">
              <div className="readiness-label">{data.label}</div>
              <div className="subtle">{data.verdict}</div>
            </div>
          </section>

          <RaceCountdown />

          <h2 className="section-title">Your plan today</h2>
          <section className="row2">
            <div className="card mini">
              <div className="mini-head">🏃 Training</div>
              <div className="mini-body">{data.training}</div>
            </div>
            <div className="card mini">
              <div className="mini-head">🥗 Nutrition</div>
              <div className="mini-body">{data.nutrition}</div>
            </div>
          </section>

          {data.sleep_nudge && <section className="card nudge">💤 {data.sleep_nudge}</section>}

          <h2 className="section-title">Today&apos;s factors <span className="subtle tiny">· tap for detail</span></h2>
          <section className="factor-list">
            {data.factors?.map((f, i) => {
              const isOpen = open === i;
              const col = impactColor(f.impact);
              const ser = isOpen ? seriesFor(f.label, trends) : null;
              return (
                <div className={isOpen ? "card factor-row open" : "card factor-row"} key={i}>
                  <button className="factor-head" onClick={() => setOpen(isOpen ? null : i)}>
                    <span className="factor-emoji">{f.emoji}</span>
                    <span className="factor-label">{f.label}</span>
                    <span className="factor-spacer" />
                    <span className="dot-impact" style={{ background: col }} />
                    <span className="factor-value" style={{ color: col }}>{f.value}</span>
                    <span className={isOpen ? "chev open" : "chev"}>⌄</span>
                  </button>
                  {isOpen && (
                    <div className="factor-detail">
                      {f.detail && <div className="subtle tiny">{f.detail}</div>}
                      {f.note && <div className="factor-note">{f.note}</div>}
                      {ser && <Spark data={ser.data} color={col} />}
                      {ser && (
                        <div className="spark-cap subtle tiny">
                          Last {ser.data.length} days · {ser.data[0]}{ser.unit} → {ser.data[ser.data.length - 1]}{ser.unit}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}
    </Screen>
  );
}
