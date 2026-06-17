"use client";

import { useState, useEffect, useCallback } from "react";
import { planGet, planPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Session = {
  id: string; session_date: string; session_type: string; activity: string;
  planned_duration: number; completed: boolean; is_rest_day: boolean; notes: string | null;
};
type PlanResp = { week_start: string; plan: Session[]; week_focus?: string };

const ICON: Record<string, string> = {
  Run: "🏃", Swim: "🏊", Strength: "🏋️", HIIT: "🔥", Mobility: "🧘", "Cross-train": "🚴", Rest: "😴",
};
function intensityClass(n: string | null): string {
  const i = (n || "").toLowerCase();
  if (i === "hard") return "bad";
  if (i === "moderate") return "warn";
  if (i === "easy") return "ok";
  return "";
}
function dayLabel(d: string): { wd: string; dm: string } {
  const dt = new Date(d + "T00:00:00");
  return { wd: dt.toLocaleDateString(undefined, { weekday: "short" }), dm: dt.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
}
function todayISO(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0]; }

export default function SchedulePage() {
  const [plan, setPlan] = useState<Session[] | null>(null);
  const [focus, setFocus] = useState<string>("");
  const [weekStart, setWeekStart] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await planGet<PlanResp>(); setPlan(d.plan); setWeekStart(d.week_start); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setGenErr(null);
    try {
      const d = await planPost<PlanResp & { ok: boolean; error?: string }>("generate");
      if (d.ok) { setPlan(d.plan); setWeekStart(d.week_start); setFocus(d.week_focus || ""); }
      else setGenErr(d.error || "Couldn't generate a plan right now.");
    } catch (e) { setGenErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggle(id: string) {
    setPlan((p) => p ? p.map((s) => s.id === id ? { ...s, completed: !s.completed } : s) : p);
    try { const d = await planPost<PlanResp>("toggle", { id }); setPlan(d.plan); } catch { load(); }
  }

  const today = todayISO();
  const hasPlan = plan && plan.length > 0;
  const done = plan?.filter((s) => s.completed && !s.is_rest_day).length ?? 0;
  const total = plan?.filter((s) => !s.is_rest_day).length ?? 0;

  return (
    <Screen title="Schedule" back="/more" error={error} loading={!plan && !error}>
      {plan && (
        <>
          {hasPlan && (
            <section className="card">
              <div className="lever-top">
                <span><strong>This week</strong> <span className="subtle tiny">{weekStart && dayLabel(weekStart).dm}</span></span>
                <span className="subtle tiny">{done}/{total} done</span>
              </div>
              {focus && <div className="subtle tiny mt8">🎯 {focus}</div>}
            </section>
          )}

          {!hasPlan && (
            <section className="card" style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No plan yet for this week</div>
              <div className="subtle tiny" style={{ marginBottom: 12 }}>
                Generate a 7-day microcycle tuned to your race phase, current load (ACWR), and readiness — swim / run / HIIT / strength, around a rest day.
              </div>
            </section>
          )}

          {hasPlan && plan.map((s) => {
            const dl = dayLabel(s.session_date);
            const isToday = s.session_date === today;
            return (
              <section key={s.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, opacity: s.completed ? 0.6 : 1, borderLeft: isToday ? "3px solid var(--accent, #6366f1)" : undefined }}>
                <div style={{ textAlign: "center", minWidth: 38 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{dl.wd}</div>
                  <div className="subtle" style={{ fontSize: 10 }}>{dl.dm.split(" ")[0]}</div>
                </div>
                <div style={{ fontSize: 22 }}>{ICON[s.session_type] || "•"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {s.session_type}{!s.is_rest_day && s.planned_duration > 0 ? <span className="subtle"> · {s.planned_duration}m</span> : null}
                    {!s.is_rest_day && s.notes ? <span className={`pill ${intensityClass(s.notes)}`} style={{ marginLeft: 8, fontSize: 10 }}>{s.notes}</span> : null}
                  </div>
                  <div className="subtle tiny" style={{ marginTop: 2 }}>{s.activity}</div>
                </div>
                {!s.is_rest_day && (
                  <button onClick={() => toggle(s.id)} aria-label="Toggle complete"
                    style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, cursor: "pointer", border: s.completed ? "none" : "1.5px solid rgba(255,255,255,0.2)", background: s.completed ? "#34d399" : "transparent", color: "#04291d", fontWeight: 800, fontSize: 14 }}>
                    {s.completed ? "✓" : ""}
                  </button>
                )}
              </section>
            );
          })}

          <button onClick={generate} disabled={busy}
            style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 12, border: "none", background: busy ? "rgba(255,255,255,0.08)" : "var(--accent, #6366f1)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Building your week…" : hasPlan ? "↻ Regenerate plan" : "✨ Generate this week's plan"}
          </button>
          {genErr && <div className="subtle tiny" style={{ color: "#f87171", marginTop: 8, textAlign: "center" }}>{genErr}</div>}
          <div className="subtle tiny" style={{ textAlign: "center", marginTop: 10 }}>AI-generated from your live data. Adjust as you go — you know your body best.</div>
        </>
      )}
    </Screen>
  );
}
