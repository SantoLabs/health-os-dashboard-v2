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

// `route` is everything after `?api=` — e.g. "today", "sleep&days=30".
export async function fetchApi<T>(route: string): Promise<T> {
  const call = async (token: string) =>
    fetch(`${SB_URL}/functions/v1/health-dashboard?api=${route}`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` },
    });

  let res = await call(await getToken());
  if (res.status === 401) res = await call(await getToken(true)); // refresh once
  if (!res.ok) throw new Error(`Couldn't load data (${res.status})`);
  return res.json();
}

export function useApi<T>(route: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchApi<T>(route)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [route]);
  return { data, error };
}
