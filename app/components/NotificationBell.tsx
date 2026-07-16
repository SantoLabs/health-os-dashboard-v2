"use client";

// Global notification bell for the StriveOS masthead: token-themed round button
// with a due-count badge that opens a 2b bottom sheet (design 2b Notifications).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { coachNotifications, coachReminderOp, coachCheckinOpen, type KaiReminder } from "../lib/api";
import Sheet from "./Sheet";

function fmtWhen(r: KaiReminder): string {
  if (r.recurrence && r.recurrence !== "none") return `${r.recur_time || ""} · ${r.recurrence}`;
  if (r.due_at) { try { return new Date(r.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
  return "";
}

function Avatar({ r }: { r: KaiReminder }) {
  if (r.kind === "checkin") return <span className="notif-av notif-av-kai">K</span>;
  return (
    <span className="notif-av">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    </span>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState<KaiReminder[]>([]);
  const [upcoming, setUpcoming] = useState<KaiReminder[]>([]);
  const [count, setCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  async function load() {
    try {
      const r = await coachNotifications();
      setDue(r.due || []); setUpcoming(r.upcoming || []); setCount(r.due_count || 0);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); loadedOnce.current = true; }, []);
  useEffect(() => {
    function onRefresh() { load(); }
    window.addEventListener("focus", onRefresh);
    window.addEventListener("kai:notos-refresh", onRefresh as EventListener);
    return () => { window.removeEventListener("focus", onRefresh); window.removeEventListener("kai:notos-refresh", onRefresh as EventListener); };
  }, []);

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
    <>
      <button className="bell-btn" onClick={() => setOpen(true)} aria-label={count > 0 ? `Notifications, ${count} due` : "Notifications"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && <span className="bell-badge">{count > 9 ? "9+" : count}</span>}
      </button>

      <Sheet open={open} title="Notifications" onClose={() => setOpen(false)}>
        <div className="notif-top">
          <button className="notif-seeall" onClick={seeAll}>See all</button>
        </div>

        {due.length === 0 && upcoming.length === 0 && (
          <div className="notif-empty">You&rsquo;re all caught up.</div>
        )}

        {due.map((r) => {
          const isCheckin = r.kind === "checkin";
          return (
            <div className="notif-row" key={r.id}>
              <Avatar r={r} />
              <div className="notif-main">
                <div className="notif-title">{r.title}</div>
                {r.body && <div className="notif-body">{r.body}</div>}
                <div className="notif-time">{fmtWhen(r)}</div>
                <div className="notif-act">
                  {isCheckin && <button className="notif-btn primary" onClick={() => answer(r)} disabled={busyId === r.id}>Answer</button>}
                  <button className="notif-btn ghost" onClick={() => done(r)} disabled={busyId === r.id}>Done</button>
                </div>
              </div>
              <span className="notif-dot" />
            </div>
          );
        })}

        {upcoming.slice(0, 5).map((r) => (
          <div className="notif-row muted" key={r.id}>
            <Avatar r={r} />
            <div className="notif-main">
              <div className="notif-title">{r.title}</div>
              {r.body && <div className="notif-body">{r.body}</div>}
              <div className="notif-time">{fmtWhen(r)}</div>
            </div>
          </div>
        ))}
      </Sheet>
    </>
  );
}
