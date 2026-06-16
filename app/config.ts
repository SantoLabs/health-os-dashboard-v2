// Public, RLS-protected values — safe to ship in a frontend (same as the current dashboard).
// Reads from env when present (set these in Vercel later), else falls back to the literals
// so the very first deploy works with zero configuration.
export const SB_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ntzlmclojiehhrzkgnsp.supabase.co";

export const SB_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50emxtY2xvamllaGhyemtnbnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzE2NTYsImV4cCI6MjA5NTY0NzY1Nn0.EVoELUiK80AdYYtGcLP5u2nL6atia7Txq4xc4K334dM";

// Demo account (read-only) — temporary, mirrors the current dashboard's demo login.
// Real per-user auth replaces this later (the "Google login" backlog item).
export const DEMO_EMAIL = "demo@healthos.app";
export const DEMO_PASSWORD = "HealthOS2026!";
