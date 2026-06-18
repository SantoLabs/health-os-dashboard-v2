"use client";

import { useEffect, useRef, useState } from "react";
import { triggerSync, getLastSynced } from "../lib/api";

const COOLDOWN_MS = 5 * 60 * 1000;
const LAST_KEY = "hos_last_sync";
const EST_MS = 110_000; // typical end-to-end sync time
const MAX_MS = 180_000; // give up polling after this, reload anyway

export default function RefreshButton() {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done" | "cooldown">("idle");
  const [left, setLeft] = useState(0); // cooldown seconds remaining
  const [pct, setPct] = useState(0); // progress %
  const [msg, setMsg] = useState(""); // status caption
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // restore cooldown on mount; clean up timers on unmount
  useEffect(() => {
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    const rem = COOLDOWN_MS - (Date.now() - last);
    if (rem > 0) { setPhase("cooldown"); setLeft(Math.ceil(rem / 1000)); }
    return clearTimers;
  }, []);

  // cooldown countdown
  useEffect(() => {
    if (phase !== "cooldown") return;
    if (left <= 0) { setPhase("idle"); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  function stageMsg(elapsed: number): string {
    if (elapsed < 4000) return "Starting sync…";
    if (elapsed < 25000) return "Pulling Garmin data…";
    if (elapsed < 70000) return "Processing metrics…";
    return "Almost done…";
  }

  function finish() {
    clearTimers();
    setPct(100);
    setMsg("Synced ✓");
    setPhase("done");
    timers.current.push(setTimeout(() => window.location.reload(), 1100));
  }

  async function onClick() {
    if (phase !== "idle") return;
    clearTimers();
    setPhase("syncing");
    setPct(5);
    setMsg("Starting sync…");
    try {
      const before = await getLastSynced();
      await triggerSync();
      localStorage.setItem(LAST_KEY, String(Date.now()));
      const start = Date.now();

      // animate progress asymptotically toward ~92% over the expected window
      const tick = () => {
        const elapsed = Date.now() - start;
        const target = Math.min(92, 8 + (elapsed / EST_MS) * 84);
        setPct((p) => (p < target ? Math.round(target) : p));
        setMsg(stageMsg(elapsed));
        timers.current.push(setTimeout(tick, 900));
      };
      tick();

      // poll for fresh data; complete as soon as last_synced advances
      const poll = async () => {
        if (Date.now() - start > MAX_MS) { finish(); return; }
        const now = await getLastSynced();
        if (now && now !== before) { finish(); return; }
        timers.current.push(setTimeout(poll, 8000));
      };
      timers.current.push(setTimeout(poll, 12000));
    } catch (e) {
      clearTimers();
      setPhase("idle"); setPct(0); setMsg("");
      alert(e instanceof Error ? e.message : "Couldn't start a refresh");
    }
  }

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const label =
    phase === "syncing" ? "Syncing…" :
    phase === "done" ? "Synced ✓" :
    phase === "cooldown" ? `Synced · ${mmss}` : "↻ Refresh";

  const showBar = phase === "syncing" || phase === "done";

  return (
    <>
      {showBar && (
        <div className="sync-overlay" role="status" aria-live="polite">
          <div className="sync-bar"><div className="sync-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="sync-status">
            <span>{msg}</span>
            <span className="sync-pct">{pct}%</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className="refresh-btn"
        onClick={onClick}
        disabled={phase !== "idle"}
        title={phase === "cooldown" ? "Recently synced — try again shortly" : "Re-run the sync and refresh metrics"}
      >
        {phase === "syncing" && <span className="spin" aria-hidden />}
        {label}
      </button>
    </>
  );
}
