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
const WORKOUT_TYPES: TKey[] = ["run", "swim", "strength", "hiit", "cycle", "yoga", "walk", "rest", "custom"];
const EVENT_TYPES: TKey[] = ["travel", "race", "social"];
const DISPLAY_TRAINING: TKey[] = ["run", "swim", "strength", "hiit", "cycle", "yoga", "walk", "rest"];
const DISPLAY_LIFE: TKey[] = ["travel", "race", "social", "custom"];
function typeGroup(k: TKey) { return DISPLAY_LIFE.includes(k) ? "Life" : "Training"; }
const ICON: Record<TKey, string> = {
  run: '<path d="M13.5 5a2 2 0 1 0 2-2M9 20l3-6 3 2 2 5M6 12l3-4 4 2 3-1"/>',
  swim: '<path d="M2 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M6 13l4-5 6 3 3-2"/><circle cx="17" cy="6" r="1.8"/>',
  strength: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  hiit: '<path d="M13 2L5 13h5l-2 9 8-11h-5l2-9Z"/>',
  cycle: '<circle cx="6" cy="16" r="3.4"/><circle cx="18" cy="16" r="3.4"/><path d="M6 16l4-7h5l3 7M10 9l2 7"/>',
  yoga: '<circle cx="12" cy="5" r="1.8"/><path d="M12 8v5M12 13l-5 4M12 13l5 4M6 10c2 1.5 4 2 6 2s4-.5 6-2"/>',
  walk: '<circle cx="13" cy="4" r="1.8"/><path d="M10 20l2-6 2.5 2 1.5 4M9 12l2.5-4 3 1.5 2.5 3.5M13 10l-1 4"/>',
  rest: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>',
  travel: '<path d="M10.5 13.5L4 11l1.5-1.5L11 10l4.5-4.5a1.6 1.6 0 0 1 2.3 2.3L13.5 12l.5 5.5L12.5 19l-2.5-6.5L7 15l.5 2L6 18.5 4.5 15 1 13.5 2.5 12l2 .5Z"/>',
  race: '<circle cx="12" cy="15" r="5"/><path d="M12 12.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3ZM8.5 10.5L6 3h4l2 4 2-4h4l-2.5 7.5"/>',
  social: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3.5 2.5-5.5 5.5-5.5s5 2 5.5 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5.2M17.5 14.8c1.7.8 2.8 2.5 3 5.2"/>',
  meeting: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  custom: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4ZM18.5 15l.9 2.3 2.1.7-2.1.7-.9 2.3-.9-2.3-2.1-.7 2.1-.7ZM5 16l.7 1.8 1.8.7-1.8.7L5 21l-.7-1.8-1.8-.7 1.8-.7Z"/>',
};
function TypeIco({ k, size = 17, color = "currentColor" }: { k: TKey; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON[k] }} />;
}

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
function chipTxt(c: string) { return `color-mix(in srgb, ${c} 68%, var(--text))`; }
function fmtT(h: number, m: number) { return pad(h) + ":" + pad(m || 0); }                  // 24h (prototype default)
function fmtHour(h: number) { return pad(h) + ":00"; }
const EVENT_CATS = ["travel", "race", "social", "meeting"];
function isEventType(k: TKey) { return EVENT_CATS.includes(T[k].cat); }
function hmToMin(x: string) { const m = /^(\d{1,2}):(\d{2})/.exec(x || ""); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0; }
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
.schd details.typedd > summary{list-style:none;}
.schd details.typedd > summary::-webkit-details-marker{display:none;}
.schd .chev{transition:transform .18s ease;}
.schd details.typedd[open] .chev{transform:rotate(180deg);}
`;

/* ════════════════════ component ════════════════════ */
type View = "week" | "day" | "month" | "schedule";
type Sheet = null | "form";
type Draft = Partial<Session> & { tkey?: TKey; end_time?: string | null; allDay?: boolean };

export default function SchedulePage() {
  const today = todayISO();
  const [view, setView] = useState<View>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selDate, setSelDate] = useState(today);
  const dayScrollRef = useRef<HTMLDivElement>(null);

  const [week, setWeek] = useState<WeekResp | null>(null);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<RangeResp | null>(null);
  const [agenda, setAgenda] = useState<RangeResp | null>(null);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [peek, setPeek] = useState<Item | null>(null);
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
  useEffect(() => { if (view === "day") { const wo = Math.round((parse(monOf(selDate)).getTime() - parse(monOf(today)).getTime()) / 6.048e8); if (wo !== weekOffset) setWeekOffset(wo); } }, [view, selDate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view !== "day") return;
    const el = dayScrollRef.current; if (!el) return;
    const n = istNow();
    const targetH = selDate === today ? n.getHours() : 6;
    const id = requestAnimationFrame(() => { el.scrollTop = Math.max(0, targetH * 54 - 90); });
    return () => cancelAnimationFrame(id);
  }, [view, selDate, week]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function openAdd(date = today, startH?: number) {
    const sh = startH != null ? pad(startH) + ":00" : "07:00";
    const eh = startH != null ? pad((startH + 1) % 24) + ":00" : "08:00";
    setMode("add"); setDraft({ tkey: "run", session_type: "Run", activity: "", session_date: date, start_time: sh, end_time: eh, allDay: false, intensity: null, focus: null, distance_m: null }); setSheet("form");
  }
  function openEdit(it: Item) {
    if (it.source === "gcal") { showToast("Google events are read-only here"); return; }
    const allDay = it.kind === "event" ? it.allDay : it.hour == null;
    const st = allDay || it.hour == null ? null : fmtT(it.hour, it.min);
    const emin = (it.hour ?? 0) * 60 + it.min + (it.dur || 0);
    const et = st == null ? null : fmtT(Math.floor(emin / 60) % 24, emin % 60);
    if (it.kind === "event") {
      const e = it.event!;
      setMode("edit"); setDraft({ id: e.id, tkey: it.tkey, session_type: T[it.tkey].label, activity: e.title, session_date: it.date, start_time: st, end_time: et, allDay, intensity: null, focus: null, distance_m: null });
    } else {
      const s = it.session!;
      setMode("edit"); setDraft({ ...s, tkey: it.tkey, start_time: st, end_time: et, allDay });
    }
    setSheet("form");
  }
  function setD(p: Partial<Draft>) { setDraft((d) => d ? { ...d, ...p } : d); }
  function closeSheet() { setSheet(null); setDraft(null); }
  function openPeek(it: Item) { setPeek(it); }
  function closePeek() { setPeek(null); }
  async function deleteItem(it: Item) {
    const isEv = it.kind === "event";
    try { await planPost(isEv ? "event_delete" : "session_delete", { id: it.id }, monOf(it.date)); refreshAll(); showToast("Deleted"); }
    catch (e) { showToast((e as Error).message); }
  }
  async function uncommitItem(it: Item) {
    try { await planPost("uncommit", { id: it.id }, monOf(it.date)); await loadWeek(monOf(it.date)); refreshAll(); showToast("Removed from calendar"); }
    catch (e) { showToast((e as Error).message); }
  }

  async function saveDraft() {
    if (!draft?.session_date) return;
    setBusy(true);
    const tkey = draft.tkey || "custom";
    const isEvent = isEventType(tkey);
    const allDay = !!draft.allDay;
    const st = draft.start_time || "07:00";
    const et = draft.end_time || "08:00";
    try {
      if (isEvent) {
        await planPost("event_save", { id: draft.id, title: draft.activity || T[tkey].label, kind: tkey, event_date: draft.session_date, all_day: allDay, start_ts: allDay ? null : `${draft.session_date}T${st}:00Z`, end_ts: allDay ? null : `${draft.session_date}T${et}:00Z`, source: "manual", busy: true });
      } else {
        const dur = allDay ? (draft.planned_duration || 0) : Math.max(0, hmToMin(et) - hmToMin(st));
        await planPost("session_save", {
          id: draft.id, session_date: draft.session_date, session_type: draft.id ? draft.session_type : T[tkey].label,
          activity: draft.activity || "", planned_duration: dur, start_time: allDay ? null : st,
          intensity: draft.intensity || null, focus: draft.focus || null, distance_m: draft.distance_m ?? null,
          is_rest_day: tkey === "rest", notes: draft.notes || null,
        }, monOf(draft.session_date));
      }
      closeSheet();
      setWeekOffset(Math.round((Date.parse(monOf(draft.session_date)) - Date.parse(monOf(today))) / (7 * 86400000)));
      await loadWeek(monOf(draft.session_date));
      refreshAll();
      showToast((draft.id ? "Updated · " : (draft.activity || T[tkey].label) + " added · ") + DOW[dowMon(draft.session_date)] + " " + num(draft.session_date));
    } catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
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
  const tabs: [View, string][] = [["week", "Week"], ["day", "Day"], ["month", "Month"], ["schedule", "Schedule"]];

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
        <button style={{ ...SS.iconAct, background: A, border: "none", color: "#fff", flex: "none" }} title="Add activity" onClick={() => openAdd(view === "day" ? selDate : today)}>＋</button>
      </div>

      {weekErr && <div style={{ ...SS.card, borderColor: "var(--danger)" }}><b>Couldn&apos;t load</b><div style={{ color: T3, fontSize: 12, marginTop: 4 }}>{weekErr}</div></div>}

      {view === "week" && renderWeek()}
      {view === "day" && renderDay()}
      {view === "month" && renderMonth()}
      {view === "schedule" && renderAgenda()}

      {sheet && renderSheet()}
      {peek && renderPeek()}
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
                <button key={b.id} onClick={() => openPeek(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", color: chipTxt(t.color), fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t.emoji} {b.title}</button>
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
                  <button key={b.id} onClick={() => openPeek(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", opacity: skip ? .6 : 1 }}>
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

  function renderDay() {
    if (!week) return <Loading />;
    const items = wItems.filter((b) => b.date === selDate && b.cat !== "rest" && onCalendar(b));
    const allDay = items.filter((b) => b.allDay);
    const unscheduled = items.filter((b) => b.kind === "session" && b.hour == null && !b.allDay);
    const timed = items.filter((b) => !b.allDay && b.hour != null).sort((a, b) => (((a.hour ?? 0) - (b.hour ?? 0)) || ((a.min ?? 0) - (b.min ?? 0))));
    const H0 = 0, H1 = 23;
    const hours: number[] = []; for (let h = H0; h <= H1; h++) hours.push(h);
    const hourH = 54;
    const now = istNow(); const showNow = selDate === today && now.getHours() >= H0 && now.getHours() <= H1;
    const nowTop = 8 + (now.getHours() - H0) * hourH + (now.getMinutes() / 60) * hourH;
    const rel = selDate === today ? "Today" : selDate === addDays(today, 1) ? "Tomorrow" : selDate === addDays(today, -1) ? "Yesterday" : DOW[dowMon(selDate)];
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={SS.navBtn} onClick={() => setSelDate(addDays(selDate, -1))}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{DOW[dowMon(selDate)]} {num(selDate)} {monShort(selDate)}</div>
            <div style={{ fontSize: 11.5, color: T3, marginTop: 1 }}>{rel}{selDate !== today && <button onClick={() => setSelDate(today)} style={{ background: "none", border: 0, color: A, cursor: "pointer", fontWeight: 700, marginLeft: 8, fontSize: 11.5 }}>Today</button>}</div>
          </div>
          <button style={SS.navBtn} onClick={() => setSelDate(addDays(selDate, 1))}>›</button>
        </div>

        {allDay.length > 0 && (
          <div style={{ ...SS.card, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T3, letterSpacing: ".05em" }}>ALL DAY</div>
            {allDay.map((b) => { const t = T[b.tkey]; return (
              <button key={b.id} onClick={() => openPeek(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", color: chipTxt(t.color), fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t.emoji} {b.title}</button>
            ); })}
          </div>
        )}

        {unscheduled.length > 0 && (
          <div style={{ ...SS.card, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: T3, marginBottom: 7 }}>Unscheduled — tap to set a time</div>
            <div className="hscroll">
              {unscheduled.map((b) => { const t = T[b.tkey]; return (
                <button key={b.id} onClick={() => openPeek(b)} style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none", background: hexA(t.color, .14), border: "1px solid " + hexA(t.color, .3), borderRadius: 999, padding: "6px 12px", cursor: "pointer", font: "inherit", color: chipTxt(t.color), fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t.emoji} {b.title}</button>
              ); })}
            </div>
          </div>
        )}

        <div ref={dayScrollRef} style={{ ...SS.card, position: "relative", height: "58vh", padding: 0, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ position: "relative", height: hours.length * hourH + 16, padding: "8px 12px" }}>
            {hours.map((h, i) => (
              <div key={h} onClick={() => openAdd(selDate, h)} style={{ position: "absolute", left: 12, right: 12, top: 8 + i * hourH, height: hourH, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 40, fontSize: 10, color: T4, textAlign: "right", transform: "translateY(-5px)", flex: "none" }}>{fmtHour(h)}</div>
                  <div style={{ flex: 1, borderTop: "1px solid var(--line)" }} />
                </div>
              </div>
            ))}
            {timed.map((b) => { const t = T[b.tkey]; const isMeet = b.cat === "meeting"; const done = b.status === "done"; const skip = b.status === "skipped"; const top = 8 + ((b.hour ?? 0) - H0) * hourH + ((b.min ?? 0) / 60) * hourH; const ht = Math.max(((b.dur ?? 45) / 60) * hourH, 34); const em = (b.hour ?? 0) * 60 + (b.min ?? 0) + (b.dur ?? 0); const col = isMeet ? "var(--muted)" : t.color; return (
              <div key={b.id} onClick={() => openPeek(b)} style={{ position: "absolute", left: 62, right: 12, top, height: ht, background: isMeet ? "var(--surface-2)" : hexA(t.color, .14), border: "1px solid " + (isMeet ? "var(--line-2)" : hexA(t.color, .3)), borderLeft: "3px solid " + col, borderRadius: 10, padding: "6px 12px", cursor: "pointer", overflow: "hidden", opacity: skip ? .6 : 1, zIndex: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: isMeet ? "var(--text-2)" : chipTxt(t.color), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: skip ? "line-through" : "none" }}>{done ? "🎉 " : t.emoji + " "}{b.title}</div>
                <div style={{ fontSize: 10.5, color: T3, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtT(b.hour ?? 0, b.min ?? 0)}{b.dur ? " – " + fmtT(Math.floor(em / 60) % 24, em % 60) : ""}{b.dist ? " · " + km(b.dist) : ""}{isMeet ? " · Google" : ""}</div>
              </div>
            ); })}
            {showNow && (
              <div style={{ position: "absolute", left: 50, right: 12, top: nowTop, display: "flex", alignItems: "center", zIndex: 8, pointerEvents: "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ember)", flex: "none" }} />
                <div style={{ flex: 1, height: 2, background: "var(--ember)" }} />
                <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--ember-strong)", background: "color-mix(in srgb, var(--ember) 16%, transparent)", borderRadius: 999, padding: "2px 7px", marginLeft: 4, flex: "none" }}>{fmtT(now.getHours(), now.getMinutes())}</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ color: T4, fontSize: 11, textAlign: "center", marginTop: 10 }}>Tap a block to edit, or an empty hour to add.</div>
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
      <div key={x.id} onClick={() => openPeek(x)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", cursor: "pointer" }}>
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
        <button onClick={() => openAdd(today)} style={{ width: "100%", padding: 12, borderRadius: 14, border: "none", background: A, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 12 }}>＋ Add to calendar</button>
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
                      <div key={x.id} onClick={() => openPeek(x)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: done ? hexA(c, .5) : c, borderRadius: 10, padding: "9px 12px", opacity: skip ? .55 : 1, cursor: "pointer" }}>
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
  function renderPeek() {
    if (!peek) return null;
    const it = peek; const t = T[it.tkey];
    const isEvent = it.kind === "event"; const isGcal = it.source === "gcal";
    const done = it.status === "done"; const skip = it.status === "skipped";
    const em = (it.hour ?? 0) * 60 + (it.min ?? 0) + (it.dur ?? 0);
    const timeStr = it.allDay ? "All day" : it.hour != null ? fmtT(it.hour, it.min) + (it.dur ? " – " + fmtT(Math.floor(em / 60) % 24, em % 60) : "") : "Unscheduled";
    const meta = [DOW[dowMon(it.date)] + " " + num(it.date) + " " + monShort(it.date), timeStr, it.dist ? km(it.dist) : "", isGcal ? "Google Calendar" : ""].filter(Boolean).join(" · ");
    const fire = (fn: () => void, msg?: string) => { fn(); if (msg) showToast(msg); closePeek(); };
    const nBtn: React.CSSProperties = { flex: 1, padding: "11px 8px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 13, border: "1px solid var(--line-2)", background: CARD2, color: T2, whiteSpace: "nowrap" };
    return (
      <div onClick={closePeek} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div className="schd-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "20px 20px 0 0", padding: "14px 16px max(18px,env(safe-area-inset-bottom))", animation: "schd-in .22s ease" }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "0 auto 14px" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: hexA(t.color, .16), border: "1px solid " + hexA(t.color, .3) }}>{done ? "🎉" : t.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, textDecoration: skip ? "line-through" : "none" }}>{it.title}</div>
              <div style={{ fontSize: 12, color: T3, marginTop: 2 }}>{meta}</div>
            </div>
            <button onClick={closePeek} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line-2)", background: CHIPBG, color: T2, fontSize: 14, cursor: "pointer", flex: "none" }}>✕</button>
          </div>
          {isGcal ? (
            <div style={{ fontSize: 12, color: T3, marginTop: 16, textAlign: "center", padding: "10px 0" }}>Read-only — manage this in Google Calendar.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => { setPeek(null); openEdit(it); }} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 13, border: "none", background: A, color: "#fff" }}>✏️ Edit</button>
                <button onClick={() => fire(() => deleteItem(it))} style={{ flex: 1, padding: "11px 8px", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 13, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", whiteSpace: "nowrap" }}>🗑 Delete</button>
              </div>
              {!isEvent && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => fire(() => toggleDone(it), done ? "Marked not done" : "Marked done 🎉")} style={nBtn}>{done ? "↺ Undo" : "✓ Done"}</button>
                  <button onClick={() => fire(() => skipItem(it), skip ? "Restored" : "Skipped")} style={nBtn}>{skip ? "↩ Restore" : "⤼ Skip"}</button>
                </div>
              )}
              {!isEvent && it.committed && (
                <button onClick={() => fire(() => uncommitItem(it))} style={{ ...nBtn, width: "100%", flex: "none", marginTop: 8 }}>↩ Remove from calendar</button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderSheet() {
    return (
      <div onClick={closeSheet} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div className="schd-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "20px 20px 0 0", padding: "18px 16px max(18px,env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", animation: "schd-in .22s ease" }}>
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
    const tkey = draft.tkey || "run";
    const isEvent = isEventType(tkey);
    const allDay = !!draft.allDay;
    const fMon = monOf(draft.session_date || today);
    const allowed = mode === "edit" ? (isEvent ? EVENT_TYPES : WORKOUT_TYPES) : PICK_TYPES;
    const gTrain = DISPLAY_TRAINING.filter((k) => allowed.includes(k));
    const gLife = DISPLAY_LIFE.filter((k) => allowed.includes(k));
    const col = T[tkey].color;
    const card: React.CSSProperties = { background: CARD, border: "1px solid var(--line)", borderRadius: 14 };
    const pick = (k: TKey, e: React.MouseEvent<HTMLButtonElement>) => { setD({ tkey: k, session_type: T[k].label }); const d = e.currentTarget.closest("details") as HTMLDetailsElement | null; if (d) d.open = false; };
    const seg = (on: boolean): React.CSSProperties => ({ fontSize: 11.5, fontWeight: on ? 800 : 600, border: "none", cursor: "pointer", borderRadius: 999, padding: "7px 14px", background: on ? CARD : "transparent", color: on ? T1 : T3, boxShadow: on ? "0 2px 6px rgba(0,0,0,.08)" : "none" });
    const menuCol = (title: string, ks: TKey[]) => (
      <div style={{ flex: 1 }}>
        <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: T4, letterSpacing: ".08em" }}>{title}</div>
        {ks.map((k) => { const sel = tkey === k; return (
          <button key={k} onClick={(e) => pick(k, e)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "none", background: sel ? hexA(T[k].color, .14) : "transparent", cursor: "pointer", textAlign: "left" }}>
            <TypeIco k={k} size={16} color={sel ? T[k].color : T3} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: sel ? 800 : 600, color: sel ? chipTxt(T[k].color) : T1 }}>{T[k].label}</span>
            {sel && <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={T[k].color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>}
          </button>
        ); })}
      </div>
    );
    return (
      <>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>{mode === "edit" ? "Edit" : "Add to plan"}</div>
        <div style={{ fontSize: 11.5, color: T3, marginTop: 3 }}>{isEvent ? "Blocks time on your calendar and gives the coach travel / busy context." : "Committed to your calendar so a plan regenerate won't move it."}</div>

        <label style={fl}>Type</label>
        <details className="typedd">
          <summary style={{ ...card, listStyle: "none", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: hexA(col, .14), display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><TypeIco k={tkey} size={17} color={col} /></span>
            <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T1 }}>{T[tkey].label}</span><span style={{ display: "block", fontSize: 10.5, color: T3 }}>{typeGroup(tkey)}</span></span>
            <svg className="chev" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <div style={{ ...card, marginTop: 6, display: "flex", overflow: "hidden" }}>
            {menuCol("Training", gTrain)}
            {gLife.length > 0 && <div style={{ width: 1, background: "var(--line)", flex: "none" }} />}
            {gLife.length > 0 && menuCol("Life", gLife)}
          </div>
        </details>

        <label style={fl}>{isEvent ? "Title" : "What you'll do"}</label>
        <input value={draft.activity || ""} onChange={(e) => setD({ activity: e.target.value })} placeholder={isEvent ? "e.g. Flight to Phuket" : "e.g. 6×800m at threshold"} style={{ ...card, width: "100%", padding: "12px 14px", fontSize: 14, color: T1, outline: "none" }} />

        <label style={fl}>Day</label>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => { const dt = addDays(fMon, i); const sel = draft.session_date === dt; return (
            <button key={dt} onClick={() => setD({ session_date: dt })} style={{ flex: 1, textAlign: "center", borderRadius: 12, padding: "7px 0", cursor: "pointer", border: sel ? "none" : "1px solid var(--line)", background: sel ? A : CARD, boxShadow: sel ? "0 4px 12px " + hexA("#d96f4e", .3) : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: sel ? "rgba(255,255,255,.85)" : T3 }}>{DOW[i].slice(0, 2)}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: sel ? "#fff" : T1, marginTop: 1 }}>{num(dt)}</div>
            </button>
          ); })}
        </div>
        <input type="date" value={draft.session_date || ""} onChange={(e) => setD({ session_date: e.target.value })} style={{ ...card, width: "100%", padding: "11px 14px", marginTop: 8, fontSize: 13.5, fontWeight: 700, color: T1, outline: "none" }} />

        <label style={fl}>Time</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", background: CHIPBG, borderRadius: 999, padding: 3, flex: "none" }}>
            <button onClick={() => setD({ allDay: false, start_time: draft.start_time || "07:00", end_time: draft.end_time || "08:00" })} style={seg(!allDay)}>Timed</button>
            <button onClick={() => setD({ allDay: true })} style={seg(allDay)}>All day</button>
          </div>
          {!allDay && <>
            <input type="time" value={draft.start_time || "07:00"} onChange={(e) => setD({ start_time: e.target.value })} style={{ ...card, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13, fontWeight: 700, color: T1, outline: "none" }} />
            <span style={{ color: T4, fontSize: 12, flex: "none" }}>–</span>
            <input type="time" value={draft.end_time || "08:00"} onChange={(e) => setD({ end_time: e.target.value })} style={{ ...card, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13, fontWeight: 700, color: T1, outline: "none" }} />
          </>}
        </div>

        <button onClick={saveDraft} disabled={busy || !draft.session_date} style={{ width: "100%", border: "none", color: "#fff", font: "800 15px 'Plus Jakarta Sans',sans-serif", padding: 15, borderRadius: 16, cursor: "pointer", background: A, marginTop: 18, boxShadow: "0 6px 18px " + hexA("#d96f4e", .35) }}>{busy ? "Saving…" : mode === "edit" ? "Save changes" : "Add to plan"}</button>
        <button onClick={closeSheet} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: "none", color: T3, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 8 }}>Cancel</button>
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
