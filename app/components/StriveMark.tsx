// StriveOS brand mark: ember tile + rising-spark glyph. Sizing/colour come from
// the .strive-mark class (auth.css) so it re-themes with tokens.
export default function StriveMark() {
  return (
    <span className="strive-mark" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18L11 8l3 5 6-9" />
        <path d="M20 4v4h-4" />
      </svg>
    </span>
  );
}
