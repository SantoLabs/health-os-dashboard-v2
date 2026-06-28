"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Screen } from "../../components/Screen";
import {
  coachThreads, coachThread, coachSend, coachVision, coachThreadOp,
  type KaiThread, type KaiMessage,
} from "../../lib/api";
import {
  KaiMark, MessageRow, relTime, primaryBtn, useVoiceInput, CameraButton, type PickedImage,
  SURF, INPUTBG, BORDER, BORDER_STRONG, BORDER_ACCENT,
  H, BODY, SECOND, MUTED, FAINT, FAINTER, ACCENT, ACCENT_LT, FAT, FIBR,
} from "../../components/KaiChat";

const SUGGEST = [
  "Am I on track for 20% body fat by September?",
  "How do I hit my protein target without eggs or whey?",
  "What's a good high-protein veg dinner?",
  "How much protein do I have left today?",
];

// ===================== Page =====================
export default function AskPage() {
  const [view, setView] = useState<"list" | "chat">("list");
  const [threads, setThreads] = useState<KaiThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<KaiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput((t) => setInput((cur) => (cur ? cur.trim() + " " : "") + t));
  const [img, setImg] = useState<PickedImage | null>(null);

  useEffect(() => { loadThreads(true); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  // If we arrived from a Home daily-card chip, auto-open a chat and ask it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let seed: string | null = null;
    try { seed = window.sessionStorage.getItem("kai_seed"); } catch { seed = null; }
    if (seed) {
      try { window.sessionStorage.removeItem("kai_seed"); } catch { /* ignore */ }
      setView("chat"); setThreadId(null); setMessages([]);
      send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThreads(first = false) {
    try {
      const r = await coachThreads();
      setThreads(r.threads || []);
      if (first && (!r.threads || r.threads.length === 0)) { setView("chat"); setThreadId(null); setMessages([]); }
    } catch (e) { setErr((e as Error).message); } finally { setLoadingThreads(false); }
  }
  async function openThread(id: string) {
    setView("chat"); setThreadId(id); setMessages([]); setErr(null); setBusy(true);
    try { const r = await coachThread(id); setMessages(r.messages || []); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function newChat() { setView("chat"); setThreadId(null); setMessages([]); setErr(null); setInput(""); }

  async function send(q: string) {
    const text = q.trim(); if ((!text && !img) || busy) return;
    setErr(null); setInput("");
    const staged = img; setImg(null);
    setMessages((m) => [...m, { id: "tmp-" + Date.now(), role: "user", text: staged ? (text || "📷 Photo") : text }]);
    setBusy(true);
    try {
      const r = staged
        ? await coachVision({ text, image: { mime: staged.mime, data: staged.data }, thread_id: threadId || undefined })
        : await coachSend({ text, thread_id: threadId || undefined });
      if (!threadId) setThreadId(r.thread_id);
      setMessages((m) => [...m, r.message]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); loadThreads(); }
  }
  function updateMsg(m: KaiMessage) { setMessages((arr) => arr.map((x) => (x.id === m.id ? m : x))); }

  async function pin(t: KaiThread) { setSwiped(null); await coachThreadOp("pin", { id: t.id, pinned: !t.pinned }); loadThreads(); }
  async function del(t: KaiThread) { setSwiped(null); await coachThreadOp("delete_thread", { id: t.id }); loadThreads(); }
  async function rename(t: KaiThread) {
    setSwiped(null);
    const title = typeof window !== "undefined" ? window.prompt("Rename chat", t.title) : null;
    if (title && title.trim()) { await coachThreadOp("rename", { id: t.id, title: title.trim() }); loadThreads(); }
  }

  // ---------- LIST VIEW ----------
  if (view === "list") {
    const pinned = threads.filter((t) => t.pinned);
    const recent = threads.filter((t) => !t.pinned);
    return (
      <Screen title="">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <KaiMark size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: H }}>Kai</div>
            <div style={{ fontSize: 11.5, color: SECOND }}>Your data-aware coach</div>
          </div>
          <button onClick={newChat} aria-label="New chat" style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 20, cursor: "pointer", boxShadow: "0 6px 16px rgba(79,156,249,.4)" }}>+</button>
        </div>

        {loadingThreads && <div style={{ color: FAINT, fontSize: 13, textAlign: "center", padding: 24 }}>Loading…</div>}
        {err && <div style={{ color: FAT, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        {!loadingThreads && threads.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <div style={{ fontSize: 13, color: SECOND, marginBottom: 14 }}>Ask Kai anything about your training, fuel, and recovery — grounded in your live data.</div>
            <button onClick={newChat} style={{ ...primaryBtn, padding: "12px 22px" }}>Start a chat</button>
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div style={lblStyle}>📌 Pinned</div>
            {pinned.map((t) => <ThreadRow key={t.id} t={t} swiped={swiped === t.id} onSwipe={() => setSwiped(swiped === t.id ? null : t.id)} onOpen={() => openThread(t.id)} onPin={() => pin(t)} onDel={() => del(t)} onRename={() => rename(t)} />)}
          </>
        )}
        {recent.length > 0 && (
          <>
            <div style={lblStyle}>Recent</div>
            {recent.map((t) => <ThreadRow key={t.id} t={t} swiped={swiped === t.id} onSwipe={() => setSwiped(swiped === t.id ? null : t.id)} onOpen={() => openThread(t.id)} onPin={() => pin(t)} onDel={() => del(t)} onRename={() => rename(t)} />)}
          </>
        )}
        {threads.length > 0 && <div style={{ fontSize: 10.5, color: FAINTER, textAlign: "center", marginTop: 12 }}>Tap ⋯ on a chat to pin, rename, or delete.</div>}
      </Screen>
    );
  }

  // ---------- CHAT VIEW ----------
  return (
    <Screen title="">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <button onClick={() => { setView("list"); loadThreads(); }} aria-label="Back" style={{ background: "none", border: "none", color: SECOND, fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>‹</button>
        <KaiMark size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: H }}>Kai</div>
          <div style={{ fontSize: 10.5, color: FIBR, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: FIBR }} />Knows your day</div>
        </div>
        <button onClick={newChat} aria-label="New chat" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 17, cursor: "pointer" }}>+</button>
      </div>

      {messages.length === 0 && !busy && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <KaiMark size={26} />
            <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: BODY, fontSize: 14, lineHeight: 1.5 }}>
              Hey! I'm Kai. I can see your targets, today's log, and your diet constraints — ask me anything, or tell me what you ate and I'll log it.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => send(s)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 11, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 12.5, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m) => <MessageRow key={m.id} msg={m} onApplied={updateMsg} onUndone={updateMsg} />)}
      {busy && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <KaiMark size={26} />
          <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: FAINT, fontSize: 13 }}>Kai is thinking…</div>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: FAT, marginBottom: 10 }}>{err}</div>}
      <div ref={endRef} />

      <div style={{ position: "sticky", bottom: 0, paddingTop: 8, paddingBottom: 4, background: "linear-gradient(180deg,transparent,#0e1320 22%)" }}>
        {img ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, background: SURF, border: "1px solid " + BORDER, borderRadius: 12, padding: 7 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.preview} alt="attached" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
            <span style={{ flex: 1, fontSize: 12.5, color: SECOND }}>Photo attached</span>
            <button onClick={() => setImg(null)} aria-label="Remove photo" style={{ background: "none", border: "none", color: FAINT, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CameraButton onImage={setImg} disabled={busy} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder={img ? "Add a note (optional)\u2026" : "Message Kai\u2026"}
            style={{ flex: 1, padding: "12px 15px", borderRadius: 999, border: "1px solid " + BORDER_STRONG, background: INPUTBG, color: BODY, fontSize: 14, outline: "none", fontFamily: "inherit" }}
          />
          {voice.supported ? (
            <button onClick={voice.toggle} aria-label="Voice input"
              style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid " + BORDER_STRONG, background: voice.listening ? ACCENT : INPUTBG, color: voice.listening ? "#fff" : SECOND, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>{voice.listening ? "\u25A0" : "\uD83C\uDFA4"}</button>
          ) : null}
          <button onClick={() => send(input)} disabled={busy || (!input.trim() && !img)} aria-label="Send"
            style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: (input.trim() || img) && !busy ? ACCENT : "#1c2740", color: "#fff", fontSize: 17, cursor: (input.trim() || img) && !busy ? "pointer" : "default", flexShrink: 0 }}>↑</button>
        </div>
        <div style={{ fontSize: 10, color: FAINTER, textAlign: "center", marginTop: 6 }}>Not medical advice · clinical questions → your physician</div>
      </div>
    </Screen>
  );
}

const lblStyle: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: FAINT, margin: "14px 0 7px" };

function ThreadRow({ t, swiped, onSwipe, onOpen, onPin, onDel, onRename }: { t: KaiThread; swiped: boolean; onSwipe: () => void; onOpen: () => void; onPin: () => void; onDel: () => void; onRename: () => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <div onClick={onOpen} style={{ background: t.pinned ? "#13203a" : SURF, border: "1px solid " + (t.pinned ? BORDER_ACCENT : BORDER), borderRadius: 13, padding: "12px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.pinned ? "📌 " : ""}{t.title}</div>
          {t.last_message ? <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{t.last_message}</div> : null}
        </div>
        <span style={{ fontSize: 10.5, color: FAINT }}>{relTime(t.updated_at)}</span>
        <button onClick={(e) => { e.stopPropagation(); onSwipe(); }} aria-label="Options" style={{ background: "none", border: "none", color: FAINT, fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>⋯</button>
      </div>
      {swiped && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
          <button onClick={onRename} style={rowAct}>Rename</button>
          <button onClick={onPin} style={{ ...rowAct, color: ACCENT_LT, borderColor: BORDER_ACCENT, background: "#1c2740" }}>{t.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={onDel} style={{ ...rowAct, color: FAT, borderColor: "#3a2330", background: "#3a2330" }}>Delete</button>
        </div>
      )}
    </div>
  );
}
const rowAct: CSSProperties = { padding: "7px 14px", borderRadius: 9, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 12, fontWeight: 700, cursor: "pointer" };
