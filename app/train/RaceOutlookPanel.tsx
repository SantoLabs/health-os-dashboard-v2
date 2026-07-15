"use client";

import { useEffect, useState, useCallback } from "react";
import { raceList, raceOutlook } from "../lib/api";
import type { RaceGoal, RaceOutlookResp, PredLeg, PacingLeg } from "../lib/api";

// Race outlook (Phase 4 · U3): a deterministic model predicts a realistic finish time from your fitness —
// run legs via a Riegel fit on your best efforts, bike from recent outdoor ride speed, swim from CSS
// (+open-water), tri = legs + transitions — with a confidence range, an even/negative-split pacing plan,
// and Kai's honest read of the runway. Not grade-adjusted (no per-point course elevation).

const GRAD = "linear-gradient(135deg,#5f7dff,#a274ff)";
const SPORT: Record<string, { label: string; color: string }> = {
  swim: { label: "Swim", color: "#5aa9e0" },
  bike: { label: "Bike", color: "#e0a15a" },
  run: { label: "Run", color: "#7ad19a" },
};

function clock(s?: number | null): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function ms(sec: number): string { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; }
function legPace(l: PredLeg | PacingLeg, val?: number): string {
  const v = val ?? (l as PredLeg).pace ?? (l as PacingLeg).even;
  if (v == null) return "";
  const unit = (l as PredLeg).pace_unit || (l as PacingLeg).unit;
  if (unit === "s_per_km") return `${ms(v)}/km`;
  if (unit === "s_per_100m") return `${ms(v)}/100m`;
  if (unit === "kmh") return `${v} km/h`;
  return String(v);
}
function fmtDate(iso?: string): string { return iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }) : ""; }
const TREND: Record<string, { icon: string; color: string; label: string }> = {
  improving: { icon: "↗", color: "#79e0a8", label: "fitness trending up" },
  sliding: { icon: "↘", color: "#ffca7a", label: "fitness slipping lately" },
  steady: { icon: "→", color: "#8ab4ff", label: "fitness steady" },
};

export default function RaceOutlookPanel() {
  const [races, setRaces] = useState<RaceGoal[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<RaceOutlookResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadOutlook = useCallback(async (id: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await raceOutlook(id);
      if (!r.ok) setErr(r.error || "Couldn't build an outlook for this race.");
      else setData(r);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let live = true;
    raceList().then((r) => {
      if (!live) return;
      const rs = r.races || [];
      setRaces(rs); setLoading(false);
      if (rs.length) { setSel(rs[0].id); loadOutlook(rs[0].id); }
    }).catch(() => { if (live) { setErr("Couldn't load your races"); setLoading(false); } });
    return () => { live = false; };
  }, [loadOutlook]);

  function pick(id: string) { if (id === sel) return; setSel(id); setData(null); loadOutlook(id); }

  const pred = data?.prediction;
  const pacing = data?.pacing;
  const trend = data?.trend ? TREND[data.trend] : null;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Race outlook</div>
        {pred?.days_to_go != null ? <div className="tiny" style={{ opacity: 0.55 }}>{pred.days_to_go}d to go</div> : null}
      </div>
      <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
        A realistic finish time from your current fitness, with a pacing plan. Effort-based splits — not course-graded.
      </div>

      {loading ? <div className="subtle tiny" style={{ marginTop: 12 }}>Loading your races…</div> : null}
      {!loading && races.length === 0 ? <div className="subtle tiny" style={{ marginTop: 12 }}>No upcoming races found. Add a race goal with a date and Kai can forecast it.</div> : null}

      {races.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {races.map((r) => (
            <button key={r.id} className="trn-sub" onClick={() => pick(r.id)} disabled={busy}
              style={sel === r.id ? { background: "rgba(121,224,168,0.12)", border: "1px solid rgba(121,224,168,0.35)", color: "#cfeede" } : undefined}>
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {err ? <div className="tiny" style={{ marginTop: 12, color: "#ff8a8a" }}>{err} · <button className="trn-sub" onClick={() => sel && loadOutlook(sel)}>retry</button></div> : null}
      {busy && !data ? <div className="subtle tiny" style={{ marginTop: 12 }}>Kai is crunching your numbers…</div> : null}

      {pred ? (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div className="tiny subtle" style={{ textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>Predicted finish</div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{clock(pred.total_s)}</div>
              <div className="tiny" style={{ opacity: 0.6, marginTop: 2 }}>range {clock(pred.total_low_s)} – {clock(pred.total_high_s)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tiny" style={{ opacity: 0.55 }}>{fmtDate(pred.target_date)}</div>
              {pred.target_s ? <div className="tiny" style={{ marginTop: 4, opacity: 0.8 }}>target {clock(pred.target_s)}</div> : null}
              {trend ? <div className="tiny" style={{ marginTop: 4, color: trend.color, fontWeight: 700 }}>{trend.icon} {trend.label}</div> : null}
            </div>
          </div>

          {pred.legs && pred.legs.length > 1 ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {pred.legs.map((l, i) => {
                const sp = SPORT[l.sport] || { label: l.sport, color: "#8a90a3" };
                return (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: sp.color, flexShrink: 0, transform: "translateY(1px)" }} />
                    <div style={{ width: 44, fontSize: 13, fontWeight: 600 }}>{sp.label}</div>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <span style={{ fontWeight: 700 }}>{clock(l.predicted_s)}</span>
                      <span style={{ opacity: 0.55 }}> · {(l.distance_m / 1000).toFixed(l.distance_m % 1000 ? 1 : 0)}k{l.pace != null ? ` · ${legPace(l)}` : ""}</span>
                    </div>
                  </div>
                );
              })}
              {pred.transitions_s ? <div className="tiny" style={{ opacity: 0.5, marginTop: 2 }}>+ {clock(pred.transitions_s)} transitions</div> : null}
            </div>
          ) : null}

          {data?.narrative ? <div className="subtle tiny" style={{ marginTop: 12, lineHeight: 1.55, fontStyle: "italic" }}>“{data.narrative}”</div> : null}

          {pacing && pacing.legs.length > 0 ? (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="tiny subtle" style={{ fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Pacing plan</div>
              {pacing.legs.map((l, i) => {
                const sp = SPORT[l.sport] || { label: l.sport, color: "#8a90a3" };
                return (
                  <div key={i} className="tiny" style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
                    <span style={{ width: 44, color: sp.color, fontWeight: 700 }}>{sp.label}</span>
                    <span style={{ opacity: 0.9 }}>{legPace(l)}</span>
                    {l.first_half != null && l.second_half != null ? (
                      <span style={{ opacity: 0.55 }}>· open {legPace(l, l.first_half)} → close {legPace(l, l.second_half)}</span>
                    ) : null}
                  </div>
                );
              })}
              <div className="tiny subtle" style={{ marginTop: 6, opacity: 0.6 }}>{pacing.note}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
