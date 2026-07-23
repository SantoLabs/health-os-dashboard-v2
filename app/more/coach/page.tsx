"use client";
import Icon from "../../components/Icon";
import type { ReactNode } from "react";

// Kai hub — leads with a Notifications ingress (the full Due/Upcoming/History list
// lives in the Notification Center) plus the editable "What Kai remembers" memory
// manager and saved insights. Reached from the More menu.

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "../../components/Screen";
import {
  coachNotifications, coachMemory, coachMemoryOp,
  coachInsights, coachUnsaveInsight,
  type KaiMemoryItem, type KaiSavedInsight,
} from "../../lib/api";
import {
  H, BODY, SECOND, MUTED, FAINT, SURF, RAISED, SUNKEN, BORDER, BORDER_STRONG,
  ACCENT, ACCENT_LT, PROT, CARB, FIBR, FAT, primaryBtn,
} from "../../components/KaiChat";

const MEM_CATS = ["preference", "nutrition", "training", "health", "goal", "context"];
const CAT_COLOR: Record<string, string> = { preference: FIBR, nutrition: CARB, training: ACCENT, health: FAT, goal: PROT, context: MUTED };

export default function CoachHubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"memory" | "saved">("memory");
  const [dueCount, setDueCount] = useState(0);
  const [memory, setMemory] = useState<KaiMemoryItem[] | null>(null);
  const [insights, setInsights] = useState<KaiSavedInsight[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState("preference");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadDue() { try { const r = await coachNotifications(); setDueCount(r.due_count || 0); } catch { /* ignore */ } }
  async function loadMemory() { try { const r = await coachMemory(); setMemory(r.memory || []); } catch (e) { setErr((e as Error).message); } }
  async function loadInsights() { try { const r = await coachInsights(); setInsights(r.insights || []); } catch (e) { setErr((e as Error).message); } }
  useEffect(() => { loadDue(); loadMemory(); loadInsights(); }, []);
  async function unsave(it: KaiSavedInsight) { setBusyId(it.id); try { await coachUnsaveInsight(it.id); await loadInsights(); } catch (e) { setErr((e as Error).message); } finally { setBusyId(null); } }

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

  return (
    <Screen title="Kai">
      <button onClick={() => router.push("/more/coach/notifications")}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: dueCount > 0 ? "rgba(79,156,249,.08)" : SURF, border: "1px solid " + (dueCount > 0 ? "rgba(79,156,249,.4)" : BORDER), borderRadius: 14, padding: "13px 14px", marginBottom: 16, cursor: "pointer", textAlign: "left" }}>
        <Icon name="bell" size={19} color="var(--muted)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: H }}>Notifications</div>
          <div style={{ fontSize: 11.5, color: dueCount > 0 ? ACCENT_LT : MUTED, marginTop: 2, fontWeight: dueCount > 0 ? 700 : 500 }}>{dueCount > 0 ? `${dueCount} due now` : "Reminders & check-ins"}</div>
        </div>
        {dueCount > 0 ? <span style={{ minWidth: 20, height: 20, padding: "0 6px", boxSizing: "border-box", borderRadius: 999, background: FAT, color: "#1a0c08", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{dueCount > 9 ? "9+" : dueCount}</span> : null}
        <span style={{ fontSize: 18, color: FAINT }}>›</span>
      </button>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["memory", "saved"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", borderRadius: 11, border: "1px solid " + (tab === t ? BORDER_STRONG : BORDER), background: tab === t ? RAISED : "transparent", color: tab === t ? H : SECOND, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {t === "memory" ? "Memory" : "Saved"}
          </button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: FAT, marginBottom: 12 }}>{err}</div>}

      {tab === "memory" ? (
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
            <Empty icon={<Icon name="brain" size={26} />} title="Nothing remembered yet" sub="When you tell Kai a lasting preference or goal, it’ll offer to remember it — or add one here." />
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
      ) : (
        <div>
          {insights === null ? <Sk /> : insights.length === 0 ? (
            <Empty icon={<Icon name="star" size={26} />} title="No saved insights yet" sub="Tap “Save” under any Kai answer to keep it here for quick reference." />
          ) : (
            insights.map((it) => (
              <div key={it.id} style={{ background: SURF, border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 13px", marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: BODY, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{it.body}</div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 10.5, color: FAINT }}>{it.created_at ? new Date(it.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</span>
                  <button onClick={() => unsave(it)} disabled={busyId === it.id} style={{ ...iconLink, color: FAT, marginLeft: "auto" }}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Screen>
  );
}

const Sk = () => <div style={{ height: 80, borderRadius: 14, background: SURF, border: "1px solid " + BORDER, opacity: 0.5 }} />;
const Empty = ({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: SECOND }}>
    <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontSize: 14.5, fontWeight: 700, color: H, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>{sub}</div>
  </div>
);
const iconLink: CSSProperties = { background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 };
