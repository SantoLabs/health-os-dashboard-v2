"use client";

import { useState, useEffect } from "react";
import { useApi, actionGet } from "./lib/api";
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
  date: string;
  score: number;
  label: string;
  verdict: string;
  training: string;
  nutrition: string;
  factors: Factor[];
  vo2max?: number;
  sleep_nudge?: string;
  last_synced?: string;
};

function scoreColor(score: number): string {
  if (score >= 75) return "#34d399";
  if (score >= 50) return "#fbbf24";
  return "#f87171";
}

function impactColor(impact?: string): string {
  if (impact === "positive") return "#34d399";
  if (impact === "negative") return "#f87171";
  return "#94a3b8";
}

export default function TodayPage() {
  const { data, error } = useApi<Today>("today");

  return (
    <Screen title="Today" error={error} loading={!data && !error}>
      {data && (
        <>
          <section className="card readiness">
            <div
              className="ring"
              style={{
                ["--c" as string]: scoreColor(data.score),
                ["--p" as string]: data.score / 100,
              }}
            >
              <span className="ring-num">{data.score}</span>
            </div>
            <div className="readiness-text">
              <div className="readiness-label">{data.label}</div>
              <div className="subtle">{data.verdict}</div>
            </div>
          </section>

          <RaceCountdown />

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

          <h2 className="section-title">Today&apos;s factors</h2>
          <section className="factors">
            {data.factors?.map((f, i) => (
              <div className="card factor" key={i}>
                <div className="factor-top">
                  <span className="factor-emoji">{f.emoji}</span>
                  <span className="factor-label">{f.label}</span>
                </div>
                <div className="factor-value" style={{ color: impactColor(f.impact) }}>
                  {f.value}
                </div>
                {f.detail && <div className="subtle tiny">{f.detail}</div>}
                {f.note && <div className="factor-note">{f.note}</div>}
              </div>
            ))}
          </section>

          {data.last_synced && (
            <div className="synced subtle tiny">
              Last synced {new Date(data.last_synced).toLocaleString()}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
