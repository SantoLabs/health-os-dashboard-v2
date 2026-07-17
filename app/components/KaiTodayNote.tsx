"use client";

import { useEffect, useState } from "react";
import { coachDailyCard, type KaiDailyCard as Card } from "../lib/api";

// StriveOS Today: Kai's daily note as the ember inset inside the readiness card,
// plus action chips. The readiness ring + verdict live in the Today page, so
// this is a fragment (no outer card, no ring). Fails silent so Today never
// breaks if Kai is unavailable — but the "Why" chip still shows if requested.
export default function KaiTodayNote({
  whyLabel,
  onWhy,
}: {
  whyLabel?: string;
  onWhy?: () => void;
}) {
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    coachDailyCard()
      .then((r) => { if (alive) setCard(r.card); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  function go(seed?: string) {
    if (typeof window !== "undefined" && seed) {
      // Open the floating Kai chat as a bottom sheet, seeded with the tapped prompt.
      window.dispatchEvent(new CustomEvent("kai:open", { detail: { seed } }));
    }
  }

  const note = card ? [card.headline, card.body].filter(Boolean).join(" ") : "";
  const chips = card && Array.isArray(card.chips) ? card.chips : [];

  if (failed && !onWhy) return null;

  return (
    <>
      {note ? (
        <div className="kai-inset">
          <span className="kai-k" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 9c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="var(--on-ember)" strokeWidth={2.3} strokeLinecap="round" />
              <path d="M6 14c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="var(--on-ember)" strokeWidth={2.3} strokeLinecap="round" />
            </svg>
          </span>
          <div className="kai-note"><b>Kai:</b> {note}</div>
        </div>
      ) : null}
      {(onWhy || chips.length > 0) && (
        <div className="kai-chips">
          {onWhy && whyLabel ? <button className="kai-chip" onClick={onWhy}>{whyLabel}</button> : null}
          {chips.slice(0, 2).map((ch, i) => (
            <button key={i} className="kai-chip" onClick={() => go(ch)}>{ch}</button>
          ))}
        </div>
      )}
    </>
  );
}
