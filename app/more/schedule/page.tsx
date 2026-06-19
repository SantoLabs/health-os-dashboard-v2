"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { planWeek, planRange, planHistory, planPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

/* ───────────────────────── types (match health-plan v4) ───────────────────────── */
type Actual = {
  plan_id: string;
  actual_min: number | null;
  actual_distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  training_effect: number | null;
  min_delta: number | null;
  hr_zones: unknown;
  matched: boolean;
};
type Session = {
  id: string;
  session_date: string;
  session_type: string;
  activity: string;
  planned_duration: number;
  completed: boolean;
  skipped: boolean;
  committed: boolean;
  is_rest_day: boolean;
  start_time: string | null;
  intensity: string | null;
  focus: string | null;
  distance_m: number | null;
  notes: string | null;
  source: string;
  dow?: number;
  actual?: Actual | null;
};
type EventItem = {
  id: string;
  source: string;
  title: string;
  kind: string;
  start_ts: string | null;
  end_ts: string | null;
  event_date: string | null;
  all_day: boolean;
  location: string | null;
  busy: boolean;
  dow?: number | null;
};
type Ctx = {
  readiness: number | null;
  readiness_label: string | null;
  acwr: number | null;
  acwr_interpretation: string | null;
  planned_load_min: number;
  last_week_load_min: number;
  ramp: number | null;
  flag: string | null;
  flag_msg: string | null;
};
type WeekResp = {
  week_start: string;
  today: string;
  sessions: Session[];
  plan: Session[];
  events: EventItem[];
  context: Ctx;
  week_focus?: string;
};
type RangeResp = { from: string; to: string; today: string; sessions: Session[]; events: EventItem[] };
type Win = { planned: number; completed: number; pct: number | null; planned_min: number; completed_min: number };
type HistoryResp = {
  windows: { week: Win; d15: Win; d30: Win };
  current_streak: number;
  best_streak: number;
  weeks: { week: string; planned: number; completed: number }[];
};

type View = "plan" | "week" | "month" | "history" | "agenda";

/* ───────────────────────── small helpers ───────────────────────── */
const TYPES = ["Run", "Swim", "Strength", "HIIT", "Mobility", "Cross-train", "Rest"] as const;
const ICON: Record<string, string> = {
  Run: "🏃", Swim: "🏊", Strength: "🏋️", HIIT: "🔥", Mobility: "🧘", "Cross-train": "🚴", Rest: "😴",
};
const KINDS = ["travel", "race", "social", "event"] as const;
const KIND_ICON: Record<string, string> = { travel: "✈️", race: "🏁", social: "🥂", event: "📌", busy: "📌" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function intensityClass(n: string | null | undefined): string {
  const i = (n || "").toLowerCase();
  if (i === "hard") return "bad";
  if (i === "moderate") return "warn";
  if (i === "easy") return "ok";
  return "";
}
function istNow(): Date { return new Date(Date.now() + 5.5 * 3600 * 1000); }
function todayISO(): string { return istNow().toISOString().split("T")[0]; }
function mondayOf(iso: string): string {
  const dt = new Date(iso + "T00:00:00Z");
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().split("T")[0];
}
function addDays(iso: string, d: number): string {
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().split("T")[0];
}
function fmtDM(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}
function fmtWeekday(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}
function fmtRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${fmtDM(weekStart)} – ${fmtDM(end)}`;
}
function fmtTime(t: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
function eventTime(e: EventItem): string {
  if (e.all_day || !e.start_ts) return "All day";
  const d = new Date(e.start_ts);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function km(m: number | null | undefined): string {
  if (!m) return "";
  return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
}
function monthFirst(iso: string): string { return iso.slice(0, 8) + "01"; }
function monthLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/* ───────────────────────── scoped prototype tokens (Plus Jakarta Sans, #6C5CE7) ───────────────────────── */
const SCOPED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.sched{--accent:#6C5CE7;--pk-green:#34D399;--pk-rose:#FB7185;
  font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
.sched .page-title{font-family:inherit;}
.sched-views{margin-bottom:14px;width:100%;justify-content:center;}
.sched-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}
.sched-nav .navbtn{background:var(--card2);border:1px solid var(--line);color:var(--text);
  width:34px;height:34px;border-radius:9px;font-size:16px;line-height:1;cursor:pointer;flex:none;}
.sched-nav .navbtn:disabled{opacity:.4;cursor:default;}
.sched-nav .navtitle{font-size:14px;font-weight:700;text-align:center;flex:1;}
.sched-nav .navtitle .sub{display:block;font-size:11px;font-weight:500;color:var(--muted);}
.guard{border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.45;margin-bottom:12px;
  display:flex;gap:9px;align-items:flex-start;border:1px solid;}
.guard.high,.guard.ramp{background:rgba(251,113,133,.10);border-color:rgba(251,113,133,.40);color:#fecdd3;}
.guard.detrain{background:rgba(52,211,153,.10);border-color:rgba(52,211,153,.35);color:#bbf7d0;}
.guard .gi{font-size:15px;line-height:1.2;flex:none;}
.swap{background:rgba(108,92,231,.12);border:1px solid rgba(108,92,231,.42);color:#ddd6fe;
  border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.45;margin-bottom:12px;}
.swap b{color:#fff;}
.srow{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;}
.srow .sd{text-align:center;min-width:42px;flex:none;}
.srow .sd .wd{font-weight:700;font-size:12px;}
.srow .sd .dm{font-size:10px;color:var(--muted);margin-top:1px;}
.srow .sic{font-size:21px;line-height:1;flex:none;margin-top:1px;}
.srow .smain{flex:1;min-width:0;}
.srow .st{font-weight:600;font-size:14px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.srow .smeta{color:var(--muted);font-size:11.5px;margin-top:2px;line-height:1.4;}
.srow .sact{display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex:none;}
.iconbtn{background:var(--card2);border:1px solid var(--line);color:var(--text);border-radius:8px;
  width:30px;height:30px;font-size:14px;cursor:pointer;line-height:1;display:grid;place-items:center;}
.iconbtn.done{background:var(--pk-green);border-color:var(--pk-green);color:#04291d;}
.commitbtn{background:var(--accent);border:0;color:#fff;font-size:11.5px;font-weight:700;
  border-radius:999px;padding:6px 12px;cursor:pointer;white-space:nowrap;}
.committed-pill{font-size:10px;font-weight:700;color:#c4b5fd;border:1px solid rgba(108,92,231,.5);
  border-radius:999px;padding:3px 9px;white-space:nowrap;}
.actual{margin-top:7px;font-size:11px;color:#a7f3d0;background:rgba(52,211,153,.08);
  border-radius:8px;padding:6px 9px;line-height:1.5;}
.ev{display:flex;gap:10px;align-items:center;padding:10px 14px;}
.ev .evic{font-size:17px;flex:none;}
.ev .evmain{flex:1;min-width:0;}
.ev .evt{font-size:13px;font-weight:600;}
.ev .evm{font-size:11px;color:var(--muted);margin-top:1px;}
.ev .evtag{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  border:1px solid var(--line);border-radius:999px;padding:2px 7px;flex:none;}
.fab-row{display:flex;gap:8px;margin:14px 0 4px;}
.fab-row .btn{margin-top:0;}
.sheet-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1400;display:flex;
  align-items:flex-end;justify-content:center;}
.sheet{width:100%;max-width:480px;background:var(--card);border:1px solid var(--line);
  border-radius:18px 18px 0 0;padding:18px 16px max(18px,env(safe-area-inset-bottom));
  max-height:88vh;overflow-y:auto;}
.sheet h3{font-size:15px;font-weight:700;margin-bottom:4px;}
.sheet .sheet-sub{font-size:12px;color:var(--muted);margin-bottom:12px;}
.fl{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 2px 5px;}
.two{display:flex;gap:10px;}.two>*{flex:1;min-width:0;}
.histbig{display:flex;align-items:baseline;gap:6px;}
.histbig .n{font-size:30px;font-weight:800;}
.histbig .of{font-size:15px;color:var(--muted);font-weight:600;}
.streaks{display:flex;gap:10px;margin-top:12px;}
.streaks .stk{flex:1;background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:11px 12px;text-align:center;}
.streaks .stk .v{font-size:20px;font-weight:800;}
.streaks .stk .l{font-size:10px;color:var(--muted);margin-top:2px;}
.empty{text-align:center;padding:8px 4px 4px;}
.empty .e-emoji{font-size:30px;}
@media (prefers-reduced-motion: reduce){.iconbtn,.chev{transition:none;}}
`;

/* ───────────────────────── component ───────────────────────── */
export default function SchedulePage() {
  const [view, setView] = useState<View>("plan");

  // week (powers Plan + Week)
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(todayISO()));
  const [week, setWeek] = useState<WeekResp | null>(null);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [weekLoading, setWeekLoading] = useState(true);

  // month
  const [monthAnchor, setMonthAnchor] = useState<string>(() => monthFirst(todayISO()));
  const [range, setRange] = useState<RangeResp | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);

  // history
  const [history, setHistory] = useState<HistoryResp | null>(null);
  const [histWin, setHistWin] = useState<"week" | "d15" | "d30">("week");

  // agenda
  const [agenda, setAgenda] = useState<RangeResp | null>(null);

  // editors
  const [editS, setEditS] = useState<Partial<Session> | null>(null);
  const [editE, setEditE] = useState<Partial<EventItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const today = todayISO();
  const isCurrentWeek = weekStart === mondayOf(today);

  /* ---- loaders ---- */
  const loadWeek = useCallback(async (ws: string) => {
    setWeekLoading(true); setWeekErr(null);
    try { setWeek(await planWeek<WeekResp>(ws)); }
    catch (e) { setWeekErr((e as Error).message); }
    finally { setWeekLoading(false); }
  }, []);
  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  const loadMonth = useCallback(async (anchor: string) => {
    // pad the grid: start on the Monday on/before the 1st, end 41 days later (6 rows)
    const from = mondayOf(anchor);
    try { setRange(await planRange<RangeResp>(from, addDays(from, 41))); } catch { /* surfaced inline */ }
  }, []);
  useEffect(() => { if (view === "month") loadMonth(monthAnchor); }, [view, monthAnchor, loadMonth]);

  useEffect(() => {
    if (view !== "history" || history) return;
    planHistory<HistoryResp>().then(setHistory).catch(() => { /* inline */ });
  }, [view, history]);

  const loadAgenda = useCallback(async () => {
    try { setAgenda(await planRange<RangeResp>(today, addDays(today, 41))); } catch { /* inline */ }
  }, [today]);
  useEffect(() => { if (view === "agenda" && !agenda) loadAgenda(); }, [view, agenda, loadAgenda]);

  /* ---- session actions ---- */
  async function act(action: string, body: Record<string, unknown>) {
    try { setWeek(await planPost<WeekResp>(action, body, weekStart)); }
    catch { loadWeek(weekStart); }
  }
  const complete = (id: string) => act("complete", { id });
  const skip = (id: string) => act("skip", { id });
  const commitOne = (id: string) => act("commit", { id });
  const uncommit = (id: string) => act("uncommit", { id });
  const commitAll = () => act("commit", { all: true });

  async function generate() {
    setBusy(true); setGenErr(null);
    try {
      const d = await planPost<WeekResp & { ok: boolean; error?: string }>("generate", {}, weekStart);
      if (d.ok) setWeek(d);
      else setGenErr(d.error || "Couldn't build a plan right now. Try again in a moment.");
    } catch (e) { setGenErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveSession() {
    if (!editS?.session_date || !editS.session_type) return;
    setSaving(true);
    try {
      await planPost("session_save", {
        id: editS.id,
        session_date: editS.session_date,
        session_type: editS.session_type,
        activity: editS.activity || "",
        planned_duration: editS.planned_duration || 0,
        start_time: editS.start_time || null,
        intensity: editS.intensity || null,
        focus: editS.focus || null,
        distance_m: editS.distance_m ?? null,
        is_rest_day: editS.session_type === "Rest",
        notes: editS.notes || null,
      }, mondayOf(editS.session_date));
      setEditS(null);
      setWeekStart(mondayOf(editS.session_date));
      await loadWeek(mondayOf(editS.session_date));
      refreshSecondary();
    } catch (e) { setGenErr((e as Error).message); }
    finally { setSaving(false); }
  }
  async function deleteSession(id: string) {
    setSaving(true);
    try { setWeek(await planPost<WeekResp>("session_delete", { id }, weekStart)); setEditS(null); refreshSecondary(); }
    catch (e) { setGenErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function saveEvent() {
    if (!editE?.title || !editE.event_date) return;
    setSaving(true);
    try {
      await planPost("event_save", {
        id: editE.id,
        title: editE.title,
        kind: editE.kind || "event",
        event_date: editE.event_date,
        all_day: editE.all_day !== false,
        start_ts: editE.all_day === false && editE.start_ts ? editE.start_ts : null,
        location: editE.location || null,
        busy: editE.busy !== false,
        source: "manual",
      });
      setEditE(null);
      await loadWeek(weekStart);
      refreshSecondary();
    } catch (e) { setGenErr((e as Error).message); }
    finally { setSaving(false); }
  }
  async function deleteEvent(id: string) {
    setSaving(true);
    try { await planPost("event_delete", { id }); setEditE(null); await loadWeek(weekStart); refreshSecondary(); }
    catch (e) { setGenErr((e as Error).message); }
    finally { setSaving(false); }
  }
  function refreshSecondary() {
    if (view === "month") loadMonth(monthAnchor);
    if (view === "agenda") loadAgenda();
    setHistory(null);
  }

  /* ---- derived ---- */
  const sessions = week?.sessions ?? [];
  const realSessions = useMemo(() => sessions.filter((s) => !s.is_rest_day), [sessions]);
  const doneCount = realSessions.filter((s) => s.completed).length;
  const uncommittedRecs = sessions.filter((s) => s.source === "ai" && !s.committed && !s.completed);
  const lowReadiness = week?.context.readiness != null && week.context.readiness < 50;
  const hasHardOpen = sessions.some(
    (s) => !s.completed && !s.skipped && ["hard", "moderate"].includes((s.intensity || "").toLowerCase()),
  );

  /* ───────────────────────── render ───────────────────────── */
  return (
    <div className="sched">
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />
      <Screen title="Schedule" back="/more" error={view === "plan" || view === "week" ? weekErr : null}
        loading={(view === "plan" || view === "week") && weekLoading && !week}>
        {/* view switcher */}
        <div className="seg seg-sm sched-views">
          {([["plan", "AI Coach Plan"], ["week", "Week"], ["month", "Month"], ["history", "History"], ["agenda", "Schedule"]] as [View, string][]).map(
            ([v, label]) => (
              <button key={v} className={`seg-opt ${view === v ? "active" : ""}`} onClick={() => setView(v)}>{label}</button>
            ),
          )}
        </div>

        {view === "plan" && week && renderPlan()}
        {view === "week" && week && renderWeek()}
        {view === "month" && renderMonth()}
        {view === "history" && renderHistory()}
        {view === "agenda" && renderAgenda()}
      </Screen>

      {editS && renderSessionSheet()}
      {editE && renderEventSheet()}
    </div>
  );

  /* ───────────────────────── PLAN view (point 8 + guardrails + swap) ───────────────────────── */
  function renderPlan() {
    if (!week) return null;
    const c = week.context;
    return (
      <>
        {weekNav()}

        {/* ACWR / ramp guardrail (upgrade 3) */}
        {c.flag && c.flag_msg && (
          <div className={`guard ${c.flag}`}>
            <span className="gi">{c.flag === "detrain" ? "🌱" : "⚠️"}</span>
            <span>{c.flag_msg}</span>
          </div>
        )}

        {/* readiness-driven swap nudge (upgrade 2) */}
        {isCurrentWeek && lowReadiness && hasHardOpen && (
          <div className="swap">
            <b>Readiness is {week.context.readiness}{week.context.readiness_label ? ` · ${week.context.readiness_label}` : ""}.</b>{" "}
            That&apos;s on the low side for a hard session. Regenerate re-plans the open days as easier work and leaves anything you&apos;ve committed or completed untouched.
          </div>
        )}

        {/* week summary */}
        <section className="card">
          <div className="lever-top">
            <span><strong>This week</strong> <span className="subtle tiny">· {doneCount}/{realSessions.length} done</span></span>
            <span className="subtle tiny">
              {c.readiness != null ? `Readiness ${c.readiness}` : ""}
              {c.acwr != null ? ` · ACWR ${c.acwr.toFixed(2)}` : ""}
            </span>
          </div>
          {week.week_focus && <div className="subtle tiny mt8">🎯 {week.week_focus}</div>}
        </section>

        {/* sessions */}
        {sessions.length === 0 ? (
          <section className="card empty">
            <div className="e-emoji">🗓️</div>
            <div style={{ fontWeight: 600, margin: "6px 0 4px" }}>No plan for this week yet</div>
            <div className="subtle tiny">Generate a 7-day microcycle tuned to your race phase, current load (ACWR), and readiness.</div>
          </section>
        ) : (
          sessions.map((s) => sessionRow(s, true))
        )}

        {/* commit-all (clean re-commit, upgrade 4) */}
        {uncommittedRecs.length > 0 && (
          <button className="btn" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }} onClick={commitAll}>
            📌 Push all {uncommittedRecs.length} to my calendar
          </button>
        )}

        <div className="fab-row">
          <button className="btn" onClick={generate} disabled={busy} style={{ background: busy ? "var(--card2)" : "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}>
            {busy ? "Building your week…" : sessions.length ? "↻ Regenerate open days" : "✨ Generate this week"}
          </button>
          <button className="btn btn-ghost" style={{ flex: "0 0 auto", width: "auto", padding: "13px 16px" }}
            onClick={() => setEditS({ session_date: isCurrentWeek ? today : weekStart, session_type: "Run", intensity: "easy" })}>
            ＋ Add
          </button>
        </div>
        {genErr && <div className="subtle tiny center" style={{ color: "var(--pk-rose)", marginTop: 8 }}>{genErr}</div>}
        <div className="subtle tiny center" style={{ marginTop: 10 }}>
          Committed and completed sessions stay put when you regenerate — the coach only re-plans the open days around them.
        </div>
      </>
    );
  }

  /* ───────────────────────── WEEK view (day-by-day, with events) ───────────────────────── */
  function renderWeek() {
    if (!week) return null;
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return (
      <>
        {weekNav()}
        {days.map((d) => {
          const daySessions = sessions.filter((s) => s.session_date === d);
          const dayEvents = (week.events || []).filter((e) => (e.event_date || "").slice(0, 10) === d);
          const isToday = d === today;
          return (
            <section key={d} className="card" style={{ padding: "12px 14px", borderLeft: isToday ? "3px solid var(--accent)" : undefined }}>
              <div className="lever-top" style={{ marginBottom: daySessions.length || dayEvents.length ? 10 : 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {fmtWeekday(d)} <span className="subtle tiny" style={{ fontWeight: 500 }}>{fmtDM(d)}</span>
                  {isToday && <span className="committed-pill" style={{ marginLeft: 8 }}>Today</span>}
                </span>
                <button className="btn-add" onClick={() => setEditS({ session_date: d, session_type: "Run", intensity: "easy" })}>＋ session</button>
              </div>
              <div className="list">
                {dayEvents.map((e) => eventRow(e))}
                {daySessions.map((s) => sessionRow(s, false))}
                {daySessions.length === 0 && dayEvents.length === 0 && (
                  <div className="subtle tiny" style={{ padding: "2px 0" }}>Open day</div>
                )}
              </div>
            </section>
          );
        })}
        <button className="btn btn-ghost" onClick={() => setEditE({ event_date: today, kind: "travel", all_day: true, busy: true })}>
          ✈️ Add travel / race / social event
        </button>
      </>
    );
  }

  /* ───────────────────────── MONTH view (Google-style grid, point 5) ───────────────────────── */
  function renderMonth() {
    const gridStart = mondayOf(monthAnchor);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const inMonth = (d: string) => d.slice(0, 7) === monthAnchor.slice(0, 7);
    const sByDay = new Map<string, Session[]>();
    const eByDay = new Map<string, EventItem[]>();
    for (const s of range?.sessions || []) { const k = s.session_date; if (!sByDay.has(k)) sByDay.set(k, []); sByDay.get(k)!.push(s); }
    for (const e of range?.events || []) { const k = (e.event_date || "").slice(0, 10); if (!k) continue; if (!eByDay.has(k)) eByDay.set(k, []); eByDay.get(k)!.push(e); }

    const sel = selDay;
    const selS = sel ? sByDay.get(sel) || [] : [];
    const selE = sel ? eByDay.get(sel) || [] : [];

    return (
      <>
        <div className="sched-nav">
          <button className="navbtn" aria-label="Previous month" onClick={() => { setMonthAnchor(monthFirst(addDays(monthAnchor, -1))); setSelDay(null); }}>‹</button>
          <div className="navtitle">{monthLabel(monthAnchor)}</div>
          <button className="navbtn" aria-label="Next month" onClick={() => { setMonthAnchor(monthFirst(addDays(monthFirst(monthAnchor), 32))); setSelDay(null); }}>›</button>
        </div>
        <section className="card cal">
          <div className="cal-grid cal-dow">{DOW.map((d) => <div key={d} className="cal-dowc">{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d) => {
              const has = (sByDay.get(d)?.length || 0) + (eByDay.get(d)?.length || 0) > 0;
              const dim = !inMonth(d);
              const cls = ["cal-cell", has ? "has" : "", d === today ? "today" : "", d === sel ? "sel" : ""].filter(Boolean).join(" ");
              return (
                <button key={d} className={cls} style={{ opacity: dim ? 0.32 : 1 }} onClick={() => has || inMonth(d) ? setSelDay(d) : undefined}>
                  {parseInt(d.slice(8), 10)}
                  {has && <span className="cal-dot" />}
                </button>
              );
            })}
          </div>
        </section>

        {sel && (
          <section className="card">
            <div className="lever-top" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{fmtWeekday(sel)}, {fmtDM(sel)}</strong>
              <button className="btn-add" onClick={() => setEditS({ session_date: sel, session_type: "Run", intensity: "easy" })}>＋ session</button>
            </div>
            <div className="list">
              {selE.map((e) => eventRow(e))}
              {selS.map((s) => sessionRow(s, false))}
              {selS.length === 0 && selE.length === 0 && <div className="subtle tiny">Nothing scheduled.</div>}
            </div>
          </section>
        )}
        {!sel && <div className="subtle tiny center" style={{ marginTop: 4 }}>Tap a day to see its sessions and events.</div>}
      </>
    );
  }

  /* ───────────────────────── HISTORY view (point 6) ───────────────────────── */
  function renderHistory() {
    if (!history) return <div className="subtle center pad">Loading history…</div>;
    const w = history.windows[histWin];
    const maxMin = Math.max(1, ...history.weeks.map((x) => x.planned));
    return (
      <>
        <div className="seg seg-sm range-seg" style={{ width: "max-content" }}>
          {([["week", "This week"], ["d15", "15 days"], ["d30", "30 days"]] as ["week" | "d15" | "d30", string][]).map(([k, l]) => (
            <button key={k} className={`range-opt ${histWin === k ? "active" : ""}`} onClick={() => setHistWin(k)}>{l}</button>
          ))}
        </div>

        <section className="card">
          <div className="histbig">
            <span className="n">{w.completed}</span><span className="of">/ {w.planned} sessions</span>
            {w.pct != null && <span className="committed-pill" style={{ marginLeft: "auto" }}>{w.pct}% done</span>}
          </div>
          <div className="subtle tiny mt8">{w.completed_min} of {w.planned_min} planned minutes completed.</div>
          <div className="streaks">
            <div className="stk"><div className="v" style={{ color: "var(--pk-green)" }}>{history.current_streak}🔥</div><div className="l">Current streak</div></div>
            <div className="stk"><div className="v">{history.best_streak}</div><div className="l">Best streak</div></div>
          </div>
        </section>

        <section className="card">
          <div className="mini-head" style={{ marginBottom: 12 }}>Planned vs completed · last {history.weeks.length} weeks</div>
          {history.weeks.length === 0 ? (
            <div className="subtle tiny">No completed weeks yet.</div>
          ) : (
            <>
              <div className="barchart">
                {history.weeks.map((x) => (
                  <div key={x.week} className="barcol" title={`${fmtDM(x.week)} · ${x.completed}/${x.planned} min`}>
                    <div style={{ width: "72%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative" }}>
                      <div className="bar" style={{ height: `${(x.planned / maxMin) * 100}%`, background: "var(--card2)", border: "1px solid var(--line)", position: "absolute", inset: "auto 0 0 0" }} />
                      <div className="bar" style={{ height: `${(x.completed / maxMin) * 100}%`, background: "var(--pk-green)", position: "relative" }} />
                    </div>
                    <span className="subtle tiny barlbl" style={{ marginTop: 4 }}>{fmtDM(x.week).split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="legend" style={{ marginTop: 10 }}>
                <span><i style={{ background: "var(--pk-green)" }} /> Completed</span>
                <span><i style={{ background: "var(--card2)", border: "1px solid var(--line)" }} /> Planned</span>
              </div>
            </>
          )}
        </section>
      </>
    );
  }

  /* ───────────────────────── SCHEDULE / agenda view (point 9) ───────────────────────── */
  function renderAgenda() {
    if (!agenda) return <div className="subtle center pad">Loading…</div>;
    type Row = { date: string; s: Session[]; e: EventItem[] };
    const byDate = new Map<string, Row>();
    for (const s of agenda.sessions) { const k = s.session_date; if (!byDate.has(k)) byDate.set(k, { date: k, s: [], e: [] }); byDate.get(k)!.s.push(s); }
    for (const e of agenda.events) { const k = (e.event_date || "").slice(0, 10); if (!k) continue; if (!byDate.has(k)) byDate.set(k, { date: k, s: [], e: [] }); byDate.get(k)!.e.push(e); }
    const rows = [...byDate.values()].filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));

    return (
      <>
        <div className="fab-row" style={{ marginTop: 0 }}>
          <button className="btn" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }}
            onClick={() => setEditS({ session_date: today, session_type: "Run", intensity: "easy" })}>＋ Activity</button>
          <button className="btn btn-ghost" onClick={() => setEditE({ event_date: today, kind: "travel", all_day: true, busy: true })}>✈️ Event</button>
        </div>
        {rows.length === 0 ? (
          <section className="card empty"><div className="e-emoji">📭</div>
            <div style={{ fontWeight: 600, margin: "6px 0 4px" }}>Nothing coming up</div>
            <div className="subtle tiny">Add an activity or event, or generate a plan from the AI Coach Plan tab.</div>
          </section>
        ) : (
          rows.map((r) => (
            <section key={r.date} className="card" style={{ padding: "12px 14px", borderLeft: r.date === today ? "3px solid var(--accent)" : undefined }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                {r.date === today ? "Today" : fmtWeekday(r.date)} <span className="subtle tiny" style={{ fontWeight: 500 }}>· {fmtDM(r.date)}</span>
              </div>
              <div className="list">
                {r.e.map((e) => eventRow(e))}
                {r.s.map((s) => sessionRow(s, false))}
              </div>
            </section>
          ))
        )}
      </>
    );
  }

  /* ───────────────────────── shared rows ───────────────────────── */
  function weekNav() {
    return (
      <div className="sched-nav">
        <button className="navbtn" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
        <div className="navtitle">
          {isCurrentWeek ? "This week" : "Week of"}
          <span className="sub">{fmtRangeLabel(weekStart)}{!isCurrentWeek && <button onClick={() => setWeekStart(mondayOf(today))} style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", fontWeight: 700, marginLeft: 8 }}>Today</button>}</span>
        </div>
        <button className="navbtn" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
      </div>
    );
  }

  function sessionRow(s: Session, showCommit: boolean) {
    const struck = s.skipped;
    const a = s.actual;
    return (
      <section key={s.id} className={`card srow ${s.completed ? "done-card" : ""} ${s.skipped ? "removed-card" : ""}`}
        style={{ borderLeft: s.session_date === today ? "3px solid var(--accent)" : undefined }}>
        <div className="sd">
          <div className="wd">{fmtWeekday(s.session_date)}</div>
          <div className="dm">{fmtDM(s.session_date)}</div>
        </div>
        <div className="sic">{s.completed ? "🎉" : (ICON[s.session_type] || "•")}</div>
        <div className="smain">
          <div className={`st ${struck ? "struck" : ""}`}>
            <span>{s.session_type}</span>
            {!s.is_rest_day && s.planned_duration > 0 && <span className="subtle" style={{ fontWeight: 500 }}>· {s.planned_duration}m</span>}
            {s.distance_m ? <span className="subtle" style={{ fontWeight: 500 }}>· {km(s.distance_m)}</span> : null}
            {s.start_time && <span className="subtle tiny" style={{ fontWeight: 500 }}>· {fmtTime(s.start_time)}</span>}
            {s.intensity && <span className={`pill ${intensityClass(s.intensity)}`}>{s.intensity}</span>}
            {s.focus && <span className="chip fo-med">{s.focus}</span>}
            {s.committed && !s.completed && <span className="chip st-prog">committed</span>}
          </div>
          {s.activity && <div className={`smeta ${struck ? "struck" : ""}`}>{s.activity}</div>}
          {s.completed && a?.matched && (
            <div className="actual">
              ✅ Actual {a.actual_min ?? "–"}m{a.min_delta != null ? ` (${a.min_delta >= 0 ? "+" : ""}${a.min_delta} vs plan)` : ""}
              {a.actual_distance_m ? ` · ${km(a.actual_distance_m)}` : ""}
              {a.avg_hr ? ` · avg HR ${a.avg_hr}` : ""}
              {a.training_effect ? ` · TE ${Number(a.training_effect).toFixed(1)}` : ""}
            </div>
          )}
        </div>
        {!s.is_rest_day && (
          <div className="sact">
            <button className={`iconbtn ${s.completed ? "done" : ""}`} aria-label={s.completed ? "Mark not done" : "Mark done"} onClick={() => complete(s.id)}>{s.completed ? "✓" : "○"}</button>
            {showCommit && !s.committed && !s.completed && s.source === "ai" ? (
              <button className="commitbtn" onClick={() => commitOne(s.id)}>Push 📌</button>
            ) : (
              <button className="iconbtn" aria-label="Edit" onClick={() => setEditS({ ...s })}>✎</button>
            )}
            {!s.completed && (
              <button className="iconbtn" aria-label={s.skipped ? "Un-skip" : "Skip"} title={s.skipped ? "Un-skip" : "Skip"} onClick={() => skip(s.id)}>⤫</button>
            )}
          </div>
        )}
      </section>
    );
  }

  function eventRow(e: EventItem) {
    return (
      <section key={e.id} className="card ev" style={{ background: "var(--card2)" }}>
        <span className="evic">{KIND_ICON[e.kind] || "📌"}</span>
        <div className="evmain">
          <div className="evt">{e.title}</div>
          <div className="evm">
            {eventTime(e)}
            {e.location ? ` · ${e.location}` : ""}
            {e.source === "gcal" ? " · Google Calendar" : ""}
            {!e.busy ? " · free" : ""}
          </div>
        </div>
        <span className="evtag">{e.kind}</span>
        {e.source === "manual" && (
          <button className="iconbtn" aria-label="Edit event" onClick={() => setEditE({ ...e })}>✎</button>
        )}
      </section>
    );
  }

  /* ───────────────────────── editor sheets ───────────────────────── */
  function renderSessionSheet() {
    if (!editS) return null;
    const s = editS;
    const set = (p: Partial<Session>) => setEditS({ ...s, ...p });
    return (
      <div className="sheet-back" onClick={() => setEditS(null)}>
        <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
          <h3>{s.id ? "Edit activity" : "Add activity"}</h3>
          <div className="sheet-sub">It&apos;s added to your calendar (committed) so a regenerate won&apos;t move it.</div>

          <label className="fl">Type</label>
          <div className="type-row">
            {TYPES.map((t) => (
              <button key={t} className={`type-btn ${s.session_type === t ? "active" : ""}`}
                onClick={() => set({ session_type: t, is_rest_day: t === "Rest" })}>
                <span style={{ fontSize: 18 }}>{ICON[t]}</span><span className="type-cap">{t}</span>
              </button>
            ))}
          </div>

          <label className="fl">What you&apos;ll do</label>
          <input className="g-input" placeholder="e.g. 6×800m at threshold, 2:30 jog" value={s.activity || ""} onChange={(e) => set({ activity: e.target.value })} />

          <div className="two">
            <div><label className="fl">Date</label><input className="g-input" type="date" value={s.session_date || ""} onChange={(e) => set({ session_date: e.target.value })} /></div>
            <div><label className="fl">Start time</label><input className="g-input" type="time" value={(s.start_time || "").slice(0, 5)} onChange={(e) => set({ start_time: e.target.value || null })} /></div>
          </div>

          {s.session_type !== "Rest" && (
            <>
              <div className="two">
                <div><label className="fl">Duration (min)</label><input className="g-input" type="number" inputMode="numeric" value={s.planned_duration ?? ""} onChange={(e) => set({ planned_duration: e.target.value ? parseInt(e.target.value, 10) : 0 })} /></div>
                <div><label className="fl">Distance (km)</label><input className="g-input" type="number" inputMode="decimal" step="0.1" value={s.distance_m != null ? s.distance_m / 1000 : ""} onChange={(e) => set({ distance_m: e.target.value ? Math.round(parseFloat(e.target.value) * 1000) : null })} /></div>
              </div>
              <label className="fl">Intensity</label>
              <div className="seg seg-sm">
                {["easy", "moderate", "hard"].map((i) => (
                  <button key={i} className={`seg-opt ${s.intensity === i ? "active" : ""}`} onClick={() => set({ intensity: i })}>{i}</button>
                ))}
              </div>
              <label className="fl">Focus (optional)</label>
              <input className="g-input" placeholder="e.g. threshold, zone 2, technique" value={s.focus || ""} onChange={(e) => set({ focus: e.target.value })} />
            </>
          )}

          <button className="btn" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }} disabled={saving || !s.session_date || !s.session_type} onClick={saveSession}>
            {saving ? "Saving…" : s.id ? "Save changes" : "Add to calendar"}
          </button>
          {s.id && <button className="btn btn-danger" disabled={saving} onClick={() => deleteSession(s.id as string)}>Delete session</button>}
          <button className="btn btn-ghost" onClick={() => setEditS(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  function renderEventSheet() {
    if (!editE) return null;
    const e = editE;
    const set = (p: Partial<EventItem>) => setEditE({ ...e, ...p });
    return (
      <div className="sheet-back" onClick={() => setEditE(null)}>
        <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
          <h3>{e.id ? "Edit event" : "Add event"}</h3>
          <div className="sheet-sub">Travel, races, and social plans give the coach busy/travel context when it plans your week.</div>

          <label className="fl">Kind</label>
          <div className="type-row">
            {KINDS.map((k) => (
              <button key={k} className={`type-btn ${e.kind === k ? "active" : ""}`} onClick={() => set({ kind: k })}>
                <span style={{ fontSize: 18 }}>{KIND_ICON[k]}</span><span className="type-cap">{k}</span>
              </button>
            ))}
          </div>

          <label className="fl">Title</label>
          <input className="g-input" placeholder="e.g. Flight to Phuket / Malnad Ultra" value={e.title || ""} onChange={(ev) => set({ title: ev.target.value })} />

          <div className="two">
            <div><label className="fl">Date</label><input className="g-input" type="date" value={(e.event_date || "").slice(0, 10)} onChange={(ev) => set({ event_date: ev.target.value })} /></div>
            <div><label className="fl">Start time</label><input className="g-input" type="time" disabled={e.all_day !== false}
              value={e.start_ts ? new Date(e.start_ts).toISOString().slice(11, 16) : ""}
              onChange={(ev) => set({ start_ts: ev.target.value && e.event_date ? `${e.event_date}T${ev.target.value}:00Z` : null })} /></div>
          </div>

          <label className="seg seg-sm" style={{ marginTop: 12, display: "flex" }}>
            <button className={`seg-opt ${e.all_day !== false ? "active" : ""}`} onClick={() => set({ all_day: true })}>All day</button>
            <button className={`seg-opt ${e.all_day === false ? "active" : ""}`} onClick={() => set({ all_day: false })}>Timed</button>
          </label>
          <label className="seg seg-sm" style={{ marginTop: 10, display: "flex" }}>
            <button className={`seg-opt ${e.busy !== false ? "active" : ""}`} onClick={() => set({ busy: true })}>Busy</button>
            <button className={`seg-opt ${e.busy === false ? "active" : ""}`} onClick={() => set({ busy: false })}>Free</button>
          </label>

          <label className="fl">Location (optional)</label>
          <input className="g-input" placeholder="e.g. Phuket" value={e.location || ""} onChange={(ev) => set({ location: ev.target.value })} />

          <button className="btn" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }} disabled={saving || !e.title || !e.event_date} onClick={saveEvent}>
            {saving ? "Saving…" : e.id ? "Save changes" : "Add event"}
          </button>
          {e.id && <button className="btn btn-danger" disabled={saving} onClick={() => deleteEvent(e.id as string)}>Delete event</button>}
          <button className="btn btn-ghost" onClick={() => setEditE(null)}>Cancel</button>
        </div>
      </div>
    );
  }
}
