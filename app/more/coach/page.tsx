"use client";

// Kai hub — in-app Reminders & check-ins surface (with due highlighting) plus the
// editable "What Kai remembers" memory manager. Reached from the More menu.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "../../components/Screen";
import {
  coachReminders, coachReminderOp, coachMemory, coachMemoryOp,
  type KaiReminder, type KaiMemoryItem,
} from "../../lib/api";
import {
  H, BODY, SECOND, MUTED, FAINT, SURF, RAISED, SUNKEN, BORDER, BORDER_STRONG,
  ACCENT, ACCENT_LT, PROT, CARB, FIBR, FAT, primaryBtn,
} from "../../components/KaiChat";

const MEM_CATS = ["preference", "nutrition", "training", "health", "goal", "context"];
const CAT_COLOR: Record<string, string> = { preference: FIBR, nutrition: CARB, training: ACCENT, health: FAT, goal: PROT, context: MUTED };

function whenLabel(r: KaiReminder): string {
  if (r.recurrence && r.recurrence !== "none") return `${r.recur_time || ""} · ${r.recurrence}`;
  if (r.due_at) {
    try { return new Date(r.due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return r.due_at; }
  }
  return "";
}

export default function CoachHubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"reminders" | "memory">("reminders");
  const [reminders, setReminders] = useState<KaiReminder[] | null>(null);
  const [memory, setMemory] = useState<KaiMemoryItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState("preference");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadReminders() { try { const r = await coachReminders(); setReminders(r.reminders || []); } catch (e) { setErr((e as Error).message); } }
  async function loadMemory() { try { const r = await coachMemory(); setMemory(r.memory || []); } catch (e) { setErr((e as Error).message); } }
  useEffect(() => { loadReminders(); loadMemory(); }, []);

  async function remOp(r: KaiReminder, op: "done" | "snooze" | "dismiss" | "delete", snooze_mins?: number) {
    setBusyId(r.id); setErr(null);
    try { await coachReminderOp({ id: r.id, op, snooze_mins }); await loadReminders(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }
  function openCheckin(r: KaiReminder) {
    const seed = r.seed_prompt || `About my check-in: ${r.title}`;
    try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ }
    if (r.recurrence !== "none" || r.due) coachReminderOp({ id: r.id, op: "done" }).catch(() => {});
    router.push("/more/ask");
  }

  async function addMemory() {
    const text = newText.trim(); if (!text) return;
    setBusyId("add"); setErr(null);
    try { await coachMemoryOp({ op: "add", text, category: newCat }); setNewText(""); setAdding(false); await loadMemory(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }
  async function editMemory(m: KaiMemoryItem) {
    const text = typeof window !== "undefined" ? window.prompt("Edit what Kai remembers", m.text) : null;
    if (text == null || !text.trim() || text.trim() === m.text) return;
    setBusyId(m.id); try { await coachMemoryOp({ op: "edit", id: m.id, text: text.trim() }); await loadMemory(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }
  async function delMemory(m: KaiMemoryItem) {
    if (typeof window !== "undefined" && !window.confirm("Forget this?")) return;
    setBusyId(m.id); try { await coachMemoryOp({ op: "delete", id: m.id }); await loadMemory(); }
    catch (e) { setErr((e as Error).message); } finally { setBusyId(null); }
  }

  const due = (reminders || []).filter((r) => r.due);
  const rest = (reminders || []).filter((r) => !r.due);

  return (
    <Screen title="Kai">
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["reminders", "memory"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", borderRadius: 11, border: "1px solid " + (tab === t ? BORDER_STRONG : BORDER), background: tab === t ? RAISED : "transparent", color: tab === t ? H : SECOND, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {t === "reminders" ? "Reminders" : "Memory"}
            {t === "reminders" && due.length ? <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 800, color: "#0c1422", background: ACCENT, borderRadius: 999, padding: "1px 7px" }}>{due.length}</span> : null}
          </button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: FAT, marginBottom: 12 }}>{err}</div>}

      {tab === "reminders" ? (
        <div>
          {reminders === null ? <Sk /> : reminders.length === 0 ? (
            <Empty icon="🔔" title="No reminders yet" sub="Ask Kai things like “remind me to take creatine at 9pm” or “check in on my knee each morning.”" />
          ) : (
            <>
              {due.length > 0 && (
                <>
                  <Label>Due now</Label>
                  {due.map((r) => <ReminderRow key={r.id} r={r} busy={busyId === r.id} onOp={remOp} onOpen={openCheckin} due />)}
                </>
              )}
              {rest.length > 0 && (
                <>
                  <Label>{due.length ? "Scheduled" : "All reminders"}</Label>
                  {rest.map((r) => <ReminderRow key={r.id} r={r} busy={busyId === r.id} onOp={remOp} onOpen={openCheckin} />)}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, color: MUTED, flex: 1, lineHeight: 1.5 }}>Durable facts Kai uses to personalize advice. A wrong memory is worse than none — edit freely.</span>
            <button onClick={() => setAdding((v) => !v)} style={{ ...primaryBtn, padding: "8px 14px", fontSize: 12.5 }}>{adding ? "Close" : "+ Add"}</button>
          </div>

          {adding && (
            <div style={{ background: RAISED, border: "1px solid " + BORDER_STRONG, borderRadius: 14, padding: 13, marginBottom: 14 }}>
              <textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="e.g. Trains for trail ultras; dislikes mushrooms" rows={2}
                style={{ width: "100%", boxSizing: "border-box", background: SUNKEN, border: "1px solid " + BORDER, borderRadius: 10, color: BODY, fontSize: 13.5, padding: "9px 11px", resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
                {MEM_CATS.map((c) => (
                  <button key={c} onClick={() => setNewCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer", textTransform: "capitalize", border: "1px solid " + (newCat === c ? (CAT_COLOR[c] || ACCENT) : BORDER), background: newCat === c ? (CAT_COLOR[c] || ACCENT) + "22" : "transparent", color: newCat === c ? (CAT_COLOR[c] || ACCENT_LT) : SECOND }}>{c}</button>
                ))}
              </div>
              <button onClick={addMemory} disabled={busyId === "add" || !newText.trim()} style={{ ...primaryBtn, width: "100%", opacity: busyId === "add" || !newText.trim() ? 0.6 : 1 }}>{busyId === "add" ? "Saving…" : "Save to memory"}</button>
            </div>
          )}

          {memory === null ? <Sk /> : memory.length === 0 ? (
            <Empty icon="🧠" title="Nothing remembered yet" sub="When you tell Kai a lasting preference or goal, it’ll offer to remember it — or add one here." />
          ) : (
            memory.map((m) => (
              <div key={m.id} style={{ background: SURF, border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 13px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: CAT_COLOR[m.category] || MUTED, background: (CAT_COLOR[m.category] || MUTED) + "1e", borderRadius: 6, padding: "2px 7px" }}>{m.category}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                    <button onClick={() => editMemory(m)} disabled={busyId === m.id} style={iconLink}>Edit</button>
                    <button onClick={() => delMemory(m)} disabled={busyId === m.id} style={{ ...iconLink, color: FAT }}>Forget</button>
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: BODY, lineHeight: 1.5 }}>{m.text}</div>
              </div>
            ))
          )}
        </div>
      )}
    </Screen>
  );
}

function ReminderRow({ r, busy, onOp, onOpen, due }: { r: KaiReminder; busy: boolean; onOp: (r: KaiReminder, op: "done" | "snooze" | "dismiss" | "delete", mins?: number) => void; onOpen: (r: KaiReminder) => void; due?: boolean }) {
  const isCheckin = r.kind === "checkin";
  return (
    <div style={{ background: due ? "rgba(79,156,249,.08)" : SURF, border: "1px solid " + (due ? "rgba(79,156,249,.4)" : BORDER), borderRadius: 14, padding: "12px 13px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 17, lineHeight: 1.2 }}>{isCheckin ? "💬" : "🔔"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{r.title}</div>
          {r.body ? <div style={{ fontSize: 11.5, color: SECOND, marginTop: 2 }}>{r.body}</div> : null}
          {isCheckin && r.seed_prompt ? <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, fontStyle: "italic" }}>“{r.seed_prompt}”</div> : null}
          <div style={{ fontSize: 11, color: due ? ACCENT_LT : FAINT, marginTop: 5, fontWeight: due ? 700 : 500 }}>{due ? "Due now" : whenLabel(r)}{r.recurrence !== "none" && due ? ` · ${whenLabel(r)}` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
        {due && isCheckin ? <button onClick={() => onOpen(r)} disabled={busy} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 12.5 }}>Open with Kai</button> : null}
        {due ? <button onClick={() => onOp(r, "done")} disabled={busy} style={pillBtn}>{isCheckin ? "Done" : "✓ Done"}</button> : null}
        {due ? <button onClick={() => onOp(r, "snooze", 60)} disabled={busy} style={pillBtn}>Snooze 1h</button> : null}
        <button onClick={() => onOp(r, r.recurrence === "none" ? "delete" : "dismiss")} disabled={busy} style={{ ...pillBtn, color: FAINT, marginLeft: due ? 0 : "auto" }}>{r.recurrence === "none" ? "Delete" : "Stop"}</button>
      </div>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px", color: FAINT, margin: "4px 2px 9px" }}>{children}</div>
);
const Sk = () => <div style={{ height: 80, borderRadius: 14, background: SURF, border: "1px solid " + BORDER, opacity: 0.5 }} />;
const Empty = ({ icon, title, sub }: { icon: string; title: string; sub: string }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: SECOND }}>
    <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontSize: 14.5, fontWeight: 700, color: H, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>{sub}</div>
  </div>
);
const pillBtn: CSSProperties = { padding: "8px 13px", borderRadius: 999, border: "1px solid " + BORDER_STRONG, background: "transparent", color: SECOND, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const iconLink: CSSProperties = { background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 };
