"use client";

import { useApi } from "./lib/api";
import { Screen } from "./components/Screen";

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
    <Screen title="Health OS" sub={data?.date} error={error} loading={!data && !error}>
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
