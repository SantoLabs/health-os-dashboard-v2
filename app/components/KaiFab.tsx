"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { coachSend, coachVision, type KaiMessage } from "../lib/api";
import {
  KaiMark, MessageRow, useVoiceInput, CameraButton, type PickedImage,
  PAGE, SURF, BORDER,
  H, BODY, SECOND, MUTED, FAINT, ACCENT, ACCENT_LT,
} from "./KaiChat";

// ---- route → context pointer + tailored quick prompts ----
type Ctx = { label: string; hint: string; chips: string[] };
const GENERIC: Ctx = {
  label: "",
  hint: "the Health OS app",
  chips: ["What should I focus on today?", "How's my recovery?"],
};
const CTX: Record<string, Ctx> = {
  "/": { label: "Today", hint: "the Today dashboard — readiness, the day's plan, and what's driving it", chips: ["What should I focus on today?", "How's my recovery?"] },
  "/trends": { label: "Trends", hint: "the Trends screen — sleep, HRV, training-load and body-comp charts", chips: ["What stands out this fortnight?", "Anything I should fix?"] },
  "/sleep": { label: "Sleep", hint: "the Sleep screen — last night and the recent sleep trend", chips: ["How's my sleep trending?", "How can I sleep better?"] },
  "/train": { label: "Training", hint: "the Training screen — recent activities and the planned sessions", chips: ["Was that session smart?", "What's next in my plan?"] },
  "/more/nutrition": { label: "Nutrition", hint: "the Nutrition screen — today's food log and macro targets", chips: ["Is this enough protein today?", "What should I eat next?"] },
  "/more/schedule": { label: "Schedule", hint: "the Schedule screen — the training plan and calendar", chips: ["Is my week balanced?", "Should I move anything?"] },
  "/more/goals": { label: "Goals & Body", hint: "the Goals & Body screen — active goals and body composition", chips: ["Am I on track for my goal?", "How's my body-comp trending?"] },
  "/more/medical": { label: "Medical", hint: "the Medical screen — bloodwork and screening history", chips: ["Any flags in my bloodwork?", "What should I retest?"] },
  "/more/mind": { label: "Mind", hint: "the Mind screen — mood and mindfulness", chips: ["How's my mood lately?", "A quick reset for stress?"] },
  "/more/profile": { label: "Profile", hint: "the Profile screen — settings and preferences", chips: ["What should I focus on today?", "How's my recovery?"] },
  "/more": { label: "Menu", hint: "the app menu", chips: ["What should I focus on today?", "How's my recovery?"] },
};
function ctxFor(path: string): Ctx { return CTX[path] || GENERIC; }

// Draggable Messenger-style chat head: floats over everything, snaps to the
// nearest edge on release, remembers where you left it, and a tap opens Kai.
const FAB_SIZE = 54;
const FAB_MARGIN = 14;
const FAB_KEY = "kai_fab_pos";
type FabPos = { side: "left" | "right"; top: number };

export default function KaiFab() {
  const path = usePathname() || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<KaiMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingSeed, setPendingSeed] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput((t) => setInput((cur) => (cur ? cur.trim() + " " : "") + t));
  const [img, setImg] = useState<PickedImage | null>(null);
  const [fabPos, setFabPos] = useState<FabPos | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);

  const ctx = ctxFor(path);

  // New page = fresh context. Reset the ephemeral conversation when the route changes.
  useEffect(() => { setMessages([]); setThreadId(null); setErr(null); setInput(""); setImg(null); }, [path]);
  // Close the sheet when navigating.
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    function onKaiOpen(e: Event) {
      const d = ((e as CustomEvent).detail || {}) as { thread_id?: string; message?: KaiMessage; seed?: string };
      // Seeded open: start a fresh thread and auto-ask the tapped prompt.
      if (d.seed) {
        setThreadId(null); setMessages([]); setErr(null); setInput(""); setImg(null);
        setOpen(true); setPendingSeed(d.seed);
        return;
      }
      if (d.thread_id) setThreadId(d.thread_id);
      setMessages(d.message ? [d.message] : []);
      setErr(null); setInput(""); setImg(null); setOpen(true);
    }
    window.addEventListener("kai:open", onKaiOpen as EventListener);
    return () => window.removeEventListener("kai:open", onKaiOpen as EventListener);
  }, []);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, open]);
  // Fire a seeded prompt (e.g. a tapped Today chip) once the sheet is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && pendingSeed) { const s = pendingSeed; setPendingSeed(null); send(s); } }, [open, pendingSeed]);
  // Restore the chat head where the user last left it (clamped to the viewport).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.innerHeight;
    const clamp = (t: number) => Math.max(56, Math.min(h - FAB_SIZE - FAB_MARGIN, t));
    try {
      const raw = localStorage.getItem(FAB_KEY);
      if (raw) { const p = JSON.parse(raw) as FabPos; setFabPos({ side: p.side === "left" ? "left" : "right", top: clamp(p.top) }); return; }
    } catch { /* ignore */ }
    setFabPos({ side: "right", top: clamp(h - 76 - FAB_SIZE - FAB_MARGIN) });
  }, []);

  // Don't show the FAB on the full Ask tab (it would be redundant there).
  if (path === "/more/ask") return null;

  async function send(q: string) {
    const text = q.trim(); if ((!text && !img) || busy) return;
    setErr(null); setInput("");
    const staged = img; setImg(null);
    setMessages((m) => [...m, { id: "tmp-" + Date.now(), role: "user", text: staged ? (text || "Photo") : text }]);
    setBusy(true);
    try {
      const r = staged
        ? await coachVision({ text, image: { mime: staged.mime, data: staged.data }, thread_id: threadId || undefined, context_route: path })
        : await coachSend({ text, thread_id: threadId || undefined, context_route: path, page_context: { label: ctx.label, hint: ctx.hint } });
      if (!threadId) setThreadId(r.thread_id);
      setMessages((m) => [...m, r.message]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function updateMsg(m: KaiMessage) { setMessages((arr) => arr.map((x) => (x.id === m.id ? m : x))); }
  function openFullChat() { setOpen(false); router.push("/more/ask"); }

  // ---- chat-head drag (pointer = touch + mouse) ----
  function fabDown(e: ReactPointerEvent<HTMLButtonElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { sx: e.clientX, sy: e.clientY, moved: false };
  }
  function fabMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current; if (!d) return;
    if (!d.moved && (Math.abs(e.clientX - d.sx) > 6 || Math.abs(e.clientY - d.sy) > 6)) d.moved = true;
    if (d.moved) setDrag({ x: e.clientX - FAB_SIZE / 2, y: e.clientY - FAB_SIZE / 2 });
  }
  function fabUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setDrag(null); setOpen(true); return; } // a tap opens Kai
    const w = window.innerWidth, h = window.innerHeight;
    const side: "left" | "right" = e.clientX < w / 2 ? "left" : "right";
    const top = Math.max(56, Math.min(h - FAB_SIZE - FAB_MARGIN, e.clientY - FAB_SIZE / 2));
    const next: FabPos = { side, top };
    setFabPos(next); setDrag(null);
    try { localStorage.setItem(FAB_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const fabStyle: CSSProperties = drag
    ? { left: drag.x, top: drag.y }
    : fabPos
      ? (fabPos.side === "left" ? { left: FAB_MARGIN, top: fabPos.top } : { right: FAB_MARGIN, top: fabPos.top })
      : { right: 16, bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" };
  const canSend = !!(input.trim() || img) && !busy;

  return (
    <>
      {/* Floating, draggable chat head (Messenger-style) */}
      {!open && (
        <button
          type="button"
          aria-label="Ask Kai — drag to move"
          className="app-fab"
          onPointerDown={fabDown}
          onPointerMove={fabMove}
          onPointerUp={fabUp}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
          style={{
            position: "fixed", ...fabStyle,
            width: 54, height: 54, borderRadius: "50%", border: "none", zIndex: 60,
            cursor: drag ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
            background: "radial-gradient(circle at 30% 26%, #e8956f, #d96f4e 52%, #b75a3c)",
            boxShadow: drag
              ? "0 14px 34px rgba(217,111,78,.5), 0 4px 12px rgba(0,0,0,.32)"
              : "0 6px 20px rgba(217,111,78,.45), 0 2px 6px rgba(0,0,0,.25)",
            transform: drag ? "scale(1.06)" : "scale(1)",
            transition: drag ? "none" : "left .2s ease, right .2s ease, top .2s ease, transform .12s, box-shadow .15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
            <path d="M6 9c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
            <path d="M6 14c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* Bottom sheet */}
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(4,8,16,.55)", backdropFilter: "blur(2px)" }} />
          <div
            style={{
              position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: PAGE, borderTopLeftRadius: 20, borderTopRightRadius: 20,
              border: "1px solid " + BORDER, borderBottom: "none", maxHeight: "82vh", height: "82vh",
              display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,.5)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: "1px solid " + BORDER }}>
              <KaiMark size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: H, display: "flex", alignItems: "center", gap: 7 }}>
                  Kai
                  {ctx.label ? <span style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT_LT, background: "rgba(217,111,78,.12)", border: "1px solid rgba(217,111,78,.28)", borderRadius: 999, padding: "2px 8px" }}>on {ctx.label}</span> : null}
                </div>
                <button onClick={openFullChat} style={{ fontSize: 11, color: SECOND, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Open full chat &amp; history →</button>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid " + BORDER, background: SURF, color: SECOND, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 15px" }}>
              {messages.length === 0 ? (
                <div>
                  <div style={{ fontSize: 13.5, color: BODY, lineHeight: 1.55, marginBottom: 14 }}>
                    Hey — I can see you&apos;re on <span style={{ color: H, fontWeight: 700 }}>{ctx.label || "Health OS"}</span>. Ask me anything about what you&apos;re looking at.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ctx.chips.map((c, i) => (
                      <button key={i} onClick={() => send(c)} style={{ textAlign: "left", fontSize: 13, color: ACCENT_LT, background: "rgba(217,111,78,.08)", border: "1px solid rgba(217,111,78,.24)", borderRadius: 12, padding: "10px 13px", cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => <MessageRow key={m.id} msg={m} onApplied={updateMsg} onUndone={updateMsg} />)
              )}
              {busy && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <KaiMark size={26} />
                  <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: MUTED, fontSize: 13 }}>Thinking…</div>
                </div>
              )}
              {err && <div style={{ fontSize: 12, color: "#f0735a", marginTop: 8 }}>{err}</div>}
              <div ref={endRef} />
            </div>

            {/* Composer — 1b floating glass dock */}
            <div style={{ padding: "10px 12px calc(12px + env(safe-area-inset-bottom, 0px))" }}>
              {img ? (
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, background: SURF, border: "1px solid " + BORDER, borderRadius: 14, padding: 7 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt="attached" style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }} />
                  <span style={{ flex: 1, fontSize: 12, color: SECOND }}>Photo attached</span>
                  <button onClick={() => setImg(null)} aria-label="Remove photo" style={{ background: "none", border: "none", color: FAINT, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 7, alignItems: "center", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 999, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.05)" }}>
                <CameraButton onImage={setImg} disabled={busy} />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
                  placeholder={img ? "Add a note (optional)\u2026" : ctx.label ? `Ask about ${ctx.label}\u2026` : "Ask Kai\u2026"}
                  style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "8px 4px", color: H, fontSize: 14, outline: "none" }}
                />
                {voice.supported ? (
                  <button onClick={voice.toggle} aria-label="Voice input"
                    style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: voice.listening ? ACCENT : "var(--surface-2)", color: voice.listening ? "var(--on-ember)" : "var(--text-2)", cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {voice.listening ? (
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--on-ember)" }} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
                    )}
                  </button>
                ) : null}
                <button
                  onClick={() => send(input)}
                  disabled={!canSend}
                  aria-label="Send"
                  style={{ width: 42, height: 42, borderRadius: "50%", border: "none", flexShrink: 0, cursor: canSend ? "pointer" : "default",
                    background: canSend ? "radial-gradient(circle at 30% 26%, #e8956f, #d96f4e 52%, #b75a3c)" : "var(--surface-2)",
                    color: canSend ? "var(--on-ember)" : "var(--faint)",
                    boxShadow: canSend ? "0 3px 10px rgba(217,111,78,.4)" : "none",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background .15s, box-shadow .15s" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
