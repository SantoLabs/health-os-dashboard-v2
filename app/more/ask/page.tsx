"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Screen } from "../../components/Screen";
import {
  coachThreads, coachThread, coachSend, coachApply, coachUndo, coachThreadOp,
  type KaiThread, type KaiMessage, type KaiAction, type KaiItem,
} from "../../lib/api";

// ---- Kai design tokens ----
const PAGE = "#0e1320", SURF = "#161d2c", RAISED = "#1a2232", INPUTBG = "#171f2e", SUNKEN = "#0f1622";
const BORDER = "#232c40", BORDER_STRONG = "#2a3550", BORDER_ACCENT = "#2f4a78";
const H = "#f3f6fb", BODY = "#dbe3f0", SECOND = "#9fb2d0", MUTED = "#79839a", FAINT = "#6e7891", FAINTER = "#5e6678";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", ACCENT_DEEP = "#2a6bd0";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a";
const USER_BG = "#284067", USER_TX = "#eaf1ff";

const SUGGEST = [
  "Am I on track for 20% body fat by September?",
  "How do I hit my protein target without eggs or whey?",
  "What's a good high-protein veg dinner?",
  "How much protein do I have left today?",
];

function KaiMark({ size = 28 }: { size?: number }) {
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
function relTime(iso?: string) {
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

// ===================== Action card dispatch =====================
function ActionCard(props: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
  const t = props.msg.action?.type;
  if (t === "schedule") return <ScheduleActionCard {...props} />;
  if (t === "target") return <TargetActionCard {...props} />;
  return <FoodActionCard {...props} />;
}

const stepBtn: CSSProperties = { width: 26, height: 26, borderRadius: 7, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 14, cursor: "pointer", lineHeight: 1 };
const primaryBtn: CSSProperties = { padding: "10px 0", borderRadius: 11, border: "none", background: ACCENT, color: "#0c1422", fontSize: 13, fontWeight: 800, cursor: "pointer" };
const ghostBtn: CSSProperties = { flex: 1, padding: "10px 0", borderRadius: 11, border: "1px solid " + BORDER_STRONG, background: "transparent", color: SECOND, fontSize: 13, fontWeight: 700, cursor: "pointer" };

// ===================== Message row =====================
function MessageRow({ msg, onApplied, onUndone }: { msg: KaiMessage; onApplied: (m: KaiMessage) => void; onUndone: (m: KaiMessage) => void }) {
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
      </div>
    </div>
  );
}

// ===================== Page =====================
export default function AskPage() {
  const [view, setView] = useState<"list" | "chat">("list");
  const [threads, setThreads] = useState<KaiThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<KaiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadThreads(true); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function loadThreads(first = false) {
    try {
      const r = await coachThreads();
      setThreads(r.threads || []);
      if (first && (!r.threads || r.threads.length === 0)) { setView("chat"); setThreadId(null); setMessages([]); }
    } catch (e) { setErr((e as Error).message); } finally { setLoadingThreads(false); }
  }
  async function openThread(id: string) {
    setView("chat"); setThreadId(id); setMessages([]); setErr(null); setBusy(true);
    try { const r = await coachThread(id); setMessages(r.messages || []); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function newChat() { setView("chat"); setThreadId(null); setMessages([]); setErr(null); setInput(""); }

  async function send(q: string) {
    const text = q.trim(); if (!text || busy) return;
    setErr(null); setInput("");
    setMessages((m) => [...m, { id: "tmp-" + Date.now(), role: "user", text }]);
    setBusy(true);
    try {
      const r = await coachSend({ text, thread_id: threadId || undefined });
      if (!threadId) setThreadId(r.thread_id);
      setMessages((m) => [...m, r.message]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); loadThreads(); }
  }
  function updateMsg(m: KaiMessage) { setMessages((arr) => arr.map((x) => (x.id === m.id ? m : x))); }

  async function pin(t: KaiThread) { setSwiped(null); await coachThreadOp("pin", { id: t.id, pinned: !t.pinned }); loadThreads(); }
  async function del(t: KaiThread) { setSwiped(null); await coachThreadOp("delete_thread", { id: t.id }); loadThreads(); }
  async function rename(t: KaiThread) {
    setSwiped(null);
    const title = typeof window !== "undefined" ? window.prompt("Rename chat", t.title) : null;
    if (title && title.trim()) { await coachThreadOp("rename", { id: t.id, title: title.trim() }); loadThreads(); }
  }

  // ---------- LIST VIEW ----------
  if (view === "list") {
    const pinned = threads.filter((t) => t.pinned);
    const recent = threads.filter((t) => !t.pinned);
    return (
      <Screen title="">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <KaiMark size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: H }}>Kai</div>
            <div style={{ fontSize: 11.5, color: SECOND }}>Your data-aware coach</div>
          </div>
          <button onClick={newChat} aria-label="New chat" style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 20, cursor: "pointer", boxShadow: "0 6px 16px rgba(79,156,249,.4)" }}>+</button>
        </div>

        {loadingThreads && <div style={{ color: FAINT, fontSize: 13, textAlign: "center", padding: 24 }}>Loading…</div>}
        {err && <div style={{ color: FAT, fontSize: 12, marginBottom: 10 }}>{err}</div>}

        {!loadingThreads && threads.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 16px" }}>
            <div style={{ fontSize: 13, color: SECOND, marginBottom: 14 }}>Ask Kai anything about your training, fuel, and recovery — grounded in your live data.</div>
            <button onClick={newChat} style={{ ...primaryBtn, padding: "12px 22px" }}>Start a chat</button>
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div style={lblStyle}>📌 Pinned</div>
            {pinned.map((t) => <ThreadRow key={t.id} t={t} swiped={swiped === t.id} onSwipe={() => setSwiped(swiped === t.id ? null : t.id)} onOpen={() => openThread(t.id)} onPin={() => pin(t)} onDel={() => del(t)} onRename={() => rename(t)} />)}
          </>
        )}
        {recent.length > 0 && (
          <>
            <div style={lblStyle}>Recent</div>
            {recent.map((t) => <ThreadRow key={t.id} t={t} swiped={swiped === t.id} onSwipe={() => setSwiped(swiped === t.id ? null : t.id)} onOpen={() => openThread(t.id)} onPin={() => pin(t)} onDel={() => del(t)} onRename={() => rename(t)} />)}
          </>
        )}
        {threads.length > 0 && <div style={{ fontSize: 10.5, color: FAINTER, textAlign: "center", marginTop: 12 }}>Tap ⋯ on a chat to pin, rename, or delete.</div>}
      </Screen>
    );
  }

  // ---------- CHAT VIEW ----------
  return (
    <Screen title="">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <button onClick={() => { setView("list"); loadThreads(); }} aria-label="Back" style={{ background: "none", border: "none", color: SECOND, fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>‹</button>
        <KaiMark size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: H }}>Kai</div>
          <div style={{ fontSize: 10.5, color: FIBR, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: FIBR }} />Knows your day</div>
        </div>
        <button onClick={newChat} aria-label="New chat" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 17, cursor: "pointer" }}>+</button>
      </div>

      {messages.length === 0 && !busy && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <KaiMark size={26} />
            <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: BODY, fontSize: 14, lineHeight: 1.5 }}>
              Hey! I'm Kai. I can see your targets, today's log, and your diet constraints — ask me anything, or tell me what you ate and I'll log it.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => send(s)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 11, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 12.5, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m) => <MessageRow key={m.id} msg={m} onApplied={updateMsg} onUndone={updateMsg} />)}
      {busy && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <KaiMark size={26} />
          <div style={{ padding: "10px 13px", borderRadius: "6px 18px 18px 18px", background: SURF, border: "1px solid " + BORDER, color: FAINT, fontSize: 13 }}>Kai is thinking…</div>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: FAT, marginBottom: 10 }}>{err}</div>}
      <div ref={endRef} />

      <div style={{ position: "sticky", bottom: 0, paddingTop: 8, paddingBottom: 4, background: "linear-gradient(180deg,transparent,#0e1320 22%)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Message Kai…"
            style={{ flex: 1, padding: "12px 15px", borderRadius: 999, border: "1px solid " + BORDER_STRONG, background: INPUTBG, color: BODY, fontSize: 14, outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send"
            style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: input.trim() && !busy ? ACCENT : "#1c2740", color: "#fff", fontSize: 17, cursor: input.trim() && !busy ? "pointer" : "default", flexShrink: 0 }}>↑</button>
        </div>
        <div style={{ fontSize: 10, color: FAINTER, textAlign: "center", marginTop: 6 }}>Not medical advice · clinical questions → your physician</div>
      </div>
    </Screen>
  );
}

const lblStyle: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: FAINT, margin: "14px 0 7px" };

function ThreadRow({ t, swiped, onSwipe, onOpen, onPin, onDel, onRename }: { t: KaiThread; swiped: boolean; onSwipe: () => void; onOpen: () => void; onPin: () => void; onDel: () => void; onRename: () => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <div onClick={onOpen} style={{ background: t.pinned ? "#13203a" : SURF, border: "1px solid " + (t.pinned ? BORDER_ACCENT : BORDER), borderRadius: 13, padding: "12px 13px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.pinned ? "📌 " : ""}{t.title}</div>
          {t.last_message ? <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{t.last_message}</div> : null}
        </div>
        <span style={{ fontSize: 10.5, color: FAINT }}>{relTime(t.updated_at)}</span>
        <button onClick={(e) => { e.stopPropagation(); onSwipe(); }} aria-label="Options" style={{ background: "none", border: "none", color: FAINT, fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>⋯</button>
      </div>
      {swiped && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
          <button onClick={onRename} style={rowAct}>Rename</button>
          <button onClick={onPin} style={{ ...rowAct, color: ACCENT_LT, borderColor: BORDER_ACCENT, background: "#1c2740" }}>{t.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={onDel} style={{ ...rowAct, color: FAT, borderColor: "#3a2330", background: "#3a2330" }}>Delete</button>
        </div>
      )}
    </div>
  );
}
const rowAct: CSSProperties = { padding: "7px 14px", borderRadius: 9, border: "1px solid " + BORDER, background: INPUTBG, color: SECOND, fontSize: 12, fontWeight: 700, cursor: "pointer" };
