"use client";

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { Screen } from "../../components/Screen";
import { nutriDay, nutriWeek, nutriPost } from "../../lib/api";

/* ---- design tokens (mapped from the Nutrition spec) ---- */
const CARD = "#101626", INSET = "#0e1320", CB = "#1a2232", IB = "#1f2838";
const H = "#f3f6fb", BODY = "#e8ecf3", MUTED = "#aeb6c4", FAINT = "#7b8597", FAINTER = "#5c6573", DIS = "#4b5462";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", CHIP_SEL = "#13203a", CHIP_SEL_B = "#294063", CHIP_IDLE = "#141b29", CHIP_IDLE_B = "#222c3d";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a", TRACK = "#1b2333";
const ON = "#46c79a", PARTIAL = "#f3b14e", MISS = "#e0574b";

const card: CSSProperties = { background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14 };
const label: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const navBtn: CSSProperties = { width: 30, height: 30, borderRadius: 9, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 16, lineHeight: 1, cursor: "pointer" };
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none" };

type Targets = { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> };
type Totals = { calories: number; protein: number; carbs: number; fats: number; fiber: number; water: number; micros: Record<string, number> };
type Meal = { id: string; meal_type: string | null; snack_slot: string | null; name: string; source: string; confidence: string | null; time: string | null; quantity: number | null; unit: string | null; servings: number; kcal: number; protein: number; carbs: number; fats: number; fiber: number; water_ml: number; micros: Record<string, number>; food_id: string | null };
type Day = { date: string; targets: Targets; totals: Totals; meals: Meal[] };
type WeekDay = { date: string; dow: number; protein: number; calories: number; entries: number; status: string };
type Week = { start: string; today: string; target_protein: number; streak: number; days: WeekDay[] };
type Draft = { id?: string; meal_type: string; name: string; kcal: string; protein: string; carbs: string; fats: string; fiber: string };

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"];

function istToday(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function mondayOf(iso: string): string { const d = new Date(iso + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number): string { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dnum(iso: string): number { return Number(iso.slice(8, 10)); }
function monOf(iso: string): string { return MON[Number(iso.slice(5, 7)) - 1]; }
function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtTime(t: string | null): string { if (!t) return ""; const d = new Date(t); if (isNaN(d.getTime())) return ""; const ist = new Date(d.getTime() + 5.5 * 3600 * 1000); return String(ist.getUTCHours()).padStart(2, "0") + ":" + String(ist.getUTCMinutes()).padStart(2, "0"); }
function statusColor(s: string): string { return s === "on" ? ON : s === "partial" ? PARTIAL : (s === "low" || s === "missed") ? MISS : s === "future" ? CHIP_IDLE_B : FAINT; }
function mealColor(m: Meal): string { const t = m.snack_slot ? "snack" : (m.meal_type || ""); return t === "breakfast" ? CARB : t === "lunch" ? PROT : t === "dinner" ? ACCENT_LT : t === "snack" ? FIBR : ACCENT; }
function mealLabel(m: Meal): string { if (m.snack_slot) return "SNACK · " + m.snack_slot.replace(/_/g, " ").toUpperCase(); return (m.meal_type || "meal").toUpperCase(); }

function Bar({ pct, color, h = 6 }: { pct: number; color: string; h?: number }) {
  return <div style={{ height: h, borderRadius: h / 2, background: TRACK, overflow: "hidden" }}><div style={{ width: Math.max(0, Math.min(100, pct)) + "%", height: "100%", background: color }} /></div>;
}

function MacroCard({ lbl, val, target, color }: { lbl: string; val: number; target: number; color: string }) {
  const pct = target ? (val / target) * 100 : 0;
  return (
    <div style={{ flex: 1, background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: "10px 9px" }}>
      <div style={label}>{lbl}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, margin: "3px 0 6px", fontVariantNumeric: "tabular-nums" }}>{Math.round(val)}<span style={{ fontSize: 10, color: FAINTER, fontWeight: 600 }}>g</span></div>
      <Bar pct={pct} color={color} h={5} />
    </div>
  );
}

function NumField({ lbl, v, on, accent }: { lbl: string; v: string; on: (val: string) => void; accent?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={label}>{lbl}</div>
      <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" style={{ ...inp, marginTop: 4, borderColor: accent ? "#294063" : IB }} />
    </div>
  );
}

export default function NutritionPage() {
  const [sel, setSel] = useState<string>(istToday());
  const [week, setWeek] = useState<Week | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<boolean>(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const loadWeek = useCallback((d: string) => { nutriWeek<Week>(mondayOf(d)).then(setWeek).catch((e) => setErr(e.message)); }, []);
  const loadDay = useCallback((d: string) => { setDay(null); nutriDay<Day>(d).then(setDay).catch((e) => setErr(e.message)); }, []);

  useEffect(() => { loadDay(sel); }, [sel, loadDay]);
  useEffect(() => { loadWeek(istToday()); }, [loadWeek]);

  function shiftWeek(n: number) { const ns = addDays(mondayOf(sel), n * 7); setSel(ns); loadWeek(ns); }
  function openAdd() { setDraft({ meal_type: "breakfast", name: "", kcal: "", protein: "", carbs: "", fats: "", fiber: "" }); setSheet(true); }
  function openEdit(m: Meal) { setDraft({ id: m.id, meal_type: m.snack_slot ? "snack" : (m.meal_type || "breakfast"), name: m.name, kcal: String(m.kcal || ""), protein: String(m.protein || ""), carbs: String(m.carbs || ""), fats: String(m.fats || ""), fiber: String(m.fiber || "") }); setSheet(true); }
  function setD(p: Partial<Draft>) { setDraft((d) => (d ? { ...d, ...p } : d)); }
  function closeSheet() { setSheet(false); setDraft(null); }

  async function save() {
    if (!draft) return; setSaving(true);
    const body = { date: sel, meal_type: draft.meal_type, name: draft.name, kcal: Number(draft.kcal) || 0, protein: Number(draft.protein) || 0, carbs: Number(draft.carbs) || 0, fats: Number(draft.fats) || 0, fiber: Number(draft.fiber) || 0, source: "manual" };
    try {
      const r = draft.id ? await nutriPost<Day>("update", { id: draft.id, ...body }) : await nutriPost<Day>("log", body);
      setDay(r); closeSheet(); loadWeek(sel);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function del() {
    if (!draft || !draft.id) return; setSaving(true);
    try { const r = await nutriPost<Day>("delete", { id: draft.id, date: sel }); setDay(r); closeSheet(); loadWeek(sel); }
    catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const t = day ? day.targets : null;
  const tot = day ? day.totals : null;
  const proteinLeft = t && tot ? Math.max(0, Math.round(t.protein - tot.protein)) : 0;

  return (
    <Screen title="Nutrition">
      {err && <div style={{ ...card, borderColor: "#5a2532", color: "#ff9aa5", marginBottom: 10, fontSize: 12.5 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{week ? monOf(week.days[0].date) + (monOf(week.days[0].date) !== monOf(week.days[6].date) ? " – " + monOf(week.days[6].date) : "") : ""}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => shiftWeek(-1)} aria-label="Previous week" style={navBtn}>‹</button>
          <button onClick={() => shiftWeek(1)} aria-label="Next week" style={navBtn}>›</button>
        </div>
      </div>

      {week && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {week.days.map((d) => {
            const s = d.date === sel;
            return (
              <button key={d.date} onClick={() => setSel(d.date)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0", borderRadius: 14, cursor: "pointer", border: "1px solid " + (s ? CHIP_SEL_B : "transparent"), background: s ? CHIP_SEL : "transparent" }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: s ? ACCENT_LT : FAINT }}>{WD[d.dow]}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: d.status === "future" ? DIS : (s ? H : BODY) }}>{dnum(d.date)}</span>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: statusColor(d.status) }} />
              </button>
            );
          })}
        </div>
      )}

      {week && (
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>Protein adherence · last 7 days · <span style={{ color: ON, fontWeight: 700 }}>{week.streak}-day streak</span></div>
      )}

      <div style={{ ...card, marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={label}>Calories</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: H, fontVariantNumeric: "tabular-nums" }}>{Math.round(tot ? tot.calories : 0)} <span style={{ color: FAINTER, fontWeight: 600 }}>/ {t ? t.calories : 0} kcal</span></span>
        </div>
        <Bar pct={t && t.calories ? ((tot ? tot.calories : 0) / t.calories) * 100 : 0} color="#cdd5e3" h={7} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MacroCard lbl="Prot" val={tot ? tot.protein : 0} target={t ? t.protein : 0} color={PROT} />
        <MacroCard lbl="Carb" val={tot ? tot.carbs : 0} target={t ? t.carbs : 0} color={CARB} />
        <MacroCard lbl="Fat" val={tot ? tot.fats : 0} target={t ? t.fats : 0} color={FAT} />
        <MacroCard lbl="Fibr" val={tot ? tot.fiber : 0} target={t ? t.fiber : 0} color={FIBR} />
      </div>

      {proteinLeft > 0 && (
        <div style={{ background: "linear-gradient(90deg, #13203a, #101626)", border: "1px solid " + CHIP_SEL_B, borderRadius: 14, padding: "11px 13px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT_LT }}>🎯 {proteinLeft}g protein to go</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{Math.round(tot ? tot.protein : 0)} of {t ? t.protein : 0}g — log a protein-rich item to close the gap.</div>
        </div>
      )}

      {!day ? (
        <div style={{ color: FAINT, fontSize: 12.5, textAlign: "center", padding: 20 }}>Loading…</div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 18 }}>
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 20, width: 2, background: CB }} />
          {day.meals.map((m) => (
            <div key={m.id} style={{ position: "relative", marginBottom: 8 }}>
              <span style={{ position: "absolute", left: -16, top: 14, width: 9, height: 9, borderRadius: 5, background: mealColor(m), border: "2px solid " + INSET }} />
              <button onClick={() => openEdit(m)} style={{ width: "100%", textAlign: "left", background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: "10px 12px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, letterSpacing: ".05em", color: FAINT }}>
                  <span>{fmtTime(m.time)} · {mealLabel(m)}</span><span style={{ color: FAINTER }}>{m.kcal} kcal</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: BODY, marginTop: 3 }}>{m.name || "—"}</div>
              </button>
            </div>
          ))}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: -16, top: 13, width: 9, height: 9, borderRadius: 5, background: "transparent", border: "2px dashed " + FAINT }} />
            <button onClick={openAdd} style={{ width: "100%", textAlign: "left", background: "transparent", border: "1px dashed " + IB, borderRadius: 13, padding: "11px 12px", cursor: "pointer", color: ACCENT, fontSize: 12.5, fontWeight: 700 }}>Add meal / snack +</button>
          </div>
        </div>
      )}

      <button onClick={openAdd} aria-label="Add food" style={{ position: "fixed", right: 18, bottom: 90, width: 56, height: 56, borderRadius: 28, border: "none", background: ACCENT, color: "#fff", fontSize: 28, lineHeight: 1, cursor: "pointer", boxShadow: "0 6px 18px rgba(79,156,249,.45)", zIndex: 30 }}>＋</button>

      {sheet && draft && (
        <div onClick={closeSheet} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "16px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: H }}>{draft.id ? "Edit entry" : "Add to " + cap(monOf(sel)) + " " + dnum(sel)}</div>
              <button onClick={closeSheet} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 15, cursor: "pointer" }}>✕</button>
            </div>
            <div style={label}>Meal</div>
            <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>
              {MEALS.map((mt) => { const a = draft.meal_type === mt; return <button key={mt} onClick={() => setD({ meal_type: mt })} style={{ flex: 1, padding: "8px 0", borderRadius: 12, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1px solid " + (a ? CHIP_SEL_B : CHIP_IDLE_B), background: a ? CHIP_SEL : CHIP_IDLE, color: a ? ACCENT_LT : MUTED }}>{cap(mt)}</button>; })}
            </div>
            <div style={label}>What you ate</div>
            <input value={draft.name} onChange={(e) => setD({ name: e.target.value })} placeholder="e.g. 3 roti, dal, paneer bhurji" style={{ ...inp, marginTop: 4 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <NumField lbl="Calories" v={draft.kcal} on={(v) => setD({ kcal: v })} />
              <NumField lbl="Protein" v={draft.protein} on={(v) => setD({ protein: v })} accent={PROT} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <NumField lbl="Carbs" v={draft.carbs} on={(v) => setD({ carbs: v })} />
              <NumField lbl="Fats" v={draft.fats} on={(v) => setD({ fats: v })} />
              <NumField lbl="Fiber" v={draft.fiber} on={(v) => setD({ fiber: v })} />
            </div>
            <button onClick={save} disabled={saving} style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : draft.id ? "Save" : "Add to " + cap(draft.meal_type)}</button>
            {draft.id && <button onClick={del} disabled={saving} style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 14, border: "1px solid #5a2532", background: "#1a0f12", color: "#ff9aa5", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete</button>}
          </div>
        </div>
      )}
    </Screen>
  );
}
