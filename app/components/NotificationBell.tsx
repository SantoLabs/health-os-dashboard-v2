"use client";

// Global notification bell for the app topbar: badge = due_count, and a compact
// due-only dropdown with quick actions plus a "See all" link to the center.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { coachNotifications, coachReminderOp, coachCheckinOpen, type KaiReminder } from "../lib/api";
import {
  SURF, RAISED, BORDER, BORDER_STRONG, H, SECOND, MUTED, FAINT, ACCENT_LT, FAT, primaryBtn,
} from "./KaiChat";

function fmtWhen(r: KaiReminder): string {
  if (r.recurrence && r.recurrence !== "none") return `${r.recur_time || ""} · ${r.recurrence}`;
  if (r.due_at) { try { return new Date(r.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
  return "";
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState<KaiReminder[]>([]);
  const [count, setCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try { const r = await coachNotifications(); setDue(r.due || []); setCount(r.due_count || 0); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    function onRefresh() { load(); }
    window.addEventListener("focus", onRefresh);
    window.addEventListener("kai:notos-refresh", onRefresh as EventListener);
    return () => { window.removeEventListener("focus", onRefresh); window.removeEventListener("kai:notos-refresh", onRefresh as EventListener); };
  }, []);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function done(r: KaiReminder) {
    setBusyId(r.id);
    try { await coachReminderOp({ id: r.id, op: "done" }); await load(); } catch { /* ignore */ } finally { setBusyId(null); }
  }
  async function answer(r: KaiReminder) {
    setBusyId(r.id);
    try {
      const res = await coachCheckinOpen(r.id);
      try { window.dispatchEvent(new CustomEvent("kai:open", { detail: { thread_id: res.thread_id, message: res.message } })); } catch { /* ignore */ }
      setOpen(false); await load();
    } catch { /* ignore */ } finally { setBusyId(null); }
  }
  function seeAll() { setOpen(false); router.push("/more/coach/notifications"); }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications" style={{ position: "relative", width: 34, height: 34, borderRadius: 10, border: "1px solid " + BORDER, background: SURF, color: SECOND, fontSize: 16, cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        🔔
        {count > 0 && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 999, background: FAT, color: "#1a0c08", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{count > 9 ? "9+" : count}</span>
        )}
      </button>
      {open && (
        <div style={{ position: "fixed", top: 58, right: 10, width: 300, maxWidth: "calc(100vw - 20px)", background: RAISED, border: "1px solid " + BORDER_STRONG, borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,.4)", zIndex: 60, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", borderBottom: "1px solid " + BORDER, fontSize: 12, fontWeight: 800, color: H }}>{count > 0 ? `${count} due now` : "Notifications"}</div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {due.length === 0 ? (
              <div style={{ padding: "20px 14px", textAlign: "center", color: MUTED, fontSize: 12.5 }}>You&rsquo;re all caught up.</div>
            ) : (
              due.slice(0, 6).map((r) => {
                const isCheckin = r.kind === "checkin";
                return (
                  <div key={r.id} style={{ padding: "10px 13px", borderBottom: "1px solid " + BORDER }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14 }}>{isCheckin ? "💬" : "🔔"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: H, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{fmtWhen(r)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                      {isCheckin ? <button onClick={() => answer(r)} disabled={busyId === r.id} style={{ ...primaryBtn, padding: "5px 12px", fontSize: 11.5 }}>Answer</button> : null}
                      <button onClick={() => done(r)} disabled={busyId === r.id} style={miniBtn}>{isCheckin ? "Done" : "✓ Done"}</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <button onClick={seeAll} style={{ width: "100%", padding: "11px 13px", border: "none", borderTop: "1px solid " + BORDER, background: "transparent", color: ACCENT_LT, fontSize: 12, fontWeight: 800, cursor: "pointer", textAlign: "left" }}>See all notifications ›</button>
        </div>
      )}
    </div>
  );
}

const miniBtn: CSSProperties = { padding: "5px 11px", borderRadius: 999, border: "1px solid " + BORDER_STRONG, background: "transparent", color: SECOND, fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
