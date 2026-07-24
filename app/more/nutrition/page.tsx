"use client";
import Icon from "../../components/Icon";

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { Screen } from "../../components/Screen";
import { nutriDay, nutriWeek, nutriGaps, nutriLoggedDays, nutriPost } from "../../lib/api";
import AddFlow, { type MealLite } from "./AddFlow";
import Adherence from "./Adherence";
import Setup from "./Setup";
import Loader from "../../components/Loader";

/* ---- design tokens (mapped from the Nutrition spec) ---- */
const CARD = "var(--surface)", INSET = "var(--bg)", CB = "var(--line)", IB = "var(--line-2)";
const H = "var(--text)", BODY = "var(--text)", MUTED = "var(--text-2)", FAINT = "var(--muted)", FAINTER = "var(--faint)", DIS = "var(--faint)";
const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)", CHIP_SEL = "var(--ember-tint)", CHIP_SEL_B = "color-mix(in srgb, var(--ember) 35%, transparent)", CHIP_IDLE = "var(--surface-2)", CHIP_IDLE_B = "var(--line-2)";
const PROT = "var(--ember)", CARB = "#dca23f", FAT = "var(--kai)", FIBR = "var(--success)";
const ON = "var(--success)", PARTIAL = "var(--gold)", MISS = "var(--danger)";

const card: CSSProperties = { background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: 14 };
const navBtn: CSSProperties = { width: 30, height: 30, borderRadius: 9, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 16, lineHeight: 1, cursor: "pointer" };

type Targets = { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> };
type Totals = { calories: number; protein: number; carbs: number; fats: number; fiber: number; water: number; micros: Record<string, number> };
type Meal = { id: string; meal_type: string | null; snack_slot: string | null; name: string; source: string; confidence: string | null; time: string | null; quantity: number | null; unit: string | null; servings: number; kcal: number; protein: number; carbs: number; fats: number; fiber: number; water_ml: number; micros: Record<string, number>; food_id: string | null };
type DaySet = { calories: number; protein: number; carbs: number; fats: number; fiber: number };
type Day = { date: string; targets: Targets; targets_training?: DaySet; targets_rest?: DaySet; has_rest?: boolean; day_type?: string; totals: Totals; meals: Meal[] };
type WeekDay = { date: string; dow: number; protein: number; calories: number; entries: number; status: string };
type Week = { start: string; today: string; target_protein: number; streak: number; days: WeekDay[] };
type LoggedDay = { date: string; calories: number; protein: number; entries: number };

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istToday(): string { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function mondayOf(iso: string): string { const d = new Date(iso + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function addDays(iso: string, n: number): string { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dnum(iso: string): number { return Number(iso.slice(8, 10)); }
function monOf(iso: string): string { return MON[Number(iso.slice(5, 7)) - 1]; }
function dowOf(iso: string): string { return DOW[new Date(iso + "T00:00:00Z").getUTCDay()]; }
function nice(iso: string): string { return dowOf(iso) + ", " + monOf(iso) + " " + dnum(iso); }
function fmtTime(t: string | null): string { if (!t) return ""; const d = new Date(t); if (isNaN(d.getTime())) return ""; const ist = new Date(d.getTime() + 5.5 * 3600 * 1000); return String(ist.getUTCHours()).padStart(2, "0") + ":" + String(ist.getUTCMinutes()).padStart(2, "0"); }
function statusColor(s: string): string { return s === "on" ? ON : s === "partial" ? PARTIAL : (s === "low" || s === "missed") ? MISS : s === "future" ? CHIP_IDLE_B : FAINT; }
function mealColor(m: Meal): string { const t = m.snack_slot ? "snack" : (m.meal_type || ""); return t === "breakfast" ? CARB : t === "lunch" ? PROT : t === "dinner" ? ACCENT_LT : t === "snack" ? FIBR : ACCENT; }
function mealLabel(m: Meal): string { if (m.snack_slot) return "SNACK · " + m.snack_slot.replace(/_/g, " ").toUpperCase(); return (m.meal_type || "meal").toUpperCase(); }

function CalRing({ val, target }: { val: number; target: number }) {
  const C = 2 * Math.PI * 52;
  const pct = target > 0 ? Math.min(val / target, 1) : 0;
  const left = Math.round((target || 0) - val);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
        <svg width={96} height={96} viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line-2)" strokeWidth={10} />
          <circle cx="60" cy="60" r="52" fill="none" stroke={ACCENT} strokeWidth={10} strokeLinecap="round" strokeDasharray={pct * C + " " + C} transform="rotate(-90 60 60)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: H, fontVariantNumeric: "tabular-nums" }}>{Math.round(val).toLocaleString()}</div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: FAINT, letterSpacing: "0.08em" }}>KCAL</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: H }}>{target ? (left >= 0 ? left.toLocaleString() + " kcal left" : Math.abs(left).toLocaleString() + " kcal over") : Math.round(val).toLocaleString() + " kcal"}</div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{target ? "Target " + target.toLocaleString() + " kcal" : "No target set"}</div>
      </div>
    </div>
  );
}
function MacroCard({ lbl, val, target, color }: { lbl: string; val: number; target: number; color: string }) {
  const pct = target ? Math.min((val / target) * 100, 100) : 0;
  return (
    <div style={{ flex: 1, background: "var(--surface-3)", borderRadius: 16, padding: "12px 10px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: FAINT, letterSpacing: "0.06em" }}>{lbl}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: H, fontVariantNumeric: "tabular-nums" }}>{Math.round(val)}<span style={{ fontSize: 11, fontWeight: 600, color: FAINTER }}>{target ? "/" + target + "g" : "g"}</span></div>
      <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: "color-mix(in srgb, " + color + " 18%, transparent)" }}><div style={{ width: pct + "%", height: 4, borderRadius: 999, background: color }} /></div>
    </div>
  );
}

export default function NutritionPage() {
  const today = istToday();
  const [sel, setSel] = useState<string>(today);
  const [week, setWeek] = useState<Week | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [editMeal, setEditMeal] = useState<MealLite | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [copyOpen, setCopyOpen] = useState<boolean>(false);
  const [pickDays, setPickDays] = useState<LoggedDay[] | null>(null);
  const [copying, setCopying] = useState<boolean>(false);
  const [adhOpen, setAdhOpen] = useState<boolean>(false);
  const [setupOpen, setSetupOpen] = useState<boolean>(false);

  const loadWeek = useCallback((d: string) => { nutriWeek<Week>(mondayOf(d)).then(setWeek).catch((e) => setErr(e.message)); }, []);
  const loadDay = useCallback((d: string) => { setDay(null); nutriDay<Day>(d).then(setDay).catch((e) => setErr(e.message)); }, []);
  const loadGaps = useCallback(() => { nutriGaps<{ gaps: string[] }>(7).then((r) => setGaps(r.gaps || [])).catch(() => {}); }, []);

  useEffect(() => { loadDay(sel); }, [sel, loadDay]);
  useEffect(() => { loadWeek(today); loadGaps(); }, [loadWeek, loadGaps, today]);

  function jumpTo(d: string) { setSel(d); loadWeek(d); }
  function shiftWeek(n: number) { const ns = addDays(mondayOf(sel), n * 7); setSel(ns); loadWeek(ns); }
  function openAdd() { setEditMeal(null); setAddOpen(true); }
  function openEdit(m: Meal) { setEditMeal(m); setAddOpen(true); }
  function onSaved(d: unknown) { setDay(d as Day); loadWeek(sel); loadGaps(); }

  function openCopy() { setCopyOpen(true); setPickDays(null); nutriLoggedDays<{ days: LoggedDay[] }>(12).then((r) => setPickDays((r.days || []).filter((x) => x.date !== sel))).catch(() => setPickDays([])); }
  async function copyFrom(from: string) {
    setCopying(true); setErr(null);
    try { const d = await nutriPost<Day>("copy_day", { from, to: sel }); setDay(d); loadWeek(sel); loadGaps(); setCopyOpen(false); }
    catch (e) { setErr((e as Error).message); } finally { setCopying(false); }
  }

  const dtype = day?.day_type || "unknown";
  const tt: DaySet | null = day ? (day.targets_training || day.targets) : null;
  const tr: DaySet | null = day ? (day.targets_rest || day.targets) : null;
  const showSplit = !!(day && day.has_rest);
  const t: DaySet | null = day ? (showSplit && dtype === "rest" ? tr : tt) : null;
  const tot = day ? day.totals : null;
  const proteinLeft = t && tot ? Math.max(0, Math.round(t.protein - tot.protein)) : 0;
  const emptyPast = sel < today && day !== null && day.meals.length === 0;

  return (
    <Screen title="Nutrition">
      {err && <div style={{ ...card, borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)", color: "var(--danger)", marginBottom: 10, fontSize: 12.5 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{week ? monOf(week.days[0].date) + (monOf(week.days[0].date) !== monOf(week.days[6].date) ? " – " + monOf(week.days[6].date) : "") : ""}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setSetupOpen(true)} aria-label="Settings" style={navBtn}><Icon name="gear" size={15} /></button>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => setAdhOpen(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: 11.5, color: FAINT }}>Protein adherence · last 7 days · <span style={{ color: ON, fontWeight: 700 }}>{week.streak}-day streak</span> <span style={{ color: ACCENT, fontWeight: 700 }}>›</span></button>
          {sel !== today && <button onClick={() => jumpTo(today)} style={{ fontSize: 11, fontWeight: 700, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>Today →</button>}
        </div>
      )}

      {gaps.length > 0 && (
        <button onClick={() => jumpTo(gaps[0])} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", background: "color-mix(in srgb, var(--gold) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--gold) 35%, transparent)", borderRadius: 13, padding: "10px 13px", marginBottom: 12, cursor: "pointer" }}>
          <span style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}><Icon name="calendar" size={11} /> {gaps.length} unlogged {gaps.length === 1 ? "day" : "days"} this past week</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: PARTIAL }}>Backfill →</span>
        </button>
      )}

      {showSplit && (
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {([["training", "\uD83C\uDFCB Training", tt], ["rest", "\uD83D\uDECC Rest", tr]] as [string, string, DaySet | null][]).map(([k, lbl, set]) => {
            const active = dtype === k; const unknown = dtype === "unknown";
            return (
              <div key={k} style={{ flex: 1, borderRadius: 12, padding: "8px 11px", border: "1px solid " + (active ? CHIP_SEL_B : CB), background: active ? CHIP_SEL : CARD, opacity: unknown || active ? 1 : 0.55 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".04em", color: active ? ACCENT_LT : FAINT }}>{lbl}{active ? " \u00b7 today" : ""}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: active ? H : MUTED, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{set ? set.calories : 0}<span style={{ fontSize: 9.5, color: FAINTER, fontWeight: 600 }}> kcal \u00b7 P{set ? set.protein : 0}</span></div>
              </div>
            );
          })}
        </div>
      )}
      {showSplit && dtype === "unknown" && (
        <div style={{ fontSize: 10.5, color: FAINT, marginBottom: 8, marginTop: -2 }}>No workout scheduled today \u2014 showing both; the active set highlights once the Schedule has a session.</div>
      )}

      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 20, boxShadow: "var(--shadow-card)", marginBottom: 12 }}>
        <CalRing val={tot ? tot.calories : 0} target={t ? t.calories : 0} />
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <MacroCard lbl="PROTEIN" val={tot ? tot.protein : 0} target={t ? t.protein : 0} color={PROT} />
          <MacroCard lbl="CARBS" val={tot ? tot.carbs : 0} target={t ? t.carbs : 0} color={CARB} />
          <MacroCard lbl="FAT" val={tot ? tot.fats : 0} target={t ? t.fats : 0} color={FAT} />
          <MacroCard lbl="FIBER" val={tot ? tot.fiber : 0} target={t ? t.fiber : 0} color={FIBR} />
        </div>
      </div>

      {proteinLeft > 0 && day && day.meals.length > 0 && (
        <div style={{ background: "linear-gradient(90deg, var(--ember-tint), var(--surface))", border: "1px solid " + CHIP_SEL_B, borderRadius: 14, padding: "11px 13px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT_LT }}><Icon name="target" size={12} /> {proteinLeft}g protein to go</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{Math.round(tot ? tot.protein : 0)} of {t ? t.protein : 0}g — log a protein-rich item to close the gap.</div>
        </div>
      )}

      {emptyPast && (
        <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>Nothing logged for {nice(sel)}</div>
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>Backfill it so your streak and trends stay accurate.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
            <button onClick={openCopy} style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}><Icon name="clipboard" size={12} /> Copy a day</button>
            <button onClick={openAdd} style={{ flex: 1, padding: 11, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>+ Add food</button>
          </div>
        </div>
      )}

      {!day ? (
        <Loader />
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

      {day && (
        <div style={{ background: "var(--surface-3)", borderRadius: 18, padding: "14px 16px", margin: "14px 0 4px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: ACCENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-ember)", fontSize: 11, fontWeight: 800 }}>K</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: BODY }}><span style={{ fontWeight: 700, color: H }}>Kai</span> will nudge your fueling here. Daily protein pacing and meal ideas, coming soon.</div>
        </div>
      )}

      <button onClick={openAdd} aria-label="Add food" className="app-fab" style={{ position: "fixed", right: "max(16px, calc(50vw - 224px))", bottom: "calc(140px + env(safe-area-inset-bottom, 0px))", width: 56, height: 56, borderRadius: 28, border: "none", background: ACCENT, color: "#fff", fontSize: 28, lineHeight: 1, cursor: "pointer", boxShadow: "var(--shadow-fab)", zIndex: 30 }}>＋</button>

      {addOpen && <AddFlow date={sel} editMeal={editMeal} onClose={() => setAddOpen(false)} onSaved={onSaved} />}
      {adhOpen && <Adherence onClose={() => setAdhOpen(false)} />}
      {setupOpen && <Setup onClose={() => setSetupOpen(false)} onChanged={() => { loadDay(sel); loadWeek(sel); }} />}

      {copyOpen && (
        <div onClick={() => setCopyOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 45 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "16px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: H }}>Copy a day into {nice(sel)}</div>
              <button onClick={() => setCopyOpen(false)} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 15, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>Clones every entry from the day you pick. You can tweak afterwards.</div>
            {pickDays === null && <Loader compact />}
            {pickDays && pickDays.length === 0 && <div style={{ fontSize: 12, color: FAINT, padding: 10 }}>No other logged days yet to copy from.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {pickDays && pickDays.map((d) => (
                <button key={d.date} disabled={copying} onClick={() => copyFrom(d.date)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "11px 13px", cursor: "pointer", opacity: copying ? 0.6 : 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: BODY }}>{nice(d.date)}</span>
                  <span style={{ fontSize: 11, color: FAINT }}>{d.entries} items · {d.calories} kcal · P {d.protein}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
