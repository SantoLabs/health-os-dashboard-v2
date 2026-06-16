"use client";

import { useEffect, useState } from "react";
import { SB_URL, SB_ANON, DEMO_EMAIL, DEMO_PASSWORD } from "./config";

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
  data_through?: string;
};

async function fetchToday(): Promise<Today> {
  // 1) mint a session (demo account, read-only) — same approach as the current dashboard
  const tokenRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!tokenRes.ok) throw new Error(`Auth failed (${tokenRes.status})`);
  const { access_token } = await tokenRes.json();

  // 2) call the existing read API with the session token
  const res = await fetch(`${SB_URL}/functions/v1/health-dashboard?api=today`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`Data fetch failed (${res.status})`);
  return res.json();
}

function scoreColor(score: number): string {
  if (score >= 75) return "#34d399"; // green
  if (score >= 50) return "#fbbf24"; // amber
  return "#f87171"; // red
}

function impactColor(impact?: string): string {
  if (impact === "positive") return "#34d399";
  if (impact === "negative") return "#f87171";
  return "#94a3b8";
}

export default function TodayPage() {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchToday()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">Health OS</div>
          {data && <div className="subtle">{data.date}</div>}
        </div>
        <div className="badge">v2 · preview</div>
      </header>

      {!data && !error && <div className="muted center pad">Loading your day…</div>}
      {error && (
        <div className="card error">
          <strong>Couldn&apos;t load data</strong>
          <div className="subtle">{error}</div>
        </div>
      )}

      {data && (
        <main>
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

          {data.sleep_nudge && (
            <section className="card nudge">💤 {data.sleep_nudge}</section>
          )}

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
        </main>
      )}

      <nav className="bottomnav">
        {[
          { icon: "☀️", label: "Today", active: true },
          { icon: "📈", label: "Trends" },
          { icon: "😴", label: "Sleep" },
          { icon: "🏋️", label: "Train" },
          { icon: "≡", label: "More" },
        ].map((t) => (
          <button key={t.label} className={t.active ? "nav active" : "nav"}>
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
