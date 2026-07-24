"use client";
import Icon from "../../components/Icon";

import { useEffect, useState, useRef, type CSSProperties } from "react";
import { nutriPost, nutriFoods, nutriTemplates, nutriHistory, nutriPantry, nutriProfile } from "../../lib/api";
import Loader from "../../components/Loader";

const CARD = "var(--surface)", INSET = "var(--bg)", CB = "var(--line)", IB = "var(--line-2)";
const H = "var(--text)", BODY = "var(--text)", MUTED = "var(--text-2)", FAINT = "var(--muted)", FAINTER = "var(--faint)", DIS = "var(--faint)";
const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)", CHIP_SEL = "var(--ember-tint)", CHIP_SEL_B = "color-mix(in srgb, var(--ember) 35%, transparent)", CHIP_IDLE = "var(--surface-2)", CHIP_IDLE_B = "var(--line-2)";
const PROT = "#4a86e8", CARB = "#cf8a2e", FAT = "#d85c42", FIBR = "#3aa17e";

export type MealLite = { id: string; meal_type: string | null; snack_slot: string | null; name: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; quantity: number | null; unit: string | null; servings: number; food_id: string | null };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type Tmpl = { id: string; name: string; meal_type: string | null; kcal: number; protein: number; carbs: number; fats: number; fiber: number; default_unit: string | null; default_qty: number; times_logged: number; pinned: boolean; auto: boolean; food_id: string | null };
type Hist = { id: string; meal_type: string | null; name: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; date: string; food_id: string | null; unit: string | null; quantity: number | null };
type Pantry = { id?: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Draft = { name: string; kcal: string; protein: string; carbs: string; fats: string; fiber: string; food_id: string | null; micros: Record<string, number> };
type PerUnit = { kcal: number; protein: number; carbs: number; fats: number; fiber: number };
type EstItem = { name: string; qty: number; unit: string; grams: number; kcal: number; protein: number; carbs: number; fats: number; fiber: number; per_unit: PerUnit; food_id: string | null; pantry_used: string | null };
type EstResp = { items?: EstItem[]; totals?: Record<string, number>; confidence?: string; pantry_used?: string[]; note?: string };

const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const SNACKS = ["pre_workout", "mid_morning", "mid_evening", "post_dinner"];
const UNITS = ["roti", "piece", "katori", "bowl", "plate", "glass", "slice", "cup", "scoop", "g", "ml"];
const EMPTY: Draft = { name: "", kcal: "", protein: "", carbs: "", fats: "", fiber: "", food_id: null, micros: {} };

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
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
const stepBtn: CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid " + CB, background: CHIP_IDLE, color: BODY, fontSize: 18, lineHeight: 1, cursor: "pointer" };

function NumIn({ v, on, color }: { v: string; on: (s: string) => void; color?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: "9px 8px", borderRadius: 10, border: "1px solid " + (color ? CHIP_SEL_B : IB), background: "var(--surface-2)", color: BODY, fontSize: 13, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />;
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
// typeable qty + steppers (E)
function QtyCtl({ qty, onQty, step = 1, unit }: { qty: number; onQty: (n: number) => void; step?: number; unit?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => onQty(Math.max(0, r1(qty - step)))} style={stepBtn}>−</button>
      <input value={String(qty)} onChange={(e) => onQty(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0))} inputMode="decimal" style={{ width: 52, textAlign: "center", padding: "7px 4px", borderRadius: 9, border: "1px solid " + IB, background: "var(--surface-2)", color: H, fontSize: 14, fontWeight: 800, outline: "none", fontVariantNumeric: "tabular-nums" }} />
      <button onClick={() => onQty(r1(qty + step))} style={stepBtn}>+</button>
      {unit ? <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 2 }}>{unit}</span> : null}
    </div>
  );
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

  const [text, setText] = useState(""); const [estNote, setEstNote] = useState<string | null>(null); const [photo, setPhoto] = useState<string | null>(null); const [listening, setListening] = useState(false);
  const [camOn, setCamOn] = useState(false); const videoRef = useRef<HTMLVideoElement | null>(null); const streamRef = useRef<MediaStream | null>(null);
  const [aiMode, setAiMode] = useState(false); const [aiQty, setAiQty] = useState(1); const [aiUnit, setAiUnit] = useState("serving");
  const [tmpls, setTmpls] = useState<Tmpl[] | null>(null); const [hist, setHist] = useState<Hist[] | null>(null);
  const [servings, setServings] = useState(editMeal?.servings || 1);
  const [editName, setEditName] = useState(editMeal?.name || "");

  // itemized review (Describe + Photo) + per-entry pantry override
  const [items, setItems] = useState<EstItem[]>([]);
  const [conf, setConf] = useState<string | null>(null);
  const [pantryUsed, setPantryUsed] = useState<string[]>([]);
  const [usePantry, setUsePantry] = useState(true);
  const [addName, setAddName] = useState(""); const [addQty, setAddQty] = useState(1); const [addUnit, setAddUnit] = useState("katori"); const [addBusy, setAddBusy] = useState(false); const [addOpen, setAddOpen] = useState(false);

  const setD = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => { nutriPantry<{ pantry: Pantry[] }>().then((r) => setPantry(r.pantry || [])).catch(() => {}); }, []);
  useEffect(() => { nutriProfile<{ profile: { refer_pantry_default?: boolean } }>().then((r) => setUsePantry(r.profile?.refer_pantry_default !== false)).catch(() => {}); }, []);
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
  useEffect(() => { if (camOn && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {}); } }, [camOn]);
  useEffect(() => { if (view !== "photo" && streamRef.current) stopCam(); }, [view]);
  useEffect(() => () => { const s = streamRef.current; if (s) s.getTracks().forEach((t) => t.stop()); }, []);

  const pantryFor = (cat: string | null) => (cat ? pantry.find((p) => p.category === cat) || null : null);

  function pickFood(f: Food) { setPicked(f); setQty(1); const def = f.basis === "per_100g" ? (Object.keys(f.unit_grams)[0] || "g") : unitOptions(f)[0]; setUnit(def); }
  function resetManual() { setPicked(null); setDraft(EMPTY); setQ(""); }
  function stopCam() { const s = streamRef.current; if (s) { s.getTracks().forEach((t) => t.stop()); streamRef.current = null; } setCamOn(false); }
  async function startCam() {
    setErr(null);
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); streamRef.current = s; setCamOn(true); }
    catch { setErr("Camera unavailable here — use the Upload option instead."); }
  }
  function capturePhoto() {
    const v = videoRef.current; if (!v) return;
    const max = 1024; let w = v.videoWidth || 640, h = v.videoHeight || 480;
    if (w > max || h > max) { const sc = max / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
    const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h); const data = c.toDataURL("image/jpeg", 0.8);
    stopCam(); setPhoto(data); runEstimate("photo", { image_b64: data.split(",")[1] || "", mime: "image/jpeg" });
  }
  async function aiEstimateFood() {
    const nm = q.trim(); if (!nm) return; setBusy(true); setErr(null);
    try {
      const r = await nutriPost<{ food: Food | null }>("ai_food", { name: nm, hint_qty: aiQty, hint_unit: aiUnit, use_pantry: usePantry });
      if (r && r.food) { const f = r.food; setFoods([f]); setPicked(f); const opts = unitOptions(f); setUnit(opts.indexOf(aiUnit) >= 0 ? aiUnit : (f.basis === "per_100g" ? (Object.keys(f.unit_grams)[0] || "g") : opts[0])); setQty(aiQty); setAiMode(false); }
      else setErr("Couldn't estimate that food — try typing the macros."); }
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

  // ---- itemized estimate (Describe + Photo) ----
  function normItem(it: any): EstItem {
    const qn = num(it.qty) || 1;
    const pu = it.per_unit || { kcal: num(it.kcal) / qn, protein: num(it.protein) / qn, carbs: num(it.carbs) / qn, fats: num(it.fats) / qn, fiber: num(it.fiber) / qn };
    return { name: String(it.name || ""), qty: qn, unit: String(it.unit || "serving"), grams: Math.round(num(it.grams)), kcal: Math.round(num(it.kcal)), protein: r1(num(it.protein)), carbs: r1(num(it.carbs)), fats: r1(num(it.fats)), fiber: r1(num(it.fiber)), per_unit: { kcal: num(pu.kcal), protein: num(pu.protein), carbs: num(pu.carbs), fats: num(pu.fats), fiber: num(pu.fiber) }, food_id: it.food_id || null, pantry_used: it.pantry_used || null };
  }
  async function runEstimate(mode: string, image?: { image_b64: string; mime: string }) {
    setBusy(true); setErr(null); setItems([]); setAddOpen(false);
    try {
      const body = mode === "photo" ? { mode, use_pantry: usePantry, ...(image || {}) } : { mode, use_pantry: usePantry, text };
      const r = await nutriPost<EstResp>("estimate", body);
      setEstNote(r.note || null); setConf(r.confidence || null); setPantryUsed(r.pantry_used || []);
      const its = (r.items || []).map(normItem);
      setItems(its);
      if (!its.length) setErr(mode === "photo" ? "Couldn't read the photo — try Upload, or add items below." : "Couldn't parse that — rephrase, or add items below.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function setItemQty(i: number, qn: number) {
    setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, qty: qn, kcal: Math.round(it.per_unit.kcal * qn), protein: r1(it.per_unit.protein * qn), carbs: r1(it.per_unit.carbs * qn), fats: r1(it.per_unit.fats * qn), fiber: r1(it.per_unit.fiber * qn), grams: it.grams && it.qty ? Math.round((it.grams / it.qty) * qn) : it.grams } : it));
  }
  function delItem(i: number) { setItems((arr) => arr.filter((_, idx) => idx !== i)); }
  async function addItemAI() {
    const nm = addName.trim(); if (!nm) return; setAddBusy(true); setErr(null);
    try {
      const r = await nutriPost<{ food: Food | null }>("ai_food", { name: nm, hint_qty: addQty, hint_unit: addUnit, use_pantry: usePantry });
      const f = r && r.food;
      if (!f) { setErr("Couldn't estimate that item — try another name."); setAddBusy(false); return; }
      const g = gramsOf(f, addUnit, addQty); const m = macrosFrom(f, g, addQty);
      const dv = addQty || 1;
      const per: PerUnit = { kcal: m.kcal / dv, protein: m.protein / dv, carbs: m.carbs / dv, fats: m.fats / dv, fiber: m.fiber / dv };
      setItems((arr) => [...arr, { name: f.name, qty: addQty, unit: addUnit, grams: f.basis === "per_100g" ? Math.round(g) : 0, kcal: Math.round(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fats: r1(m.fats), fiber: r1(m.fiber), per_unit: per, food_id: f.id, pantry_used: null }]);
      setAddName(""); setAddQty(1); setAddOpen(false);
    } catch (e) { setErr((e as Error).message); } finally { setAddBusy(false); }
  }
  async function logAll() {
    if (!items.length) return; setBusy(true); setErr(null);
    try {
      const day = await nutriPost("log_batch", { date, meal_type: mealType, snack_slot: mealType === "snack" ? snackSlot : null, source: "ai", confidence: conf, items });
      onSaved(day); onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const itemTotals = items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, protein: a.protein + it.protein, carbs: a.carbs + it.carbs, fats: a.fats + it.fats, fiber: a.fiber + it.fiber }), { kcal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });

  function loadTemplates() { setTmpls(null); nutriTemplates<{ templates: Tmpl[] }>().then((r) => setTmpls(r.templates || [])).catch(() => setTmpls([])); }
  function loadHistory() { setHist(null); nutriHistory<{ history: Hist[] }>(40).then((r) => setHist(r.history || [])).catch(() => setHist([])); }
  async function delTemplate(t: Tmpl) { try { const r = await nutriPost<{ templates: Tmpl[] }>("template_delete", { id: t.id }); setTmpls(r.templates || []); } catch { /* ignore */ } }

  const base = editMeal ? { kcal: editMeal.kcal / (editMeal.servings || 1), protein: editMeal.protein / (editMeal.servings || 1), carbs: editMeal.carbs / (editMeal.servings || 1), fats: editMeal.fats / (editMeal.servings || 1), fiber: editMeal.fiber / (editMeal.servings || 1) } : null;
  function editMacros() { if (!base) return { kcal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }; return { kcal: Math.round(base.kcal * servings), protein: r1(base.protein * servings), carbs: r1(base.carbs * servings), fats: r1(base.fats * servings), fiber: r1(base.fiber * servings) }; }
  async function editSave() { if (!editMeal) return; setBusy(true); setErr(null); const m = editMacros(); try { const day = await nutriPost("update", { id: editMeal.id, name: editName, meal_type: mealType, snack_slot: mealType === "snack" ? snackSlot : null, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats, fiber: m.fiber, servings }); onSaved(day); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); } }
  async function editDelete() { if (!editMeal) return; setBusy(true); setErr(null); try { const day = await nutriPost("delete", { id: editMeal.id, date }); onSaved(day); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); } }

  const title = view === "edit" ? "Edit entry" : view === "manual" ? "Manual entry" : view === "describe" ? "Describe meal" : view === "photo" ? "Snap a photo" : view === "templates" ? "Quick-add" : view === "history" ? "Recent foods" : "Add food";
  function dictate() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported here. Please type instead."); return; }
    try {
      const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = false; rec.continuous = false; setListening(true);
      rec.onresult = (e: any) => { const txt = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); setText((t) => (t ? t + " " : "") + txt); };
      rec.onerror = () => setListening(false); rec.onend = () => setListening(false); rec.start();
    } catch { setListening(false); }
  }
  const showBack = view !== "method" && view !== "edit";

  // shared per-entry pantry toggle (A) — local overrides the global default
  function renderPantryToggle() {
    return (
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: "12px 14px", marginTop: 12 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={usePantry ? ACCENT : FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M4 9h16l-1.4 10.3a2 2 0 0 1-2 1.7H7.4a2 2 0 0 1-2-1.7zM8 9V6a4 4 0 0 1 8 0v3" /></svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>Use my pantry</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>Compose from your items</div>
        </div>
        <button onClick={() => setUsePantry((x) => !x)} aria-label="Toggle pantry" style={{ width: 44, height: 26, borderRadius: 999, border: "none", background: usePantry ? ACCENT : CHIP_IDLE_B, position: "relative", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: usePantry ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
        </button>
      </div>
    );
  }

  // shared itemized review (D)
  function renderReview(kind: string) {
    if (busy && !items.length) return <div style={{ ...sub, marginTop: 12 }}>{kind === "photo" ? "Analysing photo…" : "Estimating…"}</div>;
    if (!items.length) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={tiny}>Review items{conf ? " · " + conf + " confidence" : ""}</span>
          <span style={{ fontSize: 11, color: FAINT }}>edit qty · remove · add</span>
        </div>
        {pantryUsed.length > 0 && (
          <div style={{ fontSize: 11, color: FIBR, marginBottom: 8 }}><Icon name="basket" size={10} /> From your pantry: {pantryUsed.join(", ")}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: H, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cap(it.name)}</div>
                  {it.pantry_used && <div style={{ fontSize: 10.5, color: FIBR, marginTop: 2 }}><Icon name="basket" size={10} /> {it.pantry_used}</div>}
                </div>
                <button onClick={() => delItem(i)} aria-label="Remove" style={{ width: 24, height: 24, borderRadius: 7, border: "1px solid " + CB, background: CHIP_IDLE, color: FAINTER, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8 }}>
                <QtyCtl qty={it.qty} onQty={(n) => setItemQty(i, n)} step={it.unit === "g" || it.unit === "ml" ? 10 : 0.5} unit={it.unit} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: H, fontVariantNumeric: "tabular-nums" }}>{it.kcal}<span style={{ fontSize: 10, color: FAINTER, fontWeight: 600 }}> kcal</span></span>
              </div>
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>P {it.protein} · C {it.carbs} · F {it.fats}{it.fiber ? " · Fb " + it.fiber : ""}{it.grams ? " · ~" + it.grams + "g" : ""}</div>
            </div>
          ))}
        </div>

        {addOpen ? (
          <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: 12, marginTop: 8 }}>
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Add a missed item (e.g. curd, salad)…" style={{ width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 10, border: "1px solid " + IB, background: "var(--surface-2)", color: BODY, fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <QtyCtl qty={addQty} onQty={setAddQty} step={addUnit === "g" || addUnit === "ml" ? 10 : 0.5} />
              <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
                {UNITS.map((u) => <button key={u} onClick={() => setAddUnit(u)} style={{ ...chip(addUnit === u), padding: "6px 9px", fontSize: 11 }}>{u}</button>)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => { setAddOpen(false); setAddName(""); }} style={{ flex: 1, padding: 10, borderRadius: 11, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={addItemAI} disabled={addBusy || !addName.trim()} style={{ flex: 2, padding: 10, borderRadius: 11, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: addBusy || !addName.trim() ? 0.6 : 1 }}>{addBusy ? "Adding…" : <><Icon name="sparkle" size={11} /> Add item</>}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)} style={{ width: "100%", marginTop: 8, padding: 11, borderRadius: 12, border: "1px dashed " + IB, background: "transparent", color: ACCENT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>+ Add an item</button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "10px 12px", background: INSET, border: "1px solid " + CB, borderRadius: 12 }}>
          <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>Total · {items.length} {items.length === 1 ? "item" : "items"}</span>
          <span style={{ fontSize: 12.5, color: H, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{Math.round(itemTotals.kcal)} kcal · P {r1(itemTotals.protein)}</span>
        </div>
        <button onClick={logAll} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Logging…" : "Log " + items.length + " to " + cap(mealType)}</button>
        <div style={{ ...sub, marginTop: 8, textAlign: "center" }}>Each item is logged as its own entry. New foods get saved for next time.</div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "20px 20px 0 0", padding: "14px 16px max(16px,env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showBack && <button onClick={() => { setView("method"); setItems([]); setPhoto(null); setAddOpen(false); }} aria-label="Back" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 16, cursor: "pointer" }}>‹</button>}
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

        {err && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 12 }}>{err}</div>}

        {/* METHOD TILES */}
        {view === "method" && (
          <>
            <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", gap: 8, background: CARD, border: "1px solid " + CB, borderRadius: 18, padding: "12px 12px 12px 15px" }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Describe what you ate..." style={{ flex: 1, boxSizing: "border-box", background: "transparent", border: "none", color: BODY, fontSize: 14, outline: "none", resize: "none", lineHeight: 1.4, padding: "3px 0", fontFamily: "inherit" }} />
              <button onClick={dictate} aria-label="Dictate" style={{ width: 38, height: 38, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + (listening ? "color-mix(in srgb, var(--danger) 45%, transparent)" : CB), background: listening ? "color-mix(in srgb, var(--danger) 12%, transparent)" : CHIP_IDLE, color: listening ? "var(--danger)" : MUTED, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg></button>
              <button onClick={() => { if (text.trim()) { setView("describe"); setItems([]); setEstNote(null); runEstimate("describe"); } }} disabled={!text.trim()} aria-label="Estimate" style={{ width: 38, height: 38, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: ACCENT, color: "#fff", cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.45 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              {([["Photo", "photo", "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"], ["Templates", "templates", "M13 2L4 14h6l-1 8 9-12h-6l1-8z"], ["Search", "manual", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"], ["Recent", "history", "M21 12a9 9 0 1 1-3-6.7M21 3v6h-6M12 8v4l3 2"]] as [string, string, string][]).map(([lbl, v, d]) => (
                <button key={v} onClick={() => { setView(v); setItems([]); setEstNote(null); if (v === "templates") loadTemplates(); if (v === "history") loadHistory(); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: CARD, border: "1px solid " + CB, borderRadius: 16, padding: "15px 4px", cursor: "pointer" }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} />{v === "photo" ? <circle cx="12" cy="13" r="3.2" /> : null}</svg>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: H }}>{lbl}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* MANUAL */}
        {view === "manual" && (
          <div style={{ marginTop: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods (e.g. paneer, dal, oats)…" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1px solid " + IB, background: "var(--surface-2)", color: BODY, fontSize: 13.5, outline: "none" }} />
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
                    {!q.trim() && <div style={sub}>Search, or just type the macros below to log it.</div>}
                    {q.trim() && !aiMode && (
                      <>
                        <button onClick={() => setAiMode(true)} style={{ width: "100%", padding: 11, borderRadius: 11, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{"Ask AI to estimate “" + q.trim() + "”"}</button>
                        <div style={{ ...sub, marginTop: 8 }}>Not in the library yet — AI can estimate it (saved for next time), or type the macros below.</div>
                      </>
                    )}
                    {q.trim() && aiMode && (
                      <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: 12 }}>
                        <div style={{ ...tiny, marginBottom: 8 }}>How much do you usually have?</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <QtyCtl qty={aiQty} onQty={setAiQty} step={0.5} />
                          <div style={{ display: "flex", gap: 5, overflowX: "auto", marginLeft: 4 }}>
                            {["serving", "piece", "katori", "bowl", "plate", "glass", "g"].map((u) => <button key={u} onClick={() => setAiUnit(u)} style={{ ...chip(aiUnit === u), padding: "6px 10px", fontSize: 11 }}>{u}</button>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          <button onClick={() => setAiMode(false)} style={{ flex: 1, padding: 10, borderRadius: 11, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                          <button onClick={aiEstimateFood} disabled={busy} style={{ flex: 2, padding: 10, borderRadius: 11, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Estimating…" : <><Icon name="sparkle" size={11} /> Estimate with AI</>}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {picked && (
              <div style={{ marginTop: 10, background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{picked.name}</span>
                  <button onClick={resetManual} style={{ fontSize: 11, color: ACCENT, background: "none", border: "none", cursor: "pointer" }}>change</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <QtyCtl qty={qty} onQty={setQty} step={picked.basis === "per_100g" && unit === "g" ? 10 : 0.5} />
                  <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
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
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. 3 roti, 1 katori dal, paneer bhurji, 1 katori curd" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: "1px solid " + IB, background: "var(--surface-2)", color: BODY, fontSize: 13.5, outline: "none", resize: "vertical" }} />
            {renderPantryToggle()}
            <button onClick={() => runEstimate("describe")} disabled={busy || !text.trim()} style={{ width: "100%", marginTop: 8, padding: 11, borderRadius: 12, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy || !text.trim() ? 0.6 : 1 }}>{busy && !items.length ? "Estimating…" : items.length ? "↻ Re-estimate" : "Estimate items"}</button>
            {renderReview("describe")}
          </div>
        )}

        {/* PHOTO */}
        {view === "photo" && (
          <div style={{ marginTop: 12 }}>
            {camOn ? (
              <div style={{ borderRadius: 14, overflow: "hidden", background: "#000" }}>
                <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }} />
                <div style={{ display: "flex", gap: 8, padding: 10 }}>
                  <button onClick={stopCam} style={{ flex: 1, padding: 11, borderRadius: 11, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                  <button onClick={capturePhoto} style={{ flex: 2, padding: 11, borderRadius: 11, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}><Icon name="camera" size={12} /> Capture</button>
                </div>
              </div>
            ) : (
              <>
                {photo && <img src={photo} alt="meal" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "cover", borderRadius: 14, border: "1px solid " + CB }} />}
                {renderPantryToggle()}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={startCam} style={{ flex: 1, border: "none", borderRadius: 16, padding: "18px 8px", cursor: "pointer", background: ACCENT, color: "#fff", fontSize: 13.5, fontWeight: 800, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="3.2" /></svg>Use camera</button>
                  <label style={{ flex: 1, textAlign: "center", border: "1px solid " + CB, borderRadius: 16, padding: "18px 8px", cursor: "pointer", background: CARD, color: BODY, fontSize: 13.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M12 3v13M7 8l5-5 5 5" /></svg>Upload photo
                    <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) { setPhoto(URL.createObjectURL(f)); resizeToB64(f).then((img) => runEstimate("photo", img)).catch(() => runEstimate("photo")); } }} style={{ display: "none" }} />
                  </label>
                </div>
              </>
            )}
            {renderReview("photo")}
          </div>
        )}

        {/* TEMPLATES */}
        {view === "templates" && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            {tmpls === null && <Loader compact />}
            {tmpls && tmpls.length === 0 && <div style={{ ...sub, padding: 10 }}>Log a food a few times and it shows up here as a one-tap quick-add.</div>}
            {tmpls && tmpls.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "9px 11px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: BODY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name} {t.pinned ? <Icon name="pin" size={10} /> : null}</div>
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
            {hist === null && <Loader compact />}
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
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "11px 12px", borderRadius: 11, border: "1px solid " + IB, background: "var(--surface-2)", color: BODY, fontSize: 13.5, outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "10px 12px" }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>Servings</span>
              <QtyCtl qty={servings} onQty={setServings} step={0.25} />
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
            <button onClick={editDelete} disabled={busy} style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 14, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete entry</button>
          </div>
        )}
      </div>
    </div>
  );
}
