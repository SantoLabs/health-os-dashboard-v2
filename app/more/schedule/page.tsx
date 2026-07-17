"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { planWeek, planRange, planPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

/* ════════════════════ backend types (health-plan v4) ════════════════════ */
type Actual = {
  plan_id: string; actual_min: number | null; actual_distance_m: number | null;
  avg_hr: number | null; max_hr: number | null; training_effect: number | null;
  min_delta: number | null; hr_zones: unknown; matched: boolean;
};
type Session = {
  id: string; session_date: string; session_type: string; activity: string;
  planned_duration: number; completed: boolean; skipped: boolean; committed: boolean;
  is_rest_day: boolean; start_time: string | null; intensity: string | null;
  focus: string | null; distance_m: number | null; notes: string | null; source: string;
  dow?: number; actual?: Actual | null;
};
type EventItem = {
  id: string; source: string; title: string; kind: string;
  start_ts: string | null; end_ts: string | null; event_date: string | null;
  all_day: boolean; location: string | null; busy: boolean; dow?: number | null;
};
type Ctx = {
  readiness: number | null; readiness_label: string | null; acwr: number | null;
  acwr_interpretation: string | null; planned_load_min: number; last_week_load_min: number;
  ramp: number | null; flag: string | null; flag_msg: string | null;
};
type WeekResp = { week_start: string; today: string; sessions: Session[]; plan: Session[]; events: EventItem[]; context: Ctx; week_focus?: string };
type RangeResp = { from: string; to: string; today: string; sessions: Session[]; events: EventItem[] };
type Win = { planned: number; completed: number; pct: number | null; planned_min: number; completed_min: number };
type HistoryResp = { windows: { week: Win; d15: Win; d30: Win }; current_streak: number; best_streak: number; weeks: { week: string; planned: number; completed: number }[] };

/* ════════════════════ design tokens (from the prototype) ════════════════════ */
const A = "var(--ember)";                       // accent / brand
const CARD = "var(--surface)", CARD2 = "var(--surface-2)", CHIPBG = "var(--surface-3)";
const T1 = "var(--text)", T2 = "var(--text-2)", T3 = "var(--muted)", T4 = "var(--faint)";
const INT: Record<string, string> = { easy: "var(--success)", moderate: "var(--gold)", hard: "var(--danger)" };
const EFFORTS = ["Easy", "Aerobic", "Tempo", "Threshold", "Intervals", "Drills"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type TKey = "run" | "swim" | "strength" | "hiit" | "cycle" | "yoga" | "walk" | "rest" | "travel" | "race" | "social" | "meeting" | "custom";
const T: Record<TKey, { label: string; emoji: string; color: string; cat: string }> = {
  run: { label: "Run", emoji: "🏃", color: "#34D399", cat: "workout" },
  swim: { label: "Swim", emoji: "🏊", color: "#38BDF8", cat: "workout" },
  strength: { label: "Strength", emoji: "🏋️", color: "#FBBF24", cat: "workout" },
  hiit: { label: "HIIT", emoji: "🔥", color: "#FB7185", cat: "workout" },
  cycle: { label: "Cycle", emoji: "🚴", color: "#A78BFA", cat: "workout" },
  yoga: { label: "Yoga", emoji: "🧘", color: "#F0ABFC", cat: "workout" },
  walk: { label: "Walk", emoji: "🚶", color: "#2DD4BF", cat: "workout" },
  rest: { label: "Rest", emoji: "😴", color: "#94A3B8", cat: "rest" },
  travel: { label: "Travel", emoji: "✈️", color: "#93C5FD", cat: "travel" },
  race: { label: "Race", emoji: "🏅", color: "#FACC15", cat: "race" },
  social: { label: "Social", emoji: "🍻", color: "#F472B6", cat: "social" },
  meeting: { label: "Event", emoji: "📅", color: "#6E7C96", cat: "meeting" },
  custom: { label: "Custom", emoji: "✨", color: "#C4B5FD", cat: "workout" },
};
const PICK_TYPES: TKey[] = ["run", "swim", "strength", "hiit", "cycle", "yoga", "walk", "rest", "travel", "race", "social", "custom"];

function normType(s: string): TKey {
  const k = (s || "").toLowerCase().replace(/[^a-z]/g, "");
  if (k in T) return k as TKey;
  if (k === "mobility" || k === "stretch") return "yoga";
  if (k === "crosstrain" || k === "bike" || k === "ride" || k === "cycling") return "cycle";
  if (k === "rundrills" || k.startsWith("run")) return "run";
  if (k.startsWith("swim")) return "swim";
  if (k.startsWith("strength") || k === "gym" || k === "lift") return "strength";
  return "custom";
}

/* ════════════════════ date / fmt helpers ════════════════════ */
function pad(n: number) { return String(n).padStart(2, "0"); }
function istNow() { return new Date(Date.now() + 5.5 * 3600 * 1000); }
function todayISO() { return istNow().toISOString().split("T")[0]; }
function parse(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function iso(dt: Date) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }
function addDays(s: string, n: number) { const dt = parse(s); dt.setDate(dt.getDate() + n); return iso(dt); }
function dowMon(s: string) { return (parse(s).getDay() + 6) % 7; }
function monOf(s: string) { return addDays(s, -dowMon(s)); }
function sunOf(s: string) { return addDays(s, -parse(s).getDay()); }
function num(s: string) { return parse(s).getDate(); }
const MON_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_L = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monShort(s: string) { return MON_S[parse(s).getMonth()]; }
function cmp(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function hexA(h: string, a: number) { h = h.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }
function fmtT(h: number, m: number) { return pad(h) + ":" + pad(m || 0); }                  // 24h (prototype default)
function fmtHour(h: number) { return pad(h) + ":00"; }
function km(m: number | null | undefined) { return m ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + " km" : ""; }

/* ════════════════════ unified item model ════════════════════ */
type Status = "planned" | "done" | "skipped";
type Item = {
  id: string; kind: "session" | "event"; tkey: TKey; title: string; date: string;
  hour: number | null; min: number; dur: number; intensity: string | null; effort: string | null;
  dist: number | null; status: Status; committed: boolean; source: string; cat: string;
  allDay: boolean; actual: Actual | null; session: Session | null; event: EventItem | null;
};

function timeFromTs(ts: string | null): { hour: number | null; min: number } {
  if (!ts) return { hour: null, min: 0 };
  const d = new Date(ts);
  return { hour: d.getHours(), min: d.getMinutes() };
}
function timeFromStr(s: string | null): { hour: number | null; min: number } {
  if (!s) return { hour: null, min: 0 };
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? { hour: parseInt(m[1], 10), min: parseInt(m[2], 10) } : { hour: null, min: 0 };
}
function sessionToItem(s: Session): Item {
  const tkey = s.is_rest_day ? "rest" : normType(s.session_type);
  const t = timeFromStr(s.start_time);
  return {
    id: s.id, kind: "session", tkey, title: s.activity || T[tkey].label, date: s.session_date,
    hour: t.hour, min: t.min, dur: s.planned_duration || 0, intensity: s.intensity, effort: s.focus,
    dist: s.distance_m, status: s.completed ? "done" : s.skipped ? "skipped" : "planned",
    committed: s.committed, source: s.source, cat: T[tkey].cat, allDay: false, actual: s.actual ?? null,
    session: s, event: null,
  };
}
function eventToItem(e: EventItem): Item {
  const k = (e.kind || "").toLowerCase();
  const tkey: TKey = e.source === "gcal" ? "meeting" : (k === "travel" || k === "race" || k === "social") ? (k as TKey) : "meeting";
  const t = timeFromTs(e.start_ts);
  let dur = 60;
  if (e.start_ts && e.end_ts) dur = Math.max(15, Math.round((Date.parse(e.end_ts) - Date.parse(e.start_ts)) / 60000));
  return {
    id: e.id, kind: "event", tkey, title: e.title || T[tkey].label, date: (e.event_date || "").slice(0, 10),
    hour: e.all_day ? null : t.hour, min: t.min, dur, intensity: null, effort: null, dist: null,
    status: "planned", committed: true, source: e.source, cat: e.source === "gcal" ? "meeting" : T[tkey].cat,
    allDay: e.all_day, actual: null, session: null, event: e,
  };
}

/* Only sessions the user has sent to the calendar (committed) or already completed show in
   the Week/Month/Schedule views. Uncommitted sessions (e.g. a Kai plan not yet sent) are hidden here.
   Calendar events (Google sync, manual travel/race/social) are always real, so always shown. */
function onCalendar(it: Item) { return it.kind === "event" || it.committed || it.status === "done"; }

/* ════════════════════ tiny style helpers ════════════════════ */
const SS: Record<string, React.CSSProperties> = {
  card: { background: CARD, border: "1px solid var(--line)", borderRadius: 16, padding: 14, marginBottom: 12 },
  navBtn: { background: CHIPBG, border: "1px solid var(--line)", color: T2, width: 34, height: 34, borderRadius: 9, fontSize: 17, lineHeight: 1, cursor: "pointer", flex: "none" },
  iconAct: { background: CARD2, border: "1px solid var(--line)", color: T2, width: 36, height: 36, borderRadius: 11, fontSize: 16, cursor: "pointer", display: "grid", placeItems: "center", flex: "none" },
};
function chipStyle(active: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return { padding: "9px 12px", borderRadius: 10, border: "1px solid " + (active ? "transparent" : "var(--line)"), background: active ? A : CHIPBG, color: active ? "#fff" : T2, font: "600 12px 'Plus Jakarta Sans',sans-serif", cursor: "pointer", flex: "none", ...extra };
}

const SCOPED_CSS = `
.schd{color:${T1};}
.schd *{box-sizing:border-box;}
.schd .hscroll{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.schd .hscroll::-webkit-scrollbar{display:none;}
.schd input{font-family:inherit;}
.schd-grid-scroll{overflow:auto;-webkit-overflow-scrolling:touch;}
.schd-grid-scroll::-webkit-scrollbar{height:6px;width:6px;}
.schd-grid-scroll::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:3px;}
@keyframes schd-in{from{transform:translateY(16px);opacity:.6}to{transform:translateY(0);opacity:1}}
@media (prefers-reduced-motion: reduce){.schd-sheet{animation:none!important;}}
`;

/* ════════════════════ component ════════════════════ */
type View = "week" | "month" | "schedule";
type Sheet = null | "form";
type Draft = Partial<Session> & { tkey?: TKey; end_time?: string | null };

export default function SchedulePage() {
  const today = todayISO();
  const [view, setView] = useState<View>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selDate, setSelDate] = useState(today);

  const [week, setWeek] = useState<WeekResp | null>(null);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<RangeResp | null>(null);
  const [agenda, setAgenda] = useState<RangeResp | null>(null);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const weekMon = addDays(monOf(today), weekOffset * 7);

  const showToast = useCallback((t: string) => { setToast(t); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast]);

  // Deep-link: ?date=YYYY-MM-DD (e.g. from the Progress → Summary calendar) lands on that week + day.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qd = new URLSearchParams(window.location.search).get("date");
    if (qd && qd.length === 10 && qd[4] === "-" && qd[7] === "-" && !Number.isNaN(Date.parse(qd + "T00:00:00"))) {
      setWeekOffset(Math.round((parse(monOf(qd)).getTime() - parse(monOf(today)).getTime()) / 604800000));
      setSelDate(qd);
      setView("week");
    }
  }, [today]);

  /* ---- loaders ---- */
  const loadWeek = useCallback(async (ws: string) => {
    setWeekErr(null);
    try { setWeek(await planWeek<WeekResp>(ws)); } catch (e) { setWeekErr((e as Error).message); }
  }, []);
  useEffect(() => { loadWeek(weekMon); }, [weekMon, loadWeek]);

  const loadMonth = useCallback(async (anchorMonthOffset: number) => {
    const base = new Date(2000, 0, 1); base.setFullYear(parse(today).getFullYear(), parse(today).getMonth() + anchorMonthOffset, 1);
    const first = iso(new Date(base.getFullYear(), base.getMonth(), 1));
    const gridStart = monOf(first);
    try { setMonthData(await planRange<RangeResp>(gridStart, addDays(gridStart, 41))); } catch { /* inline */ }
  }, [today]);
  useEffect(() => { if (view === "month") loadMonth(monthOffset); }, [view, monthOffset, loadMonth]);

  const loadAgenda = useCallback(async () => {
    const from = sunOf(addDays(today, -7));
    try { setAgenda(await planRange<RangeResp>(from, addDays(today, 45))); } catch { /* inline */ }
  }, [today]);
  useEffect(() => { if (view === "schedule" && !agenda) loadAgenda(); }, [view, agenda, loadAgenda]);


  const refreshAll = useCallback(() => {
    loadWeek(weekMon);
    if (view === "month") loadMonth(monthOffset);
    if (view === "schedule") loadAgenda();
  }, [loadWeek, weekMon, view, loadMonth, monthOffset, loadAgenda]);

  /* ---- actions ---- */
  async function act(action: string, body: Record<string, unknown>, ws = weekMon) {
    try { const r = await planPost<WeekResp>(action, body, ws); if (r && (r as WeekResp).sessions) setWeek(r); else loadWeek(weekMon); }
    catch { loadWeek(weekMon); }
    refreshAll();
  }
  const toggleDone = (it: Item) => { act("complete", { id: it.id }); };
  const skipItem = (it: Item) => { act("skip", { id: it.id }); };

  function sessionPayload(s: Session, over: Partial<Session>) {
    return {
      id: s.id, session_date: s.session_date, session_type: s.session_type, activity: s.activity || "",
      planned_duration: s.planned_duration || 0, start_time: s.start_time, intensity: s.intensity,
      focus: s.focus, distance_m: s.distance_m, is_rest_day: s.is_rest_day, notes: s.notes, ...over,
    };
  }


  /* ---- form ---- */
  function openAdd(date = today) { setMode("add"); setDraft({ tkey: "run", session_type: "Run", activity: "", session_date: date, start_time: "07:00", planned_duration: 45, intensity: null, focus: null, distance_m: null }); setSheet("form"); }
  function openEdit(it: Item) {
    if (it.kind === "event") { // manual events editable; gcal read-only
      if (it.source === "gcal") { showToast("Google events are read-only here"); return; }
      const e = it.event!;
      setMode("edit"); setDraft({ id: e.id, tkey: it.tkey, session_type: it.tkey, activity: e.title, session_date: it.date, start_time: e.all_day ? null : fmtT(it.hour ?? 9, it.min), planned_duration: it.dur, intensity: null, focus: null, distance_m: null, notes: "event:" + (e.kind || "event") + (e.all_day ? ":allday" : "") }); setSheet("form"); return;
    }
    const s = it.session!;
    setMode("edit"); setDraft({ ...s, tkey: it.tkey }); setSheet("form");
  }
  function setD(p: Partial<Draft>) { setDraft((d) => d ? { ...d, ...p } : d); }
  function closeSheet() { setSheet(null); setDraft(null); }

  async function saveDraft() {
    if (!draft?.session_date) return;
    setBusy(true);
    const isEvent = typeof draft.notes === "string" && draft.notes.startsWith("event:");
    try {
      if (isEvent) {
        const kind = (draft.notes || "event:event").split(":")[1] || "event";
        const allDay = (draft.notes || "").includes(":allday") || !draft.start_time;
        await planPost("event_save", { id: draft.id, title: draft.activity || T[draft.tkey || "travel"].label, kind, event_date: draft.session_date, all_day: allDay, start_ts: allDay ? null : `${draft.session_date}T${(draft.start_time || "09:00")}:00Z`, end_ts: allDay ? null : `${draft.session_date}T${(draft.end_time || "10:00")}:00Z`, source: "manual", busy: true });
      } else {
        const tkey = draft.tkey || "custom";
        await planPost("session_save", {
          id: draft.id, session_date: draft.session_date, session_type: draft.id ? draft.session_type : T[tkey].label,
          activity: draft.activity || "", planned_duration: draft.planned_duration || 0, start_time: draft.start_time || null,
          intensity: draft.intensity || null, focus: draft.focus || null, distance_m: draft.distance_m ?? null,
          is_rest_day: tkey === "rest", notes: draft.notes || null,
        }, monOf(draft.session_date));
      }
      closeSheet();
      setWeekOffset(Math.round((Date.parse(monOf(draft.session_date)) - Date.parse(monOf(today))) / (7 * 86400000)));
      await loadWeek(monOf(draft.session_date));
      refreshAll();
      showToast((draft.id ? "Updated · " : (draft.activity || T[draft.tkey || "run"].label) + " added · ") + DOW[dowMon(draft.session_date)] + " " + num(draft.session_date));
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  }
  async function deleteDraft() {
    if (!draft?.id) return; setBusy(true);
    const isEvent = typeof draft.notes === "string" && draft.notes.startsWith("event:");
    try { await planPost(isEvent ? "event_delete" : "session_delete", { id: draft.id }, weekMon); closeSheet(); refreshAll(); showToast("Removed from plan"); }
    catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  }
  async function toggleDraftDone() {
    if (!draft?.id) return; await planPost("complete", { id: draft.id }, weekMon);
    setD({ completed: !draft.completed }); refreshAll();
  }
  async function skipDraft() {
    if (!draft?.id) return; await planPost("skip", { id: draft.id }, weekMon); closeSheet(); refreshAll(); showToast(draft.skipped ? "Restored to plan" : "Marked as skipped");
  }


  /* ════════════════════ derived ════════════════════ */
  const wItems = useMemo(() => {
    if (!week) return [] as Item[];
    return [...week.sessions.map(sessionToItem), ...week.events.map(eventToItem)];
  }, [week]);
  const ctx = week?.context;
  const meetingConflict = useCallback((it: Item) => {
    if (it.hour == null) return false;
    const s = it.hour * 60 + it.min, en = s + it.dur;
    return wItems.some((m) => m.cat === "meeting" && m.date === it.date && m.hour != null && s < (m.hour * 60 + m.min + m.dur) && (m.hour * 60 + m.min) < en);
  }, [wItems]);

  /* ════════════════════ render ════════════════════ */
  const tabs: [View, string][] = [["week", "Week"], ["month", "Month"], ["schedule", "Schedule"]];

  return (
    <Screen title="Schedule">
    <div className="schd">
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      {/* view tabs + add */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div className="hscroll" style={{ flex: 1, minWidth: 0 }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={{ padding: "9px 15px", borderRadius: 11, border: "none", cursor: "pointer", font: "700 13px 'Plus Jakarta Sans',sans-serif", flex: "none", ...(view === k ? { background: A, color: "#fff", boxShadow: "0 4px 12px " + "color-mix(in srgb, var(--ember) 40%, transparent)" } : { background: CARD2, color: T3 }) }}>{label}</button>
        ))}
      </div>
        <button style={{ ...SS.iconAct, background: A, border: "none", color: "#fff", flex: "none" }} title="Add activity" onClick={() => openAdd(today)}>＋</button>
      </div>

      {weekErr && <div style={{ ...SS.card, borderColor: "var(--danger)" }}><b>Couldn&apos;t load</b><div style={{ color: T3, fontSize: 12, marginTop: 4 }}>{weekErr}</div></div>}

      {view === "week" && renderWeek()}
      {view === "month" && renderMonth()}
      {view === "schedule" && renderAgenda()}

      {sheet && renderSheet()}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 108, transform: "translateX(-50%)", background: "#222230", color: "#fff", padding: "10px 16px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, zIndex: 1600, boxShadow: "0 8px 24px rgba(0,0,0,.5)", maxWidth: 340, textAlign: "center" }}>{toast}</div>
      )}
    </div>
    </Screen>
  );

  /* ───────────── COACH ───────────── */
  function renderWeek() {
    if (!week) return <Loading />;
    const wDates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekMon, i));
    const unscheduled = wItems.filter((b) => b.date >= wDates[0] && b.date <= wDates[6] && b.kind === "session" && b.hour == null && !b.allDay && b.cat !== "rest" && onCalendar(b));
    const rowItems = (d: string) => wItems.filter((b) => b.date === d && b.cat !== "rest" && onCalendar(b) && !(b.kind === "session" && b.hour == null && !b.allDay)).sort((a, b) => (Number(b.allDay) - Number(a.allDay)) || ((a.hour ?? 99) - (b.hour ?? 99)));
    const weekLabel = weekOffset === 0 ? "This week" : weekOffset < 0 ? Math.abs(weekOffset) + "w ago" : "In " + weekOffset + "w";
    const chipTxt = (c: string) => `color-mix(in srgb, ${c} 68%, var(--text))`;
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button style={SS.navBtn} onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{weekLabel}{weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ background: "none", border: 0, color: A, cursor: "pointer", fontWeight: 700, marginLeft: 8, fontSize: 12 }}>Today</button>}</div>
            <div style={{ fontSize: 11, color: T3 }}>{num(wDates[0])} {monShort(wDates[0])} – {num(wDates[6])} {monShort(wDates[6])}</div>
          </div>
          <button style={SS.navBtn} onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
        </div>

        {unscheduled.length > 0 && (
          <div style={{ ...SS.card, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: T3, marginBottom: 7 }}>Unscheduled — tap to set a time</div>
            <div className="hscroll">
              {unscheduled.map((b) => { const t = T[b.tkey]; return (
                <button key={b.id} onClick={() => openEdit(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", color: chipTxt(t.color), fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t.emoji} {b.title}</button>
              ); })}
            </div>
          </div>
        )}

        <div style={{ ...SS.card, padding: "2px 12px" }}>
          {wDates.map((dt, i) => { const isT = dt === today; const items = rowItems(dt); return (
            <div key={dt} style={{ display: "flex", gap: 10, padding: "10px 0", alignItems: "flex-start", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <div style={{ width: 34, flex: "none", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isT ? A : T3, letterSpacing: ".05em" }}>{DOW[i]}</div>
                <div style={isT ? { width: 26, height: 26, margin: "2px auto 0", borderRadius: 999, background: A, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 } : { fontSize: 15, fontWeight: 700, color: T1, marginTop: 2 }}>{num(dt)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                {items.map((b) => { const t = T[b.tkey]; const done = b.status === "done"; const skip = b.status === "skipped"; const meta = b.dist ? km(b.dist) : b.allDay ? "" : b.hour != null ? fmtT(b.hour, b.min) : ""; return (
                  <button key={b.id} onClick={() => openEdit(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", opacity: skip ? .6 : 1 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: chipTxt(t.color), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: skip ? "line-through" : "none" }}>{done ? "🎉 " : t.emoji + " "}{b.title}</span>
                    {meta && <span style={{ fontSize: 10.5, fontWeight: 600, color: T3, flex: "none" }}>{meta}</span>}
                  </button>
                ); })}
                <button onClick={() => openAdd(dt)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1.5px dashed var(--line-2)", borderRadius: 999, padding: "6px 12px", background: "transparent", cursor: "pointer", font: "inherit" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T3, lineHeight: 1 }}>＋</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: T3 }}>Plan</span>
                </button>
              </div>
            </div>
          ); })}
        </div>
        <div style={{ color: T4, fontSize: 11, textAlign: "center", marginTop: 10 }}>Tap ＋ Plan to add · tap a chip to edit.</div>
      </>
    );
  }

  /* ───────────── MONTH ───────────── */
  function renderMonth() {
    const base = new Date(parse(today).getFullYear(), parse(today).getMonth() + monthOffset, 1);
    const my = base.getFullYear(), mo = base.getMonth();
    const first = iso(new Date(my, mo, 1)); const gridStart = monOf(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const items = (monthData ? [...monthData.sessions.map(sessionToItem), ...monthData.events.map(eventToItem)] : []).filter(onCalendar);
    const byDay = new Map<string, Item[]>();
    items.forEach((x) => { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date)!.push(x); });
    const selItems = (byDay.get(selDate) || []).sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99));
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button style={SS.navBtn} onClick={() => setMonthOffset(monthOffset - 1)}>‹</button>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{MON_L[mo]} {my}</div>
          <button style={SS.navBtn} onClick={() => setMonthOffset(monthOffset + 1)}>›</button>
        </div>
        <div style={{ ...SS.card, padding: "12px 10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
            {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, color: T3 }}>{d[0]}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {cells.map((d) => {
              const evs = (byDay.get(d) || []).sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99));
              const inMonth = d.slice(0, 7) === first.slice(0, 7);
              const isToday = d === today, isSel = d === selDate;
              return (
                <button key={d} onClick={() => setSelDate(d)} style={{ minHeight: 52, borderRadius: 9, padding: "4px 3px 0", overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch", background: isSel ? "color-mix(in srgb, var(--ember) 16%, transparent)" : isToday ? "var(--surface-2)" : "var(--surface-2)", border: isSel ? "1px solid " + "color-mix(in srgb, var(--ember) 60%, transparent)" : isToday ? "1px solid " + "color-mix(in srgb, var(--ember) 45%, transparent)" : "1px solid transparent", opacity: inMonth ? 1 : .4 }}>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? A : T2, textAlign: "center", marginBottom: 1 }}>{num(d)}</div>
                  {evs.slice(0, 2).map((x) => { const c = T[x.tkey].color; const done = x.status === "done", skip = x.status === "skipped"; return (
                    <div key={x.id} style={{ background: hexA(c, .9), color: "#0A0A0F", fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 1, opacity: skip ? .45 : done ? .7 : 1, textDecoration: skip ? "line-through" : "none" }}>{T[x.tkey].emoji} {x.title}</div>
                  ); })}
                  {evs.length > 2 && <div style={{ fontSize: 8, color: T3, textAlign: "center" }}>+{evs.length - 2}</div>}
                </button>
              );
            })}
          </div>
        </div>
        <div style={SS.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>{DOW[dowMon(selDate)]}, {monShort(selDate)} {num(selDate)}</strong>
            <button style={chipStyle(false, { padding: "6px 12px" })} onClick={() => openAdd(selDate)}>＋ activity</button>
          </div>
          {selItems.length === 0 ? <div style={{ color: T3, fontSize: 12 }}>Nothing scheduled.</div> : selItems.map((x) => selDayRow(x))}
        </div>
      </>
    );
  }
  function selDayRow(x: Item) {
    const t = T[x.tkey]; const done = x.status === "done", skip = x.status === "skipped";
    const past = x.date < today; const tag = x.cat === "meeting" ? "event" : x.cat === "rest" ? "rest" : done ? "done" : skip ? "skipped" : past ? "missed" : "planned";
    const tagColors: Record<string, [string, number]> = { done: ["#5f8f63", .14], missed: ["#c4543b", .14], skipped: ["#8a7f73", .16], planned: ["#d96f4e", .14], rest: ["#94A3B8", .12], event: ["#93C5FD", .14] };
    const tc = tagColors[tag] || tagColors.planned;
    const meta = [x.hour != null && !x.allDay ? fmtT(x.hour, x.min) : x.allDay ? "All day" : "", x.dur && x.cat === "workout" ? x.dur + "m" : "", km(x.dist)].filter(Boolean).join(" · ");
    return (
      <div key={x.id} onClick={() => openEdit(x)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", cursor: "pointer" }}>
        <div style={{ width: 38, height: 38, flex: "none", borderRadius: 11, background: hexA(t.color, .13), border: "1px solid " + hexA(t.color, .28), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: skip ? T4 : T1, textDecoration: skip ? "line-through" : "none" }}>{x.title}{done ? " 🎉" : ""}</div>
          {meta && <div style={{ color: T3, fontSize: 11.5, marginTop: 1 }}>{meta}</div>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: tc[0], background: hexA(tc[0], tc[1]), padding: "3px 9px", borderRadius: 7, textTransform: "capitalize", flex: "none" }}>{tag}</span>
      </div>
    );
  }

  /* ───────────── SCHEDULE (agenda) ───────────── */
  function renderAgenda() {
    if (!agenda) return <Loading />;
    const items = [...agenda.sessions.map(sessionToItem), ...agenda.events.map(eventToItem)].filter((x) => x.date >= sunOf(addDays(today, -7)) && onCalendar(x));
    const byDay = new Map<string, Item[]>();
    items.forEach((x) => { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date)!.push(x); });
    const dayKeys = [...byDay.keys()].sort();
    const groups = new Map<string, string[]>();
    dayKeys.forEach((dk) => { const gk = sunOf(dk); if (!groups.has(gk)) groups.set(gk, []); groups.get(gk)!.push(dk); });
    const gKeys = [...groups.keys()].sort();
    let prevMon = -1;
    return (
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => openAdd(today)} style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: A, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>＋ Activity</button>
          <button onClick={() => { setMode("add"); setDraft({ tkey: "travel", session_type: "Travel", activity: "", session_date: today, start_time: null, planned_duration: 0, notes: "event:travel:allday" }); setSheet("form"); }} style={{ flex: 1, padding: 12, borderRadius: 14, border: "1px solid var(--line)", background: CARD2, color: T1, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>✈️ Event</button>
        </div>
        {gKeys.length === 0 && <div style={{ ...SS.card, textAlign: "center", padding: 24 }}><div style={{ fontSize: 28 }}>📭</div><div style={{ fontWeight: 700, margin: "6px 0 4px" }}>Nothing on your calendar</div><div style={{ color: T3, fontSize: 12 }}>Add an activity or event here, or send a session from Kai in the Coach tab.</div></div>}
        {gKeys.map((gk) => {
          const end = addDays(gk, 6); const sameM = monShort(gk) === monShort(end);
          const range = sameM ? `${num(gk)}–${num(end)} ${monShort(gk)}` : `${num(gk)} ${monShort(gk)} – ${num(end)} ${monShort(end)}`;
          const gMon = parse(gk).getMonth(); let banner: string | null = null;
          if (prevMon !== -1 && gMon !== prevMon) banner = MON_L[gMon] + " " + parse(gk).getFullYear(); prevMon = gMon;
          return (
            <div key={gk}>
              {banner && <div style={{ margin: "18px -2px 8px", height: 64, borderRadius: 16, background: "linear-gradient(120deg, var(--ember), var(--ember-strong))", display: "flex", alignItems: "flex-end", padding: 14, fontSize: 18, fontWeight: 800, color: "#fff" }}>{banner}</div>}
              <div style={{ color: T3, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", margin: "4px 2px 8px" }}>{range}</div>
              {groups.get(gk)!.map((dk) => { const isT = dk === today; return (
                <div key={dk} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isT ? A : T3, textTransform: "uppercase" }}>{DOW[dowMon(dk)]}</div>
                    <div style={isT ? { fontSize: 15, fontWeight: 800, color: "#fff", background: A, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" } : { fontSize: 16, fontWeight: 700, color: T1 }}>{num(dk)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {byDay.get(dk)!.sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99)).map((x) => { const c = T[x.tkey].color; const done = x.status === "done", skip = x.status === "skipped"; const time = x.allDay ? "All day" : x.hour != null ? fmtT(x.hour, x.min) : ""; return (
                      <div key={x.id} onClick={() => openEdit(x)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: done ? hexA(c, .5) : c, borderRadius: 10, padding: "9px 12px", opacity: skip ? .55 : 1, cursor: "pointer" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: x.cat === "meeting" ? "#fff" : "#0E0E14", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: skip ? "line-through" : "none" }}>{done ? "🎉 " : T[x.tkey].emoji + " "}{x.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: x.cat === "meeting" ? "rgba(255,255,255,.8)" : "rgba(14,14,20,.7)", flex: "none" }}>{time}</span>
                      </div>
                    ); })}
                  </div>
                </div>
              ); })}
            </div>
          );
        })}
      </>
    );
  }

  /* ───────────── HISTORY ───────────── */
  function renderSheet() {
    return (
      <div onClick={closeSheet} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div className="schd-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "20px 20px 0 0", padding: "18px 16px max(18px,env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", animation: "schd-in .22s ease" }}>
          <div style={{ position: "sticky", top: 0, display: "flex", justifyContent: "flex-end", zIndex: 5 }}>
            <button onClick={closeSheet} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line-2)", background: CHIPBG, color: T2, fontSize: 15, lineHeight: 1, cursor: "pointer" }}>✕</button>
          </div>
          {sheet === "form" && renderForm()}
        </div>
      </div>
    );
  }

  function renderForm() {
    if (!draft) return null;
    const isEvent = typeof draft.notes === "string" && draft.notes.startsWith("event:");
    const fMon = monOf(draft.session_date || today);
    const tkey = draft.tkey || "run";
    const [hh, mm] = (draft.start_time || "07:00").split(":").map((x) => parseInt(x, 10));
    const [eh, em] = (draft.end_time || "10:00").split(":").map((x) => parseInt(x, 10));
    const allDay = isEvent && (draft.notes || "").includes(":allday");
    return (
      <>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{mode === "edit" ? (isEvent ? "Edit event" : "Edit activity") : isEvent ? "Add event" : "Add activity"}</div>
        <div style={{ fontSize: 11.5, color: T3, marginBottom: 14 }}>{isEvent ? "Travel, races and social plans give the coach busy/travel context." : "Added to your Health OS calendar (committed) so a regenerate won't move it."}</div>

        {mode !== "edit" && (
          <div style={{ display: "flex", gap: 6, padding: 3, background: CARD2, border: "1px solid var(--line)", borderRadius: 11, marginBottom: 12 }}>
            <button onClick={() => setD({ notes: undefined, tkey: "run", session_type: "Run", start_time: "07:00" })} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, ...(!isEvent ? { background: A, color: "#fff" } : { background: "transparent", color: T3 }) }}>🏃 Activity</button>
            <button onClick={() => setD({ notes: "event:travel", tkey: "travel", session_type: "Travel", start_time: "09:00", end_time: "10:00" })} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, ...(isEvent ? { background: A, color: "#fff" } : { background: "transparent", color: T3 }) }}>📅 Event</button>
          </div>
        )}
        <label style={fl}>Type</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {(isEvent ? (["travel", "race", "social", "custom"] as TKey[]) : PICK_TYPES).map((k) => { const t = T[k]; const sel = tkey === k; return (
            <button key={k} onClick={() => setD(isEvent ? { tkey: k, session_type: t.label, notes: "event:" + k + (allDay ? ":allday" : "") } : { tkey: k, session_type: t.label })} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 2px", borderRadius: 12, cursor: "pointer", background: sel ? hexA(t.color, .18) : CHIPBG, border: "1px solid " + (sel ? hexA(t.color, .6) : "var(--line)"), color: "var(--text)" }}><span style={{ fontSize: 18 }}>{t.emoji}</span><span style={{ fontSize: 9, color: T3 }}>{t.label}</span></button>
          ); })}
        </div>

        <label style={fl}>{isEvent ? "Title" : "What you'll do"}</label>
        <input value={draft.activity || ""} onChange={(e) => setD({ activity: e.target.value })} placeholder={isEvent ? "e.g. Flight to Phuket" : "e.g. 6×800m at threshold"} style={inp} />

        <label style={fl}>Day</label>
        <div className="hscroll" style={{ marginTop: 5 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => { const dt = addDays(fMon, i); const sel = draft.session_date === dt; return (
            <button key={dt} onClick={() => setD({ session_date: dt })} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 44, padding: "8px 0", borderRadius: 11, border: "1px solid " + (sel ? "transparent" : "var(--line)"), background: sel ? A : CHIPBG, color: sel ? "#fff" : T2, cursor: "pointer", flex: "none" }}><span style={{ fontSize: 11, fontWeight: 700 }}>{DOW[i].slice(0, 2)}</span><span style={{ fontSize: 14, fontWeight: 700 }}>{num(dt)}</span></button>
          ); })}
        </div>
        <input type="date" value={draft.session_date || ""} onChange={(e) => setD({ session_date: e.target.value })} style={{ ...inp, marginTop: 8 }} />

        {isEvent && (
          <>
            <label style={fl}>All day</label>
            <button onClick={() => allDay ? setD({ notes: "event:" + tkey, start_time: "09:00", end_time: "10:00" }) : setD({ notes: "event:" + tkey + ":allday", start_time: null, end_time: null })} style={{ width: "100%", padding: "12px 14px", borderRadius: 11, cursor: "pointer", fontWeight: 700, fontSize: 14, border: "1px solid " + (allDay ? "transparent" : "var(--line-2)"), background: allDay ? A : CHIPBG, color: allDay ? "#fff" : T2, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span>{allDay ? "All-day event" : "Has a set start & end time"}</span><span style={{ fontSize: 12, opacity: .85 }}>{allDay ? "ON" : "OFF"}</span></button>
          </>
        )}
        {!allDay && (
          <>
            <label style={fl}>Start time</label>
            <input type="time" value={draft.start_time || (isEvent ? "09:00" : "07:00")} onChange={(e) => setD({ start_time: e.target.value })} style={inp} />
            {isEvent && (
              <>
                <label style={fl}>End time</label>
                <input type="time" value={draft.end_time || "10:00"} onChange={(e) => setD({ end_time: e.target.value })} style={inp} />
              </>
            )}
          </>
        )}

        {!isEvent && tkey !== "rest" && (
          <>
            <label style={fl}>Duration</label>
            <div style={{ display: "flex", gap: 8 }}>{[30, 45, 60, 90].map((d) => <button key={d} onClick={() => setD({ planned_duration: d })} style={chipStyle(draft.planned_duration === d, { flex: 1, textAlign: "center", padding: "9px 0" })}>{d}m</button>)}</div>
            <label style={fl}>Intensity</label>
            <div style={{ display: "flex", gap: 8 }}>{["easy", "moderate", "hard"].map((k) => <button key={k} onClick={() => setD({ intensity: draft.intensity === k ? null : k })} style={chipStyle(draft.intensity === k, { flex: 1, textAlign: "center", color: draft.intensity === k ? "#fff" : INT[k] })}>{k}</button>)}</div>
            <label style={fl}>Effort</label>
            <div className="hscroll" style={{ marginTop: 5 }}>{EFFORTS.map((k) => <button key={k} onClick={() => setD({ focus: draft.focus === k ? null : k })} style={chipStyle(draft.focus === k)}>{k}</button>)}</div>
            <label style={fl}>Distance (km, optional)</label>
            <input inputMode="decimal" value={draft.distance_m != null ? String(draft.distance_m / 1000) : ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setD({ distance_m: v ? Math.round(parseFloat(v) * 1000) : null }); }} placeholder="e.g. 8" style={inp} />
          </>
        )}

        {mode === "edit" && draft.id && !isEvent && (
          <button onClick={toggleDraftDone} style={{ width: "100%", padding: 14, borderRadius: 14, cursor: "pointer", font: "700 14px 'Plus Jakarta Sans',sans-serif", marginTop: 14, border: "1px solid " + (draft.completed ? "transparent" : hexA("#34D399", .4)), background: draft.completed ? "#34D399" : hexA("#34D399", .1), color: draft.completed ? "#06281c" : "#34D399" }}>{draft.completed ? "✓ Completed — tap to undo" : "Mark as completed 🎉"}</button>
        )}
        {mode === "edit" && draft.id && !isEvent && draft.committed && (
          <button onClick={async () => { if (!draft.id) return; const _m = monOf(draft.session_date || today); await planPost("uncommit", { id: draft.id }, _m); closeSheet(); await loadWeek(_m); refreshAll(); showToast("Removed from calendar"); }} style={{ width: "100%", padding: 13, borderRadius: 14, cursor: "pointer", fontWeight: 700, fontSize: 13.5, marginTop: 8, border: "1px solid var(--line-2)", background: CARD2, color: T2 }}>↩ Remove from calendar</button>
        )}
        <button onClick={saveDraft} disabled={busy || !draft.session_date} style={{ width: "100%", border: "none", color: "#fff", font: "700 15px 'Plus Jakarta Sans',sans-serif", padding: 15, borderRadius: 14, cursor: "pointer", background: A, marginTop: 8 }}>{busy ? "Saving…" : mode === "edit" ? "Save changes" : isEvent ? "Add event" : "Add to plan"}</button>
        {mode === "edit" && draft.id && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {!isEvent && <button onClick={skipDraft} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--line-2)", background: CARD2, color: T2, fontWeight: 700, cursor: "pointer" }}>{draft.skipped ? "Restore" : "Skip"}</button>}
            <button onClick={deleteDraft} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", fontWeight: 700, cursor: "pointer" }}>Delete</button>
          </div>
        )}
        <button onClick={closeSheet} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: "none", color: T3, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Cancel</button>
      </>
    );
  }

}

/* ════════════════════ small components ════════════════════ */
function Loading() { return <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: 13 }}>Loading…</div>; }
function Stepper({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
      <button onClick={onUp} style={{ width: 56, padding: "4px 0", border: "none", background: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>▲</button>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", padding: "0 0 2px" }}>{label}</div>
      <button onClick={onDown} style={{ width: 56, padding: "4px 0", border: "none", background: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>▼</button>
    </div>
  );
}
const fl: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", margin: "14px 2px 6px", fontWeight: 700 };
const inp: React.CSSProperties = { width: "100%", background: "var(--surface-3)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 11, padding: "11px 12px", fontSize: 15, boxSizing: "border-box" };
