"use client";
import Icon from "./Icon";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachDailyCard, type KaiDailyCard as Card } from "../lib/api";
import { WhyChip } from "./KaiChat";

const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)";
const GREEN = "var(--success)", AMBER = "var(--gold)";
const H = "var(--text)", BODY = "var(--text)", SECOND = "var(--text-2)";

function toneColor(tone?: string): string {
  if (tone === "positive") return GREEN;
  if (tone === "off") return AMBER;
  return ACCENT;
}

function KaiMark({ size = 26 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 30% 26%, #e8956f, #d96f4e 52%, #b75a3c)", flexShrink: 0 }}>
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
        <circle cx={22} cy={22} r={r} fill="none" stroke="var(--line-2)" strokeWidth={4} />
        <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums" }}>{Math.round(value)}</span>
    </span>
  );
}

export default function KaiDailyCard({ liveReadiness, scope }: { liveReadiness?: { score: number | null; label?: string | null } | null; scope?: "training" }) {
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    coachDailyCard(scope)
      .then((r) => { if (alive) setCard(r.card); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [scope]);

  // Fail silent — the Home screen must never break if Kai is unavailable.
  if (failed || !card) return null;

  const tc = toneColor(card.tone);
  const liveScore = liveReadiness && liveReadiness.score != null ? liveReadiness.score : null;
  const ringValue = liveScore != null ? liveScore : (card.readiness ? card.readiness.current : null);
  const ringLabel = liveScore != null ? (liveReadiness?.label ?? null) : (card.readiness?.label ?? null);

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
        background: "linear-gradient(160deg, color-mix(in srgb, var(--ember) 12%, transparent), color-mix(in srgb, var(--ember) 3%, transparent))",
        border: "1px solid color-mix(in srgb, var(--ember) 30%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <KaiMark size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: H }}>{card.greeting}</div>
          <div style={{ fontSize: 10.5, color: SECOND }}>{scope === "training" ? "Kai · Thoughts" : "Kai · your daily note"}</div>
        </div>
        {ringValue != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Ring value={ringValue} color={tc} />
            {ringLabel ? <span style={{ fontSize: 10.5, color: SECOND, maxWidth: 64, lineHeight: 1.2 }}>{ringLabel}</span> : null}
          </div>
        ) : null}
      </div>

      {card.streak && card.streak > 0 ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: GREEN, background: "color-mix(in srgb, var(--success) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 32%, transparent)", borderRadius: 999, padding: "3px 9px", marginBottom: 9 }}>
          <Icon name="fire" size={11} /> {card.streak}-day protein streak
        </div>
      ) : null}

      <div style={{ fontSize: 15, fontWeight: 800, color: H, marginBottom: 5, lineHeight: 1.3 }}>{card.headline}</div>
      {card.body ? <div style={{ fontSize: 13, color: BODY, lineHeight: 1.5, marginBottom: card.lever ? 10 : 2 }}>{card.body}</div> : null}

      {card.lever ? (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "9px 11px" }}>
          <span style={{ color: tc, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>↳</span>
          <span style={{ fontSize: 12.5, color: BODY, lineHeight: 1.45 }}>{card.lever}</span>
        </div>
      ) : null}

      {ringValue != null ? (
        <div style={{ marginTop: 11 }}>
          <WhyChip metric="readiness" value={ringValue} label="Why this readiness?" />
        </div>
      ) : null}

      {Array.isArray(card.chips) && card.chips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
          {card.chips.map((ch, i) => (
            <button
              key={i}
              onClick={() => go(ch)}
              style={{ fontSize: 11.5, fontWeight: 600, color: ACCENT_LT, background: "color-mix(in srgb, var(--ember) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--ember) 30%, transparent)", borderRadius: 999, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}
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
