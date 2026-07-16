"use client";

import { useState, useEffect, useRef } from "react";
import { useApi, actionGet, fetchApi, dashPost } from "./lib/api";
import { Screen } from "./components/Screen";
import KaiTodayNote from "./components/KaiTodayNote";
import TodayNotosChip from "./components/TodayNotosChip";
import Sheet from "./components/Sheet";

type Goal = { id: string; label: string; when_text?: string; target_date: string | null; days_away: number | null };

function racePhase(days: number): { label: string; color: string } {
  if (days <= 7) return { label: "Race week — taper & rest", color: "var(--ember)" };
  if (days <= 21) return { label: "Peak — sharpen, cut volume", color: "var(--gold)" };
  if (days <= 56) return { label: "Build — push key sessions", color: "var(--success)" };
  return { label: "Base — consistency & volume", color: "var(--kai)" };
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
  { v: 1, label: "Rough" },
  { v: 2, label: "Meh" },
  { v: 3, label: "OK" },
  { v: 4, label: "Good" },
  { v: 5, label: "Great" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
function freshDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Pt = { date: string; v: number | null };
type SleepPt = { date: string; total: number | null };
type Trends = { sleep: SleepPt[]; hrv: Pt[]; steps: Pt[]; acwr: Pt[]; debt: Pt[]; vo2max: Pt[] };

function scoreColor(s: number): string { return s >= 75 ? "var(--success)" : s >= 50 ? "var(--gold)" : "var(--danger)"; }
function scoreCap(s: number): string { return s >= 75 ? "READY" : s >= 50 ? "MODERATE" : "LOW"; }
function impactColor(i?: string): string { return i === "positive" ? "var(--success)" : i === "negative" ? "var(--danger)" : "var(--muted)"; }

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

function ReadinessRing({ score }: { score: number }) {
  const r = 47, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, score)) / 100;
  const col = scoreColor(score);
  return (
    <div className="rd-ring">
      <svg viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle cx="54" cy="54" r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="rd-ring-num">
        <div className="rd-ring-score">{score}</div>
        <div className="rd-ring-cap">{scoreCap(score)}</div>
      </div>
    </div>
  );
}

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

type SheetState = { kind: "factor"; i: number } | { kind: "why" } | { kind: "race" } | null;

export default function TodayPage() {
  const { data, error } = useApi<Today>("today");
  const [trends, setTrends] = useState<Trends | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [moodBusy, setMoodBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);

  useEffect(() => { if (data?.checkin?.feeling_score != null) setMood(data.checkin.feeling_score); }, [data]);

  useEffect(() => {
    let alive = true;
    fetchApi<Trends>("trends&days=14").then((t) => { if (alive) setTrends(t); }).catch(() => {});
    actionGet<{ goals: Goal[] }>("goals_list").then((d) => { if (alive) setGoals(d.goals); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function pickMood(v: number) {
    if (moodBusy) return;
    setMood(v); setMoodBusy(true);
    try { await dashPost("checkin", { feeling_score: v }); }
    catch { /* keep optimistic value */ }
    finally { setMoodBusy(false); }
  }

  const nextRace = (goals || [])
    .filter((g) => g.target_date && (g.days_away ?? -1) >= 0)
    .sort((a, b) => (a.days_away ?? 0) - (b.days_away ?? 0))[0];

  const factors = data?.factors ?? [];
  const shownFactors = showAll ? factors : factors.slice(0, 4);
  const factorSer = sheet?.kind === "factor" ? seriesFor(factors[sheet.i]?.label ?? "", trends) : null;

  return (
    <Screen title="" error={error} loading={!data && !error}>
      {data && (
        <>
          <div className="today-greet">{greeting()}</div>
          <div className="today-date">{longDate()}</div>

          <TodayNotosChip />

          <section className="rd-card">
            <div className="rd-top">
              <ReadinessRing score={data.score} />
              <div className="rd-textwrap">
                <div className="rd-label">{data.label}</div>
                <div className="rd-verdict">{data.verdict}</div>
              </div>
            </div>
            <KaiTodayNote whyLabel={`Why ${data.score}?`} onWhy={() => setSheet({ kind: "why" })} />
          </section>

          {nextRace && nextRace.days_away != null && (
            <button className="race-strip" onClick={() => setSheet({ kind: "race" })}>
              <svg className="rs-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 21V4a1 1 0 0 1 1-1h13l-2.5 4L18 11H5" /><path d="M4 21h4" />
              </svg>
              <span className="rs-body">
                <span className="rs-title">Race in {nextRace.days_away} {nextRace.days_away === 1 ? "day" : "days"}{nextRace.label ? ` — ${nextRace.label}` : ""}</span>
                <span className="rs-sub">{racePhase(nextRace.days_away).label}</span>
              </span>
              <svg className="rs-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          )}

          <section className="mood-card">
            <div className="mood-q">How are you feeling today?</div>
            <div className="mood-seg">
              {MOODS.map((m) => (
                <button key={m.v} className={mood === m.v ? "mood-opt on" : "mood-opt"} disabled={moodBusy} onClick={() => pickMood(m.v)}>
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <div className="plan-row">
            <div className="plan-card">
              <div className="plan-head">🏃 Training</div>
              <div className="plan-body">{data.training}</div>
            </div>
            <div className="plan-card">
              <div className="plan-head">🥗 Nutrition</div>
              <div className="plan-body">{data.nutrition}</div>
            </div>
          </div>

          {data.sleep_nudge && <div className="sleep-nudge2">💤 {data.sleep_nudge}</div>}

          <div className="today-sec">
            <span className="today-sec-t">Today&apos;s factors</span>
            <span className="today-sec-s">tap for detail</span>
          </div>
          <section className="fx-card">
            {shownFactors.map((f, i) => (
              <button className="fx-row" key={i} onClick={() => setSheet({ kind: "factor", i })}>
                <span className="fx-emoji">{f.emoji}</span>
                <span className="fx-name">{f.label}</span>
                <span className="fx-val" style={{ color: impactColor(f.impact) }}>{f.value}</span>
                <svg className="fx-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
            {factors.length > 4 && (
              <button className="fx-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `${factors.length - 4} more factors`}
              </button>
            )}
          </section>

          {data.data_through && (
            <div className="subtle tiny" style={{ textAlign: "center", margin: "10px 0 2px", opacity: 0.7 }}>
              Data through {freshDate(data.data_through)}
              {data.last_synced ? ` · synced ${freshDate(data.last_synced)}` : ""}
            </div>
          )}

          {/* ---- 2b sheets ---- */}
          <Sheet open={sheet?.kind === "factor"} title={sheet?.kind === "factor" ? factors[sheet.i]?.label ?? "" : ""} onClose={() => setSheet(null)}>
            {sheet?.kind === "factor" && factors[sheet.i] && (() => {
              const f = factors[sheet.i];
              const col = impactColor(f.impact);
              const ser = factorSer;
              const nudge = ser ? nudgeFor(ser, f.impact) : null;
              return (
                <div className="sheet-body">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: col, fontVariantNumeric: "tabular-nums" }}>{f.value}</span>
                    <span style={{ fontSize: 20 }}>{f.emoji}</span>
                  </div>
                  {f.detail && <div style={{ marginBottom: 4 }}>{f.detail}</div>}
                  {f.note && <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5 }}>{f.note}</div>}
                  {ser && <MiniChart pts={ser.pts} color={col} unit={ser.unit} />}
                  {nudge && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: col }}>{nudge}</div>}
                </div>
              );
            })()}
          </Sheet>

          <Sheet open={sheet?.kind === "why"} title={`Why ${data.score}?`} onClose={() => setSheet(null)}>
            <div className="sheet-body">
              <div style={{ marginBottom: 12 }}>{data.verdict}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {factors.slice(0, 6).map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{f.emoji}</span>
                    <span style={{ flex: 1, fontSize: 13.5, color: "var(--text)" }}>{f.label}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: impactColor(f.impact) }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Sheet>

          <Sheet open={sheet?.kind === "race"} title={nextRace?.label || "Next race"} onClose={() => setSheet(null)}>
            {nextRace && nextRace.days_away != null && (
              <div className="sheet-body">
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: "var(--ember)" }}>{nextRace.days_away}</span>
                  <span>{nextRace.days_away === 1 ? "day to go" : "days to go"}</span>
                </div>
                {nextRace.target_date && <div style={{ marginBottom: 6 }}>Race day · {freshDate(nextRace.target_date)}</div>}
                <div style={{ color: racePhase(nextRace.days_away).color, fontWeight: 600 }}>{racePhase(nextRace.days_away).label}</div>
              </div>
            )}
          </Sheet>
        </>
      )}
    </Screen>
  );
}
