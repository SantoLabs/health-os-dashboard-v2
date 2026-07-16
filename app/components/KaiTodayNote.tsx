"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

  function go(seed?: string) {
    if (seed && typeof window !== "undefined") {
      try { window.sessionStorage.setItem("kai_seed", seed); } catch { /* ignore */ }
    }
    router.push("/more/ask");
  }

  const note = card ? [card.headline, card.body].filter(Boolean).join(" ") : "";
  const chips = card && Array.isArray(card.chips) ? card.chips : [];

  if (failed && !onWhy) return null;

  return (
    <>
      {note ? (
        <div className="kai-inset">
          <span className="kai-k">K</span>
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
