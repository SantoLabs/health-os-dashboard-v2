"use client";

import { useState } from "react";
import { useTrain, type TrnStrength, type TrnLift, type TrnLiftSummary } from "../lib/api";
import { Spark, Delta, BackHead, kg, dShort, muscleTint } from "./ui";

const RANGES = [
  { k: "6W", days: 42 }, { k: "3M", days: 92 }, { k: "1Y", days: 366 },
] as const;

function LiftRow({ l, onOpen }: { l: TrnLiftSummary; onOpen: (t: string) => void }) {
  const right = l.recent_e1rm ?? l.best_e1rm ?? l.max_weight;
  return (
    <button className="trn-liftrow" onClick={() => onOpen(l.title)}>
      <span className="ic" style={{ color: muscleTint(l.muscle_group) }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
        </svg>
      </span>
      <div className="main">
        <div className="tt">{l.title}</div>
        <div className="mm">{l.muscle_group.replace(/_/g, " ")} · {l.sessions} sessions</div>
      </div>
      <div className="rt">
        <div className="n tnum">{right != null ? kg(right) : "bw"}</div>
        <div className="k">{right != null ? (l.recent_e1rm != null ? "recent e1RM" : "kg") : "bodyweight"}</div>
      </div>
    </button>
  );
}

function LiftDetail({ title, onBack }: { title: string; onBack: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("3M");
  const { data, error } = useTrain<TrnLift>(`lift&title=${encodeURIComponent(title)}`);

  if (error) return (<><BackHead title={title} onBack={onBack} /><div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div></>);
  if (!data) return (<><BackHead title={title} onBack={onBack} /><div className="muted center pad">Loading…</div></>);

  const s = data.summary;
  const sessions = data.sessions || [];
  const rangeDays = RANGES.find((r) => r.k === range)!.days;
  const cutoff = Date.now() - rangeDays * 86400000;
  const inRange = sessions.filter((x) => new Date(x.date + "T00:00:00").getTime() >= cutoff);
  const chartRows = inRange.length >= 2 ? inRange : sessions.slice(-12);
  const e1rmSeries = chartRows.map((x) => x.est_1rm);
  const volSeries = chartRows.map((x) => x.volume_kg);

  // vs prior: last two sessions with an e1RM
  const withE = sessions.filter((x) => x.est_1rm != null);
  const last = withE[withE.length - 1]?.est_1rm ?? null;
  const prev = withE[withE.length - 2]?.est_1rm ?? null;
  const vsPrior = last != null && prev != null ? Math.round((last - prev) * 10) / 10 : null;

  const peak = s.peak_e1rm;
  const target = peak != null ? Math.ceil(peak / 5) * 5 : null;
  const recent = data.sessions[data.sessions.length - 1];

  return (
    <>
      <BackHead
        title={title}
        sub={`${s.muscle_group.replace(/_/g, " ")} · ${s.sessions} sessions`}
        onBack={onBack}
      />

      {/* e1RM hero */}
      <div className="trn-hero">
        <div className="trn-eyebrow">Estimated 1RM</div>
        <div className="trn-hero-num tnum">
          {peak != null ? kg(peak) : "—"}<small>kg</small>
          {vsPrior != null && <Delta v={vsPrior} unit="kg" suffix="vs prior" />}
        </div>
        <div className="trn-hero-sub">
          {peak != null ? "All-time best" : "Bodyweight movement"}
          {s.best_e1rm != null ? ` · robust best ${kg(s.best_e1rm)} kg` : ""}
        </div>

        <Spark values={e1rmSeries} target={target} color="#6d8bff" />

        <div className="trn-range">
          {RANGES.map((r) => (
            <button key={r.k} className={range === r.k ? "on" : ""} onClick={() => setRange(r.k)}>{r.k}</button>
          ))}
        </div>
      </div>

      {/* 4-up stats */}
      <div className="trn-statgrid">
        <div className="trn-cell"><div className="v tnum">{s.recent_top_weight != null ? kg(s.recent_top_weight) : "—"}</div><div className="l">top set kg</div></div>
        <div className="trn-cell"><div className="v tnum">{s.max_weight != null ? kg(s.max_weight) : "—"}</div><div className="l">heaviest kg</div></div>
        <div className="trn-cell hl"><div className="v tnum">{s.best_e1rm != null ? kg(s.best_e1rm) : "—"}</div><div className="l">best 1RM</div></div>
        <div className="trn-cell"><div className="v tnum" style={{ color: vsPrior == null ? undefined : vsPrior >= 0 ? "#34d6a4" : "#ff6f5e" }}>{vsPrior == null ? "—" : `${vsPrior >= 0 ? "+" : "−"}${Math.abs(vsPrior)}`}</div><div className="l">vs prior</div></div>
      </div>

      {/* volume trend */}
      <div className="card">
        <div className="trn-eyebrow">Session volume · {range}</div>
        <Spark values={volSeries} color="#34d6a4" height={90} />
      </div>

      {/* recent sessions */}
      <div className="eyebrow">Recent sessions</div>
      <div className="card">
        {[...sessions].slice(-6).reverse().map((x, i) => (
          <div className="trn-srow" key={i}>
            <span className="d">{dShort(x.date)}</span>
            <span className="tnum">{x.working_sets}×{x.top_weight != null ? ` ${kg(x.top_weight)}kg` : " bw"}</span>
            <span className="tnum" style={{ color: "var(--muted)" }}>{x.est_1rm != null ? `e1RM ${kg(x.est_1rm)}` : `${x.volume_kg.toLocaleString()}kg vol`}</span>
          </div>
        ))}
        {recent && <div className="subtle tiny" style={{ marginTop: 8 }}>Last trained {dShort(recent.date)}</div>}
      </div>
    </>
  );
}

export default function StrengthTab() {
  const [sel, setSel] = useState<string | null>(null);
  const { data, error } = useTrain<TrnStrength>(sel ? null : "strength");

  if (sel) return <LiftDetail title={sel} onBack={() => setSel(null)} />;
  if (error) return <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;

  const lifts = (data.lifts || []).filter((l) => l.sessions > 0);
  return (
    <div>
      <div className="eyebrow" style={{ marginTop: 0 }}>Your lifts · {lifts.length}</div>
      {lifts.map((l) => <LiftRow key={l.title} l={l} onOpen={setSel} />)}
    </div>
  );
}
