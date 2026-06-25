"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { nutriPost, nutriFoods, nutriTemplates, nutriHistory, nutriPantry } from "../../lib/api";

const CARD = "#101626", INSET = "#0e1320", CB = "#1a2232", IB = "#1f2838";
const H = "#f3f6fb", BODY = "#e8ecf3", MUTED = "#aeb6c4", FAINT = "#7b8597", FAINTER = "#5c6573", DIS = "#4b5462";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", CHIP_SEL = "#13203a", CHIP_SEL_B = "#294063", CHIP_IDLE = "#141b29", CHIP_IDLE_B = "#222c3d";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a";

export type MealLite = { id: string; meal_type: string | null; snack_slot: string | null; name: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; quantity: number | null; unit: string | null; servings: number; food_id: string | null };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type Tmpl = { id: string; name: string; meal_type: string | null; kcal: number; protein: number; carbs: number; fats: number; fiber: number; default_unit: string | null; default_qty: number; times_logged: number; pinned: boolean; auto: boolean; food_id: string | null };
type Hist = { id: string; meal_type: string | null; name: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; date: string; food_id: string | null; unit: string | null; quantity: number | null };
type Pantry = { id?: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Draft = { name: string; kcal: string; protein: string; carbs: string; fats: string; fiber: string; food_id: string | null; micros: Record<string, number> };

const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const SNACKS = ["pre_workout", "mid_morning", "mid_evening", "post_dinner"];
const EMPTY: Draft = { name: "", kcal: "", protein: "", carbs: "", fats: "", fiber: "", food_id: null, micros: {} };

const r1 = (n: number) => Math.round(n * 10) / 10;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pretty = (s: string) => s.replace(/_/g, " ");
const numv = (s: string) => Number(s) || 0;

function gramsFactor(f: Food, unit: string, qty: number): number {
  if (f.basis === "per_piece" || f.basis === "per_serving") return qty;
  const g = unit === "g" ? qty : qty * (f.unit_grams[unit] || 100);
  return g / 100;
}
function unitOptions(f: Food): string[] {
  if (f.basis === "per_piece") return ["piece"];
  if (f.basis === "per_serving") { const k = Object.keys(f.unit_grams); return k.length ? k : ["serving"]; }
  return ["g", ...Object.keys(f.unit_grams)];
}
function scaleMicros(m: Record<string, number>, f: number): Record<string, number> { const o: Record<string, number> = {}; for (const k in m) o[k] = r1((m[k] || 0) * f); return o; }
function computeMacros(f: Food, unit: string, qty: number) { const x = gramsFactor(f, unit, qty); return { kcal: Math.round(f.kcal * x), protein: r1(f.protein * x), carbs: r1(f.carbs * x), fats: r1(f.fats * x), fiber: r1(f.fiber * x), micros: scaleMicros(f.micros, x) }; }
function gramsOf(f: Food, unit: string, qty: number): number { if (f.basis === "per_100g") return unit === "g" ? qty : qty * (f.unit_grams[unit] || 100); return qty; }
function macrosFrom(s: { basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number> }, grams: number, qty: number) { const f = s.basis === "per_100g" ? grams / 100 : qty; return { kcal: Math.round(s.kcal * f), protein: r1(s.protein * f), carbs: r1(s.carbs * f), fats: r1(s.fats * f), fiber: r1(s.fiber * f), micros: scaleMicros(s.micros, f) }; }
function resizeToB64(file: File): Promise<{ image_b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height; const max = 1024;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); if (!ctx) { reject(new Error("no canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const data = c.toDataURL("image/jpeg", 0.8); URL.revokeObjectURL(url);
      resolve({ image_b64: data.split(",")[1] || "", mime: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

const tiny: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const sub: CSSProperties = { fontSize: 11.5, color: FAINT };
function chip(active: boolean): CSSProperties { return { padding: "8px 12px", borderRadius: 11, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid " + (active ? CHIP_SEL_B : CHIP_IDLE_B), background: active ? CHIP_SEL : CHIP_IDLE, color: active ? ACCENT_LT : MUTED }; }
const primaryBtn: CSSProperties = { width: "100%", marginTop: 14, padding: 13, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" };

function NumIn({ v, on, color }: { v: string; on: (s: string) => void; color?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: "9px 8px", borderRadius: 10, border: "1px solid " + (color ? "#294063" : IB), background: "#0b101b", color: BODY, fontSize: 13, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />;
}
function MacroFields({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const F: [string, keyof Draft, string | undefined][] = [["Cal", "kcal", undefined], ["Prot", "protein", PROT], ["Carb", "carbs", CARB], ["Fat", "fats", FAT], ["Fibr", "fiber", FIBR]];
  return <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
    {F.map(([lbl, key, col]) => <div key={key} style={{ flex: 1 }}>
      <div style={{ ...tiny, textAlign: "center", color: col || FAINT, marginBottom: 4 }}>{lbl}</div>
      <NumIn v={String(d[key] ?? "")} on={(s) => set({ [key]: s } as Partial<Draft>)} color={col} />
    </div>)}
  </div>;
}

export default function AddFlow({ date, editMeal, onClose, onSaved }: { date: string; editMeal: MealLite | null; onClose: () => void; onSaved: (day: unknown) => void }) {
  const [view, setView] = useState<string>(editMeal ? "edit" : "method");
  const [mealType, setMealType] = useState<string>(editMeal ? (editMeal.snack_slot ? "snack" : (editMeal.meal_type || "breakfast")) : "breakfast");
  const [snackSlot, setSnackSlot] = useState<string>(editMeal?.snack_slot || "mid_morning");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState(""); const [foods, setFoods] = useState<Food[]>([]); const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState(1); const [unit, setUnit] = useState("g");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pantry, setPantry] = useState<Pantry[]>([]); const [referPantry, setReferPantry] = useState(true);

  const [text, setText] = useState(""); const [estNote, setEstNote] = useState<string | null>(null); const [photo, setPhoto] = useState<string | null>(null);
  const [tmpls, setTmpls] = useState<Tmpl[] | null>(null); const [hist, setHist] = useState<Hist[] | null>(null);
  const [servings, setServings] = useState(editMeal?.servings || 1);
  const [editName, setEditName] = useState(editMeal?.name || "");

  const setD = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => { nutriPantry<{ pantry: Pantry[] }>().then((r) => setPantry(r.pantry || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (view !== "manual") return;
    const t = setTimeout(() => { nutriFoods<{ foods: Food[] }>(q).then((r) => setFoods(r.foods || [])).catch(() => {}); }, 220);
    return () => clearTimeout(t);
  }, [q, view]);
  useEffect(() => {
    if (!picked) return;
    const grams = gramsOf(picked, unit, qty);
    const pd = referPantry ? pantryFor(picked.category) : null;
    const eff = pd ? { basis: pd.basis, kcal: pd.kcal, protein: pd.protein, carbs: pd.carbs, fats: pd.fats, fiber: pd.fiber, micros: pd.micros } : picked;
    const m = macrosFrom(eff, grams, qty);
    setDraft((d) => ({ name: d.name || picked.name, kcal: String(m.kcal), protein: String(m.protein), carbs: String(m.carbs), fats: String(m.fats), fiber: String(m.fiber), food_id: picked.id, micros: m.micros }));
  }, [picked, unit, qty, referPantry, pantry]);

  const pantryFor = (cat: string | null) => (cat ? pantry.find((p) => p.category === cat) || null : null);

  function pickFood(f: Food) { setPicked(f); setQty(1); const def = f.basis === "per_100g" ? (Object.keys(f.unit_grams)[0] || "g") : unitOptions(f)[0]; setUnit(def); }
  function resetManual() { setPicked(null); setDraft(EMPTY); setQ(""); }
  async function aiEstimateFood() {
    const nm = q.trim(); if (!nm) return; setBusy(true); setErr(null);
    try { const r = await nutriPost<{ food: Food | null }>("ai_food", { name: nm }); if (r && r.food) { setFoods([r.food]); pickFood(r.food); } else setErr("Couldn't estimate that food — try typing the macros."); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function addLog(d: { name: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; food_id: string | null; source: string; unit?: string | null; quantity?: number | null; micros?: Record<string, number> }) {
    setBusy(true); setErr(null);
    try {
      const day = await nutriPost("log", { date, meal_type: mealType, snack_slot: mealType === "snack" ? snackSlot : null, ...d });
      onSaved(day); onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  function manualAdd() {
    addLog({ name: draft.name || (picked ? picked.name : "Manual entry"), kcal: numv(draft.kcal), protein: numv(draft.protein), carbs: numv(draft.carbs), fats: numv(draft.fats), fiber: numv(draft.fiber), food_id: draft.food_id, source: "manual", unit: picked ? unit : null, quantity: picked ? qty : null, micros: draft.micros });
  }
  async function runEstimate(mode: string, image?: { image_b64: string; mime: string }) {
    setBusy(true); setErr(null);
    try {
      const r = await nutriPost<{ note?: string; totals?: Record<string, number> }>("estimate", mode === "photo" ? { mode, ...(image || {}) } : { mode, text });
      setEstNote(r.note || null); const t = r.totals || {};
      setDraft((d) => ({ name: mode === "describe" ? (text.slice(0, 120) || "Meal") : (d.name || "Photo meal"), kcal: String(t.kcal || 0), protein: String(t.protein || 0), carbs: String(t.carbs || 0), fats: String(t.fats || 0), fiber: String(t.fiber || 0), food_id: null, micros: {} }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function loadTemplates() { setTmpls(null); nutriTemplates<{ templates: Tmpl[] }>().then((r) => setTmpls(r.templates || [])).catch(() => setTmpls([])); }
  function loadHistory() { setHist(null); nutriHistory<{ history: Hist[] }>(40).then((r) => setHist(r.history || [])).catch(() => setHist([])); }
  async function delTemplate(t: Tmpl) { try { const r = await nutriPost<{ templates: Tmpl[] }>("template_delete", { id: t.id }); setTmpls(r.templates || []); } catch { /* ignore */ } }

  const base = editMeal ? { kcal: editMeal.kcal / (editMeal.servings || 1), protein: editMeal.protein / (editMeal.servings || 1), carbs: editMeal.carbs / (editMeal.servings || 1), fats: editMeal.fats / (editMeal.servings || 1), fiber: editMeal.fiber / (editMeal.servings || 1) } : null;
  function editMacros() { if (!base) return { kcal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }; return { kcal: Math.round(base.kcal * servings), protein: r1(base.protein * servings), carbs: r1(base.carbs * servings), fats: r1(base.fats * servings), fiber: r1(base.fiber * servings) }; }
  async function editSave() { if (!editMeal) return; setBusy(true); setErr(null); const m = editMacros(); try { const day = await nutriPost("update", { id: editMeal.id, name: editName, meal_type: mealType, snack_slot: mealType === "snack" ? snackSlot : null, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats, fiber: m.fiber, servings }); onSaved(day); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); } }
  async function editDelete() { if (!editMeal) return; setBusy(true); setErr(null); try { const day = await nutriPost("delete", { id: editMeal.id, date }); onSaved(day); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); } }

  const title = view === "edit" ? "Edit entry" : view === "manual" ? "Manual entry" : view === "describe" ? "Describe meal" : view === "photo" ? "Snap a photo" : view === "templates" ? "Quick-add" : view === "history" ? "Recent foods" : "Add food";
  const showBack = view !== "method" && view !== "edit";
  const live = picked ? null : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "14px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showBack && <button onClick={() => setView("method")} aria-label="Back" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 16, cursor: "pointer" }}>‹</button>}
            <div style={{ fontSize: 15, fontWeight: 800, color: H }}>{title}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>

        {/* meal + snack selector (shared) */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {MEALS.map((m) => <button key={m} onClick={() => setMealType(m)} style={chip(mealType === m)}>{cap(m)}</button>)}
        </div>
        {mealType === "snack" && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 8, paddingBottom: 2 }}>
            {SNACKS.map((s) => <button key={s} onClick={() => setSnackSlot(s)} style={{ ...chip(snackSlot === s), fontSize: 11, fontWeight: 600 }}>{cap(pretty(s))}</button>)}
          </div>
        )}

        {err && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #5a2532", background: "#1a0f12", color: "#ff9aa5", fontSize: 12 }}>{err}</div>}

        {/* METHOD TILES */}
        {view === "method" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            {([["Describe", "✍️", "describe", "Type what you ate"], ["Photo", "📷", "photo", "Snap your plate"], ["Templates", "⚡", "templates", "Your quick-adds"], ["Manual", "🔍", "manual", "Search the food list"]] as [string, string, string, string][]).map(([lbl, ic, v, desc]) => (
              <button key={v} onClick={() => { setView(v); if (v === "templates") loadTemplates(); if (v === "history") loadHistory(); }} style={{ textAlign: "left", background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: "16px 14px", cursor: "pointer" }}>
                <div style={{ fontSize: 24 }}>{ic}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: H, marginTop: 8 }}>{lbl}</div>
                <div style={{ ...sub, marginTop: 2 }}>{desc}</div>
              </button>
            ))}
            <button onClick={() => { setView("history"); loadHistory(); }} style={{ gridColumn: "1 / span 2", background: "transparent", border: "1px dashed " + IB, borderRadius: 14, padding: "11px", cursor: "pointer", color: ACCENT, fontSize: 12.5, fontWeight: 700 }}>↻ Re-log a recent food</button>
          </div>
        )}

        {/* MANUAL */}
        {view === "manual" && (
          <div style={{ marginTop: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods (e.g. paneer, dal, oats)…" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none" }} />
            {!picked && (
              <div style={{ marginTop: 8, maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {foods.map((f) => (
                  <button key={f.id} onClick={() => pickFood(f)} style={{ textAlign: "left", background: CARD, border: "1px solid " + CB, borderRadius: 11, padding: "9px 11px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: BODY }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: FAINTER }}>{f.kcal} kcal{f.basis === "per_100g" ? "/100g" : ""}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>P {f.protein} · C {f.carbs} · F {f.fats}{f.verified ? "" : " · est"}</div>
                  </button>
                ))}
                {foods.length === 0 && (
                  <div style={{ padding: 10 }}>
                    {q.trim() ? <button onClick={aiEstimateFood} disabled={busy} style={{ width: "100%", padding: 11, borderRadius: 11, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Estimating…" : "✨ Estimate “" + q.trim() + "” with AI"}</button> : null}
                    <div style={{ ...sub, marginTop: q.trim() ? 8 : 0 }}>{q.trim() ? "Not in the library yet — let AI estimate it (saved for next time), or type the macros below." : "Search, or just type the macros below to log it."}</div>
                  </div>
                )}
                <button onClick={() => setPicked(null)} style={{ display: "none" }} />
              </div>
            )}

            {picked && (
              <div style={{ marginTop: 10, background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{picked.name}</span>
                  <button onClick={resetManual} style={{ fontSize: 11, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>change</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <button onClick={() => setQty((x) => Math.max(0.5, r1(x - (picked.basis === "per_100g" && unit === "g" ? 10 : 0.5))))} style={stepBtn}>−</button>
                  <div style={{ minWidth: 46, textAlign: "center", fontSize: 15, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums" }}>{qty}</div>
                  <button onClick={() => setQty((x) => r1(x + (picked.basis === "per_100g" && unit === "g" ? 10 : 0.5)))} style={stepBtn}>+</button>
                  <div style={{ display: "flex", gap: 5, overflowX: "auto", marginLeft: 4 }}>
                    {unitOptions(picked).map((u) => <button key={u} onClick={() => setUnit(u)} style={{ ...chip(unit === u), padding: "6px 10px", fontSize: 11 }}>{u}</button>)}
                  </div>
                </div>
                {pantryFor(picked.category) && (
                  <button onClick={() => setReferPantry((x) => !x)} style={{ width: "100%", marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: INSET, border: "1px solid " + CB, borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
                    <span style={{ fontSize: 12, color: MUTED }}>Refer Pantry · <span style={{ color: BODY }}>{pantryFor(picked.category)?.label}</span></span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: referPantry ? FIBR : FAINTER }}>{referPantry ? "ON" : "OFF"}</span>
                  </button>
                )}
              </div>
            )}

            <MacroFields d={draft} set={setD} />
            <button onClick={manualAdd} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add to " + cap(mealType)}</button>
          </div>
        )}

        {/* DESCRIBE */}
        {view === "describe" && (
          <div style={{ marginTop: 12 }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. 3 roti, 1 katori dal, paneer bhurji, 1 katori curd" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none", resize: "vertical" }} />
            <button onClick={() => runEstimate("describe")} disabled={busy || !text.trim()} style={{ width: "100%", marginTop: 8, padding: 11, borderRadius: 12, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || !text.trim() ? 0.6 : 1 }}>{busy ? "Estimating…" : "✨ Estimate macros"}</button>
            {estNote && <div style={{ ...sub, marginTop: 8 }}>{estNote}</div>}
            <MacroFields d={draft} set={setD} />
            <button onClick={manualAdd} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add to " + cap(mealType)}</button>
          </div>
        )}

        {/* PHOTO */}
        {view === "photo" && (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", border: "1px dashed " + IB, borderRadius: 14, padding: photo ? 0 : "26px 12px", textAlign: "center", cursor: "pointer", overflow: "hidden", background: CARD }}>
              {photo ? <img src={photo} alt="meal" style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }} /> : <span style={{ ...sub }}>📷 Tap to take or choose a photo</span>}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) { setPhoto(URL.createObjectURL(f)); resizeToB64(f).then((img) => runEstimate("photo", img)).catch(() => runEstimate("photo")); } }} style={{ display: "none" }} />
            </label>
            {estNote && <div style={{ ...sub, marginTop: 8 }}>{estNote}</div>}
            <MacroFields d={draft} set={setD} />
            <button onClick={manualAdd} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add to " + cap(mealType)}</button>
          </div>
        )}

        {/* TEMPLATES */}
        {view === "templates" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            {tmpls === null && <div style={{ ...sub, padding: 10 }}>Loading…</div>}
            {tmpls && tmpls.length === 0 && <div style={{ ...sub, padding: 10 }}>Log a food a few times and it shows up here as a one-tap quick-add.</div>}
            {tmpls && tmpls.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "9px 11px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BODY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name} {t.pinned ? "📌" : ""}</div>
                  <div style={{ fontSize: 10.5, color: FAINT, marginTop: 1 }}>{t.kcal} kcal · P {t.protein} · C {t.carbs} · F {t.fats}</div>
                </div>
                <button onClick={() => delTemplate(t)} aria-label="Remove" style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid " + CB, background: CHIP_IDLE, color: FAINTER, fontSize: 12, cursor: "pointer" }}>✕</button>
                <button onClick={() => addLog({ name: t.name, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fats: t.fats, fiber: t.fiber, food_id: t.food_id, source: "template", unit: t.default_unit, quantity: t.default_qty })} style={{ padding: "7px 13px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Log</button>
              </div>
            ))}
          </div>
        )}

        {/* HISTORY */}
        {view === "history" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            {hist === null && <div style={{ ...sub, padding: 10 }}>Loading…</div>}
            {hist && hist.length === 0 && <div style={{ ...sub, padding: 10 }}>Nothing logged yet.</div>}
            {hist && hist.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "9px 11px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BODY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  <div style={{ fontSize: 10.5, color: FAINT, marginTop: 1 }}>{(h.meal_type || "").toUpperCase()} · {h.date} · {h.kcal} kcal · P {h.protein}</div>
                </div>
                <button onClick={() => addLog({ name: h.name, kcal: h.kcal, protein: h.protein, carbs: h.carbs, fats: h.fats, fiber: h.fiber, food_id: h.food_id, source: "history", unit: h.unit, quantity: h.quantity || 1 })} style={{ padding: "7px 13px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Re-log</button>
              </div>
            ))}
          </div>
        )}

        {/* EDIT */}
        {view === "edit" && editMeal && (
          <div style={{ marginTop: 12 }}>
            <div style={tiny}>Name</div>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "11px 12px", borderRadius: 11, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "10px 12px" }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>Servings</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setServings((s) => Math.max(0.25, r1(s - 0.25)))} style={stepBtn}>−</button>
                <div style={{ minWidth: 40, textAlign: "center", fontSize: 15, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums" }}>{servings}×</div>
                <button onClick={() => setServings((s) => r1(s + 0.25))} style={stepBtn}>+</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {([["Cal", editMacros().kcal, undefined], ["Prot", editMacros().protein, PROT], ["Carb", editMacros().carbs, CARB], ["Fat", editMacros().fats, FAT], ["Fibr", editMacros().fiber, FIBR]] as [string, number, string | undefined][]).map(([lbl, val, col]) => (
                <div key={lbl} style={{ flex: 1, background: CARD, border: "1px solid " + CB, borderRadius: 11, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ ...tiny, color: col || FAINT }}>{lbl}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: col || H, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                </div>
              ))}
            </div>
            <button onClick={editSave} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={editDelete} disabled={busy} style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 14, border: "1px solid #5a2532", background: "#1a0f12", color: "#ff9aa5", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete entry</button>
          </div>
        )}
      </div>
    </div>
  );
}

const stepBtn: CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid " + CB, background: CHIP_IDLE, color: BODY, fontSize: 18, lineHeight: 1, cursor: "pointer" };
