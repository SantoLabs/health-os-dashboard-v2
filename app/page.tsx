"use client";

import { useState, useEffect, useRef } from "react";
import { useApi, actionGet, fetchApi, dashPost } from "./lib/api";
import { Screen } from "./components/Screen";
import KaiDailyCard from "./components/KaiDailyCard";
import TodayNotosChip from "./components/TodayNotosChip";

type Goal = { id: string; label: string; when_text?: string; target_date: string | null; days_away: number | null };

function racePhase(days: number): { label: string; color: string } {
  if (days <= 7) return { label: "Race week — taper & rest", color: "#f472b6" };
  if (days <= 21) return { label: "Peak — sharpen, cut volume", color: "#fbbf24" };
  if (days <= 56) return { label: "Build — push key sessions", color: "#34d399" };
  return { label: "Base — consistency & volume", color: "#60a5fa" };
}

function RaceCountdown() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  useEffect(() => {
    let alive = true;
    actionGet<{ goals: Goal[] }>("goals_list").then((d) => { if (alive) setGoals(d.goals); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!goals) return null;
  const next = goals
    .filter((g) => g.target_date && (g.days_away ?? -1) >= 0)
    .sort((a, b) => (a.days_away ?? 0) - (b.days_away ?? 0))[0];
  if (!next || next.days_away == null) return null;
  const days = next.days_away;
  const weeks = Math.floor(days / 7);
  const phase = racePhase(days);
  return (
    <section className="card" style={{ borderLeft: `3px solid ${phase.color}` }}>
      <div className="lever-top">
        <span className="subtle tiny">NEXT RACE</span>
        <span className="subtle tiny">{next.target_date}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>{days}</span>
        <span className="subtle">days · {next.label}</span>
      </div>
      <div className="tiny" style={{ marginTop: 6, color: phase.color }}>
        {phase.label}{weeks >= 2 ? ` · ~${weeks} wks out` : ""}
      </div>
    </section>
  );
}

type Factor = {
  emoji: string; label: string; value: string;
  detail?: string; impact?: "positive" | "negative" | "neutral" | string; note?: string;
};

type Today = {
  date: string; score: number; label: string; verdict: string;
  training: string; nutrition: string; factors: Factor[];
  vo2max?: number; sleep_nudge?: string; last_synced?: string;
  data_through?: string; checkin?: { feeling_score: number } | null;
};

const MOODS = [
  { v: 1, emoji: "😖", label: "Rough" },
  { v: 2, emoji: "😕", label: "Meh" },
  { v: 3, emoji: "😐", label: "OK" },
  { v: 4, emoji: "🙂", label: "Good" },
  { v: 5, emoji: "😄", label: "Great" },
];
function freshDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Pt = { date: string; v: number | null };
type SleepPt = { date: string; total: number | null };
type Trends = { sleep: SleepPt[]; hrv: Pt[]; steps: Pt[]; acwr: Pt[]; debt: Pt[]; vo2max: Pt[] };

function scoreColor(s: number): string { return s >= 75 ? "#34d399" : s >= 50 ? "#fbbf24" : "#f87171"; }
function impactColor(i?: string): string { return i === "positive" ? "#34d399" : i === "negative" ? "#f87171" : "#94a3b8"; }

type Ser = { pts: Pt[]; unit: string; betterUp: boolean | null };

// Map a factor to a recent dated series for the interactive chart.
function seriesFor(label: string, t: Trends | null): Ser | null {
  if (!t) return null;
  const take = (pts: Pt[], unit: string, betterUp: boolean | null): Ser | null => {
    const clean = (pts || []).filter((p) => p.v != null);
    return clean.length >= 4 ? { pts: clean.slice(-14), unit, betterUp } : null;
  };
  const l = label.toLowerCase();
  if (l.includes("debt")) return take(t.debt, "m", false);
  if (l.startsWith("vo")) return take(t.vo2max, "", true);
  if (l.startsWith("sleep")) return take(t.sleep.map((s) => ({ date: s.date, v: s.total != null ? Math.round((s.total / 60) * 10) / 10 : null })), "h", true);
  if (l.includes("hrv")) return take(t.hrv, "ms", true);
  if (l.includes("steps")) return take(t.steps, "", true);
  if (l.includes("training load")) return take(t.acwr, "", null);
  return null;
}

// Short trend-aware nudge from the series direction + current impact.
function nudgeFor(s: Ser, impact?: string): string | null {
  const vals = s.pts.map((p) => p.v as number);
  if (vals.length < 4 || s.betterUp == null) return null;
  const mid = Math.floor(vals.length / 2);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const delta = mean(vals.slice(mid)) - mean(vals.slice(0, mid));
  const rng = Math.max(...vals) - Math.min(...vals) || 1;
  const norm = delta / rng, eps = 0.08;
  const dir = norm > eps ? 1 : norm < -eps ? -1 : 0;
  const improving = dir !== 0 && ((s.betterUp && dir > 0) || (!s.betterUp && dir < 0));
  const worsening = dir !== 0 && !improving;
  const pos = impact === "positive", neg = impact === "negative";
  if (improving) return pos ? "Great and still improving — keep it up. 👍" : "Heading the right way — keep the momentum going.";
  if (worsening) return neg ? "Slipping lately — worth a focused reset." : "Solid for now, but drifting — keep an eye on it.";
  return pos ? "Holding steady in a good place. 👍" : neg ? "Stuck low — a small change could nudge this up." : "Flat and stable this fortnight.";
}

function fmtDay(iso: string) { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }); }

function MiniChart({ pts, color, unit }: { pts: Pt[]; color: string; unit: string }) {
  const w = 260, h = 64, pad = 6, padB = 14;
  const vals = pts.map((p) => p.v as number);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, n = vals.length;
  const X = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const Y = (v: number) => (h - padB) - ((v - min) / span) * ((h - padB) - pad);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${X(n - 1).toFixed(1)} ${h - padB} L${X(0).toFixed(1)} ${h - padB} Z`;
  const [act, setAct] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const at = (clientX: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * w;
    let i = Math.round((rel - pad) / ((w - 2 * pad) / (n - 1)));
    i = Math.max(0, Math.min(n - 1, i)); setAct(i);
  };
  const cur = act ?? n - 1;
  return (
    <div className="mini-chart-wrap">
      <svg ref={ref} className="mini-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        onMouseMove={(e) => at(e.clientX)} onMouseLeave={() => setAct(null)}
        onTouchStart={(e) => at(e.touches[0].clientX)} onTouchMove={(e) => at(e.touches[0].clientX)} onTouchEnd={() => setAct(null)}>
        <path d={area} fill={color} opacity="0.12" stroke="none" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {act != null && <line x1={X(act)} y1={pad} x2={X(act)} y2={h - padB} stroke={color} strokeWidth="1" opacity="0.45" />}
        <circle cx={X(cur)} cy={Y(vals[cur])} r="3" fill={color} />
      </svg>
      <div className="mini-chart-cap subtle tiny">
        {act != null
          ? <span style={{ color }}><strong>{vals[act]}{unit}</strong> · {fmtDay(pts[act].date)}</span>
          : <>Last {n} days · {vals[0]}{unit} → {vals[n - 1]}{unit}</>}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data, error } = useApi<Today>("today");
  const [trends, setTrends] = useState<Trends | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [moodBusy, setMoodBusy] = useState(false);

  useEffect(() => { if (data?.checkin?.feeling_score != null) setMood(data.checkin.feeling_score); }, [data]);

  async function pickMood(v: number) {
    if (moodBusy) return;
    setMood(v); setMoodBusy(true);
    try { await dashPost("checkin", { feeling_score: v }); }
    catch { /* keep optimistic value */ }
    finally { setMoodBusy(false); }
  }

  useEffect(() => {
    let alive = true;
    fetchApi<Trends>("trends&days=14").then((t) => { if (alive) setTrends(t); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <Screen title="Today" error={error} loading={!data && !error}>
      {data && (
        <>
          <KaiDailyCard liveReadiness={{ score: data.score, label: data.label }} />
          <TodayNotosChip />
          <section className="card readiness">
            <div className="ring" style={{ ["--c" as string]: scoreColor(data.score), ["--p" as string]: data.score / 100 }}>
              <span className="ring-num">{data.score}</span>
            </div>
            <div className="readiness-text">
              <div className="readiness-label">{data.label}</div>
              <div className="subtle">{data.verdict}</div>
            </div>
          </section>

          <RaceCountdown />

          <section className="card">
            <div className="subtle" style={{ fontSize: 13, marginBottom: 10 }}>How are you feeling today?</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
              {MOODS.map((m) => {
                const on = mood === m.v;
                return (
                  <button key={m.v} onClick={() => pickMood(m.v)} disabled={moodBusy} aria-label={m.label}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 2px", borderRadius: 12, cursor: moodBusy ? "default" : "pointer",
                      border: on ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.08)", background: on ? "rgba(99,102,241,0.16)" : "rgba(255,255,255,0.03)",
                      opacity: on || mood == null ? 1 : 0.55, transition: "all .12s" }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{m.emoji}</span>
                    <span className="tiny" style={{ color: on ? "#a5b4fc" : "var(--muted)" }}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <h2 className="section-title">Your plan today</h2>
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

          {data.sleep_nudge && <section className="card nudge">💤 {data.sleep_nudge}</section>}

          <h2 className="section-title">Today&apos;s factors <span className="subtle tiny">· tap for detail</span></h2>
          <section className="factor-list">
            {data.factors?.map((f, i) => {
              const isOpen = open === i;
              const col = impactColor(f.impact);
              const ser = isOpen ? seriesFor(f.label, trends) : null;
              const nudge = ser ? nudgeFor(ser, f.impact) : null;
              return (
                <div className={isOpen ? "card factor-row open" : "card factor-row"} key={i}>
                  <button className="factor-head" onClick={() => setOpen(isOpen ? null : i)}>
                    <span className="factor-emoji">{f.emoji}</span>
                    <span className="factor-label">{f.label}</span>
                    <span className="factor-spacer" />
                    <span className="dot-impact" style={{ background: col }} />
                    <span className="factor-value" style={{ color: col }}>{f.value}</span>
                    <span className={isOpen ? "chev open" : "chev"}>⌄</span>
                  </button>
                  {isOpen && (
                    <div className="factor-detail">
                      {f.detail && <div className="subtle tiny">{f.detail}</div>}
                      {f.note && <div className="factor-note">{f.note}</div>}
                      {ser && <MiniChart pts={ser.pts} color={col} unit={ser.unit} />}
                      {nudge && <div className="factor-nudge" style={{ color: col }}>{nudge}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {data.data_through && (
            <div className="subtle tiny" style={{ textAlign: "center", margin: "10px 0 2px", opacity: 0.7 }}>
              Data through {freshDate(data.data_through)}
              {data.last_synced ? ` · synced ${freshDate(data.last_synced)}` : ""}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
