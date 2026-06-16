"use client";

import { useApi } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Goals = {
  body_comp: {
    bia_bf: number; dexa_bf: number; goal_bf: number; goal_by: string;
    latest_weight: number; weight_as_of: string;
    weight_history: { kg: number; date: string; source: string }[];
  };
  milestones: { date: string; when: string; label: string; days_away: number }[];
};

export default function GoalsPage() {
  const { data, error } = useApi<Goals>("goals");
  const bc = data?.body_comp;
  const progress = bc ? Math.max(0, Math.min(100, ((bc.dexa_bf - bc.bia_bf) / (bc.dexa_bf - bc.goal_bf)) * 100)) : 0;
  const wStart = bc?.weight_history?.find((w) => w.source === "withings")?.kg;
  const wDelta = bc && wStart ? bc.latest_weight - wStart : undefined;

  const upcoming = (data?.milestones ?? []).filter((m) => m.days_away >= 0).slice(0, 6);
  const shown = upcoming.length ? upcoming : (data?.milestones ?? []).slice(-4);

  return (
    <Screen title="Goals & Body" back="/more" error={error} loading={!data && !error}>
      {bc && (
        <>
          <h2 className="section-title">Body composition</h2>
          <section className="card">
            <div className="lever-top">
              <span>Body fat <strong>{bc.bia_bf}%</strong> <span className="subtle tiny">BIA · DEXA {bc.dexa_bf}%</span></span>
              <span className="subtle tiny">goal {bc.goal_bf}% by {bc.goal_by}</span>
            </div>
            <div className="track" style={{ marginTop: 12 }}>
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="subtle tiny mt8">{Math.round(progress)}% of the way from {bc.dexa_bf}% → {bc.goal_bf}%</div>
            <div className="lever-top" style={{ marginTop: 14 }}>
              <span>Weight <strong>{bc.latest_weight}kg</strong></span>
              {wDelta != null && <span className={`pill ${wDelta <= 0 ? "ok" : "warn"}`}>{wDelta > 0 ? "+" : ""}{wDelta.toFixed(1)}kg</span>}
            </div>
          </section>
        </>
      )}

      {shown.length > 0 && (
        <>
          <h2 className="section-title">Milestones</h2>
          <section className="list">
            {shown.map((m, i) => (
              <div key={i} className="card cardio-row">
                <span className="cardio-ic">🏁</span>
                <div className="cardio-main">
                  <div className="session-title">{m.label}</div>
                  <div className="subtle tiny">{m.when}</div>
                </div>
                <span className={`pill ${m.days_away < 0 ? "ok" : m.days_away <= 30 ? "warn" : ""}`}>
                  {m.days_away < 0 ? `${-m.days_away}d ago` : m.days_away === 0 ? "today" : `in ${m.days_away}d`}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </Screen>
  );
}
