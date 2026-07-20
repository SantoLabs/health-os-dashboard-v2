"use client";

import { useEffect, useState } from "react";
import { useTrain, wkExercises, type TrnLift, type WkExercise, type WkMedia } from "../lib/api";
import { Spark, Delta, BackHead, kg, dShort } from "./ui";

const RANGES = [
  { k: "6W", days: 42 }, { k: "3M", days: 92 }, { k: "1Y", days: 366 },
] as const;

function HowTo({ title, cat, media }: { title: string; cat: WkExercise | null; media?: WkMedia | null }) {
  const rows: [string, string | null | undefined][] = cat ? [
    ["Primary muscle", cat.muscle_group],
    ["Also works", cat.secondary],
    ["Equipment", cat.equipment],
    ["Pattern", cat.movement_pattern],
    ["Mechanic", cat.mechanic],
    ["Difficulty", cat.difficulty],
  ] : [];
  const video = media?.video_url || cat?.video_url || null;
  const thumb = media?.thumbnail_url || cat?.thumbnail_url || null;
  const cueSrc = (media?.cue_steps && media.cue_steps.length) ? media.cue_steps : (cat?.cue_steps && cat.cue_steps.length ? cat.cue_steps : null);
  const cues = cueSrc;
  return (
    <>
      {video ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <video src={video} poster={thumb || undefined} autoPlay loop muted playsInline controls style={{ width: "100%", display: "block", background: "#000" }} />
        </div>
      ) : thumb ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}><img src={thumb} alt={title} style={{ width: "100%", display: "block" }} /></div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "26px 16px" }}>
          <div style={{ fontSize: 30 }}>🎬</div>
          <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>No form clip yet</div>
          <div className="subtle tiny" style={{ lineHeight: 1.5 }}>A demo clip for {title} isn&apos;t in your library yet. Here&apos;s the movement profile.</div>
        </div>
      )}

      {cues ? (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>How to perform</div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {cues.map((step, i) => (
              <li key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)", fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ flex: "0 0 auto", width: 20, height: 20, borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ember)", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {cat ? (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{cat.name}</div>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
              <span className="subtle">{k}</span>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{String(v).replace(/_/g, " ")}</span>
            </div>
          ))}
          {cat.prescription ? <div className="subtle tiny" style={{ marginTop: 10 }}>Typical: {cat.prescription}</div> : null}
        </div>
      ) : (
        <div className="card"><div className="subtle tiny">No catalog match for this exercise yet — it&apos;ll gain a form guide when the library fills in.</div></div>
      )}
    </>
  );
}

export default function ExerciseDetail({ title, onBack, media }: { title: string; onBack: () => void; media?: WkMedia | null }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("3M");
  const [tab, setTab] = useState<"history" | "howto">("history");
  const [cat, setCat] = useState<WkExercise | null>(null);
  const { data, error } = useTrain<TrnLift>(`lift&title=${encodeURIComponent(title)}`);
  useEffect(() => { let alive = true; wkExercises(title, {}).then((r) => { if (alive) setCat((r.exercises && r.exercises[0]) || null); }).catch(() => {}); return () => { alive = false; }; }, [title]);

  if (error) return (<><BackHead title={title} onBack={onBack} /><div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div></>);
  if (!data) return (<><BackHead title={title} onBack={onBack} /><div className="muted center pad">Loading…</div></>);

  const s = data.summary;
  if (!s) {
    return (
      <>
        <BackHead title={title} onBack={onBack} />
        <div className="trn-subs" style={{ marginBottom: 12 }}>
          <button className={tab === "history" ? "trn-sub on" : "trn-sub"} onClick={() => setTab("history")}>History</button>
          <button className={tab === "howto" ? "trn-sub on" : "trn-sub"} onClick={() => setTab("howto")}>How-to</button>
        </div>
        {tab === "howto" ? <HowTo title={title} cat={cat} media={media} /> : (
          <div className="card"><div className="subtle tiny" style={{ lineHeight: 1.5 }}>No logged strength history for {title} yet — once you log a set here, your e1RM and trends will show up. Check the How-to tab for the movement profile.</div></div>
        )}
      </>
    );
  }
  const sessions = data.sessions || [];
  const rangeDays = RANGES.find((r) => r.k === range)!.days;
  const cutoff = Date.now() - rangeDays * 86400000;
  const inRange = sessions.filter((x) => new Date(x.date + "T00:00:00").getTime() >= cutoff);
  const chartRows = inRange.length >= 2 ? inRange : sessions.slice(-12);
  const e1rmSeries = chartRows.map((x) => x.est_1rm);
  const volSeries = chartRows.map((x) => x.volume_kg);

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

      <div className="trn-subs" style={{ marginBottom: 12 }}>
        <button className={tab === "history" ? "trn-sub on" : "trn-sub"} onClick={() => setTab("history")}>History</button>
        <button className={tab === "howto" ? "trn-sub on" : "trn-sub"} onClick={() => setTab("howto")}>How-to</button>
      </div>

      {tab === "howto" ? <HowTo title={title} cat={cat} media={media} /> : (
      <>

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
        <Spark values={e1rmSeries} target={target} color="var(--ember)" />
        <div className="trn-range">
          {RANGES.map((r) => (
            <button key={r.k} className={range === r.k ? "on" : ""} onClick={() => setRange(r.k)}>{r.k}</button>
          ))}
        </div>
      </div>

      <div className="trn-statgrid">
        <div className="trn-cell"><div className="v tnum">{s.recent_top_weight != null ? kg(s.recent_top_weight) : "—"}</div><div className="l">top set kg</div></div>
        <div className="trn-cell"><div className="v tnum">{s.max_weight != null ? kg(s.max_weight) : "—"}</div><div className="l">heaviest kg</div></div>
        <div className="trn-cell hl"><div className="v tnum">{s.best_e1rm != null ? kg(s.best_e1rm) : "—"}</div><div className="l">best 1RM</div></div>
        <div className="trn-cell"><div className="v tnum" style={{ color: vsPrior == null ? undefined : vsPrior >= 0 ? "var(--success)" : "var(--danger)" }}>{vsPrior == null ? "—" : `${vsPrior >= 0 ? "+" : "−"}${Math.abs(vsPrior)}`}</div><div className="l">vs prior</div></div>
      </div>

      <div className="card">
        <div className="trn-eyebrow">Session volume · {range}</div>
        <Spark values={volSeries} color="var(--success)" height={90} />
      </div>

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
      )}
    </>
  );
}
