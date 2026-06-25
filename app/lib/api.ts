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

// ---- health-coach (AI coach) ----
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
