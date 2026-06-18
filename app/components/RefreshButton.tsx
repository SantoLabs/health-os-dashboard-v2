"use client";

import { useEffect, useRef, useState } from "react";
import { triggerSync, getLastSynced } from "../lib/api";

const COOLDOWN_MS = 5 * 60 * 1000;
const LAST_KEY = "hos_last_sync";

export default function RefreshButton() {
  const [phase, setPhase] = useState<"idle" | "syncing" | "cooldown">("idle");
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    const rem = COOLDOWN_MS - (Date.now() - last);
    if (rem > 0) {
      setPhase("cooldown");
      setLeft(Math.ceil(rem / 1000));
    }
  }, []);

  useEffect(() => {
    if (phase !== "cooldown") return;
    if (left <= 0) {
      setPhase("idle");
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  async function onClick() {
    if (phase !== "idle") return;
    setPhase("syncing");
    try {
      const before = await getLastSynced();
      await triggerSync();
      localStorage.setItem(LAST_KEY, String(Date.now()));
      const start = Date.now();
      const poll = async () => {
        if (Date.now() - start > 180000) {
          window.location.reload();
          return;
        }
        const now = await getLastSynced();
        if (now && now !== before) {
          window.location.reload();
          return;
        }
        timer.current = setTimeout(poll, 10000);
      };
      timer.current = setTimeout(poll, 12000);
    } catch (e) {
      setPhase("idle");
      alert(e instanceof Error ? e.message : "Couldn't start a refresh");
    }
  }

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const label =
    phase === "syncing" ? "Syncing…" : phase === "cooldown" ? `Synced · ${mmss}` : "↻ Refresh";

  return (
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
  );
}
