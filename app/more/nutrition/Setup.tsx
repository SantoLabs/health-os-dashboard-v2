"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nutriProfile, nutriFoods, nutriPost } from "../../lib/api";

const CARD = "var(--surface)", INSET = "var(--bg)", CB = "var(--line)", IB = "var(--line-2)";
const H = "var(--text)", BODY = "var(--text)", MUTED = "var(--text-2)", FAINT = "var(--muted)", FAINTER = "var(--faint)";
const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)", CHIP_SEL = "var(--ember-tint)", CHIP_SEL_B = "color-mix(in srgb, var(--ember) 35%, transparent)", CHIP_IDLE = "var(--surface-2)", CHIP_IDLE_B = "var(--line-2)";
const PROT = "#4a86e8", CARB = "#cf8a2e", FAT = "#d85c42", FIBR = "#3aa17e", FIBR2 = "#3aa17e";
const LIKE = "var(--success)", LIKE_B = "color-mix(in srgb, var(--success) 35%, transparent)", DISLIKE = "var(--danger)", DISLIKE_B = "color-mix(in srgb, var(--danger) 35%, transparent)";

type DaySet = { calories: number; protein: number; carbs: number; fats: number; fiber: number };
type Targets = DaySet & { micros_rda: Record<string, number>; rest?: DaySet; has_rest?: boolean; inputs?: Record<string, number> | null };
type Profile = { cuisine: string[]; eating_pattern: string; restrictions: string; refer_pantry_default: boolean; typical_meals: string; biggest_challenge: string; starter_menu: unknown; likes: string; dislikes: string; narrative: string; height_cm: number | null; age: number | null; sex: string; activity_level: string };
type PantryItem = { id: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type ProfileResp = { profile: Profile; targets: Targets; pantry: PantryItem[] };
type Sug = { rationale: string; bmr?: number; tdee?: number; bmi?: number; af?: number; ai?: boolean };

const CUISINES = ["North Indian", "South Indian", "Gujarati", "Punjabi", "Bengali", "Maharashtrian", "Continental", "Chinese", "Mediterranean", "Mexican"];
const PATTERNS = ["Vegetarian", "Eggetarian", "Non-veg", "Vegan", "Jain"];
const CATS = ["milk", "paneer", "curd", "whey", "atta", "oats", "oil", "ghee", "bread", "rice", "dal"];
const GOALS = ["cut", "recomp", "maintain", "gain"];

const numv = (s: string) => Number(s) || 0;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const tiny: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 10, border: "1px solid " + IB, background: "var(--surface-2)", color: BODY, fontSize: 13.5, outline: "none" };
function chip(active: boolean): CSSProperties { return { padding: "8px 12px", borderRadius: 11, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid " + (active ? CHIP_SEL_B : CHIP_IDLE_B), background: active ? CHIP_SEL : CHIP_IDLE, color: active ? ACCENT_LT : MUTED }; }
const primary: CSSProperties = { width: "100%", marginTop: 14, padding: 13, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" };
const softBtn: CSSProperties = { width: "100%", padding: 11, borderRadius: 12, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 13, fontWeight: 700, cursor: "pointer" };

function resizeToB64(file: File): Promise<{ image_b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height; const max = 1280;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); if (!ctx) { reject(new Error("no canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const data = c.toDataURL("image/jpeg", 0.85); URL.revokeObjectURL(url);
      resolve({ image_b64: data.split(",")[1] || "", mime: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

function NumIn({ v, on, color }: { v: string; on: (s: string) => void; color?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.-]/g, ""))} inputMode="decimal" placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: "9px 8px", borderRadius: 10, border: "1px solid " + (color ? CHIP_SEL_B : IB), background: "var(--surface-2)", color: BODY, fontSize: 13, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />;
}
function Field({ lbl, v, on, color }: { lbl: string; v: string; on: (s: string) => void; color?: string }) {
  return <div style={{ flex: 1 }}><div style={{ ...tiny, textAlign: "center", color: color || FAINT, marginBottom: 4 }}>{lbl}</div><NumIn v={v} on={on} color={color} /></div>;
}
function QField({ lbl, v, on }: { lbl: string; v: string; on: (s: string) => void }) {
  return <div style={{ flex: 1 }}><div style={{ ...tiny, marginBottom: 4 }}>{lbl}</div><NumIn v={v} on={on} /></div>;
}

export default function Setup({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<string>("targets");
  const [data, setData] = useState<ProfileResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // targets — training + rest sets
  const [calTr, setCalTr] = useState(""); const [proTr, setProTr] = useState(""); const [carTr, setCarTr] = useState(""); const [fatTr, setFatTr] = useState(""); const [fibTr, setFibTr] = useState("");
  const [calRt, setCalRt] = useState(""); const [proRt, setProRt] = useState(""); const [carRt, setCarRt] = useState(""); const [fatRt, setFatRt] = useState(""); const [fibRt, setFibRt] = useState("");
  const [hasRest, setHasRest] = useState(false);
  // quantifiers
  const [wt, setWt] = useState(""); const [bf, setBf] = useState(""); const [ht, setHt] = useState(""); const [age, setAge] = useState(""); const [sex, setSex] = useState("male");
  const [spw, setSpw] = useState(""); const [goal, setGoal] = useState("recomp"); const [rate, setRate] = useState(""); const [ppk, setPpk] = useState("");
  const [aiTune, setAiTune] = useState(false);
  const [sugBusy, setSugBusy] = useState(false); const [sug, setSug] = useState<Sug | null>(null);
  // prefs
  const [cuisine, setCuisine] = useState<string[]>([]); const [pattern, setPattern] = useState(""); const [referDefault, setReferDefault] = useState(true);
  const [typical, setTypical] = useState(""); const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<any>(null); const [genBusy, setGenBusy] = useState(false); const [genNote, setGenNote] = useState<string | null>(null);
  const [menuPick, setMenuPick] = useState<Record<string, number>>({}); const [picksBusy, setPicksBusy] = useState(false); const [picksNote, setPicksNote] = useState<string | null>(null);
  const [existingLikes, setExistingLikes] = useState(""); const [existingDislikes, setExistingDislikes] = useState("");
  // pantry
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [pAdding, setPAdding] = useState(false); const [pCat, setPCat] = useState(""); const [pQ, setPQ] = useState(""); const [pFoods, setPFoods] = useState<Food[]>([]); const [pPicked, setPPicked] = useState(false);
  const [pLabel, setPLabel] = useState(""); const [pKcal, setPKcal] = useState(""); const [pPro, setPPro] = useState(""); const [pCar, setPCar] = useState(""); const [pFat, setPFat] = useState(""); const [pFib, setPFib] = useState("");
  const [pBasis, setPBasis] = useState("per_100g"); const [pUnitGrams, setPUnitGrams] = useState<Record<string, number>>({}); const [pMicros, setPMicros] = useState<Record<string, number>>({});
  const [scanBusy, setScanBusy] = useState(false); const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null); const streamRef = useRef<MediaStream | null>(null);

  function hydrate(d: ProfileResp) {
    setData(d);
    const tg = d.targets; const rest = tg.rest || tg; const inpv = tg.inputs || {};
    setCalTr(String(tg.calories || "")); setProTr(String(tg.protein || "")); setCarTr(String(tg.carbs || "")); setFatTr(String(tg.fats || "")); setFibTr(String(tg.fiber || ""));
    setCalRt(String(rest.calories || "")); setProRt(String(rest.protein || "")); setCarRt(String(rest.carbs || "")); setFatRt(String(rest.fats || "")); setFibRt(String(rest.fiber || ""));
    setHasRest(!!tg.has_rest);
    if (inpv.weight_kg) setWt(String(inpv.weight_kg)); if (inpv.body_fat_pct != null) setBf(String(inpv.body_fat_pct));
    if (inpv.sessions_per_week != null) setSpw(String(inpv.sessions_per_week)); if (inpv.rate_kg_wk != null) setRate(String(inpv.rate_kg_wk)); if (inpv.protein_per_kg != null) setPpk(String(inpv.protein_per_kg));
    if (inpv.goal != null) setGoal(String(inpv.goal));
    if (d.profile.height_cm != null) setHt(String(d.profile.height_cm)); if (d.profile.age != null) setAge(String(d.profile.age)); if (d.profile.sex) setSex(d.profile.sex);
    setCuisine(d.profile.cuisine || []); setPattern(d.profile.eating_pattern || ""); setReferDefault(d.profile.refer_pantry_default !== false);
    setTypical(d.profile.typical_meals || ""); setExistingLikes(d.profile.likes || ""); setExistingDislikes(d.profile.dislikes || "");
    setPantry(d.pantry || []);
    setMenu(d.profile.starter_menu && (d.profile.starter_menu as any).breakfast ? d.profile.starter_menu : null);
    setMenuPick({});
  }
  useEffect(() => { nutriProfile<ProfileResp>().then(hydrate).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!pAdding) return;
    const t = setTimeout(() => { nutriFoods<{ foods: Food[] }>(pQ).then((r) => setPFoods(r.foods || [])).catch(() => {}); }, 220);
    return () => clearTimeout(t);
  }, [pQ, pAdding]);
  useEffect(() => { if (camOn && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {}); } }, [camOn]);
  useEffect(() => () => { const s = streamRef.current; if (s) s.getTracks().forEach((t) => t.stop()); }, []);

  async function suggestTargets() {
    setSugBusy(true); setErr(null); setSug(null);
    try {
      const body = { weight_kg: numv(wt) || null, body_fat_pct: bf !== "" ? numv(bf) : null, height_cm: numv(ht) || null, age: numv(age) || null, sex: sex || null, sessions_per_week: spw !== "" ? numv(spw) : null, goal, rate_kg_wk: rate !== "" ? numv(rate) : null, protein_per_kg: ppk !== "" ? numv(ppk) : null, ai: aiTune };
      const r = await nutriPost<any>("targets_suggest", body);
      if (r && r.needs) { setErr("Add " + (r.needs as string[]).join(", ") + " above for a personalised suggestion."); return; }
      if (r && r.training) {
        const T = r.training, R = r.rest || r.training; const inpv = r.inputs || {};
        setCalTr(String(T.calories)); setProTr(String(T.protein)); setCarTr(String(T.carbs)); setFatTr(String(T.fats)); setFibTr(String(T.fiber));
        setCalRt(String(R.calories)); setProRt(String(R.protein)); setCarRt(String(R.carbs)); setFatRt(String(R.fats)); setFibRt(String(R.fiber));
        setHasRest(true);
        setSug({ rationale: r.rationale || "", bmr: inpv.bmr, tdee: inpv.tdee, bmi: inpv.bmi, af: inpv.activity_factor, ai: !!r.ai });
        if (inpv.weight_kg && !wt) setWt(String(inpv.weight_kg));
        if (inpv.body_fat_pct != null && bf === "") setBf(String(inpv.body_fat_pct));
        if (inpv.sessions_per_week != null && spw === "") setSpw(String(inpv.sessions_per_week));
        if (inpv.rate_kg_wk != null && rate === "") setRate(String(inpv.rate_kg_wk));
        if (inpv.protein_per_kg != null && ppk === "") setPpk(String(inpv.protein_per_kg));
      } else setErr((r && r.note) || "Couldn't suggest right now.");
    } catch (e) { setErr((e as Error).message); } finally { setSugBusy(false); }
  }
  async function saveTargets() {
    setBusy(true); setErr(null);
    try {
      const inputs = { weight_kg: numv(wt) || null, body_fat_pct: bf !== "" ? numv(bf) : null, height_cm: numv(ht) || null, age: numv(age) || null, sex, sessions_per_week: spw !== "" ? numv(spw) : null, goal, rate_kg_wk: rate !== "" ? numv(rate) : null, protein_per_kg: ppk !== "" ? numv(ppk) : null };
      const d = await nutriPost<ProfileResp>("targets_save", {
        calories: numv(calTr), protein: numv(proTr), carbs: numv(carTr), fats: numv(fatTr), fiber: numv(fibTr),
        rest_calories: numv(calRt), rest_protein: numv(proRt), rest_carbs: numv(carRt), rest_fats: numv(fatRt), rest_fiber: numv(fibRt),
        inputs,
      });
      hydrate(d); if (onChanged) onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function savePrefs() {
    setBusy(true); setErr(null);
    try { const d = await nutriPost<ProfileResp>("profile_save", { cuisine, eating_pattern: pattern, refer_pantry_default: referDefault, typical_meals: typical }); hydrate(d); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  function toggleCuisine(c: string) { setCuisine((xs) => (xs.indexOf(c) >= 0 ? xs.filter((x) => x !== c) : [...xs, c])); }
  function startDictation() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported in this browser — please type instead."); return; }
    try {
      const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = false; rec.continuous = false; setListening(true);
      rec.onresult = (e: any) => { const txt = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); setTypical((t) => (t ? t + " " : "") + txt); };
      rec.onerror = () => setListening(false); rec.onend = () => setListening(false); rec.start();
    } catch { setListening(false); }
  }
  async function generateMenu() {
    setGenBusy(true); setGenNote(null); setPicksNote(null);
    try { const r = await nutriPost<{ menu: any; note?: string }>("menu_generate", { cuisine, eating_pattern: pattern, typical_meals: typical }); if (r && r.menu) { setMenu(r.menu); setMenuPick({}); } else setGenNote((r && r.note) || "Couldn't generate right now."); }
    catch (e) { setGenNote((e as Error).message); } finally { setGenBusy(false); }
  }
  function cyclePick(item: string) {
    setMenuPick((m) => { const cur = m[item] || 0; const nx = cur === 0 ? 1 : cur === 1 ? -1 : 0; const c = { ...m }; if (nx === 0) delete c[item]; else c[item] = nx; return c; });
  }
  function mergeCsv(existing: string, add: string[]): string {
    const seen = new Set<string>(); const out: string[] = [];
    for (const part of [...String(existing || "").split(","), ...add]) { const t = part.trim(); if (!t) continue; const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(t); }
    return out.join(", ");
  }
  async function saveMenuPicks() {
    const likes = Object.keys(menuPick).filter((k) => menuPick[k] === 1);
    const dislikes = Object.keys(menuPick).filter((k) => menuPick[k] === -1);
    if (!likes.length && !dislikes.length) { setPicksNote("Tap a dish once for 👍, twice for 👎."); return; }
    setPicksBusy(true); setErr(null); setPicksNote(null);
    try {
      const d = await nutriPost<ProfileResp>("profile_save", { likes: mergeCsv(existingLikes, likes), dislikes: mergeCsv(existingDislikes, dislikes) });
      hydrate(d); setPicksNote("Saved — future menus will lean into your 👍 and avoid your 👎.");
    } catch (e) { setErr((e as Error).message); } finally { setPicksBusy(false); }
  }

  function applyFood(f: Food) { setPPicked(true); setPLabel(f.brand ? f.brand + " " + f.name : f.name); setPKcal(String(f.kcal)); setPPro(String(f.protein)); setPCar(String(f.carbs)); setPFat(String(f.fats)); setPFib(String(f.fiber)); setPBasis(f.basis); setPUnitGrams(f.unit_grams || {}); setPMicros(f.micros || {}); if (f.category && !pCat) setPCat(f.category); }
  function resetPantryAdd() { setPCat(""); setPQ(""); setPFoods([]); setPPicked(false); setPLabel(""); setPKcal(""); setPPro(""); setPCar(""); setPFat(""); setPFib(""); setPBasis("per_100g"); setPUnitGrams({}); setPMicros({}); stopCam(); }
  async function aiPantryFood() {
    const nm = pQ.trim(); if (!nm) return; setBusy(true); setErr(null);
    try { const r = await nutriPost<{ food: Food | null }>("ai_food", { name: nm }); if (r && r.food) applyFood(r.food); else setErr("Couldn't estimate that product — type the values or scan the label."); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function runLabelScan(image_b64: string, mime: string) {
    setScanBusy(true); setErr(null);
    try {
      const r = await nutriPost<any>("label_scan", { image_b64, mime });
      if (r && r.ok && r.label) { const L = r.label; setPPicked(true); if (L.name && !pLabel) setPLabel(L.name); setPKcal(String(L.kcal)); setPPro(String(L.protein)); setPCar(String(L.carbs)); setPFat(String(L.fats)); setPFib(String(L.fiber)); setPBasis(L.basis || "per_100g"); setPUnitGrams(L.unit_grams || {}); }
      else setErr((r && r.note) || "Couldn't read the label — try a clearer photo or type the values.");
    } catch (e) { setErr((e as Error).message); } finally { setScanBusy(false); }
  }
  function scanUpload(file: File) { resizeToB64(file).then((img) => runLabelScan(img.image_b64, img.mime)).catch(() => setErr("Couldn't read that image.")); }
  function stopCam() { const s = streamRef.current; if (s) { s.getTracks().forEach((t) => t.stop()); streamRef.current = null; } setCamOn(false); }
  async function startCam() {
    setErr(null);
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); streamRef.current = s; setCamOn(true); }
    catch { setErr("Camera unavailable here — use the Upload option instead."); }
  }
  function captureLabel() {
    const v = videoRef.current; if (!v) return;
    const max = 1280; let w = v.videoWidth || 720, h = v.videoHeight || 540;
    if (w > max || h > max) { const sc = max / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
    const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h); const dataUrl = c.toDataURL("image/jpeg", 0.85);
    stopCam(); runLabelScan(dataUrl.split(",")[1] || "", "image/jpeg");
  }
  async function savePantryItem() {
    if (!pCat.trim()) { setErr("Pick or type a category"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await nutriPost<{ pantry: PantryItem[] }>("pantry_save", { category: pCat.trim().toLowerCase(), label: pLabel || pCat, basis: pBasis, kcal: numv(pKcal), protein: numv(pPro), carbs: numv(pCar), fats: numv(pFat), fiber: numv(pFib), unit_grams: pUnitGrams, micros: pMicros });
      setPantry(r.pantry || []); resetPantryAdd(); setPAdding(false);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function delPantry(it: PantryItem) { try { const r = await nutriPost<{ pantry: PantryItem[] }>("pantry_delete", { id: it.id }); setPantry(r.pantry || []); } catch { /* ignore */ } }

  // macro row for a target set (training/rest), highlighted when active
  function macroRow(kind: string) {
    const isTr = kind === "training";
    const fields: [string, string, (s: string) => void, string | undefined][] = isTr
      ? [["Cal", calTr, setCalTr, undefined], ["Prot", proTr, setProTr, PROT], ["Carb", carTr, setCarTr, CARB], ["Fat", fatTr, setFatTr, FAT], ["Fibr", fibTr, setFibTr, FIBR]]
      : [["Cal", calRt, setCalRt, undefined], ["Prot", proRt, setProRt, PROT], ["Carb", carRt, setCarRt, CARB], ["Fat", fatRt, setFatRt, FAT], ["Fibr", fibRt, setFibRt, FIBR]];
    return (
      <div style={{ marginTop: 10, padding: 11, borderRadius: 12, background: isTr ? CHIP_SEL : CARD, border: "1px solid " + (isTr ? CHIP_SEL_B : CB) }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: isTr ? ACCENT_LT : MUTED, marginBottom: 8 }}>{isTr ? "🏋 Training day" : "🛌 Rest day"}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {fields.map(([lbl, v, on, col]) => <Field key={lbl} lbl={lbl} v={v} on={on} color={col} />)}
        </div>
      </div>
    );
  }

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

        {err && <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 12 }}>{err}</div>}
        {!data && !err && <div style={{ color: FAINT, fontSize: 12.5, textAlign: "center", padding: 24 }}>Loading…</div>}

        {data && tab === "targets" && (
          <div>
            <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 13, padding: 12 }}>
              <div style={{ ...tiny, marginBottom: 8 }}>✨ Calculator — your numbers</div>
              <div style={{ display: "flex", gap: 6 }}>
                <QField lbl="Weight kg" v={wt} on={setWt} />
                <QField lbl="Body-fat %" v={bf} on={setBf} />
                <QField lbl="Sessions/wk" v={spw} on={setSpw} />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <QField lbl="Height cm" v={ht} on={setHt} />
                <QField lbl="Age" v={age} on={setAge} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...tiny, marginBottom: 4 }}>Sex</div>
                  <div style={{ display: "flex", gap: 5 }}>{["male", "female"].map((s) => <button key={s} onClick={() => setSex(s)} style={{ ...chip(sex === s), flex: 1, padding: "8px 0", textAlign: "center", fontSize: 11 }}>{cap(s)}</button>)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <QField lbl="Rate kg/wk (− = loss)" v={rate} on={setRate} />
                <QField lbl="Protein g/kg" v={ppk} on={setPpk} />
              </div>
              <div style={{ ...tiny, margin: "10px 0 4px" }}>Goal</div>
              <div style={{ display: "flex", gap: 5 }}>{GOALS.map((g) => <button key={g} onClick={() => setGoal(g)} style={{ ...chip(goal === g), flex: 1, padding: "8px 0", textAlign: "center", fontSize: 11 }}>{cap(g)}</button>)}</div>
              <button onClick={() => setAiTune((x) => !x)} style={{ width: "100%", marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: INSET, border: "1px solid " + CB, borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
                <span style={{ fontSize: 11.5, color: MUTED }}>✨ AI fine-tune <span style={{ color: FAINTER }}>· nudge ±12% for training load</span></span>
                <span style={{ fontSize: 11, fontWeight: 800, color: aiTune ? FIBR2 : FAINTER }}>{aiTune ? "ON" : "OFF"}</span>
              </button>
              <button onClick={suggestTargets} disabled={sugBusy} style={{ ...softBtn, marginTop: 10, opacity: sugBusy ? 0.6 : 1 }}>{sugBusy ? "Calculating…" : "Calculate targets"}</button>
              {sug && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: INSET, border: "1px solid " + CB }}>
                  <div style={{ fontSize: 11.5, color: BODY, lineHeight: 1.45 }}>{sug.rationale}</div>
                  <div style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>BMR ~{sug.bmr} · TDEE ~{sug.tdee} kcal{sug.bmi ? " · BMI " + sug.bmi : ""}{sug.af ? " · ×" + sug.af : ""}{sug.ai ? " · AI-tuned" : ""} — edit any field below.</div>
                </div>
              )}
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>Blanks fall back to your latest weight, DEXA body-fat &amp; training load. A starting point, not medical advice.</div>
            </div>

            <div style={{ ...tiny, margin: "14px 0 0" }}>Daily targets — protein held constant; carbs cycle by day</div>
            {macroRow("training")}
            {macroRow("rest")}
            <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>The day view highlights whichever set applies, based on your Schedule.</div>
            <button onClick={saveTargets} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save both targets"}</button>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 6px" }}>
              <div style={tiny}>What you typically eat · likes &amp; dislikes</div>
              <button onClick={startDictation} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9, border: "1px solid " + (listening ? "color-mix(in srgb, var(--danger) 40%, transparent)" : CHIP_IDLE_B), background: listening ? "color-mix(in srgb, var(--danger) 10%, transparent)" : CHIP_IDLE, color: listening ? "var(--danger)" : ACCENT_LT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{listening ? "● Listening…" : "🎤 Speak"}</button>
            </div>
            <textarea value={typical} onChange={(e) => setTypical(e.target.value)} rows={3} placeholder="e.g. I usually have idli or oats for breakfast, dal-roti-sabzi lunches, paneer often. Love filter coffee. Dislike mushrooms; no eggs." style={{ ...inp, resize: "vertical", lineHeight: 1.45 }} />
            {(existingLikes || existingDislikes) && (
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 8, lineHeight: 1.5 }}>{existingLikes ? <span>👍 {existingLikes}</span> : null}{existingLikes && existingDislikes ? <br /> : null}{existingDislikes ? <span>👎 {existingDislikes}</span> : null}</div>
            )}
            <button onClick={() => setReferDefault((x) => !x)} style={{ width: "100%", marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, color: BODY, textAlign: "left" }}>Use my Pantry brands by default<br /><span style={{ fontSize: 10.5, color: FAINT }}>The global default; each add screen can still override per entry.</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: referDefault ? FIBR2 : FAINTER }}>{referDefault ? "ON" : "OFF"}</span>
            </button>
            <div style={{ marginTop: 14 }}>
              <button onClick={generateMenu} disabled={genBusy} style={{ ...softBtn, opacity: genBusy ? 0.6 : 1 }}>{genBusy ? "Generating…" : "✨ Generate starter menu"}</button>
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>Built from your cuisines, eating pattern, the notes above &amp; your targets. Tap a dish: once 👍, twice 👎.</div>
              {genNote && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>{genNote}</div>}
              {menu && ["breakfast", "lunch", "dinner", "snacks"].map((k) => (Array.isArray(menu[k]) && menu[k].length ? (
                <div key={k} style={{ marginTop: 10 }}>
                  <div style={{ ...tiny, marginBottom: 5 }}>{cap(k)}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{menu[k].map((it: string, i: number) => {
                    const p = menuPick[it] || 0;
                    const bg = p === 1 ? LIKE_B : p === -1 ? DISLIKE_B : CARD;
                    const bd = p === 1 ? LIKE : p === -1 ? DISLIKE : CB;
                    const col = p === 1 ? LIKE : p === -1 ? DISLIKE : BODY;
                    return <button key={i} onClick={() => cyclePick(it)} style={{ fontSize: 11.5, color: col, background: bg, border: "1px solid " + bd, borderRadius: 9, padding: "5px 9px", cursor: "pointer", fontWeight: p ? 700 : 500 }}>{p === 1 ? "👍 " : p === -1 ? "👎 " : ""}{it}</button>;
                  })}</div>
                </div>
              ) : null))}
              {menu && (
                <>
                  <button onClick={saveMenuPicks} disabled={picksBusy} style={{ width: "100%", marginTop: 12, padding: 11, borderRadius: 12, border: "1px solid " + LIKE_B, background: "transparent", color: LIKE, fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: picksBusy ? 0.6 : 1 }}>{picksBusy ? "Saving…" : "Save 👍 / 👎 to my preferences"}</button>
                  {picksNote && <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>{picksNote}</div>}
                </>
              )}
            </div>
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
                      <button key={f.id} onClick={() => applyFood(f)} style={{ textAlign: "left", background: INSET, border: "1px solid " + CB, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: BODY }}>{f.name}</span>
                        <span style={{ fontSize: 10.5, color: FAINT }}> · {f.kcal} kcal · P {f.protein}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!pPicked && pQ.trim() && pFoods.length === 0 && (
                  <button onClick={aiPantryFood} disabled={busy} style={{ ...softBtn, marginTop: 8, opacity: busy ? 0.6 : 1 }}>{busy ? "Estimating…" : "✨ Estimate “" + pQ.trim() + "” with AI"}</button>
                )}

                <div style={{ ...tiny, margin: "12px 0 6px" }}>Or scan the nutrition label</div>
                {camOn ? (
                  <div style={{ borderRadius: 12, overflow: "hidden", background: "#000" }}>
                    <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
                    <div style={{ display: "flex", gap: 8, padding: 8 }}>
                      <button onClick={stopCam} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                      <button onClick={captureLabel} style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>📸 Capture label</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, textAlign: "center", border: "1px dashed " + IB, borderRadius: 11, padding: "11px 8px", cursor: "pointer", background: INSET, color: ACCENT_LT, fontSize: 12, fontWeight: 700 }}>📁 Upload label
                      <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) scanUpload(f); }} style={{ display: "none" }} />
                    </label>
                    <button onClick={startCam} style={{ flex: 1, border: "1px dashed " + IB, borderRadius: 11, padding: "11px 8px", cursor: "pointer", background: INSET, color: ACCENT_LT, fontSize: 12, fontWeight: 700 }}>📷 Camera</button>
                  </div>
                )}
                {scanBusy && <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>✨ Reading label…</div>}

                <div style={{ ...tiny, margin: "12px 0 4px" }}>Label</div>
                <input value={pLabel} onChange={(e) => setPLabel(e.target.value)} placeholder="e.g. Amul High-Protein Paneer" style={inp} />
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <Field lbl="Cal" v={pKcal} on={setPKcal} />
                  <Field lbl="Prot" v={pPro} on={setPPro} color={PROT} />
                  <Field lbl="Carb" v={pCar} on={setPCar} color={CARB} />
                  <Field lbl="Fat" v={pFat} on={setPFat} color={FAT} />
                  <Field lbl="Fibr" v={pFib} on={setPFib} color={FIBR} />
                </div>
                <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>{pBasis === "per_serving" ? "Per serving (from the label)." : "Per 100g (or per piece/serving if picked/scanned)."}</div>
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
