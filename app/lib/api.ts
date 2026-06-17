"use client";

import { useEffect, useState } from "react";
import { SB_URL, SB_ANON, DEMO_EMAIL, DEMO_PASSWORD } from "../config";

let cachedToken: string | null = null;
let tokenExp = 0; // epoch seconds

async function getToken(force = false): Promise<string> {
  const now = Date.now() / 1000;
  if (!force && cachedToken && now < tokenExp - 60) return cachedToken;
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Auth failed (${r.status})`);
  const j = await r.json();
  cachedToken = j.access_token;
  tokenExp = j.expires_at || now + (j.expires_in || 3600);
  return cachedToken as string;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const mk = (t: string): HeadersInit => ({ apikey: SB_ANON, Authorization: `Bearer ${t}`, ...(init?.headers || {}) });
  let res = await fetch(`${SB_URL}${path}`, { ...init, headers: mk(await getToken()) });
  if (res.status === 401) res = await fetch(`${SB_URL}${path}`, { ...init, headers: mk(await getToken(true)) });
  return res;
}

// ---- health-dashboard (read API) ----
export async function fetchApi<T>(route: string): Promise<T> {
  const res = await authedFetch(`/functions/v1/health-dashboard?api=${route}`);
  if (!res.ok) throw new Error(`Couldn't load data (${res.status})`);
  return res.json();
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
