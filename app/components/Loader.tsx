"use client";

import type { ReactNode } from "react";

/* Mock 18b "Marching line": four monochrome glyphs bobbing in sequence like a
   relay. Run / fuel / sleep / recover - the four pillars the app tracks. */
const GLYPHS: ReactNode[] = [
  <>
    <circle cx="15" cy="5" r="2" />
    <path d="M13 8.5L9 11l2 3-3 5M13 8.5l3 2.5 3-1M13 8.5L11 14l4 2 1 5M9 11l-4 1" />
  </>,
  <>
    <path d="M4 11h16a8 8 0 0 1-16 0Z" />
    <path d="M9 8c0-2 2-2 2-4M14 8c0-2 2-2 2-4" />
  </>,
  <path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9Z" />,
  <path d="M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.4 12 21 12 21Z" />,
];

export default function Loader({ compact = false }: { compact?: boolean }) {
  const size = compact ? 15 : 18;
  return (
    <div className={compact ? "ld-wrap ld-compact" : "ld-wrap"} role="status" aria-label="Loading">
      {GLYPHS.map((g, i) => (
        <span key={i} className="ld-g" style={{ animationDelay: i * 0.15 + "s" }}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{g}</svg>
        </span>
      ))}
    </div>
  );
}
