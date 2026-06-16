"use client";

import { useState } from "react";
import { useApi } from "../lib/api";
import { Screen } from "../components/Screen";

type Ex = { title: string; muscle: string; sets: number; vol: number };
type StrengthSession = { date: string; title: string; sets: number; mins: number; exercises: Ex[] };
type CardioSession = { date: string; sport: string; km: number; mins: number };
type Muscle = { muscle: string; sessions: number; sets: number; volume_kg: number; days_since: number };

type Training = {
  insights: string[];
  muscle_balance: Muscle[];
  strength: {
    sessions_30d: number;
    sessions_7d: number;
    target_per_week: number;
    week_start: string;
    sets_30d: number;
    recent: StrengthSession[];
  };
  cardio: {
    sessions_30d: number;
    sport_counts: Record<string, number>;
    sport_km: Record<string, number>;
    distance_30d_km: number;
    recent: CardioSession[];
  };
};

const dateLabel = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

const sportIcon = (s: string) => {
  const k = s.toLowerCase();
  if (k.includes("swim")) return "🏊";
  if (k.includes("run")) return "🏃";
  if (k.includes("ride") || k.includes("cycl") || k.includes("bike")) return "🚴";
  if (k.includes("walk")) return "🚶";
  return "💪";
};

function daysBadge(d: number) {
  const cls = d <= 3 ? "ok" : d <= 7 ? "warn" : "bad";
  return <span className={`pill ${cls}`}>{d}d ago</span>;
}

export default function TrainPage() {
  const { data, error } = useApi<Training>("training");
  const [open, setOpen] = useState<number | null>(null);

  const maxSets = data ? Math.max(...data.muscle_balance.map((m) => m.sets), 1) : 1;

  return (
    <Screen title="Training" error={error} loading={!data && !error}>
      {data && (
        <>
          {data.insights?.length > 0 && (
            <section className="card insights">
              {data.insights.map((t, i) => (
                <div key={i} className="insight-line">
                  <span className="dot">›</span>
                  <span>{t}</span>
                </div>
              ))}
            </section>
          )}

          <h2 className="section-title">Strength</h2>
          <section className="stats-row">
            <div className="card stat">
              <div className="stat-num">
                {data.strength.sessions_7d}
                <span className="stat-of">/{data.strength.target_per_week}</span>
              </div>
              <div className="stat-label">this week</div>
            </div>
            <div className="card stat">
              <div className="stat-num">{data.strength.sessions_30d}</div>
              <div className="stat-label">sessions · 30d</div>
            </div>
            <div className="card stat">
              <div className="stat-num">{data.strength.sets_30d}</div>
              <div className="stat-label">sets · 30d</div>
            </div>
          </section>

          <section className="list">
            {data.strength.recent.map((s, i) => {
              const isOpen = open === i;
              return (
                <div className="card session" key={i}>
                  <button className="session-head" onClick={() => setOpen(isOpen ? null : i)}>
                    <div>
                      <div className="session-title">{s.title}</div>
                      <div className="subtle tiny">{dateLabel(s.date)}</div>
                    </div>
                    <div className="session-meta">
                      <span>{s.sets} sets</span>
                      <span className="subtle">·</span>
                      <span>{Math.round(s.mins)} min</span>
                      <span className={isOpen ? "chev open" : "chev"}>⌄</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="exlist">
                      {s.exercises.map((e, j) => (
                        <div className="exrow" key={j}>
                          <span className="ex-title">{e.title}</span>
                          <span className="subtle tiny">
                            {e.sets}×{e.vol > 0 ? ` ${e.vol.toLocaleString()}kg` : " bw"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <h2 className="section-title">Cardio</h2>
          <section className="stats-row">
            <div className="card stat">
              <div className="stat-num">{data.cardio.distance_30d_km}</div>
              <div className="stat-label">km · 30d</div>
            </div>
            {Object.keys(data.cardio.sport_counts).map((sp) => (
              <div className="card stat" key={sp}>
                <div className="stat-num">{data.cardio.sport_counts[sp]}</div>
                <div className="stat-label">
                  {sportIcon(sp)} {sp.toLowerCase()} · {data.cardio.sport_km[sp]}km
                </div>
              </div>
            ))}
          </section>

          <section className="list">
            {data.cardio.recent.map((c, i) => (
              <div className="card cardio-row" key={i}>
                <span className="cardio-ic">{sportIcon(c.sport)}</span>
                <div className="cardio-main">
                  <div className="session-title">{c.sport}</div>
                  <div className="subtle tiny">{dateLabel(c.date)}</div>
                </div>
                <div className="session-meta">
                  <span>{c.km} km</span>
                  <span className="subtle">·</span>
                  <span>{Math.round(c.mins)} min</span>
                </div>
              </div>
            ))}
          </section>

          <h2 className="section-title">Muscle balance · 30 days</h2>
          <section className="card muscles">
            {data.muscle_balance.map((m) => (
              <div className="muscle-row" key={m.muscle}>
                <div className="muscle-top">
                  <span className="muscle-name">{m.muscle.replace("_", " ")}</span>
                  <span className="muscle-right">
                    <span className="subtle tiny">{m.sets} sets</span>
                    {daysBadge(m.days_since)}
                  </span>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(m.sets / maxSets) * 100}%` }} />
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </Screen>
  );
}
