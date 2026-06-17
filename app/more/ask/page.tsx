"use client";

import { useState, useRef, useEffect } from "react";
import { coachAsk } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Msg = { role: "user" | "model"; content: string };

const SUGGESTIONS = [
  "What should I prioritise this week?",
  "Am I on track for 20% body fat by September?",
  "How do I hit my protein target without eggs or whey?",
  "Is my training load too high right now?",
];

export default function AskPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setErr(null);
    setInput("");
    const history = msgs.slice();
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await coachAsk(question, history);
      if (res.ok && res.answer) setMsgs((m) => [...m, { role: "model", content: res.answer as string }]);
      else setErr(res.error || "The coach couldn't answer that. Try rephrasing.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Ask Health AI" back="/more">
      {msgs.length === 0 && (
        <section className="card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Your data-aware coach 🧠</div>
          <div className="subtle tiny" style={{ marginBottom: 12 }}>
            Grounded in your live readiness, training load, body-comp, and diet constraints (veg, no eggs/whey). Not a doctor — clinical stuff goes to your physician.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "var(--fg)", fontSize: 13, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {msgs.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
          <div style={{
            maxWidth: "85%", padding: "10px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
            background: m.role === "user" ? "var(--accent, #6366f1)" : "rgba(255,255,255,0.05)",
            color: m.role === "user" ? "#fff" : "var(--fg)",
            borderTopRightRadius: m.role === "user" ? 4 : 14, borderTopLeftRadius: m.role === "user" ? 14 : 4,
          }}>{m.content}</div>
        </div>
      ))}
      {busy && <div className="subtle tiny" style={{ marginBottom: 10 }}>Coach is thinking…</div>}
      {err && <div className="subtle tiny" style={{ color: "#f87171", marginBottom: 10 }}>{err}</div>}
      <div ref={endRef} />

      <div style={{ position: "sticky", bottom: 0, paddingTop: 8, display: "flex", gap: 8, background: "var(--bg, #0b0f17)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
          placeholder="Ask about training, fuel, recovery…"
          style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "var(--fg)", fontSize: 14, fontFamily: "inherit" }}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()}
          style={{ padding: "0 16px", borderRadius: 12, border: "none", background: input.trim() && !busy ? "var(--accent, #6366f1)" : "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: input.trim() && !busy ? "pointer" : "default" }}>
          Send
        </button>
      </div>
    </Screen>
  );
}
