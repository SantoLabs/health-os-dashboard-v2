"use client";

// Shared Kai chat primitives — design tokens, the KaiMark avatar, the three
// confirm-first action cards (food / schedule / target), the ActionCard
// dispatcher, and MessageRow. Used by both the full Ask tab (/more/ask) and the
// global floating coach widget (KaiFab), so the chat looks and behaves identically.

import * as React from "react";
import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from "react";
import { coachApply, coachUndo, coachSaveInsight, coachExplain, type KaiMessage, type KaiAction, type KaiItem } from "../lib/api";

export const PAGE = "#0e1320", SURF = "#161d2c", RAISED = "#1a2232", INPUTBG = "#171f2e", SUNKEN = "#0f1622";
export const BORDER = "#232c40", BORDER_STRONG = "#2a3550", BORDER_ACCENT = "#2f4a78";
export const H = "#f3f6fb", BODY = "#dbe3f0", SECOND = "#9fb2d0", MUTED = "#79839a", FAINT = "#6e7891", FAINTER = "#5e6678";
export const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", ACCENT_DEEP = "#2a6bd0";
export const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a";
export const USER_BG = "#284067", USER_TX = "#eaf1ff";

const SUGGEST = [
  "Am I on track for 20% body fat by September?",
  "How do I hit my protein target without eggs or whey?",
  "What's a good high-protein veg dinner?",
  "How much protein do I have left today?",
];

export function KaiMark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 30% 26%, #86b8ff, #4f9cf9 52%, #2a6bd0)", flexShrink: 0 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M6 9c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M6 14c1.8-2.4 4.2-2.4 6 0s4.2 2.4 6 0" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const r1 = (n: number) => Math.round(n * 10) / 10;
export function relTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso).getTime(); const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now"; if (mins < 60) return mins + "m"; const h = Math.round(mins / 60);
  if (h < 24) return h + "h"; return Math.round(h / 24) + "d";
}
function dayLabel(date?: string): string {
  if (!date) return "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const tmr = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (date === today) return "Today";
  if (date === tmr) return "Tomorrow";
  try { return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return date; }
}
const fmtTime = (t?: string | null) => (t || "").slice(0, 5);

// ===================== Food action card =====================
function FoodActionCard({ msg, onApplied, onUndone }: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  const a = msg.action as KaiAction;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<KaiItem[]>(a.payload?.items || []);
  const [err, setErr] = useState<string | null>(null);

  const items = a.status === "applied" ? (a.payload?.items || []) : (editing ? edit : (a.payload?.items || []));
  const dProt = r1(items.reduce((s, i) => s + Number(i.protein || 0), 0));
  const dKcal = Math.round(items.reduce((s, i) => s + Number(i.kcal || 0), 0));
  const imp = a.impact;
  const projTo = imp ? r1(imp.from + dProt) : 0;

  function setQty(i: number, qn: number) {
    setEdit((arr) => arr.map((it, k) => {
      if (k !== i) return it;
      const base = it.qty || 1; const f = base ? qn / base : 1;
      return { ...it, qty: qn, kcal: Math.round((it.kcal || 0) * f), protein: r1((it.protein || 0) * f), carbs: r1((it.carbs || 0) * f), fats: r1((it.fats || 0) * f), fiber: r1((it.fiber || 0) * f) };
    }));
  }
  function delItem(i: number) { setEdit((arr) => arr.filter((_, k) => k !== i)); }

  async function apply() {
    setBusy(true); setErr(null);
    try {
      const r = await coachApply(msg.id, editing ? edit : undefined);
      onApplied({ ...msg, action: r.action });
      setEditing(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    setBusy(true); setErr(null);
    try { const r = await coachUndo(msg.id); onUndone({ ...msg, action: r.action }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  // -------- applied state --------
  if (a.status === "applied") {
    return (
      <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: "rgba(70,199,154,.08)", border: "1px solid rgba(70,199,154,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: FIBR, color: "#06231a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: H }}>Added to today's log</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT }}>{relTime(msg.created_at)} ago</span>
        </div>
        <div style={{ fontSize: 11.5, color: SECOND, margin: "8px 0 2px", lineHeight: 1.5 }}>
          {items.map((it, i) => <span key={i}>{it.name} · {it.qty} {it.unit}{i < items.length - 1 ? <br /> : null}</span>)}
        </div>
        {imp ? <div style={{ fontSize: 12, color: BODY, marginTop: 6 }}>Protein {imp.from} → <span style={{ color: FIBR, fontWeight: 700 }}>{projTo}</span> / {imp.target}g ✓</div> : null}
        <button onClick={undo} disabled={busy} style={{ marginTop: 8, background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>↶ {busy ? "Undoing…" : "Undo"}</button>
        {err && <div style={{ fontSize: 11, color: FAT, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }

  // -------- proposed / editing state --------
  return (
    <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: RAISED, border: "1px solid " + BORDER_STRONG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(91,155,255,.16)", color: PROT, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{editing ? "✎" : "+"}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: H }}>{editing ? "Adjust amounts" : a.title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: PROT, background: "rgba(91,155,255,.12)", border: "1px solid rgba(91,155,255,.3)", borderRadius: 999, padding: "3px 8px" }}>+{dProt}g protein</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: editing ? 8 : 6 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: BODY }}>{it.name}</div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 1 }}>{it.kcal} kcal · <span style={{ color: PROT }}>{it.protein}P</span> · <span style={{ color: CARB }}>{it.carbs}C</span> · <span style={{ color: FAT }}>{it.fats}F</span></div>
            </div>
            {editing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setQty(i, Math.max(0.5, r1((it.qty || 1) - 0.5)))} style={stepBtn}>−</button>
                <span style={{ fontSize: 12, color: H, minWidth: 44, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{it.qty} {it.unit}</span>
                <button onClick={() => setQty(i, r1((it.qty || 1) + 0.5))} style={stepBtn}>+</button>
                <button onClick={() => delItem(i)} style={{ ...stepBtn, color: FAT, borderColor: "#3a2330" }}>×</button>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: SECOND }}>{it.qty} {it.unit}</span>
            )}
          </div>
        ))}
      </div>

      {imp && !editing ? (
        <div style={{ marginTop: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: FAINT, marginBottom: 4 }}>
            <span>Protein today</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{imp.from} → <span style={{ color: ACCENT_LT }}>{projTo}</span> / {imp.target}g</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: SUNKEN, overflow: "hidden", display: "flex" }}>
            <div style={{ width: Math.min(100, (imp.from / imp.target) * 100) + "%", background: PROT }} />
            <div style={{ width: Math.min(100 - (imp.from / imp.target) * 100, (dProt / imp.target) * 100) + "%", background: "repeating-linear-gradient(45deg," + FIBR + "," + FIBR + " 3px,transparent 3px,transparent 6px)" }} />
          </div>
        </div>
      ) : null}

      {err && <div style={{ fontSize: 11, color: FAT, marginTop: 8 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {editing ? (
          <>
            <button onClick={apply} disabled={busy || !items.length} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Logging…" : `Save ${items.length} item${items.length === 1 ? "" : "s"}`}</button>
            <button onClick={() => { setEditing(false); setEdit(a.payload?.items || []); }} style={ghostBtn}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add to today"}</button>
            <button onClick={() => { setEdit(a.payload?.items || []); setEditing(true); }} style={ghostBtn}>Adjust</button>
          </>
        )}
      </div>
      <div style={{ fontSize: 10, color: FAINTER, marginTop: 8 }}>Estimates — review before logging. You can undo after.</div>
    </div>
  );
}

// ===================== Schedule action card =====================
function ScheduleActionCard({ msg, onApplied, onUndone }: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  const a = msg.action as KaiAction;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const from = a.from; const to = a.to;

  async function apply() {
    setBusy(true); setErr(null);
    try { const r = await coachApply(msg.id); onApplied({ ...msg, action: r.action }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    setBusy(true); setErr(null);
    try { const r = await coachUndo(msg.id); onUndone({ ...msg, action: r.action }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (a.status === "applied") {
    return (
      <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: "rgba(79,156,249,.08)", border: "1px solid rgba(79,156,249,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: ACCENT, color: "#08182e", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: H }}>Session moved</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT }}>{relTime(msg.created_at)} ago</span>
        </div>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8 }}>
          {from?.activity ? <span style={{ fontWeight: 600 }}>{from.activity}</span> : "Session"} → <span style={{ color: ACCENT_LT, fontWeight: 700 }}>{dayLabel(to?.date)} {fmtTime(to?.time)}</span>
        </div>
        <button onClick={undo} disabled={busy} style={{ marginTop: 8, background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>↶ {busy ? "Undoing…" : "Undo"}</button>
        {err && <div style={{ fontSize: 11, color: FAT, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }
  if (kept) {
    return <div style={{ marginTop: 8, fontSize: 11.5, color: FAINT, fontStyle: "italic" }}>Kept the current time.</div>;
  }
  return (
    <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: RAISED, border: "1px solid " + BORDER_STRONG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(79,156,249,.16)", color: ACCENT, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🗓</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: H }}>{a.title || "Reschedule session"}</span>
      </div>

      <div style={{ background: SUNKEN, borderRadius: 12, padding: "11px 13px" }}>
        {from?.activity ? <div style={{ fontSize: 13, fontWeight: 700, color: H, marginBottom: 8 }}>{from.activity}</div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>From</div>
            <div style={{ fontSize: 13, color: SECOND, textDecoration: "line-through", textDecorationColor: "#54607a" }}>{dayLabel(from?.date)} {fmtTime(from?.time)}</div>
          </div>
          <span style={{ color: ACCENT, fontSize: 18, fontWeight: 800 }}>→</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>To</div>
            <div style={{ fontSize: 14, color: ACCENT_LT, fontWeight: 800 }}>{dayLabel(to?.date)} {fmtTime(to?.time)}</div>
          </div>
        </div>
      </div>
      {a.reason ? <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.45 }}>{a.reason}</div> : null}

      {err && <div style={{ fontSize: 11, color: FAT, marginTop: 8 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Moving…" : "Move session"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>Keep</button>
      </div>
      <div style={{ fontSize: 10, color: FAINTER, marginTop: 8 }}>Updates your plan. You can undo after.</div>
    </div>
  );
}

// ===================== Target action card =====================
function TargetActionCard({ msg, onApplied, onUndone }: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  const a = msg.action as KaiAction;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const p = a.payload || {};
  const metric = String(p.metric || "target");
  const unit = p.unit ?? "g";
  const badge = a.delta_badge;

  async function apply() {
    setBusy(true); setErr(null);
    try { const r = await coachApply(msg.id); onApplied({ ...msg, action: r.action }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    setBusy(true); setErr(null);
    try { const r = await coachUndo(msg.id); onUndone({ ...msg, action: r.action }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (a.status === "applied") {
    return (
      <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: "rgba(91,155,255,.08)", border: "1px solid rgba(91,155,255,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: PROT, color: "#08182e", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: H }}>Target updated</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT }}>{relTime(msg.created_at)} ago</span>
        </div>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8, textTransform: "capitalize" }}>
          {metric}: {p.from} → <span style={{ color: PROT, fontWeight: 700 }}>{p.to}{unit}</span>
        </div>
        <button onClick={undo} disabled={busy} style={{ marginTop: 8, background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>↶ {busy ? "Undoing…" : "Undo"}</button>
        {err && <div style={{ fontSize: 11, color: FAT, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }
  if (kept) {
    return <div style={{ marginTop: 8, fontSize: 11.5, color: FAINT, fontStyle: "italic" }}>Kept your current target.</div>;
  }
  return (
    <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: RAISED, border: "1px solid " + BORDER_STRONG }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(91,155,255,.16)", color: PROT, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>◎</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: H, textTransform: "capitalize" }}>{a.title || `Adjust ${metric} target`}</span>
        {badge ? <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: badge.color, background: "rgba(91,155,255,.12)", border: "1px solid rgba(91,155,255,.3)", borderRadius: 999, padding: "3px 8px" }}>{badge.text}</span> : null}
      </div>

      <div style={{ background: SUNKEN, borderRadius: 12, padding: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 3 }}>Now</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SECOND, fontVariantNumeric: "tabular-nums" }}>{p.from}<span style={{ fontSize: 12, color: FAINT }}>{unit}</span></div>
        </div>
        <span style={{ color: PROT, fontSize: 20, fontWeight: 800 }}>→</span>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 3 }}>New</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: ACCENT_LT, fontVariantNumeric: "tabular-nums" }}>{p.to}<span style={{ fontSize: 12, color: PROT }}>{unit}</span></div>
        </div>
      </div>

      {err && <div style={{ fontSize: 11, color: FAT, marginTop: 8 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Updating…" : "Update target"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>Not now</button>
      </div>
      <div style={{ fontSize: 10, color: FAINTER, marginTop: 8 }}>Changes your daily target. You can undo after.</div>
    </div>
  );
}

// ===================== Swap / Pantry / Reminder / Memory cards =====================
type CardProps = { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void };

function useAct(msg: KaiMessage, onApplied: (m: KaiMessage) => void, onUndone: (m: KaiMessage) => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const apply = async () => { setBusy(true); setErr(null); try { const r = await coachApply(msg.id); onApplied({ ...msg, action: r.action }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const undo = async () => { setBusy(true); setErr(null); try { const r = await coachUndo(msg.id); onUndone({ ...msg, action: r.action }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return { busy, err, apply, undo };
}

function AppliedShell({ tint, tick, label, created, busy, onUndo, children }: { tint: string; tick: string; label: string; created?: string; busy: boolean; onUndo: () => void; children?: ReactNode }) {
  return (
    <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: tint + "14", border: "1px solid " + tint + "59" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: tick, color: "#08182e", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>✓</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: H }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT }}>{relTime(created)} ago</span>
      </div>
      {children}
      <button onClick={onUndo} disabled={busy} style={{ marginTop: 8, background: "none", border: "none", color: ACCENT_LT, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>↶ {busy ? "Undoing…" : "Undo"}</button>
    </div>
  );
}

function SwapActionCard({ msg, onApplied, onUndone }: CardProps) {
  const a = msg.action as KaiAction;
  const { busy, err, apply, undo } = useAct(msg, onApplied, onUndone);
  const [kept, setKept] = useState(false);
  const p = a.payload || {};
  const isSession = p.target === "session";
  const fromO = (a.from as { name?: string; activity?: string } | undefined) || {};
  const toItems = a.to?.items || p.items || [];
  const fromTxt = isSession ? String(fromO.activity || "session") : String(fromO.name || "item");
  const toTxt = isSession ? String(p.new_activity || "") : toItems.map((i) => i.name).join(", ");

  if (a.status === "applied") {
    return (
      <AppliedShell tint={ACCENT} tick={ACCENT} label="Swapped" created={msg.created_at} busy={busy} onUndo={undo}>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8 }}><span style={{ textDecoration: "line-through", color: SECOND, textTransform: isSession ? "capitalize" : "none" }}>{fromTxt}</span> → <span style={{ color: ACCENT_LT, fontWeight: 700, textTransform: isSession ? "capitalize" : "none" }}>{toTxt}</span></div>
        {err && <div style={errStyle}>{err}</div>}
      </AppliedShell>
    );
  }
  if (kept) return <div style={keptStyle}>Kept it as is.</div>;
  return (
    <div style={proposedWrap}>
      <div style={cardHead}><span style={cardIcon(ACCENT)}>⇄</span><span style={cardTitle}>{a.title || "Swap"}</span>{a.delta_badge ? <span style={badgePill(a.delta_badge.color)}>{a.delta_badge.text}</span> : null}</div>
      <div style={{ background: SUNKEN, borderRadius: 12, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={miniLabel}>Remove</div><div style={{ fontSize: 13, color: SECOND, textDecoration: "line-through", textDecorationColor: "#54607a", textTransform: isSession ? "capitalize" : "none" }}>{fromTxt}</div></div>
        <span style={{ color: ACCENT, fontSize: 18, fontWeight: 800 }}>→</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={miniLabel}>Add</div><div style={{ fontSize: isSession ? 14 : 13, color: ACCENT_LT, fontWeight: isSession ? 800 : 700, textTransform: isSession ? "capitalize" : "none" }}>{toTxt}</div></div>
      </div>
      {!isSession && toItems.length ? <div style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>{toItems.map((i) => `${i.protein}P`).join(" · ")} · {Math.round(toItems.reduce((s, i) => s + Number(i.kcal || 0), 0))} kcal</div> : null}
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Swapping…" : "Swap"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>Keep</button>
      </div>
      <div style={fineprint}>{isSession ? "Updates your plan." : "Replaces the logged item."} You can undo after.</div>
    </div>
  );
}

function PantryActionCard({ msg, onApplied, onUndone }: CardProps) {
  const a = msg.action as KaiAction;
  const { busy, err, apply, undo } = useAct(msg, onApplied, onUndone);
  const [kept, setKept] = useState(false);
  const row = (a.payload?.row || {}) as Record<string, number | string>;
  const label = String(row.label || "Staple");

  if (a.status === "applied") {
    return (
      <AppliedShell tint={PROT} tick={PROT} label="Saved to pantry" created={msg.created_at} busy={busy} onUndo={undo}>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8 }}>{label} · <span style={{ color: PROT, fontWeight: 700 }}>{row.protein_g}g protein</span> / {row.per_unit}</div>
        {err && <div style={errStyle}>{err}</div>}
      </AppliedShell>
    );
  }
  if (kept) return <div style={keptStyle}>Won't save that.</div>;
  return (
    <div style={proposedWrap}>
      <div style={cardHead}><span style={cardIcon(PROT)}>🥫</span><span style={cardTitle}>{a.title || "Add to pantry"}</span>{a.delta_badge ? <span style={badgePill(a.delta_badge.color)}>{a.delta_badge.text}</span> : null}</div>
      <div style={{ background: SUNKEN, borderRadius: 12, padding: "11px 13px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{label}</div>
        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>per {String(row.per_unit || "serving")} · <span style={{ color: PROT }}>{row.protein_g}P</span> · <span style={{ color: CARB }}>{row.carbs_g}C</span> · <span style={{ color: FAT }}>{row.fat_g}F</span> · {row.kcal} kcal {row.category ? `· ${row.category}` : ""}</div>
      </div>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save to pantry"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>Not now</button>
      </div>
      <div style={fineprint}>Saves a reusable staple for quick logging. You can undo after.</div>
    </div>
  );
}

function ReminderActionCard({ msg, onApplied, onUndone }: CardProps) {
  const a = msg.action as KaiAction;
  const { busy, err, apply, undo } = useAct(msg, onApplied, onUndone);
  const [kept, setKept] = useState(false);
  const p = a.payload || {};
  const d = a.display || {};
  const isCheckin = p.kind === "checkin";
  const when = d.when || (p.recurrence === "none" ? "" : `${p.recur_time || ""} ${p.recurrence || ""}`);

  if (a.status === "applied") {
    return (
      <AppliedShell tint={ACCENT} tick={ACCENT} label={isCheckin ? "Check-in scheduled" : "Reminder set"} created={msg.created_at} busy={busy} onUndo={undo}>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8 }}>{String(p.title || d.title || "")} · <span style={{ color: ACCENT_LT, fontWeight: 700 }}>{when}</span></div>
        {err && <div style={errStyle}>{err}</div>}
      </AppliedShell>
    );
  }
  if (kept) return <div style={keptStyle}>No reminder set.</div>;
  return (
    <div style={proposedWrap}>
      <div style={cardHead}><span style={cardIcon(ACCENT)}>{isCheckin ? "💬" : "🔔"}</span><span style={cardTitle}>{isCheckin ? "Schedule check-in" : "Set reminder"}</span>{when ? <span style={badgePill(ACCENT)}>{when}</span> : null}</div>
      <div style={{ background: SUNKEN, borderRadius: 12, padding: "11px 13px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{String(p.title || d.title || "Reminder")}</div>
        {p.body || d.body ? <div style={{ fontSize: 11.5, color: SECOND, marginTop: 4, lineHeight: 1.45 }}>{String(p.body || d.body)}</div> : null}
        {isCheckin && (p.seed_prompt || d.seed) ? <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6, fontStyle: "italic" }}>Kai will ask: “{String(p.seed_prompt || d.seed)}”</div> : null}
      </div>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, opacity: busy ? 0.6 : 1 }}>{busy ? "Setting…" : isCheckin ? "Schedule it" : "Set reminder"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>No</button>
      </div>
      <div style={fineprint}>Shows up in-app when due. You can undo after.</div>
    </div>
  );
}

function MemoryActionCard({ msg, onApplied, onUndone }: CardProps) {
  const a = msg.action as KaiAction;
  const { busy, err, apply, undo } = useAct(msg, onApplied, onUndone);
  const [kept, setKept] = useState(false);
  const p = a.payload || {};

  if (a.status === "applied") {
    return (
      <AppliedShell tint={FIBR} tick={FIBR} label="Saved to memory" created={msg.created_at} busy={busy} onUndo={undo}>
        <div style={{ fontSize: 12.5, color: BODY, marginTop: 8 }}>“{String(p.text || "")}”</div>
        {err && <div style={errStyle}>{err}</div>}
      </AppliedShell>
    );
  }
  if (kept) return <div style={keptStyle}>Won't remember that.</div>;
  return (
    <div style={{ marginTop: 8, borderRadius: 16, padding: 13, background: "rgba(70,199,154,.07)", border: "1px solid rgba(70,199,154,.3)" }}>
      <div style={cardHead}><span style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(70,199,154,.16)", color: FIBR, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🧠</span><span style={cardTitle}>Remember this?</span>{p.category ? <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: FIBR, background: "rgba(70,199,154,.12)", border: "1px solid rgba(70,199,154,.3)", borderRadius: 999, padding: "3px 8px" }}>{String(p.category)}</span> : null}</div>
      <div style={{ fontSize: 13, color: BODY, lineHeight: 1.5 }}>“{String(p.text || "")}”</div>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={apply} disabled={busy} style={{ ...primaryBtn, flex: 2, background: FIBR, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Remember"}</button>
        <button onClick={() => setKept(true)} disabled={busy} style={ghostBtn}>Don't save</button>
      </div>
      <div style={fineprint}>Kai uses this to personalize future advice. Manage it anytime in “What Kai remembers”.</div>
    </div>
  );
}

// ===================== Action card dispatch =====================
export function ActionCard(props: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  const t = props.msg.action?.type;
  if (t === "schedule") return <ScheduleActionCard {...props} />;
  if (t === "target") return <TargetActionCard {...props} />;
  if (t === "swap") return <SwapActionCard {...props} />;
  if (t === "pantry") return <PantryActionCard {...props} />;
  if (t === "reminder") return <ReminderActionCard {...props} />;
  if (t === "memory") return <MemoryActionCard {...props} />;
  return <FoodActionCard {...props} />;
}

const stepBtn: CSSProperties = { width: 26, height: 26, borderRadius: 7, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 14, cursor: "pointer", lineHeight: 1 };
export const primaryBtn: CSSProperties = { padding: "10px 0", borderRadius: 11, border: "none", background: ACCENT, color: "#0c1422", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const ghostBtn: CSSProperties = { flex: 1, padding: "10px 0", borderRadius: 11, border: "1px solid " + BORDER_STRONG, background: "transparent", color: SECOND, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const errStyle: CSSProperties = { fontSize: 11, color: FAT, marginTop: 8 };
const keptStyle: CSSProperties = { marginTop: 8, fontSize: 11.5, color: FAINT, fontStyle: "italic" };
const proposedWrap: CSSProperties = { marginTop: 8, borderRadius: 16, padding: 13, background: RAISED, border: "1px solid " + BORDER_STRONG };
const cardHead: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 };
const cardTitle: CSSProperties = { fontSize: 13, fontWeight: 700, color: H };
const miniLabel: CSSProperties = { fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 };
const fineprint: CSSProperties = { fontSize: 10, color: FAINTER, marginTop: 8 };
function cardIcon(color: string): CSSProperties { return { width: 24, height: 24, borderRadius: 7, background: "rgba(79,156,249,.16)", color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }; }
function badgePill(color: string): CSSProperties { return { marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color, background: "rgba(91,155,255,.12)", border: "1px solid rgba(91,155,255,.3)", borderRadius: 999, padding: "3px 8px" }; }

// ===================== Voice input (Wave 2) =====================
/* eslint-disable @typescript-eslint/no-explicit-any */
export function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<any>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SR) setSupported(true);
  }, []);
  function toggle() {
    if (typeof window === "undefined") return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e: any) => { const t = e.results?.[0]?.[0]?.transcript; if (t) onResult(String(t)); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }
  return { listening, supported, toggle };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ===================== Camera / photo attach (Wave 2) =====================
export type PickedImage = { mime: string; data: string; preview: string };
export function CameraButton({ onImage, disabled }: { onImage: (img: PickedImage) => void; disabled?: boolean }) {
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const u = String(reader.result || "");
      const comma = u.indexOf(",");
      if (comma < 0) return;
      onImage({ mime: f.type || "image/jpeg", data: u.slice(comma + 1), preview: u });
    };
    reader.readAsDataURL(f);
  }
  const item: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "none", border: "none", color: BODY, fontSize: 13.5, fontFamily: "inherit", padding: "10px 13px", cursor: "pointer", whiteSpace: "nowrap" };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* take a photo with the camera */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onChange} style={{ display: "none" }} />
      {/* choose an existing photo */}
      <input ref={upRef} type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
      <button onClick={() => setMenu((m) => !m)} disabled={disabled} aria-label="Add photo"
        style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid " + (menu ? BORDER_ACCENT : BORDER_STRONG), background: INPUTBG, color: SECOND, fontSize: 16, cursor: disabled ? "default" : "pointer", flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>📷</button>
      {menu ? (
        <>
          <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
          <div style={{ position: "absolute", bottom: 52, left: 0, zIndex: 81, background: RAISED, border: "1px solid " + BORDER_STRONG, borderRadius: 13, boxShadow: "0 8px 28px rgba(0,0,0,.5)", overflow: "hidden", minWidth: 168 }}>
            <button style={item} onClick={() => { setMenu(false); camRef.current?.click(); }}>📷 Take photo</button>
            <div style={{ height: 1, background: BORDER }} />
            <button style={item} onClick={() => { setMenu(false); upRef.current?.click(); }}>🖼️ Upload photo</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ===================== "Why?" explainer chip (Wave 2) =====================
export function WhyChip({ metric, value, label = "Why?" }: { metric: string; value?: string | number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (text || busy) return;
    setBusy(true); setErr(null);
    try { const r = await coachExplain(metric, value); setText(r.text); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <span style={{ display: "inline-block" }}>
      <button onClick={go} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(79,156,249,.1)", border: "1px solid " + BORDER_ACCENT, color: ACCENT_LT, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>
        <KaiMark size={13} /> {label}
      </button>
      {open ? (
        <div style={{ marginTop: 8, background: SURF, border: "1px solid " + BORDER, borderRadius: 12, padding: "11px 13px", fontSize: 12.5, color: BODY, lineHeight: 1.5 }}>
          {busy ? "Thinking\u2026" : err ? <span style={{ color: FAT }}>{err}</span> : text}
        </div>
      ) : null}
    </span>
  );
}

function SaveButton({ messageId }: { messageId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (saved || busy) return;
    setBusy(true);
    try { await coachSaveInsight(messageId); setSaved(true); } catch { /* ignore */ } finally { setBusy(false); }
  }
  return (
    <button onClick={save} disabled={busy || saved} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: saved ? FIBR : FAINT, fontSize: 11, fontWeight: 700, cursor: saved ? "default" : "pointer", padding: 0, marginTop: 7 }}>
      {saved ? "\u2605 Saved" : busy ? "Saving\u2026" : "\u2606 Save"}
    </button>
  );
}

// ===================== Message row =====================
export function MessageRow({ msg, onApplied, onUndone }: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div style={{ maxWidth: "80%", padding: "10px 13px", borderRadius: "18px 18px 6px 18px", background: USER_BG, color: USER_TX, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
      <KaiMark size={26} />
      <div style={{ maxWidth: "84%" }}>
        <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: BODY, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{msg.text}</div>
        {Array.isArray(msg.citations) && msg.citations.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {msg.citations.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: SECOND, background: "#141b29", border: "1px solid #283250", borderRadius: 999, padding: "3px 8px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />{c.label}
              </span>
            ))}
          </div>
        )}
        {msg.action ? <ActionCard msg={msg} onApplied={onApplied} onUndone={onUndone} /> : null}
        {msg.id && !String(msg.id).startsWith("tmp-") && msg.text ? <div><SaveButton messageId={msg.id} /></div> : null}
      </div>
    </div>
  );
}
