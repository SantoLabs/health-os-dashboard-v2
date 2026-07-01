"use client";

import { useRouter } from "next/navigation";

// Light placeholder this phase. Deep recovery tools (body-map, mobility protocols,
// readiness-aware routines) land later; for now route care requests into Kai.
export default function RecoveryPanel() {
  const router = useRouter();
  function ask(seed?: string) {
    if (seed && typeof window !== "undefined") {
      try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ }
    }
    router.push("/more/ask");
  }
  const prompts = ["My right trap is sore — help me recover it", "Stretch whole body", "Post-run cooldown"];
  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>💚</span>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Tell me what needs care</div>
          </div>
          <span className="trn-soon">Phase 2</span>
        </div>
        <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
          Full recovery tools — body-map, mobility protocols and readiness-aware routines — are coming next. For now, tell Kai what hurts and it&apos;ll guide you.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {prompts.map((q) => (
            <button key={q} className="trn-sub" onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
