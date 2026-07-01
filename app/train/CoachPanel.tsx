"use client";

import { useRouter } from "next/navigation";
import KaiDailyCard from "../components/KaiDailyCard";

// Coach = the existing Kai (reuse, don't fork). Light hub this phase: the live daily
// card + quick entries into the full Kai chat, framed around training.
export default function CoachPanel() {
  const router = useRouter();
  function ask(seed?: string) {
    if (seed && typeof window !== "undefined") {
      try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ }
    }
    router.push("/more/ask");
  }
  const chips = ["Was that session smart?", "What's next in my plan?", "How's my recovery?"];
  return (
    <div>
      <KaiDailyCard />
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Your coach, across everything</div>
        <div className="subtle tiny" style={{ marginTop: 4, lineHeight: 1.5 }}>
          Kai reads your training, recovery, sleep and race calendar together — ask about today&apos;s session, a tweak to the week, or why a number moved.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {chips.map((q) => (
            <button key={q} className="trn-sub" onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
        <button
          onClick={() => ask()}
          style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 13, background: "linear-gradient(135deg,#5f7dff,#a274ff)" }}
        >
          Open coach chat →
        </button>
      </div>
    </div>
  );
}
