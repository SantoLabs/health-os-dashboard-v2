"use client";
import { useEffect, useState } from "react";
import { insights, type TrnInsight, type TrnInsightsResp } from "../lib/api";

const CONF: Record<string, { label: string; bg: string; fg: string }> = {
  strong: { label: "Strong signal", bg: "color-mix(in srgb, var(--success) 15%, transparent)", fg: "var(--success)" },
  moderate: { label: "Moderate signal", bg: "color-mix(in srgb, var(--ember) 15%, transparent)", fg: "var(--ember)" },
  weak: { label: "Weak signal", bg: "color-mix(in srgb, var(--gold) 15%, transparent)", fg: "var(--gold)" },
  insufficient: { label: "Not enough data", bg: "var(--surface-2)", fg: "var(--muted)" },
};

function Bars({ ins }: { ins: TrnInsight }) {
  const vals = ins.buckets.map((b) => b.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = Math.max(max - min, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0 4px" }}>
      {ins.buckets.map((b) => {
        const w = ((b.value - min) / span) * 100;
        return (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 92, flexShrink: 0, textAlign: "right", fontSize: 12, fontWeight: b.best ? 700 : 500, color: b.best ? "var(--ember)" : "var(--muted)" }}>{b.label}</div>
            <div style={{ flex: 1, height: 16, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(w, 3)}%`, height: "100%", borderRadius: 6, background: b.best ? "var(--t-grad)" : "var(--muted)" }} />
            </div>
            <div style={{ width: 66, flexShrink: 0, textAlign: "right", fontSize: 11.5, color: b.value >= 0 ? "var(--text-2)" : "var(--muted)" }}>{b.disp ?? `${b.value > 0 ? "+" : ""}${b.value} ${ins.unit}`}</div>
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "right", marginTop: 2 }}>{ins.scale_caption}</div>
    </div>
  );
}

function InsightCard({ ins }: { ins: TrnInsight }) {
  const c = CONF[ins.confidence] || CONF.insufficient;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="subtle tiny" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>{ins.sport} &middot; {ins.title}</span>
        <span className="pill" style={{ background: c.bg, color: c.fg, fontSize: 10.5, fontWeight: 700 }}>{c.label}</span>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, margin: "6px 0 2px" }}>{ins.headline}</div>
      <div className="subtle tiny">{ins.metric_label}</div>
      <Bars ins={ins} />
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>{ins.stat.effect} <span className="subtle">&middot; n {ins.stat.n} &middot; r {ins.stat.r}</span></div>
      {ins.kai && <div style={{ fontSize: 12.5, color: "var(--ember)", marginTop: 6, fontStyle: "italic" }}>Kai: {ins.kai}</div>}
      <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.4 }}>{ins.note}</div>
    </div>
  );
}

export default function InsightsTab() {
  const [data, setData] = useState<TrnInsightsResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    insights().then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);

  if (error) return <div className="card error"><strong>Couldn&apos;t load insights</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Finding patterns&hellip;</div>;

  return (
    <div>
      <div className="eyebrow">Insights</div>
      <div className="subtle tiny" style={{ margin: "-2px 0 10px" }}>Patterns Kai spotted in your own training data.</div>
      {data.insights.length === 0
        ? <div className="card"><div className="subtle">Not enough data yet to surface a reliable pattern. Keep logging &mdash; insights sharpen as your history grows.</div></div>
        : data.insights.map((ins) => <InsightCard key={ins.id} ins={ins} />)}
    </div>
  );
}
