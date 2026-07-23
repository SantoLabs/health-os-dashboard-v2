"use client";
import Icon from "./Icon";

// Minimal "N due" chip for the Today page. Renders nothing when nothing is due,
// so Today stays uncluttered; taps through to the Notification Center.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachNotifications } from "../lib/api";

export default function TodayNotosChip() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  async function load() { try { const r = await coachNotifications(); setCount(r.due_count || 0); } catch { /* ignore */ } }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    function onR() { load(); }
    window.addEventListener("focus", onR);
    window.addEventListener("kai:notos-refresh", onR as EventListener);
    return () => { window.removeEventListener("focus", onR); window.removeEventListener("kai:notos-refresh", onR as EventListener); };
  }, []);
  if (count <= 0) return null;
  return (
    <button
      onClick={() => router.push("/more/coach/notifications")}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        background: "var(--ember-tint)", border: "1px solid var(--ember)",
        borderRadius: 12, padding: "10px 13px", marginBottom: 12, cursor: "pointer",
        textAlign: "left", fontFamily: "inherit",
      }}
    >
      <Icon name="bell" size={14} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--ember-strong)" }}>
        {count} {count === 1 ? "reminder" : "reminders"} due now
      </span>
      <span style={{ minWidth: 18, height: 18, padding: "0 5px", boxSizing: "border-box", borderRadius: 999, background: "var(--ember)", color: "var(--on-ember)", fontSize: 10.5, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{count > 9 ? "9+" : count}</span>
      <span style={{ fontSize: 15, color: "var(--faint)" }}>›</span>
    </button>
  );
}
