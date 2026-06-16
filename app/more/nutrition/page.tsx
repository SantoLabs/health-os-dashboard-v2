"use client";

import { useApi } from "../../lib/api";
import { Screen } from "../../components/Screen";

type DayTarget = { calories: number; protein: number; carbs: number; fats: number; fiber: number; water: number; steps: number };
type Training = { nutrition_targets: { workout_day: DayTarget; rest_day: DayTarget } };

function TargetCard({ title, t }: { title: string; t: DayTarget }) {
  const rows: [string, string][] = [
    ["Calories", `${t.calories} kcal`],
    ["Protein", `${t.protein} g`],
    ["Carbs", `${t.carbs} g`],
    ["Fats", `${t.fats} g`],
    ["Fiber", `${t.fiber} g`],
    ["Water", `${t.water} L`],
    ["Steps", t.steps.toLocaleString()],
  ];
  return (
    <section className="card">
      <div className="lever-top"><span><strong>{title}</strong></span></div>
      <div style={{ marginTop: 8 }}>
        {rows.map(([k, v]) => (
          <div key={k} className="exrow" style={{ padding: "6px 0" }}>
            <span className="subtle">{k}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function NutritionPage() {
  const { data, error } = useApi<Training>("training");
  const nt = data?.nutrition_targets;
  return (
    <Screen title="Nutrition" back="/more" error={error} loading={!data && !error}>
      {nt && (
        <>
          <div className="subtle tiny" style={{ marginBottom: 12 }}>
            Daily targets, tuned to your body-recomp goal. Higher carbs on training days, leaner on rest days.
          </div>
          <h2 className="section-title">Workout day</h2>
          <TargetCard title="🏋️ Training day" t={nt.workout_day} />
          <h2 className="section-title">Rest day</h2>
          <TargetCard title="🛌 Rest day" t={nt.rest_day} />
        </>
      )}
    </Screen>
  );
}
