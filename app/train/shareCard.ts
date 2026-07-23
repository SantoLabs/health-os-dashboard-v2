import type { SessionExerciseSets } from "../lib/api";

// Share for a finished strength session — a PNG card plus Hevy-style copyable
// text. Both are built from sessionSets() so the two always agree.
//
// The card is drawn straight onto a canvas: the app has no html-to-image
// dependency and public/ has no logo, so the StriveOS wordmark is drawn here
// too (chevron badge + "Strive" in text colour, "OS" in ember).

const INK = "#f3ece4";
const MUTED = "#a08d78";
const EMBER = "#d9704e";
const BG_TOP = "#241c17";
const BG_BOT = "#191310";
const CARD_W = 1080;

function setLine(st: { weight_kg: number | null; reps: number | null; duration_s: number | null; distance_m: number | null }): string {
  if (st.weight_kg != null && st.reps != null) return `${st.weight_kg} kg x ${st.reps}`;
  if (st.reps != null) return `${st.reps} reps`;
  if (st.duration_s != null) { const m = Math.floor(st.duration_s / 60), sec = st.duration_s % 60; return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`; }
  if (st.distance_m != null) return `${st.distance_m} m`;
  if (st.weight_kg != null) return `${st.weight_kg} kg`;
  return "-";
}

function longDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

/** Hevy-style plain text: title, date, then each exercise with its sets. */
export function workoutText(name: string, date: string, detail: SessionExerciseSets[], totals?: { sets: number; volume: number }): string {
  const out: string[] = [name, longDate(date), ""];
  for (const ex of detail) {
    out.push(ex.title);
    ex.sets.forEach((st, i) => out.push(`Set ${i + 1}: ${setLine(st)}`));
    out.push("");
  }
  if (totals) out.push(`${totals.sets} sets${totals.volume ? ` · ${totals.volume.toLocaleString("en-US")} kg` : ""}`);
  out.push("— StriveOS");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const FONT = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** The wordmark, drawn at a given left/baseline. Returns the width consumed. */
function drawWordmark(g: CanvasRenderingContext2D, x: number, y: number, scale = 1): number {
  const s = 44 * scale;
  // chevron badge
  g.save();
  g.fillStyle = EMBER;
  roundRect(g, x, y - s, s, s, s * 0.29);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = s * 0.11;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x + s * 0.28, y - s * 0.36);
  g.lineTo(x + s * 0.5, y - s * 0.64);
  g.lineTo(x + s * 0.72, y - s * 0.36);
  g.stroke();
  g.restore();

  const tx = x + s + s * 0.34;
  g.font = FONT(800, s * 0.86);
  g.fillStyle = INK;
  g.textBaseline = "alphabetic";
  g.fillText("Strive", tx, y - s * 0.08);
  const w1 = g.measureText("Strive").width;
  g.fillStyle = EMBER;
  g.fillText("OS", tx + w1, y - s * 0.08);
  return s + s * 0.34 + w1 + g.measureText("OS").width;
}

function fitText(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 4 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export type ShareCardInput = {
  name: string;
  date: string;
  sets: number;
  volume: number;
  detail: SessionExerciseSets[];
};

/** Renders the share card to a PNG blob (and an object URL for preview). */
export async function renderShareCard(inp: ShareCardInput): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  const pad = 72;
  const rows = inp.detail.slice(0, 8);
  const more = inp.detail.length - rows.length;
  const headH = 300;
  const rowH = 76;
  const footH = 190;
  const H = headH + rows.length * rowH + (more > 0 ? 58 : 0) + footH;

  const cv = document.createElement("canvas");
  cv.width = CARD_W; cv.height = H;
  const g = cv.getContext("2d");
  if (!g) throw new Error("canvas unavailable");

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, BG_TOP); grad.addColorStop(1, BG_BOT);
  g.fillStyle = grad; g.fillRect(0, 0, CARD_W, H);

  // ember hairline down the left edge
  g.fillStyle = EMBER; g.fillRect(0, 0, 10, H);

  g.textBaseline = "alphabetic";
  g.font = FONT(700, 30);
  g.fillStyle = MUTED;
  g.fillText(longDate(inp.date).toUpperCase(), pad, 118);

  g.font = FONT(800, 68);
  g.fillStyle = INK;
  g.fillText(fitText(g, inp.name, CARD_W - pad * 2), pad, 196);

  // stat strip
  g.font = FONT(700, 32);
  g.fillStyle = EMBER;
  const stat = `${inp.sets} sets${inp.volume ? `   ·   ${inp.volume.toLocaleString("en-US")} kg` : ""}`;
  g.fillText(stat, pad, 250);

  g.fillStyle = "rgba(255,255,255,0.09)";
  g.fillRect(pad, 282, CARD_W - pad * 2, 2);

  // exercise rows: "3x  Exercise name"
  let y = headH + 34;
  for (const ex of rows) {
    g.font = FONT(800, 40);
    g.fillStyle = EMBER;
    const tag = `${ex.sets.length}x`;
    g.fillText(tag, pad, y);
    const tw = Math.max(g.measureText(tag).width, 62);
    g.font = FONT(600, 40);
    g.fillStyle = INK;
    g.fillText(fitText(g, ex.title, CARD_W - pad * 2 - tw - 22), pad + tw + 22, y);
    y += rowH;
  }
  if (more > 0) {
    g.font = FONT(600, 34);
    g.fillStyle = MUTED;
    g.fillText(`…and ${more} more exercise${more > 1 ? "s" : ""}`, pad, y);
    y += 58;
  }

  drawWordmark(g, pad, H - 78, 1.25);

  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  return { blob, url: URL.createObjectURL(blob), width: CARD_W, height: H };
}

/** Share the PNG via the native sheet; falls back to a download. */
export async function shareImage(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "workout"}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return "shared"; } catch { /* user cancelled or unsupported */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove(); return ok;
  } catch { return false; }
}
