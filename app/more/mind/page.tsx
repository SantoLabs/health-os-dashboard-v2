"use client";
import Icon, { type IconName } from "../../components/Icon";

import { useState, useEffect, useCallback, useRef } from "react";
import { mindGet, mindPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Sess = { id: string; kind: string; minutes: number; note: string | null; logged_at: string; log_date: string };
type Summary = {
  today: { minutes: number; sessions: number };
  week: { minutes: number; sessions: number; days_active: number };
  recent: Sess[];
};

const KIND_ICON: Record<string, IconName> = { meditation: "yoga", breathwork: "wind", focus: "target" };

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MindPage() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [secs, setSecs] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { setSum(await mindGet<Summary>()); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const log = useCallback(async (kind: string, minutes: number) => {
    setSaving(true);
    try { setSum(await mindPost<Summary>("log", { kind, minutes })); } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }, []);

  // focus timer tick
  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current);
          setRunning(false);
          log("focus", 25);
          return 25 * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, log]);

  async function del(id: string) {
    try { setSum(await mindPost<Summary>("delete", { id })); } catch { load(); }
  }

  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "var(--fg)", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer",
  });

  return (
    <Screen title="Mind" back="/more" error={error} loading={!sum && !error}>
      {sum && (
        <>
          <section className="stats-row">
            <div className="card stat"><div className="stat-num">{sum.today.minutes}<span className="stat-of">m</span></div><div className="stat-label">today</div></div>
            <div className="card stat"><div className="stat-num">{sum.week.minutes}<span className="stat-of">m</span></div><div className="stat-label">this week</div></div>
            <div className="card stat"><div className="stat-num">{sum.week.days_active}<span className="stat-of">/7</span></div><div className="stat-label">days active</div></div>
          </section>

          <h2 className="section-title">Meditate</h2>
          <section className="card">
            <div style={{ display: "flex", gap: 8 }}>
              {[5, 10, 15, 20].map((m) => (
                <button key={m} disabled={saving} style={btn(false)} onClick={() => log("meditation", m)}>{m}m</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button disabled={saving} style={btn(false)} onClick={() => log("breathwork", 5)}><Icon name="wind" size={12} /> Breathwork 5m</button>
              <button disabled={saving} style={btn(false)} onClick={() => log("breathwork", 10)}><Icon name="wind" size={12} /> 10m</button>
            </div>
          </section>

          <h2 className="section-title">Focus timer</h2>
          <section className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}>{fmtClock(secs)}</div>
            <div className="subtle tiny" style={{ marginBottom: 12 }}>Pomodoro — logs 25m of focus when it completes</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setRunning((r) => !r)}
                style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: running ? "#fbbf24" : "var(--accent, #6366f1)", color: running ? "#3a2c00" : "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {running ? "Pause" : secs === 25 * 60 ? "Start" : "Resume"}
              </button>
              <button onClick={() => { setRunning(false); setSecs(25 * 60); }}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "var(--muted)", fontSize: 14, cursor: "pointer" }}>
                Reset
              </button>
            </div>
          </section>

          <h2 className="section-title">Recent</h2>
          {sum.recent.length === 0 ? (
            <div className="card subtle tiny">Nothing logged yet. A few quiet minutes count — start above ↑</div>
          ) : (
            <section className="list">
              {sum.recent.map((s) => (
                <div key={s.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 0 }}>
                  <span style={{ fontSize: 20 }}>{KIND_ICON[s.kind] || "•"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{s.kind} · {s.minutes}m</div>
                    <div className="subtle tiny">{new Date(s.logged_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
                  </div>
                  <button onClick={() => del(s.id)} aria-label="Delete" style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>
                </div>
              ))}
            </section>
          )}
          <div className="subtle tiny mt8" style={{ textAlign: "center" }}>Recovery is training too — HRV likes consistency here.</div>
        </>
      )}
    </Screen>
  );
}
