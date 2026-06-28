"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachDailyCard, type KaiDailyCard as Card } from "../lib/api";
import { WhyChip } from "./KaiChat";

const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff";
const GREEN = "#46c79a", BLUE = "#5b9bff", AMBER = "#f3b14e";
const H = "#f3f6fb", BODY = "#dbe3f0", SECOND = "#9fb2d0", FAINT = "#6e7891";

function toneColor(tone?: string): string {
  if (tone === "positive") return GREEN;
  if (tone === "off") return AMBER;
  return ACCENT;
}

function KaiMark({ size = 26 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 30% 26%, #86b8ff, #4f9cf9 52%, #2a6bd0)", flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M6 9c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M6 14c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Ring({ value, color }: { value: number; color: string }) {
  const r = 17, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <span style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
      <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="#1f2940" strokeWidth={4} />
        <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums" }}>{Math.round(value)}</span>
    </span>
  );
}

export default function KaiDailyCard() {
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    coachDailyCard()
      .then((r) => { if (alive) setCard(r.card); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Fail silent — the Home screen must never break if Kai is unavailable.
  if (failed || !card) return null;

  const tc = toneColor(card.tone);

  function go(seed?: string) {
    if (seed && typeof window !== "undefined") {
      try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ }
    }
    router.push("/more/ask");
  }

  return (
    <section
      style={{
        borderRadius: 18, padding: 15, marginBottom: 4,
        background: "linear-gradient(160deg, rgba(79,156,249,.10), rgba(79,156,249,.02))",
        border: "1px solid rgba(79,156,249,.28)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <KaiMark size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: H }}>{card.greeting}</div>
          <div style={{ fontSize: 10.5, color: SECOND }}>Kai · your daily note</div>
        </div>
        {card.readiness ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Ring value={card.readiness.current} color={tc} />
            {card.readiness.label ? <span style={{ fontSize: 10.5, color: SECOND, maxWidth: 64, lineHeight: 1.2 }}>{card.readiness.label}</span> : null}
          </div>
        ) : null}
      </div>

      {card.streak && card.streak > 0 ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: GREEN, background: "rgba(70,199,154,.12)", border: "1px solid rgba(70,199,154,.3)", borderRadius: 999, padding: "3px 9px", marginBottom: 9 }}>
          🔥 {card.streak}-day protein streak
        </div>
      ) : null}

      <div style={{ fontSize: 15, fontWeight: 800, color: H, marginBottom: 5, lineHeight: 1.3 }}>{card.headline}</div>
      {card.body ? <div style={{ fontSize: 13, color: BODY, lineHeight: 1.5, marginBottom: card.lever ? 10 : 2 }}>{card.body}</div> : null}

      {card.lever ? (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "9px 11px" }}>
          <span style={{ color: tc, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>↳</span>
          <span style={{ fontSize: 12.5, color: BODY, lineHeight: 1.45 }}>{card.lever}</span>
        </div>
      ) : null}

      {card.readiness ? (
        <div style={{ marginTop: 11 }}>
          <WhyChip metric="readiness" value={card.readiness.current} label="Why this readiness?" />
        </div>
      ) : null}

      {Array.isArray(card.chips) && card.chips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
          {card.chips.map((ch, i) => (
            <button
              key={i}
              onClick={() => go(ch)}
              style={{ fontSize: 11.5, color: ACCENT_LT, background: "rgba(79,156,249,.10)", border: "1px solid rgba(79,156,249,.28)", borderRadius: 999, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}
            >
              {ch}
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => go()}
          style={{ marginTop: 11, fontSize: 12, fontWeight: 700, color: ACCENT_LT, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >
          Ask Kai about today →
        </button>
      )}
    </section>
  );
}
