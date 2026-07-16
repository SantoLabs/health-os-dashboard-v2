"use client";

import { useEffect, useRef, useState } from "react";
import { triggerSync, getLastSynced } from "../lib/api";

const COOLDOWN_MS = 5 * 60 * 1000;
const LAST_KEY = "hos_last_sync";
const EST_MS = 110_000;
const MAX_MS = 180_000;

// Render an ISO/UTC timestamp as compact IST HH:MM, e.g. "21:00".
function hhmm(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function RefreshButton() {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done" | "cooldown">("idle");
  const [left, setLeft] = useState(0);
  const [pct, setPct] = useState(0);
  const [synced, setSynced] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    const rem = COOLDOWN_MS - (Date.now() - last);
    if (rem > 0) { setPhase("cooldown"); setLeft(Math.ceil(rem / 1000)); }
    let alive = true;
    getLastSynced().then((s) => { if (alive) setSynced(s); }).catch(() => {});
    return () => { alive = false; clearTimers(); };
  }, []);

  useEffect(() => {
    if (phase !== "cooldown") return;
    if (left <= 0) { setPhase("idle"); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  function finish() {
    clearTimers();
    setPct(100);
    setPhase("done");
    timers.current.push(setTimeout(() => window.location.reload(), 1000));
  }

  async function onClick() {
    if (phase !== "idle") return;
    clearTimers();
    setPhase("syncing"); setPct(6);
    try {
      const before = await getLastSynced();
      await triggerSync();
      localStorage.setItem(LAST_KEY, String(Date.now()));
      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const target = Math.min(92, 8 + (elapsed / EST_MS) * 84);
        setPct((p) => (p < target ? Math.round(target) : p));
        timers.current.push(setTimeout(tick, 900));
      };
      tick();
      const poll = async () => {
        if (Date.now() - start > MAX_MS) { finish(); return; }
        const now = await getLastSynced();
        if (now && now !== before) { finish(); return; }
        timers.current.push(setTimeout(poll, 8000));
      };
      timers.current.push(setTimeout(poll, 12000));
    } catch (e) {
      clearTimers();
      setPhase("idle"); setPct(0);
      alert(e instanceof Error ? e.message : "Couldn't start a refresh");
    }
  }

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const text =
    phase === "syncing" ? `${pct}%` :
    phase === "done" ? "Synced" :
    phase === "cooldown" ? mmss :
    (synced ? hhmm(synced) : "Sync");
  const title =
    phase === "cooldown" ? "Recently synced — try again shortly" :
    phase === "syncing" ? "Syncing your latest data…" :
    synced ? `Last synced ${hhmm(synced)} IST · tap to refresh` : "Tap to sync";

  return (
    <button
      type="button"
      className="sync-pill"
      data-state={phase}
      onClick={onClick}
      disabled={phase !== "idle"}
      title={title}
      aria-label={title}
    >
      <svg className={phase === "syncing" ? "sync-pill-ic spin-svg" : "sync-pill-ic"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11a8 8 0 1 0-2.3 6" /><path d="M20 5v6h-6" />
      </svg>
      <span className="sync-pill-t">{text}</span>
    </button>
  );
}
