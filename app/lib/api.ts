"use client";

import { useEffect, useState } from "react";
import { SB_URL, SB_ANON } from "../config";
import { getStoredSession, refreshSession, clearSession } from "./auth";

async function getToken(force = false): Promise<string> {
  const s = getStoredSession();
  if (!s) throw new Error("Not signed in");
  const now = Date.now() / 1000;
  if (!force && now < s.expires_at - 60) return s.access_token;
  if (s.refresh_token) {
    try {
      const ns = await refreshSession(s.refresh_token);
      return ns.access_token;
    } catch {
      clearSession();
      if (typeof window !== "undefined") window.location.reload();
      throw new Error("Session expired");
    }
  }
  return s.access_token;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const mk = (t: string): HeadersInit => ({ apikey: SB_ANON, Authorization: `Bearer ${t}`, ...(init?.headers || {}) });
  let res = await fetch(`${SB_URL}${path}`, { cache: "no-store", ...init, headers: mk(await getToken()) });
  if (res.status === 401) res = await fetch(`${SB_URL}${path}`, { cache: "no-store", ...init, headers: mk(await getToken(true)) });
  return res;
}

// ---- health-dashboard (read API) ----
export async function fetchApi<T>(route: string): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-dashboard?api=${route}`);
  if (!res.ok) throw new Error(`Couldn't load data (${res.status})`);
  return res.json();
}

export async function dashPost<T>(route: string, body: unknown): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-dashboard?api=${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// ---- on-demand sync (Refresh button) ----
export async function triggerSync(): Promise<unknown> {
  const res = await authedFetch(`/functions/v1/trigger-garmin-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_type: "daily_manual" }),
  });
  if (!res.ok) throw new Error(`Couldn't start a refresh (${res.status})`);
  return res.json();
}
export async function getLastSynced(): Promise<string | null> {
  try {
    const t = await fetchApi<{ last_synced?: string }>("today");
    return t.last_synced || null;
  } catch {
    return null;
  }
}

// ---- health-actions (read + write API) ----
export async function actionGet<T>(route: string): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-actions?api=${route}`);
  if (!res.ok) throw new Error(`Couldn't load (${res.status})`);
  return res.json();
}
export async function actionPost<T>(route: string, body: unknown): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-actions?api=${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function useApi<T>(route: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchApi<T>(route).then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [route]);
  return { data, error };
}

// ---- health-coach (legacy basic Q&A — superseded by the Kai coach below) ----
export async function coachAsk(
  question: string,
  history: { role: string; content: string }[],
): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const res = await authedFetch(`/functions/v1/health-coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok) throw new Error(`Coach unavailable (${res.status})`);
  return res.json();
}

// ---- coach (Kai: agentic AI coach — threads, grounded turns, confirm-first actions) ----
export type KaiCitation = { label: string; color: string; source: string };
export type KaiItem = { name: string; qty: number; unit: string; grams?: number | null; kcal: number; protein: number; carbs: number; fats: number; fiber: number };
// Schedule/target reschedule + target-adjust share this action shape; `payload` carries
// the per-type fields (food: meal_type/date/items; schedule: session_id/new_date/new_start_time;
// target: metric/target_id/from/to/unit), and `from`/`to` describe a schedule move.
export type KaiActionWhen = { activity?: string; name?: string; date?: string; time?: string };
export type KaiAction = {
  id: string;
  type: "food" | "schedule" | "target" | "swap" | "pantry" | "reminder" | "memory" | "capability" | string;
  title: string;
  delta_badge?: { text: string; color: string };
  status: "proposed" | "editing" | "applied" | "dismissed";
  payload?: {
    meal_type?: string; date?: string; items?: KaiItem[];
    session_id?: string; new_date?: string; new_start_time?: string | null;
    metric?: string; target_id?: string; from?: number; to?: number; unit?: string;
    // swap
    target?: string; remove_log_id?: string; new_activity?: string;
    // pantry
    row?: Record<string, unknown>;
    // reminder / check-in
    kind?: string; title?: string; body?: string | null; seed_prompt?: string | null; recurrence?: string; due_at?: string | null; recur_time?: string | null;
    // memory
    text?: string; category?: string;
    // capability (kind reused from reminder above)
    started_on?: string; note?: string | null;
    // plan (schedule week)
    week_start?: string; sessions?: Array<{ session_date?: string; activity?: string; session_type?: string; planned_duration?: number | null; intensity?: string | null; focus?: string | null; is_rest_day?: boolean; notes?: string | null }>;
  };
  impact?: { metric: string; from: number; to: number; target: number; color: string } | null;
  summary?: { kcal: number; protein: number };
  display?: { title?: string; body?: string | null; seed?: string | null; when?: string; week_start?: string; sessions?: Array<{ day?: string; date?: string; line?: string; is_rest?: boolean }>; kind?: string; started_on?: string; note?: string | null };
  from?: KaiActionWhen;
  to?: { date?: string; time?: string; activity?: string; items?: KaiItem[] };
  reason?: string | null;
  applied_log_ids?: string[];
  inserted_ids?: string[];
};
export type KaiMessage = { id: string; role: "user" | "kai"; text: string; citations?: KaiCitation[]; action?: KaiAction | null; created_at?: string; feedback?: number | null };
export type KaiThread = { id: string; title: string; pinned: boolean; last_message?: string; last_role?: string; updated_at?: string };
export type KaiDailyCard = {
  date: string;
  greeting: string;
  generated_at?: string;
  readiness?: { current: number; label?: string | null } | null;
  streak?: number;
  headline: string;
  body: string;
  lever: string;
  tone: "positive" | "neutral" | "off" | string;
  chips?: string[];
};

export async function coachThreads(): Promise<{ threads: KaiThread[] }> {
  const res = await authedFetch(`/functions/v1/coach?api=threads`);
  if (!res.ok) throw new Error(`Couldn't load chats (${res.status})`);
  return res.json();
}
export async function coachThread(id: string): Promise<{ thread: KaiThread | null; messages: KaiMessage[] }> {
  const res = await authedFetch(`/functions/v1/coach?api=thread&id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Couldn't load chat (${res.status})`);
  const data = await res.json();
  try {
    const fb = await coachThreadFeedback(id);
    if (fb && fb.feedback) data.messages = (data.messages || []).map((m: KaiMessage) => (fb.feedback[m.id] ? { ...m, feedback: fb.feedback[m.id].rating } : m));
  } catch { /* feedback merge is best-effort */ }
  return data;
}
export async function coachSend(body: { text: string; thread_id?: string; context_route?: string; page_context?: { label: string; hint?: string } }): Promise<{ thread_id: string; message: KaiMessage; degraded?: boolean }> {
  const res = await authedFetch(`/functions/v1/coach?api=send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kai is unavailable (${res.status})`);
  return res.json();
}
export async function coachApply(message_id: string, items?: KaiItem[]): Promise<{ ok: boolean; applied_log_ids?: string[]; action: KaiAction }> {
  const res = await authedFetch(`/functions/v1/coach?api=apply_action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id, items }),
  });
  if (!res.ok) throw new Error(`Couldn't apply (${res.status})`);
  return res.json();
}
export async function coachUndo(message_id: string): Promise<{ ok: boolean; action: KaiAction }> {
  const res = await authedFetch(`/functions/v1/coach?api=undo_action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id }),
  });
  if (!res.ok) throw new Error(`Couldn't undo (${res.status})`);
  return res.json();
}
export async function coachThreadOp(op: "rename" | "pin" | "delete_thread", body: Record<string, unknown>): Promise<{ ok: boolean }> {
  const res = await authedFetch(`/functions/v1/coach?api=${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
// GET today's proactive home-screen card (generated once per day, cached server-side).
export async function coachDailyCard(scope?: "training"): Promise<{ card: KaiDailyCard; cached: boolean }> {
  const res = await authedFetch(`/functions/v1/coach?api=daily_card${scope ? `&scope=${scope}` : ""}`);
  if (!res.ok) throw new Error(`Couldn't load your daily card (${res.status})`);
  return res.json();
}

// ---- coach: reminders + check-ins (in-app) ----
export type KaiReminder = { id: string; kind: string; title: string; body?: string | null; due_at?: string | null; recurrence: string; recur_time?: string | null; recur_days?: number[] | null; seed_prompt?: string | null; status: string; last_fired_at?: string | null; created_at?: string; due: boolean };
export async function coachReminders(): Promise<{ reminders: KaiReminder[]; due_count: number }> {
  const res = await authedFetch(`/functions/v1/coach?api=reminders`);
  if (!res.ok) throw new Error(`Couldn't load reminders (${res.status})`);
  return res.json();
}
export async function coachReminderOp(body: { id: string; op: "done" | "snooze" | "dismiss" | "delete"; snooze_mins?: number }): Promise<{ ok: boolean }> {
  const res = await authedFetch(`/functions/v1/coach?api=reminder_op`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
export type KaiNotifications = { due: KaiReminder[]; upcoming: KaiReminder[]; history: KaiReminder[]; due_count: number };
export async function coachNotifications(): Promise<KaiNotifications> {
  const res = await authedFetch(`${AUX}?api=notifications`);
  if (!res.ok) throw new Error(`Couldn't load notifications (${res.status})`);
  return res.json();
}
export async function coachReminderSnooze(id: string, preset: string): Promise<{ ok?: boolean; due_at?: string }> {
  const res = await authedFetch(`${AUX}?api=reminder_snooze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, preset }) });
  if (!res.ok) throw new Error(`Couldn't snooze (${res.status})`);
  return res.json();
}
export async function coachCheckinOpen(reminder_id: string): Promise<{ thread_id: string; message: KaiMessage }> {
  const res = await authedFetch(`${AUX}?api=checkin_open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminder_id }) });
  if (!res.ok) throw new Error(`Couldn't open check-in (${res.status})`);
  return res.json();
}

// ---- coach: long-term memory ("What Kai remembers") ----
export type KaiMemoryItem = { id: string; category: string; text: string; source?: string; strength?: string; created_at?: string };
export async function coachMemory(): Promise<{ memory: KaiMemoryItem[] }> {
  const res = await authedFetch(`/functions/v1/coach?api=memory`);
  if (!res.ok) throw new Error(`Couldn't load memory (${res.status})`);
  return res.json();
}
export async function coachMemoryOp(body: { op: "add" | "edit" | "delete"; id?: string; text?: string; category?: string }): Promise<{ ok: boolean; item?: KaiMemoryItem }> {
  const res = await authedFetch(`/functions/v1/coach?api=memory_op`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// ---- coach-aux: "why?" explainer + saved insights ----
const AUX = "/functions/v1/coach-aux";
export async function coachExplain(metric: string, value?: string | number): Promise<{ text: string }> {
  const res = await authedFetch(`${AUX}?api=explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric, value }) });
  if (!res.ok) throw new Error(`Couldn't explain that (${res.status})`);
  return res.json();
}
export type KaiSavedInsight = { id: string; title?: string; body: string; pinned?: boolean; message_id?: string; thread_id?: string; created_at?: string };
export async function coachInsights(): Promise<{ insights: KaiSavedInsight[] }> {
  const res = await authedFetch(`${AUX}?api=insights`);
  if (!res.ok) throw new Error(`Couldn't load saved insights (${res.status})`);
  return res.json();
}
export async function coachSaveInsight(message_id: string): Promise<{ ok: boolean; insight?: KaiSavedInsight; already?: boolean }> {
  const res = await authedFetch(`${AUX}?api=save_insight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id }) });
  if (!res.ok) throw new Error(`Couldn't save (${res.status})`);
  return res.json();
}
export async function coachUnsaveInsight(id: string): Promise<{ ok: boolean }> {
  const res = await authedFetch(`${AUX}?api=unsave_insight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  if (!res.ok) throw new Error(`Couldn't remove (${res.status})`);
  return res.json();
}

export async function coachFeedback(message_id: string, rating: number | null, note?: string): Promise<{ ok?: boolean; feedback?: number | null }> {
  const res = await authedFetch(`${AUX}?api=feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id, rating, note }) });
  if (!res.ok) throw new Error(`Couldn't save feedback (${res.status})`);
  return res.json();
}
export async function coachThreadFeedback(thread_id: string): Promise<{ feedback: Record<string, { rating: number; note: string | null }> }> {
  const res = await authedFetch(`${AUX}?api=feedback&thread_id=${encodeURIComponent(thread_id)}`);
  if (!res.ok) throw new Error(`Couldn't load feedback (${res.status})`);
  return res.json();
}
export async function coachVision(args: { text?: string; image: { mime: string; data: string }; thread_id?: string; context_route?: string }): Promise<{ thread_id: string; message: KaiMessage }> {
  const res = await authedFetch(`${AUX}?api=vision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`Couldn't read the photo (${res.status})`);
  return res.json();
}

// ---- health-plan (Schedule: AI plan + calendar + history) ----
// GET week (optionally a past/future week via Monday-anchored week_start).
export async function planWeek<T>(weekStart?: string): Promise<T> {
  const q = weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : "";
  const res = await authedFetch(`/functions/v1/health-plan?api=week${q}`);
  if (!res.ok) throw new Error(`Couldn't load your week (${res.status})`);
  return res.json();
}
// GET a date range (sessions + normalized calendar events) for the month grid + agenda.
export async function planRange<T>(from: string, to: string): Promise<T> {
  const res = await authedFetch(
    `/functions/v1/health-plan?api=range&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!res.ok) throw new Error(`Couldn't load the calendar (${res.status})`);
  return res.json();
}
// GET planned-vs-completed windows (week / 15d / 30d) + streaks + weekly bars.
export async function planHistory<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-plan?api=history`);
  if (!res.ok) throw new Error(`Couldn't load history (${res.status})`);
  return res.json();
}
// POST an action (generate / complete / skip / commit / uncommit / session_save /
// session_delete / event_save / event_delete). Pass weekStart to act on a non-current week.
export async function planPost<T>(action: string, body: unknown = {}, weekStart?: string): Promise<T> {
  const q = weekStart ? `&week_start=${encodeURIComponent(weekStart)}` : "";
  const res = await authedFetch(`/functions/v1/health-plan?api=${action}${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
// Back-compat: original single-call current-week fetch (kept for any older callers).
export async function planGet<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-plan?api=week`);
  if (!res.ok) throw new Error(`Couldn't load plan (${res.status})`);
  return res.json();
}

// ---- health-mind (meditation / focus) ----
export async function mindGet<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-mind`);
  if (!res.ok) throw new Error(`Couldn't load (${res.status})`);
  return res.json();
}
export async function mindPost<T>(action: string, body: unknown): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-mind?api=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// ---- health-nutrition (Nutrition: daily log, day/week, AI methods) ----
// GET a single day: { date, targets, totals, meals[] }. Defaults to today (IST).
export async function nutriDay<T>(date?: string): Promise<T> {
  const q = date ? `&date=${encodeURIComponent(date)}` : "";
  const res = await authedFetch(`/functions/v1/health-nutrition?api=day${q}`);
  if (!res.ok) throw new Error(`Couldn't load the day (${res.status})`);
  return res.json();
}
// GET the 7-day strip (Mon-anchored): { start, today, target_protein, streak, days[] }.
export async function nutriWeek<T>(start?: string): Promise<T> {
  const q = start ? `&start=${encodeURIComponent(start)}` : "";
  const res = await authedFetch(`/functions/v1/health-nutrition?api=week${q}`);
  if (!res.ok) throw new Error(`Couldn't load the week (${res.status})`);
  return res.json();
}
// POST an action (log / update / delete). Returns the refreshed day.
export async function nutriPost<T>(action: string, body: unknown = {}): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// GET food-DB search: { foods: [...] }. Optional category filter.
export async function nutriFoods<T>(q: string, cat?: string): Promise<T> {
  const qs = "&q=" + encodeURIComponent(q || "") + (cat ? "&cat=" + encodeURIComponent(cat) : "");
  const res = await authedFetch(`/functions/v1/health-nutrition?api=foods${qs}`);
  if (!res.ok) throw new Error(`Couldn't search foods (${res.status})`);
  return res.json();
}
// GET quick-add templates: { templates: [...] }.
export async function nutriTemplates<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=templates`);
  if (!res.ok) throw new Error(`Couldn't load templates (${res.status})`);
  return res.json();
}
// GET recent entries for re-log: { history: [...] }.
export async function nutriHistory<T>(limit = 30): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=history&limit=${limit}`);
  if (!res.ok) throw new Error(`Couldn't load history (${res.status})`);
  return res.json();
}
// GET pantry defaults: { pantry: [...] }.
export async function nutriPantry<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=pantry`);
  if (!res.ok) throw new Error(`Couldn't load pantry (${res.status})`);
  return res.json();
}

// GET unlogged past days within N days: { gaps: [dates], today }.
export async function nutriGaps<T>(within = 7): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=gaps&within=${within}`);
  if (!res.ok) throw new Error(`Couldn't load gaps (${res.status})`);
  return res.json();
}
// GET recent days that have entries (for the copy-a-day backfill picker): { days: [...] }.
export async function nutriLoggedDays<T>(limit = 12): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=logged_days&limit=${limit}`);
  if (!res.ok) throw new Error(`Couldn't load days (${res.status})`);
  return res.json();
}

// GET adherence over a window (7 or 30 days): macros avg vs target + micros vs RDA + streak.
export async function nutriAdherence<T>(window = 7): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=adherence&window=${window}`);
  if (!res.ok) throw new Error(`Couldn't load adherence (${res.status})`);
  return res.json();
}

// GET profile + targets + pantry in one shot: { profile, targets, pantry }.
// Writes go through nutriPost: profile_save / targets_save / pantry_save / pantry_delete.
export async function nutriProfile<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-nutrition?api=profile`);
  if (!res.ok) throw new Error(`Couldn't load profile (${res.status})`);
  return res.json();
}

// ---- training (Training tab revamp v2 — standalone `training` edge fn, read-only intelligence) ----
const TRAIN = "/functions/v1/training";
export async function trainGet<T>(route: string): Promise<T> {
  const res = await authedFetch(`${TRAIN}?api=${route}`);
  if (!res.ok) throw new Error(`Couldn't load training (${res.status})`);
  return res.json();
}
// Route-driven fetch hook (mirrors useApi). Pass null to skip (e.g. no lift selected yet).
export function useTrain<T>(route: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!route) { setData(null); setError(null); return; }
    let alive = true;
    setData(null); setError(null);
    trainGet<T>(route).then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [route]);
  return { data, error };
}

// ---- training response types ----
export type TrnLiftSummary = {
  title: string; muscle_group: string; sessions: number; first_done?: string; last_done: string;
  max_weight: number | null; best_e1rm: number | null; recent_e1rm: number | null; recent_top_weight: number | null;
  last_session_e1rm?: number | null; lifetime_sets: number; peak_e1rm: number | null;
};
export type TrnWeekStrength = { week_start: string; sessions: number; volume_kg: number; total_sets: number; duration_mins: number };
export type TrnCardioWeek = {
  week_start: string; sessions: number; distance_km: number; duration_mins: number; avg_hr: number | null;
  long_distance_km: number; z2_mins: number; zoned_mins: number; avg_pace_min_km: number | null; avg_m_per_beat: number | null;
};
export type TrnOverview = {
  kai_summary: string;
  strength: { weekly: TrnWeekStrength[]; top_lifts: TrnLiftSummary[]; muscle_balance?: unknown; muscle_balance_week?: unknown };
  cardio: { weekly: { running: TrnCardioWeek[]; swimming: TrnCardioWeek[] } };
};
export type TrnStrength = { lifts: TrnLiftSummary[] };
export type TrnLiftSession = { date: string; workout_id?: string; working_sets: number; total_reps: number; top_weight: number | null; est_1rm: number | null; volume_kg: number };
export type TrnLift = { title: string; summary: TrnLiftSummary; sessions: TrnLiftSession[] };
export type StatWindow = { key: string; vol: number; sets: number; sessions: number; prev_vol: number | null; prev_sets: number | null; prev_sessions: number | null };
export type RadarAxis = { axis: string; current: number; previous: number | null };
export type StrengthStats = { windows: StatWindow[]; radar: Record<string, RadarAxis[]> };
export async function strengthStats(): Promise<StrengthStats> { const res = await authedFetch(`/functions/v1/strength_stats`); if (!res.ok) throw new Error(`Couldn't load strength stats (${res.status})`); return res.json(); }
export type SessionExercise = { title: string; muscle_group: string; sets: number; volume: number | null };
export type StrengthSession = { id: string; date: string; name: string; source: string; sets: number; volume: number; exercises: SessionExercise[] };
export async function strengthSessions(): Promise<StrengthSession[]> { const res = await authedFetch(`/functions/v1/strength_stats?api=sessions`); if (!res.ok) throw new Error(`Couldn't load sessions (${res.status})`); return res.json(); }
export type TrnActivity = {
  date: string; name?: string; distance_km: number; pace_min_km: number | null; avg_hr: number | null; max_hr?: number | null;
  z1: number; z2: number; z3: number; z4: number; z5: number; m_per_beat: number | null;
  avg_run_cadence?: number | null; avg_swolf?: number | null; duration_mins?: number | null;
};
export type TrnCardio = { sport: string; weekly: TrnCardioWeek[]; activities: TrnActivity[] };
export type TrnRecord = { category: string; metric: string; scope_label: string; value: number; unit: string; achieved_on: string };
export type TrnProjection = { distance: string; projected_time: string; projected_pace_min_km: number };
export type TrnStats = { total_workouts: number; workouts_2026: number; week_streak: number; first_workout: string };
export type TrnPrs = { records: { strength: TrnRecord[]; running: TrnRecord[]; swim: TrnRecord[] }; projections: TrnProjection[]; projection_base_km: number; stats: TrnStats };
export type TrnGoal = { label: string; target_date: string; status: string; days_to_go: number };
export type TrnBody = { date: string; weight_kg: number | null; body_fat_pct: number | null; lean_mass_kg: number | null };
export type TrnProgress = { next_race: TrnGoal | null; goals: TrnGoal[]; body_latest: TrnBody | null; body_trend: TrnBody[] };

// ---- health-plan Phase 2: Kai prescribes (propose / accept / decline) ----
export type TrnValidatorFlag = { rule: string; severity: "warn" | "info" | string; message: string; action: string };
export type TrnProposal = {
  id: string | null; session_date: string; dow?: number; session_type: string; activity: string;
  planned_duration: number; intensity: string; distance_m: number | null; is_rest_day: boolean;
  rationale: string; validator: TrnValidatorFlag[];
};
export type TrnProposeContext = {
  readiness: number | null; readiness_label?: string | null; acwr: number | null;
  next_race: TrnGoal | null; flag?: string | null; flag_msg?: string | null;
  validator_inputs?: { readiness: number | null; acwr: number | null; days_to_race: number | null; week_index: number | null };
};
export type TrnProposeResp = { ok: boolean; week_start: string; summary: string; proposals: TrnProposal[]; context: TrnProposeContext | null; error?: string };

// Ask Kai to propose the next N upcoming sessions (grounded + validator-checked). Writes uncommitted proposals server-side.
export async function planPropose(horizon = 3, weekStart?: string): Promise<TrnProposeResp> {
  return planPost<TrnProposeResp>("propose", { horizon }, weekStart);
}
// Accept a proposal -> commits it to the plan and mirrors it onto the calendar.
export async function planAccept(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return planPost("accept", { id });
}
// Decline a proposal with an optional free-text reason. Kai stores it as memory, then immediately
// re-proposes an adapted session for that same day (returned as `replacement`).
export async function planDecline(id: string, reason = ""): Promise<{ ok: boolean; declined_id?: string; replacement?: TrnProposal | null; summary?: string; error?: string }> {
  return planPost("decline", { id, reason });
}

// ---- workout (Phase 3: live logger + saved routines) ----
const WK = "/functions/v1/workout";
export type WkSet = { id: string; session_id: string; exercise_name: string; muscle_group?: string | null; exercise_index: number; set_number: number; set_type: string; weight_kg: number | null; reps: number | null; rpe: number | null; rir: number | null; target_reps: number | null; target_weight_kg: number | null; completed: boolean; note?: string | null };
export type WkSession = { id: string; date: string; title: string | null; status: string; source?: string; started_at?: string | null; ended_at?: string | null; duration_mins: number | null; total_volume_kg: number | null; muscles_worked?: Record<string, number> | null; session_rpe: number | null; notes?: string | null; linked_session_id?: string | null };
export type WkPrevSet = { set_number: number; weight_kg: number | null; reps: number | null; ref_date: string | null };
export type WkBundle = { session: WkSession | null; sets: WkSet[]; prev?: Record<string, WkPrevSet[]>; already_active?: boolean; error?: string };
export type WkRoutineSummary = { id: string; name: string; notes?: string | null; focus?: string | null; est_duration_mins?: number | null; item_count: number };
export type WkRoutineItem = { id?: string; exercise_index?: number; exercise_name: string; muscle_group?: string | null; target_sets?: number; target_reps?: string | null; target_weight_kg?: number | null; rest_s?: number | null; notes?: string | null };
export type WkRoutine = { routine: { id: string; name: string; notes?: string | null; focus?: string | null; est_duration_mins?: number | null } | null; items: WkRoutineItem[] };
export type WkParsedItem = WkRoutineItem & { matched?: boolean; raw_name?: string };
export type WkParsedRoutine = { ok: boolean; name?: string; focus?: string | null; est_duration_mins?: number | null; items: WkParsedItem[]; unmatched?: string[]; error?: string };
export type WkPR = { exercise: string; type: string; value: number; prev: number | null; unit: string };
export type WkFinish = { ok: boolean; session_id: string; title: string | null; summary: { sets: number; exercises: number; volume_kg: number; duration_mins: number | null; top_sets: { exercise: string; top_weight: number; best_e1rm: number }[] }; prs: WkPR[]; error?: string };
export type WkExercise = { name: string; muscle_group: string; equipment?: string | null; type?: string | null; movement_pattern?: string | null; mechanic?: string | null; unilateral?: boolean | null; difficulty?: string | null; prescription?: string | null; is_recovery?: boolean | null; secondary?: string | null; body_region?: string | null; media_status?: string | null };
export type WkFacets = { equipment: string[]; muscle: string[]; type: string[] };

async function wkGet<T>(route: string): Promise<T> { const res = await authedFetch(`${WK}?api=${route}`); if (!res.ok) throw new Error(`Couldn't load (${res.status})`); return res.json(); }
async function wkPost<T>(route: string, body: unknown): Promise<T> { const res = await authedFetch(`${WK}?api=${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!res.ok) throw new Error(`Request failed (${res.status})`); return res.json(); }
export function wkActive() { return wkGet<WkBundle>("active"); }
export function wkRoutines() { return wkGet<{ routines: WkRoutineSummary[] }>("routines"); }
export function wkRoutine(id: string) { return wkGet<WkRoutine>(`routine&id=${encodeURIComponent(id)}`); }
export function wkHistory(limit = 20) { return wkGet<{ sessions: WkSession[] }>(`history&limit=${limit}`); }
export function wkExercises(q: string, filters?: { equipment?: string; muscle?: string; type?: string }) {
  const qs = [`q=${encodeURIComponent(q || "")}`];
  if (filters?.equipment) qs.push(`equipment=${encodeURIComponent(filters.equipment)}`);
  if (filters?.muscle) qs.push(`muscle=${encodeURIComponent(filters.muscle)}`);
  if (filters?.type) qs.push(`type=${encodeURIComponent(filters.type)}`);
  return wkGet<{ exercises: WkExercise[]; facets?: WkFacets; source?: string }>(`exercises&${qs.join("&")}`);
}
export function wkStart(body: { plan_id?: string; routine_id?: string; title?: string }) { return wkPost<WkBundle>("start", body); }
export function wkLogSet(body: { session_id: string; exercise_name: string; muscle_group?: string | null; weight_kg?: number | null; reps?: number | null; rpe?: number | null; rir?: number | null; set_type?: string }) { return wkPost<{ ok: boolean; set?: WkSet; error?: string }>("log_set", body); }
export function wkCompleteSet(body: { id: string; weight_kg?: number | null; reps?: number | null; rpe?: number | null; rir?: number | null }) { return wkPost<{ ok: boolean; set?: WkSet; error?: string }>("complete_set", body); }
export function wkEditSet(body: { id: string; weight_kg?: number | null; reps?: number | null; rpe?: number | null; set_type?: string; completed?: boolean }) { return wkPost<{ ok: boolean; set?: WkSet }>("edit_set", body); }
export function wkDeleteSet(id: string) { return wkPost<{ ok: boolean }>("delete_set", { id }); }
export function wkAddExercise(body: { session_id: string; exercise_name: string; muscle_group?: string | null }) { return wkPost<{ ok: boolean; set?: WkSet }>("add_exercise", body); }
export function wkAddSet(body: { session_id: string; exercise_name: string; muscle_group?: string | null; target_reps?: number | null; target_weight_kg?: number | null }) { return wkPost<{ ok: boolean; set?: WkSet }>("add_set", body); }
export function wkDiscard(session_id: string) { return wkPost<{ ok: boolean; discarded?: string }>("discard", { session_id }); }
export function wkFinish(body: { session_id: string; session_rpe?: number | null; notes?: string | null }) { return wkPost<WkFinish>("finish", body); }
export function wkSaveRoutine(body: { id?: string; name: string; notes?: string | null; focus?: string | null; est_duration_mins?: number | null; items: WkRoutineItem[] }) { return wkPost<{ ok: boolean; id: string }>("save_routine", body); }
export function wkDeleteRoutine(id: string) { return wkPost<{ ok: boolean }>("delete_routine", { id }); }
export function wkParseRoutine(text: string) { return wkPost<WkParsedRoutine>("parse_routine", { text }); }
export function wkRename(body: { session_id: string; title: string }) { return wkPost<{ ok: boolean; session?: { id: string; title: string } }>("rename", body); }
export function wkReconcile() { return wkPost<{ ok: boolean; matched: number; sessions: unknown[] }>("reconcile", {}); }

export function fmtVolume(kg: number | null | undefined): string { const n = Math.round(Number(kg) || 0); return `${n.toLocaleString("en-US")} kg`; }

const CARD = "/functions/v1/cardio";
async function cardGet<T>(route: string): Promise<T> { const res = await authedFetch(`${CARD}?api=${route}`); if (!res.ok) throw new Error(`Couldn't load (${res.status})`); return res.json(); }
async function cardPost<T>(route: string, body: unknown): Promise<T> { const res = await authedFetch(`${CARD}?api=${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!res.ok) throw new Error(`Request failed (${res.status})`); return res.json(); }
export type CardioSegment = { role: string; distance_m?: number | null; duration_s?: number | null; intensity?: string | null; pace?: string | null; note?: string | null };
export type CardioBlock = { label?: string | null; reps: number; segments: CardioSegment[] };
export type CardioStructure = { blocks: CardioBlock[] };
export type CardioRoutine = { id: string; name: string; sport: string | null; structure: CardioStructure; total_distance_m?: number | null; total_duration_s?: number | null; source?: string; updated_at?: string };
export type CardioParsed = { ok: boolean; name?: string; sport?: string; structure?: CardioStructure; total_distance_m?: number; total_duration_s?: number; error?: string };
export function cardioParse(text: string, sport?: string) { return cardPost<CardioParsed>("parse", { text, sport }); }
export function cardioList() { return cardGet<{ routines: CardioRoutine[] }>("list"); }
export function cardioGet(id: string) { return cardGet<{ routine: CardioRoutine | null }>(`get&id=${encodeURIComponent(id)}`); }
export function cardioSave(body: { id?: string; name: string; sport?: string; structure: CardioStructure; source?: string; notes?: string }) { return cardPost<{ ok: boolean; id?: string; total_distance_m?: number; total_duration_s?: number; error?: string }>("save", body); }
export function cardioDelete(id: string) { return cardPost<{ ok: boolean }>("delete", { id }); }
export function cardioPrescribe(body: { sport?: string; date?: string; routine_id?: string; structure?: CardioStructure; name?: string; duration_min?: number; distance_m?: number }) { return cardPost<{ ok: boolean; plan_id?: string; session_type?: string; date?: string; planned_duration?: number | null; distance_m?: number | null; error?: string }>("prescribe", body); }

// ---- recovery (Slice C: body map + mobility) ----
export type RecMuscle = { muscle_group: string; last_trained: string | null; days_ago: number | null; vol_14d: number; sets_14d: number; freshness: number; load_pct: number };
export type RecMobility = { name: string; primary_muscle: string | null; secondary_muscles: string | null; body_region: string | null; type: string | null; default_prescription: string | null };
export type RecRoutine = { id: string; name: string; focus: string | null; est_duration_mins: number | null; item_count: number; recommend_after: string | null; recommended: boolean };
export type RecoveryResp = { ok: boolean; muscles: RecMuscle[]; mobility: RecMobility[]; routines?: RecRoutine[]; recommended_id?: string | null; recent_sport?: string | null; generated_at?: string };
export async function recoveryGet(): Promise<RecoveryResp> { const res = await authedFetch(`/functions/v1/recovery`); if (!res.ok) throw new Error(`Couldn't load recovery (${res.status})`); return res.json(); }



