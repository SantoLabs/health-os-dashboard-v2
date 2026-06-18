"use client";

import { SB_URL, SB_ANON, DEMO_EMAIL, DEMO_PASSWORD } from "../config";

export type Session = { access_token: string; refresh_token?: string; expires_at: number };
const KEY = "hos_session";

export function getStoredSession(): Session | null {
  try {
    const r = localStorage.getItem(KEY);
    return r ? (JSON.parse(r) as Session) : null;
  } catch {
    return null;
  }
}
export function storeSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}

function toSession(j: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number }): Session {
  const now = Date.now() / 1000;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || now + (j.expires_in || 3600),
  };
}

export async function loginPassword(email: string, password: string): Promise<Session> {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error_description || j.msg || `Sign-in failed (${r.status})`);
  }
  const s = toSession(await r.json());
  storeSession(s);
  return s;
}

export async function loginDemo(): Promise<Session> {
  return loginPassword(DEMO_EMAIL, DEMO_PASSWORD);
}

export function loginGoogle() {
  const redirect = `${window.location.origin}/`;
  window.location.href =
    `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
}

// On load after an OAuth redirect, Supabase returns the session in the URL hash.
export function consumeOAuthHash(): Session | null {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const at = h.get("access_token");
  if (!at) return null;
  const now = Date.now() / 1000;
  const s: Session = {
    access_token: at,
    refresh_token: h.get("refresh_token") || undefined,
    expires_at: Number(h.get("expires_at")) || now + Number(h.get("expires_in") || 3600),
  };
  storeSession(s);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return s;
}

export async function refreshSession(refresh_token: string): Promise<Session> {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON },
    body: JSON.stringify({ refresh_token }),
  });
  if (!r.ok) throw new Error("refresh failed");
  const s = toSession(await r.json());
  storeSession(s);
  return s;
}

export function logout() {
  clearSession();
  if (typeof window !== "undefined") window.location.replace("/");
}
