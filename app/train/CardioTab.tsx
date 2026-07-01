"use client";

import { useState } from "react";
import { useTrain, type TrnCardio, type TrnActivity } from "../lib/api";
import { Spark, Delta, ZoneBar, fmtPace, dShort, sportEmoji } from "./ui";

const SPORTS = [
  { pill: "Run", sport: "running" },
  { pill: "Swim", sport: "swimming" },
  { pill: "Ride", sport: "cycling" },
] as const;
type Pill = (typeof SPORTS)[number]["pill"];

const isEasy = (a: TrnActivity) => (a.z2 || 0) > (a.z3 || 0) + (a.z4 || 0) + (a.z5 || 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function SportView({ pill, sport }: { pill: Pill; sport: string }) {
  const { data, error } = useTrain<TrnCardio>(`cardio&sport=${sport}`);
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;

  const acts = [...(data.activities || [])].sort((a, b) => a.date.localeCompare(b.date));
  const weekly = data.weekly || [];

  if (acts.length < 2) {
    return <div className="card"><div className="subtle center" style={{ padding: "18px 0" }}>Not enough {pill.toLowerCase()} sessions logged yet to analyse.</div></div>;
  }

  // easy-run avg pace (fallback to all if too few easy)
  const easy = acts.filter(isEasy);
  const paceSet = (easy.length >= 3 ? easy : acts).slice(-12).map((a) => a.pace_min_km).filter((p): p is number => p != null);
  const avgPace = mean(paceSet);

  // aerobic efficiency (m/beat) — recent vs ~4 weeks ago (weekly series)
  const effWeeks = weekly.filter((w) => w.avg_m_per_beat != null);
  const recentEff = effWeeks[effWeeks.length - 1]?.avg_m_per_beat ?? null;
  const pastEff = effWeeks[effWeeks.length - 5]?.avg_m_per_beat ?? effWeeks[0]?.avg_m_per_beat ?? null;
  const effPct = recentEff != null && pastEff ? Math.round((recentEff / pastEff - 1) * 1000) / 10 : null;
  const effSeries = weekly.slice(-16).map((w) => w.avg_m_per_beat);

  // HR zones — last 30 days summed (seconds → minutes)
  const cut30 = Date.now() - 30 * 86400000;
  const z: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  acts.forEach((a) => {
    if (new Date(a.date + "T00:00:00").getTime() >= cut30) {
      z[0] += a.z1 || 0; z[1] += a.z2 || 0; z[2] += a.z3 || 0; z[3] += a.z4 || 0; z[4] += a.z5 || 0;
    }
  });
  const zoneHas = z.some((v) => v > 0);
  const recent6 = [...acts].reverse().slice(0, 6);

  return (
    <>
      {/* avg pace hero */}
      <div className="trn-hero">
        <div className="trn-eyebrow">Avg pace · {easy.length >= 3 ? "easy sessions" : "recent"}</div>
        <div className="trn-hero-num tnum">
          {fmtPace(avgPace)}<small>/km</small>
          {effPct != null && <Delta v={effPct} unit="%" suffix="at same HR" />}
        </div>
        <div className="trn-hero-sub">
          {recentEff != null ? `Aerobic efficiency ${recentEff.toFixed(2)} m/beat` : "Efficiency trending"}
        </div>
        <Spark values={effSeries} color="#3ec8e6" />
        <div className="subtle tiny" style={{ marginTop: 8 }}>Aerobic efficiency (m/beat) · higher = faster at the same heart rate</div>
      </div>

      {/* HR zone distribution */}
      {zoneHas && (
        <div className="card">
          <div className="trn-eyebrow">Time in heart-rate zones · 30d</div>
          <ZoneBar z={z} />
        </div>
      )}

      {/* recent activities */}
      <div className="eyebrow">Recent {pill.toLowerCase()} sessions</div>
      <div className="card">
        {recent6.map((a, i) => (
          <div className="trn-srow" key={i}>
            <span className="d">{sportEmoji(sport)} {dShort(a.date)}</span>
            <span className="tnum">{a.distance_km != null ? `${a.distance_km.toFixed(2)} km` : "—"}</span>
            <span className="tnum" style={{ color: "var(--muted)" }}>
              {sport === "swimming" && a.avg_swolf != null
                ? `SWOLF ${Math.round(a.avg_swolf)}`
                : a.pace_min_km != null ? `${fmtPace(a.pace_min_km)}/km` : ""}
              {a.avg_hr != null ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function CardioTab() {
  const [pill, setPill] = useState<Pill>("Run");
  const active = SPORTS.find((s) => s.pill === pill)!;
  return (
    <div>
      <div className="trn-subs" style={{ marginBottom: 12 }}>
        {SPORTS.map((s) => (
          <button key={s.pill} className={pill === s.pill ? "trn-sub on" : "trn-sub"} onClick={() => setPill(s.pill)}>
            {sportEmoji(s.sport)} {s.pill}
          </button>
        ))}
      </div>
      <SportView key={active.sport} pill={active.pill} sport={active.sport} />
    </div>
  );
}
