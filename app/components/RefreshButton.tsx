"use client";

import { useEffect, useRef, useState } from "react";
import { triggerSync, getLastSynced } from "../lib/api";

const COOLDOWN_MS = 5 * 60 * 1000;
const LAST_KEY = "hos_last_sync";
const EST_MS = 110_000;
const MAX_MS = 180_000;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ["th","st","nd","rd"][n % 10] || "th";
  return `${n}${s}`;
}
// Render an ISO/UTC timestamp as compact IST, e.g. "18th June, 11:52"
function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  const day = ist.getUTCDate();
  const mon = MONTHS[ist.getUTCMonth()];
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${ordinal(day)} ${mon}, ${hh}:${mm}`;
}

export default function RefreshButton() {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done" | "cooldown">("idle");
  const [left, setLeft] = useState(0);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
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

  function stageMsg(elapsed: number): string {
    if (elapsed < 4000) return "Starting…";
    if (elapsed < 25000) return "Pulling Garmin…";
    if (elapsed < 70000) return "Processing…";
    return "Almost done…";
  }

  function finish() {
    clearTimers();
    setPct(100);
    setMsg("Synced ✓");
    setPhase("done");
    timers.current.push(setTimeout(() => window.location.reload(), 1000));
  }

  async function onClick() {
    if (phase !== "idle") return;
    clearTimers();
    setPhase("syncing"); setPct(6); setMsg("Starting…");
    try {
      const before = await getLastSynced();
      await triggerSync();
      localStorage.setItem(LAST_KEY, String(Date.now()));
      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const target = Math.min(92, 8 + (elapsed / EST_MS) * 84);
        setPct((p) => (p < target ? Math.round(target) : p));
        setMsg(stageMsg(elapsed));
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
      setPhase("idle"); setPct(0); setMsg("");
      alert(e instanceof Error ? e.message : "Couldn't start a refresh");
    }
  }

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const label =
    phase === "syncing" ? "Syncing…" :
    phase === "done" ? "Synced ✓" :
    phase === "cooldown" ? `↻ ${mmss}` : "↻ Refresh";
  const showBar = phase === "syncing" || phase === "done";

  return (
    <div className="refresh-col">
      {showBar && (
        <div className="sync-mini" title={msg} role="status" aria-live="polite">
          <div className="sync-mini-track"><div className="sync-mini-fill" style={{ width: `${pct}%` }} /></div>
          <span className="sync-mini-pct">{pct}%</span>
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
      <div className="last-synced">
        <span className="ls-label">Last synced</span>
        <span className="ls-value">{synced ? fmt(synced) : "—"}</span>
      </div>
    </div>
  );
}
