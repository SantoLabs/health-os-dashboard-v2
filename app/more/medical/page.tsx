"use client";

import { useState } from "react";
import { useApi } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Marker = {
  metric: string; value: number; unit: string; status: string;
  why?: string; ref_low: number | null; ref_high: number | null;
};
type Section = { group: string; flagged: number; markers: Marker[] };
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

export default function MedicalPage() {
  const { data, error } = useApi<Medical>("medical");
  const [openSec, setOpenSec] = useState<number | null>(null);

  return (
    <Screen title="Medical" back="/more" error={error} loading={!data && !error}>
      {data && (
        <>
          <section className="card">
            <div className="lever-top">
              <span><strong>{data.panel_size}</strong> markers · {fmtDate(data.last_report)}</span>
            </div>
            <div className="stage-chips" style={{ marginTop: 10 }}>
              <span className="subtle tiny">Focus:</span>
              {data.focus.map((f) => <span key={f} className="pill bad">{f}</span>)}
            </div>
          </section>

          <h2 className="section-title">Key markers</h2>
          <section className="list">
            {data.key_markers.map((m, i) => <MarkerRow key={i} m={m} />)}
          </section>

          {data.notes?.length > 0 && (
            <section className="card insights" style={{ marginTop: 12 }}>
              {data.notes.map((n, i) => (
                <div key={i} className="insight-line"><span className="dot">›</span><span>{n}</span></div>
              ))}
            </section>
          )}

          <h2 className="section-title">Full panel by group</h2>
          <section className="list">
            {data.sections.map((s, i) => {
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
