"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { nutriProfile, nutriFoods, nutriPost } from "../../lib/api";

const CARD = "#101626", INSET = "#0e1320", CB = "#1a2232", IB = "#1f2838";
const H = "#f3f6fb", BODY = "#e8ecf3", MUTED = "#aeb6c4", FAINT = "#7b8597", FAINTER = "#5c6573";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", CHIP_SEL = "#13203a", CHIP_SEL_B = "#294063", CHIP_IDLE = "#141b29", CHIP_IDLE_B = "#222c3d";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a", FIBR2 = "#46c79a";

type Targets = { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> };
type Profile = { cuisine: string[]; eating_pattern: string; restrictions: string; refer_pantry_default: boolean; typical_meals: string; biggest_challenge: string; starter_menu: unknown };
type PantryItem = { id: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type ProfileResp = { profile: Profile; targets: Targets; pantry: PantryItem[] };

const CUISINES = ["North Indian", "South Indian", "Gujarati", "Punjabi", "Bengali", "Maharashtrian", "Continental", "Chinese", "Mediterranean", "Mexican"];
const PATTERNS = ["Vegetarian", "Eggetarian", "Non-veg", "Vegan", "Jain"];
const CATS = ["milk", "paneer", "curd", "whey", "atta", "oats", "oil", "ghee", "bread", "rice", "dal"];

const numv = (s: string) => Number(s) || 0;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const tiny: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 10, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none" };
function chip(active: boolean): CSSProperties { return { padding: "8px 12px", borderRadius: 11, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid " + (active ? CHIP_SEL_B : CHIP_IDLE_B), background: active ? CHIP_SEL : CHIP_IDLE, color: active ? ACCENT_LT : MUTED }; }
const primary: CSSProperties = { width: "100%", marginTop: 14, padding: 13, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" };

function NumIn({ v, on, color }: { v: string; on: (s: string) => void; color?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: "9px 8px", borderRadius: 10, border: "1px solid " + (color ? "#294063" : IB), background: "#0b101b", color: BODY, fontSize: 13, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />;
}
function Field({ lbl, v, on, color }: { lbl: string; v: string; on: (s: string) => void; color?: string }) {
  return <div style={{ flex: 1 }}><div style={{ ...tiny, textAlign: "center", color: color || FAINT, marginBottom: 4 }}>{lbl}</div><NumIn v={v} on={on} color={color} /></div>;
}

export default function Setup({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<string>("targets");
  const [data, setData] = useState<ProfileResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // targets draft
  const [cal, setCal] = useState(""); const [pro, setPro] = useState(""); const [car, setCar] = useState(""); const [fat, setFat] = useState(""); const [fib, setFib] = useState("");
  const [wt, setWt] = useState(""); const [goal, setGoal] = useState("maintain");
  // prefs draft
  const [cuisine, setCuisine] = useState<string[]>([]); const [pattern, setPattern] = useState(""); const [referDefault, setReferDefault] = useState(true);
  // pantry add
  const [pAdding, setPAdding] = useState(false); const [pCat, setPCat] = useState(""); const [pQ, setPQ] = useState(""); const [pFoods, setPFoods] = useState<Food[]>([]); const [pPicked, setPPicked] = useState<Food | null>(null);
  const [pLabel, setPLabel] = useState(""); const [pKcal, setPKcal] = useState(""); const [pPro, setPPro] = useState(""); const [pCar, setPCar] = useState(""); const [pFat, setPFat] = useState(""); const [pFib, setPFib] = useState("");
  const [pantry, setPantry] = useState<PantryItem[]>([]);

  function hydrate(d: ProfileResp) {
    setData(d);
    setCal(String(d.targets.calories || "")); setPro(String(d.targets.protein || "")); setCar(String(d.targets.carbs || "")); setFat(String(d.targets.fats || "")); setFib(String(d.targets.fiber || ""));
    setCuisine(d.profile.cuisine || []); setPattern(d.profile.eating_pattern || ""); setReferDefault(d.profile.refer_pantry_default !== false);
    setPantry(d.pantry || []);
  }
  useEffect(() => { nutriProfile<ProfileResp>().then(hydrate).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!pAdding) return;
    const t = setTimeout(() => { nutriFoods<{ foods: Food[] }>(pQ).then((r) => setPFoods(r.foods || [])).catch(() => {}); }, 220);
    return () => clearTimeout(t);
  }, [pQ, pAdding]);

  function suggest() {
    const w = numv(wt); if (!w) { setErr("Enter your weight first"); return; }
    const perKg = goal === "cut" ? 26 : goal === "gain" ? 34 : 30;
    const c = Math.round(w * perKg); const p = Math.round(w * 1.8); const f = Math.round((c * 0.25) / 9); const cb = Math.round((c - p * 4 - f * 9) / 4);
    setCal(String(c)); setPro(String(p)); setFat(String(f)); setCar(String(cb < 0 ? 0 : cb)); setFib(String(30));
  }
  async function saveTargets() {
    setBusy(true); setErr(null);
    try { const d = await nutriPost<ProfileResp>("targets_save", { calories: numv(cal), protein: numv(pro), carbs: numv(car), fats: numv(fat), fiber: numv(fib) }); hydrate(d); if (onChanged) onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function savePrefs() {
    setBusy(true); setErr(null);
    try { const d = await nutriPost<ProfileResp>("profile_save", { cuisine, eating_pattern: pattern, refer_pantry_default: referDefault }); hydrate(d); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function toggleCuisine(c: string) { setCuisine((xs) => (xs.indexOf(c) >= 0 ? xs.filter((x) => x !== c) : [...xs, c])); }

  function pickPantryFood(f: Food) { setPPicked(f); setPLabel(f.brand ? f.brand + " " + f.name : f.name); setPKcal(String(f.kcal)); setPPro(String(f.protein)); setPCar(String(f.carbs)); setPFat(String(f.fats)); setPFib(String(f.fiber)); if (f.category && !pCat) setPCat(f.category); }
  function resetPantryAdd() { setPCat(""); setPQ(""); setPFoods([]); setPPicked(null); setPLabel(""); setPKcal(""); setPPro(""); setPCar(""); setPFat(""); setPFib(""); }
  async function savePantryItem() {
    if (!pCat.trim()) { setErr("Pick or type a category"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await nutriPost<{ pantry: PantryItem[] }>("pantry_save", { category: pCat.trim().toLowerCase(), label: pLabel || pCat, food_id: pPicked ? pPicked.id : null, basis: pPicked ? pPicked.basis : "per_100g", kcal: numv(pKcal), protein: numv(pPro), carbs: numv(pCar), fats: numv(pFat), fiber: numv(pFib), unit_grams: pPicked ? pPicked.unit_grams : {}, micros: pPicked ? pPicked.micros : {} });
      setPantry(r.pantry || []); resetPantryAdd(); setPAdding(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function delPantry(it: PantryItem) { try { const r = await nutriPost<{ pantry: PantryItem[] }>("pantry_delete", { id: it.id }); setPantry(r.pantry || []); } catch { /* ignore */ } }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 49 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "14px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: H }}>Nutrition setup</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["targets", "Targets"], ["prefs", "Preferences"], ["pantry", "Pantry"]].map(([k, lbl]) => <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 11, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: "1px solid " + (tab === k ? CHIP_SEL_B : CHIP_IDLE_B), background: tab === k ? CHIP_SEL : CHIP_IDLE, color: tab === k ? ACCENT_LT : MUTED }}>{lbl}</button>)}
        </div>

        {err && <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid #5a2532", background: "#1a0f12", color: "#ff9aa5", fontSize: 12 }}>{err}</div>}
        {!data && !err && <div style={{ color: FAINT, fontSize: 12.5, textAlign: "center", padding: 24 }}>Loading…</div>}

        {data && tab === "targets" && (
          <div>
            <div style={{ ...tiny, marginBottom: 6 }}>Daily targets</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Field lbl="Cal" v={cal} on={setCal} />
              <Field lbl="Prot" v={pro} on={setPro} color={PROT} />
              <Field lbl="Carb" v={car} on={setCar} color={CARB} />
              <Field lbl="Fat" v={fat} on={setFat} color={FAT} />
              <Field lbl="Fibr" v={fib} on={setFib} color={FIBR} />
            </div>
            <div style={{ marginTop: 14, background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: 12 }}>
              <div style={{ ...tiny, marginBottom: 8 }}>Quick-set from bodyweight</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 96 }}><input value={wt} onChange={(e) => setWt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="kg" style={inp} /></div>
                <div style={{ display: "flex", gap: 5, flex: 1 }}>
                  {["cut", "maintain", "gain"].map((g) => <button key={g} onClick={() => setGoal(g)} style={{ ...chip(goal === g), flex: 1, padding: "8px 0", textAlign: "center" }}>{cap(g)}</button>)}
                </div>
              </div>
              <button onClick={suggest} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 11, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Suggest targets (~1.8g protein/kg)</button>
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>A starting point you can edit. Not medical advice — adjust to how you feel and progress.</div>
            </div>
            <button onClick={saveTargets} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save targets"}</button>
          </div>
        )}

        {data && tab === "prefs" && (
          <div>
            <div style={{ ...tiny, marginBottom: 6 }}>Cuisines you eat</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CUISINES.map((c) => <button key={c} onClick={() => toggleCuisine(c)} style={chip(cuisine.indexOf(c) >= 0)}>{c}</button>)}
            </div>
            <div style={{ ...tiny, margin: "16px 0 6px" }}>Eating pattern</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PATTERNS.map((p) => <button key={p} onClick={() => setPattern(p)} style={chip(pattern === p)}>{p}</button>)}
            </div>
            <button onClick={() => setReferDefault((x) => !x)} style={{ width: "100%", marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, color: BODY, textAlign: "left" }}>Use my Pantry brands by default<br /><span style={{ fontSize: 10.5, color: FAINT }}>When logging, prefer your saved products over generic values.</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: referDefault ? FIBR2 : FAINTER }}>{referDefault ? "ON" : "OFF"}</span>
            </button>
            <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 10 }}>✨ AI-generated starter menus from your cuisines are coming in a later update.</div>
            <button onClick={savePrefs} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save preferences"}</button>
          </div>
        )}

        {data && tab === "pantry" && (
          <div>
            <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>Set your usual product per category. When you log a food in that category, the add screen offers a “Refer Pantry” toggle to use these values.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {pantry.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: H }}>{cap(it.category)} <span style={{ color: FAINT, fontWeight: 500 }}>· {it.label}</span></div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 1 }}>{it.kcal} kcal · P {it.protein} · C {it.carbs} · F {it.fats}{it.basis === "per_100g" ? " /100g" : ""}</div>
                  </div>
                  <button onClick={() => delPantry(it)} aria-label="Remove" style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid " + CB, background: CHIP_IDLE, color: FAINTER, fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              ))}
              {pantry.length === 0 && <div style={{ fontSize: 12, color: FAINT, padding: 6 }}>No pantry defaults yet.</div>}
            </div>

            {!pAdding ? (
              <button onClick={() => { resetPantryAdd(); setPAdding(true); }} style={{ width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: "1px dashed " + IB, background: "transparent", color: ACCENT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Add a pantry default</button>
            ) : (
              <div style={{ marginTop: 12, background: CARD, border: "1px solid " + CB, borderRadius: 14, padding: 13 }}>
                <div style={{ ...tiny, marginBottom: 6 }}>Category</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  {CATS.map((c) => <button key={c} onClick={() => setPCat(c)} style={{ ...chip(pCat === c), padding: "6px 10px", fontSize: 11 }}>{c}</button>)}
                </div>
                <input value={pCat} onChange={(e) => setPCat(e.target.value)} placeholder="or type a category" style={{ ...inp, marginBottom: 10 }} />
                <div style={{ ...tiny, marginBottom: 6 }}>Find your product</div>
                <input value={pQ} onChange={(e) => setPQ(e.target.value)} placeholder="search e.g. paneer, whey, milk…" style={inp} />
                {!pPicked && pFoods.length > 0 && (
                  <div style={{ marginTop: 8, maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {pFoods.map((f) => (
                      <button key={f.id} onClick={() => pickPantryFood(f)} style={{ textAlign: "left", background: INSET, border: "1px solid " + CB, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: BODY }}>{f.name}</span>
                        <span style={{ fontSize: 10.5, color: FAINT }}> · {f.kcal} kcal · P {f.protein}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ ...tiny, margin: "12px 0 4px" }}>Label</div>
                <input value={pLabel} onChange={(e) => setPLabel(e.target.value)} placeholder="e.g. Amul High-Protein Paneer" style={inp} />
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <Field lbl="Cal" v={pKcal} on={setPKcal} />
                  <Field lbl="Prot" v={pPro} on={setPPro} color={PROT} />
                  <Field lbl="Carb" v={pCar} on={setPCar} color={CARB} />
                  <Field lbl="Fat" v={pFat} on={setPFat} color={FAT} />
                  <Field lbl="Fibr" v={pFib} on={setPFib} color={FIBR} />
                </div>
                <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>Per 100g (or per piece/serving if you picked such a food).</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => { resetPantryAdd(); setPAdding(false); }} style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                  <button onClick={savePantryItem} disabled={busy} style={{ flex: 1, padding: 11, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save default"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
