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

// ---- health-plan (AI training plan) ----
export async function planGet<T>(): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-plan?api=plan`);
  if (!res.ok) throw new Error(`Couldn't load plan (${res.status})`);
  return res.json();
}
export async function planPost<T>(action: string, body: unknown = {}): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-plan?api=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
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
