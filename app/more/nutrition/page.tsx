"use client";

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { Screen } from "../../components/Screen";
import { nutriDay, nutriWeek } from "../../lib/api";
import AddFlow, { type MealLite } from "./AddFlow";

/* ---- design tokens (mapped from the Nutrition spec) ---- */
const CARD = "#101626", INSET = "#0e1320", CB = "#1a2232", IB = "#1f2838";
const H = "#f3f6fb", BODY = "#e8ecf3", MUTED = "#aeb6c4", FAINT = "#7b8597", FAINTER = "#5c6573", DIS = "#4b5462";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", CHIP_SEL = "#13203a", CHIP_SEL_B = "#294063", CHIP_IDLE = "#141b29", CHIP_IDLE_B = "#222c3d";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a", TRACK = "#1b2333";
const ON = "#46c79a", PARTIAL = "#f3b14e", MISS = "#e0574b";

const card: CSSProperties = { background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14 };
const label: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const navBtn: CSSProperties = { width: 30, height: 30, borderRadius: 9, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 16, lineHeight: 1, cursor: "pointer" };

type Targets = { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> };
type Totals = { calories: number; protein: number; carbs: number; fats: number; fiber: number; water: number; micros: Record<string, number> };
type Meal = { id: string; meal_type: string | null; snack_slot: string | null; name: string; source: string; confidence: string | null; time: string | null; quantity: number | null; unit: string | null; servings: number; kcal: number; protein: number; carbs: number; fats: number; fiber: number; water_ml: number; micros: Record<string, number>; food_id: string | null };
type Day = { date: string; targets: Targets; totals: Totals; meals: Meal[] };
type WeekDay = { date: string; dow: number; protein: number; calories: number; entries: number; status: string };
type Week = { start: string; today: string; target_protein: number; streak: number; days: WeekDay[] };

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istToday(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function mondayOf(iso: string): string { const d = new Date(iso + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number): string { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dnum(iso: string): number { return Number(iso.slice(8, 10)); }
function monOf(iso: string): string { return MON[Number(iso.slice(5, 7)) - 1]; }
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

export default function NutritionPage() {
  const [sel, setSel] = useState<string>(istToday());
  const [week, setWeek] = useState<Week | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [editMeal, setEditMeal] = useState<MealLite | null>(null);

  const loadWeek = useCallback((d: string) => { nutriWeek<Week>(mondayOf(d)).then(setWeek).catch((e) => setErr(e.message)); }, []);
  const loadDay = useCallback((d: string) => { setDay(null); nutriDay<Day>(d).then(setDay).catch((e) => setErr(e.message)); }, []);

  useEffect(() => { loadDay(sel); }, [sel, loadDay]);
  useEffect(() => { loadWeek(istToday()); }, [loadWeek]);

  function shiftWeek(n: number) { const ns = addDays(mondayOf(sel), n * 7); setSel(ns); loadWeek(ns); }
  function openAdd() { setEditMeal(null); setAddOpen(true); }
  function openEdit(m: Meal) { setEditMeal(m); setAddOpen(true); }
  function onSaved(d: unknown) { setDay(d as Day); loadWeek(sel); }

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
                <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 3 }}>P {Math.round(m.protein)} · C {Math.round(m.carbs)} · F {Math.round(m.fats)}{m.fiber ? " · Fb " + Math.round(m.fiber) : ""}</div>
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

      {addOpen && <AddFlow date={sel} editMeal={editMeal} onClose={() => setAddOpen(false)} onSaved={onSaved} />}
    </Screen>
  );
}
