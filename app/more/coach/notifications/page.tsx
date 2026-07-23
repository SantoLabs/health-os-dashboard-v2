"use client";
import Icon from "../../../components/Icon";

// Notification Center — full grouped view of reminders & check-ins (Due / Upcoming / History).
// Reached from the global bell ("See all") and the Kai hub ingress tile.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  coachNotifications, coachReminderOp, coachReminderSnooze, coachCheckinOpen,
  type KaiReminder, type KaiNotifications,
} from "../../../lib/api";
import { Screen } from "../../../components/Screen";
import {
  H, SECOND, MUTED, FAINT, SURF, SUNKEN, BORDER, BORDER_STRONG,
  ACCENT, ACCENT_LT, FAT, primaryBtn,
} from "../../../components/KaiChat";

const SNOOZE_PRESETS: { key: string; label: string }[] = [
  { key: "plus_1h", label: "+1h" },
  { key: "plus_2h", label: "+2h" },
  { key: "plus_3h", label: "+3h" },
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow_morning", label: "Tom AM" },
  { key: "tomorrow_evening", label: "Tom PM" },
  { key: "tomorrow_night", label: "Tom night" },
];

function fmt(t?: string | null): string {
  if (!t) return "";
  try { return new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return t; }
}
function whenLabel(r: KaiReminder): string {
  if (r.recurrence && r.recurrence !== "none") return `${r.recur_time || ""} · ${r.recurrence}`;
  return fmt(r.due_at);
}

export default function NotificationCenterPage() {
  const [data, setData] = useState<KaiNotifications | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);

  async function load() { try { const r = await coachNotifications(); setData(r); } catch (e) { setErr((e as Error).message); } }
  useEffect(() => { load(); }, []);

  async function op(r: KaiReminder, o: "done" | "dismiss" | "delete") {
    setBusyId(r.id); setErr(null);
    try { await coachReminderOp({ id: r.id, op: o }); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); setSnoozeFor(null); }
  }
  async function snooze(r: KaiReminder, preset: string) {
    setBusyId(r.id); setErr(null);
    try { await coachReminderSnooze(r.id, preset); await load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); setSnoozeFor(null); }
  }
  async function answer(r: KaiReminder) {
    setBusyId(r.id); setErr(null);
    try {
      const res = await coachCheckinOpen(r.id);
      try { window.dispatchEvent(new CustomEvent("kai:open", { detail: { thread_id: res.thread_id, message: res.message } })); } catch { /* ignore */ }
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }

  const due = data?.due || [];
  const upcoming = data?.upcoming || [];
  const history = data?.history || [];
  const empty = !!data && !due.length && !upcoming.length && !history.length;

  return (
    <Screen title="Notifications">
      {err && <div style={{ fontSize: 12, color: FAT, marginBottom: 12 }}>{err}</div>}
      {data === null ? <Sk /> : empty ? (
        <Empty icon={<Icon name="bell" size={26} />} title="Nothing here yet" sub="Ask Kai things like “remind me to take creatine at 9pm” or “check in on my knee each morning,” and they’ll show up here." />
      ) : (
        <>
          {due.length > 0 && (
            <>
              <Label>{`Due now · ${due.length}`}</Label>
              {due.map((r) => (
                <Row key={r.id} r={r} group="due" busy={busyId === r.id} snoozeOpen={snoozeFor === r.id}
                  onSnoozeToggle={() => setSnoozeFor((v) => (v === r.id ? null : r.id))} onSnooze={snooze} onOp={op} onAnswer={answer} />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <Label>Upcoming</Label>
              {upcoming.map((r) => (
                <Row key={r.id} r={r} group="upcoming" busy={busyId === r.id} snoozeOpen={false}
                  onSnoozeToggle={() => {}} onSnooze={snooze} onOp={op} onAnswer={answer} />
              ))}
            </>
          )}
          {history.length > 0 && (
            <>
              <Label>History</Label>
              {history.map((r) => (
                <Row key={r.id} r={r} group="history" busy={busyId === r.id} snoozeOpen={false}
                  onSnoozeToggle={() => {}} onSnooze={snooze} onOp={op} onAnswer={answer} />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Row({ r, group, busy, snoozeOpen, onSnoozeToggle, onSnooze, onOp, onAnswer }: {
  r: KaiReminder; group: "due" | "upcoming" | "history"; busy: boolean; snoozeOpen: boolean;
  onSnoozeToggle: () => void; onSnooze: (r: KaiReminder, preset: string) => void;
  onOp: (r: KaiReminder, o: "done" | "dismiss" | "delete") => void; onAnswer: (r: KaiReminder) => void;
}) {
  const isCheckin = r.kind === "checkin";
  const due = group === "due";
  const hist = group === "history";
  const statusLabel = r.status === "dismissed" ? "Stopped" : r.status === "done" ? "Done" : "";
  const histWhen = fmt(r.last_fired_at || r.due_at);
  return (
    <div style={{ background: due ? "rgba(79,156,249,.08)" : SURF, border: "1px solid " + (due ? "rgba(79,156,249,.4)" : BORDER), borderRadius: 14, padding: "12px 13px", marginBottom: 10, opacity: hist ? 0.78 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 17, lineHeight: 1.2 }}><Icon name={isCheckin ? "chat" : "bell"} size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{r.title}</div>
          {r.body ? <div style={{ fontSize: 11.5, color: SECOND, marginTop: 2 }}>{r.body}</div> : null}
          {isCheckin && r.seed_prompt ? <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, fontStyle: "italic" }}>{`“${r.seed_prompt}”`}</div> : null}
          <div style={{ fontSize: 11, color: due ? ACCENT_LT : FAINT, marginTop: 5, fontWeight: due ? 700 : 500 }}>
            {due ? "Due now" : hist ? `${statusLabel}${histWhen ? " · " + histWhen : ""}` : whenLabel(r)}
          </div>
        </div>
      </div>
      {!hist && (
        <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          {due && isCheckin ? <button onClick={() => onAnswer(r)} disabled={busy} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 12.5 }}>Answer</button> : null}
          {due ? <button onClick={() => onOp(r, "done")} disabled={busy} style={pillBtn}>{isCheckin ? "Done" : "✓ Done"}</button> : null}
          {due ? <button onClick={onSnoozeToggle} disabled={busy} style={{ ...pillBtn, color: snoozeOpen ? ACCENT_LT : SECOND, borderColor: snoozeOpen ? ACCENT : BORDER_STRONG }}>Snooze ▾</button> : null}
          <button onClick={() => onOp(r, r.recurrence === "none" ? "delete" : "dismiss")} disabled={busy} style={{ ...pillBtn, color: FAINT, marginLeft: due ? 0 : "auto" }}>{r.recurrence === "none" ? "Delete" : "Stop"}</button>
        </div>
      )}
      {hist && (
        <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
          <button onClick={() => onOp(r, "delete")} disabled={busy} style={{ ...pillBtn, color: FAINT, marginLeft: "auto" }}>Delete</button>
        </div>
      )}
      {due && snoozeOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9, paddingTop: 9, borderTop: "1px solid " + BORDER }}>
          {SNOOZE_PRESETS.map((p) => (
            <button key={p.key} onClick={() => onSnooze(r, p.key)} disabled={busy} style={snoozeChip}>{p.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px", color: FAINT, margin: "4px 2px 9px" }}>{children}</div>
);
const Sk = () => <div style={{ height: 80, borderRadius: 14, background: SURF, border: "1px solid " + BORDER, opacity: 0.5 }} />;
const Empty = ({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: SECOND }}>
    <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontSize: 14.5, fontWeight: 700, color: H, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>{sub}</div>
  </div>
);
const pillBtn: CSSProperties = { padding: "8px 13px", borderRadius: 999, border: "1px solid " + BORDER_STRONG, background: "transparent", color: SECOND, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const snoozeChip: CSSProperties = { padding: "6px 11px", borderRadius: 999, border: "1px solid " + BORDER, background: SUNKEN, color: ACCENT_LT, fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
