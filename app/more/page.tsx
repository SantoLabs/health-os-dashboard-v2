"use client";

import { useState } from "react";
import { useApi } from "../lib/api";
import { Screen } from "../components/Screen";

type Hist = { v: number; date: string };
type Marker = {
  metric: string; value: number; unit: string; status: string; as_of: string;
  why?: string; ref_low: number | null; ref_high: number | null;
  prev_value: number | null; higher_is_better: boolean;
};
type Section = { group: string; flagged: number; markers: Marker[] };
type Goals = {
  body_comp: {
    bia_bf: number; dexa_bf: number; goal_bf: number; goal_by: string;
    latest_weight: number; weight_as_of: string;
    weight_history: { kg: number; date: string; source: string }[];
  };
  milestones: { date: string; when: string; label: string; days_away: number }[];
};
type Medical = {
  focus: string[]; notes: string[]; last_report: string; panel_size: number;
  key_markers: Marker[]; sections: Section[];
};

function statusClass(s: string): string {
  const t = s.toLowerCase();
  if (t.includes("borderline")) return "warn";
  if (t.includes("high") || t.includes("low") || t.includes("elevated")) return "bad";
  return "ok";
}
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const refText = (m: Marker) =>
  m.ref_low != null && m.ref_high != null ? `${m.ref_low}–${m.ref_high}` :
  m.ref_high != null ? `<${m.ref_high}` :
  m.ref_low != null ? `>${m.ref_low}` : "—";

function MarkerRow({ m }: { m: Marker }) {
  return (
    <div className="card" style={{ marginBottom: 0, padding: "12px 16px" }}>
      <div className="lever-top">
        <span><strong>{m.metric}</strong> <span className="subtle">{m.value}{m.unit}</span></span>
        <span className={`pill ${statusClass(m.status)}`}>{m.status}</span>
      </div>
      <div className="subtle tiny mt8">ref {refText(m)}{m.why ? ` · ${m.why}` : ""}</div>
    </div>
  );
}

export default function MorePage() {
  const goals = useApi<Goals>("goals");
  const med = useApi<Medical>("medical");
  const [openSec, setOpenSec] = useState<number | null>(null);

  const bc = goals.data?.body_comp;
  const progress = bc ? Math.max(0, Math.min(100, ((bc.dexa_bf - bc.bia_bf) / (bc.dexa_bf - bc.goal_bf)) * 100)) : 0;
  const wStart = bc?.weight_history?.find((w) => w.source === "withings")?.kg;
  const wDelta = bc && wStart ? bc.latest_weight - wStart : undefined;

  const upcoming = (goals.data?.milestones ?? []).filter((m) => m.days_away >= 0).slice(0, 5);
  const shown = upcoming.length ? upcoming : (goals.data?.milestones ?? []).slice(-4);

  return (
    <Screen title="More" error={goals.error || med.error} loading={!goals.data && !med.data && !goals.error && !med.error}>
      {/* Body composition */}
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

      {/* Milestones */}
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

      {/* Bloodwork */}
      {med.data && (
        <>
          <h2 className="section-title">Bloodwork</h2>
          <section className="card">
            <div className="lever-top">
              <span><strong>{med.data.panel_size}</strong> markers · {fmtDate(med.data.last_report)}</span>
            </div>
            <div className="stage-chips" style={{ marginTop: 10 }}>
              <span className="subtle tiny">Focus:</span>
              {med.data.focus.map((f) => <span key={f} className="pill bad">{f}</span>)}
            </div>
          </section>

          <section className="list">
            {med.data.key_markers.map((m, i) => <MarkerRow key={i} m={m} />)}
          </section>

          {med.data.notes?.length > 0 && (
            <section className="card insights" style={{ marginTop: 12 }}>
              {med.data.notes.map((n, i) => (
                <div key={i} className="insight-line"><span className="dot">›</span><span>{n}</span></div>
              ))}
            </section>
          )}

          <h2 className="section-title">Full panel by group</h2>
          <section className="list">
            {med.data.sections.map((s, i) => {
              const isOpen = openSec === i;
              return (
                <div key={i} className="card session">
                  <button className="session-head" onClick={() => setOpenSec(isOpen ? null : i)}>
                    <div className="session-title">{s.group}</div>
                    <div className="session-meta">
                      {s.flagged > 0 && <span className="pill bad">{s.flagged} flagged</span>}
                      <span className="subtle">{s.markers.length}</span>
                      <span className={isOpen ? "chev open" : "chev"}>⌄</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="exlist">
                      {s.markers.map((m, j) => (
                        <div className="exrow" key={j}>
                          <span className="ex-title">{m.metric}</span>
                          <span className="session-meta">
                            <span className="subtle tiny">{m.value}{m.unit}</span>
                            <span className={`pill ${statusClass(m.status)}`}>{m.status}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <div className="subtle tiny mt8" style={{ textAlign: "center", marginBottom: 4 }}>
            Tracking only — not medical advice. Discuss flagged markers with your doctor.
          </div>
        </>
      )}
    </Screen>
  );
}
