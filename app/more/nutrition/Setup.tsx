"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nutriProfile, nutriFoods, nutriPost } from "../../lib/api";

const CARD = "var(--surface)", INSET = "var(--bg)", CB = "var(--line)";
const H = "var(--text)", BODY = "var(--text)", MUTED = "var(--text-2)", FAINT = "var(--muted)", FAINTER = "var(--faint)";
const ACCENT = "var(--ember)", ACCENT_LT = "var(--ember-strong)", CHIP_SEL = "var(--ember-tint)", CHIP_SEL_B = "color-mix(in srgb, var(--ember) 35%, transparent)", CHIP_IDLE = "var(--surface-2)", CHIP_IDLE_B = "var(--line-2)";
const PROT = "var(--ember)", CARB = "#dca23f", FAT = "var(--kai)", FIBR = "var(--success)";
const LIKE = "var(--success)", DISLIKE = "var(--danger)";
const SURF3 = "var(--surface-3)";

type DaySet = { calories: number; protein: number; carbs: number; fats: number; fiber: number };
type Targets = DaySet & { micros_rda: Record<string, number>; rest?: DaySet; has_rest?: boolean; inputs?: Record<string, number> | null };
type Profile = { cuisine: string[]; eating_pattern: string; restrictions: string; refer_pantry_default: boolean; typical_meals: string; biggest_challenge: string; starter_menu: unknown; likes: string; dislikes: string; narrative: string; height_cm: number | null; age: number | null; sex: string; activity_level: string };
type PantryItem = { id: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type ProfileResp = { profile: Profile; targets: Targets; pantry: PantryItem[] };

const CUISINES = ["North Indian", "South Indian", "Gujarati", "Punjabi", "Bengali", "Maharashtrian", "Continental", "Chinese", "Mediterranean", "Mexican"];
const PATTERNS = ["Vegetarian", "Eggetarian", "Non-veg", "Vegan", "Jain"];
const CATS = ["milk", "paneer", "curd", "whey", "atta", "oats", "oil", "ghee", "bread", "rice", "dal"];
const MEALS: [string, string][] = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];

const numv = (s: string) => Number(s) || 0;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const label11: CSSProperties = { fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: "0.08em" };
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid " + CB, background: CARD, color: BODY, fontSize: 13, outline: "none" };
function chip(active: boolean): CSSProperties { return { padding: "8px 15px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: active ? 700 : 600, whiteSpace: "nowrap", border: "1px solid " + (active ? CHIP_SEL_B : CB), background: active ? CHIP_SEL : CARD, color: active ? ACCENT_LT : MUTED }; }
const emberBtn: CSSProperties = { width: "100%", marginTop: 14, padding: 14, borderRadius: 16, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 18px color-mix(in srgb, var(--ember) 35%, transparent)" };

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

function Chevron() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={FAINTER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>; }
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Toggle" style={{ width: 44, height: 26, borderRadius: 999, border: "none", background: on ? ACCENT : CHIP_IDLE_B, position: "relative", cursor: "pointer", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
    </button>
  );
}
function KaiNote({ text }: { text: string }) {
  return (
    <div style={{ background: SURF3, borderRadius: 16, padding: "13px 15px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 24, height: 24, borderRadius: 999, background: ACCENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 800 }}>K</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: BODY }}>{text}</div>
    </div>
  );
}
function MacroBox({ lbl, val, sub, color }: { lbl: string; val: number; sub: string; color: string }) {
  return (
    <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 18, padding: "14px 16px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em" }}>{lbl}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: H, marginTop: 4 }}>{val} <span style={{ fontSize: 11, fontWeight: 600, color: FAINTER }}>g</span></div>
      <div style={{ fontSize: 11, color: FAINTER, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />{sub}</div>
    </div>
  );
}
function Field({ lbl, v, on }: { lbl: string; v: string; on: (s: string) => void }) {
  return (
    <div style={{ flex: 1, background: CARD, border: "1px solid " + CB, borderRadius: 14, padding: "9px 4px", textAlign: "center" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: FAINT, letterSpacing: "0.06em" }}>{lbl}</div>
      <input value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.-]/g, ""))} inputMode="decimal" placeholder="0" style={{ width: "100%", boxSizing: "border-box", marginTop: 3, border: "none", background: "transparent", color: v ? H : FAINTER, fontSize: 15, fontWeight: 800, outline: "none", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
    </div>
  );
}

export default function Setup({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<string>("targets");
  const [data, setData] = useState<ProfileResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefView, setPrefView] = useState<string>("list");
  const [starterMeal, setStarterMeal] = useState<string>("breakfast");
  // prefs
  const [cuisine, setCuisine] = useState<string[]>([]); const [pattern, setPattern] = useState(""); const [referDefault, setReferDefault] = useState(true);
  const [typical, setTypical] = useState(""); const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<any>(null); const [genBusy, setGenBusy] = useState(false); const [genNote, setGenNote] = useState<string | null>(null);
  const [menuPick, setMenuPick] = useState<Record<string, number>>({});
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

  function toggleCuisine(c: string) { setCuisine((xs) => (xs.indexOf(c) >= 0 ? xs.filter((x) => x !== c) : [...xs, c])); }
  function startDictation() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported here. Please type instead."); return; }
    try {
      const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = false; rec.continuous = false; setListening(true);
      rec.onresult = (e: any) => { const txt = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); setTypical((t) => (t ? t + " " : "") + txt); };
      rec.onerror = () => setListening(false); rec.onend = () => setListening(false); rec.start();
    } catch { setListening(false); }
  }
  async function generateMenu() {
    setGenBusy(true); setGenNote(null);
    try { const r = await nutriPost<{ menu: any; note?: string }>("menu_generate", { cuisine, eating_pattern: pattern, typical_meals: typical }); if (r && r.menu) { setMenu(r.menu); setMenuPick({}); } else setGenNote((r && r.note) || "Couldn't generate right now."); }
    catch (e) { setGenNote((e as Error).message); } finally { setGenBusy(false); }
  }
  function setPick(item: string, val: number) {
    setMenuPick((m) => { const c = { ...m }; if (c[item] === val) delete c[item]; else c[item] = val; return c; });
  }
  function mergeCsv(existing: string, add: string[]): string {
    const seen = new Set<string>(); const out: string[] = [];
    for (const part of [...String(existing || "").split(","), ...add]) { const t = part.trim(); if (!t) continue; const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(t); }
    return out.join(", ");
  }
  async function savePrefs() {
    setBusy(true); setErr(null);
    try {
      const likes = mergeCsv(existingLikes, Object.keys(menuPick).filter((k) => menuPick[k] === 1));
      const dislikes = mergeCsv(existingDislikes, Object.keys(menuPick).filter((k) => menuPick[k] === -1));
      const d = await nutriPost<ProfileResp>("profile_save", { cuisine, eating_pattern: pattern, refer_pantry_default: referDefault, typical_meals: typical, likes, dislikes });
      hydrate(d); if (onChanged) onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function applyFood(f: Food) { setPPicked(true); setPLabel(f.brand ? f.brand + " " + f.name : f.name); setPKcal(String(f.kcal)); setPPro(String(f.protein)); setPCar(String(f.carbs)); setPFat(String(f.fats)); setPFib(String(f.fiber)); setPBasis(f.basis); setPUnitGrams(f.unit_grams || {}); setPMicros(f.micros || {}); if (f.category && !pCat) setPCat(f.category); }
  function resetPantryAdd() { setPCat(""); setPQ(""); setPFoods([]); setPPicked(false); setPLabel(""); setPKcal(""); setPPro(""); setPCar(""); setPFat(""); setPFib(""); setPBasis("per_100g"); setPUnitGrams({}); setPMicros({}); stopCam(); }
  async function aiPantryFood() {
    const nm = pQ.trim(); if (!nm) return; setBusy(true); setErr(null);
    try { const r = await nutriPost<{ food: Food | null }>("ai_food", { name: nm }); if (r && r.food) applyFood(r.food); else setErr("Couldn't estimate that product. Type the values or scan the label."); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function runLabelScan(image_b64: string, mime: string) {
    setScanBusy(true); setErr(null);
    try {
      const r = await nutriPost<any>("label_scan", { image_b64, mime });
      if (r && r.ok && r.label) { const L = r.label; setPPicked(true); if (L.name && !pLabel) setPLabel(L.name); setPKcal(String(L.kcal)); setPPro(String(L.protein)); setPCar(String(L.carbs)); setPFat(String(L.fats)); setPFib(String(L.fiber)); setPBasis(L.basis || "per_100g"); setPUnitGrams(L.unit_grams || {}); }
      else setErr((r && r.note) || "Couldn't read the label. Try a clearer photo or type the values.");
    } catch (e) { setErr((e as Error).message); } finally { setScanBusy(false); }
  }
  function scanUpload(file: File) { resizeToB64(file).then((img) => runLabelScan(img.image_b64, img.mime)).catch(() => setErr("Couldn't read that image.")); }
  function stopCam() { const s = streamRef.current; if (s) { s.getTracks().forEach((t) => t.stop()); streamRef.current = null; } setCamOn(false); }
  async function startCam() {
    setErr(null);
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); streamRef.current = s; setCamOn(true); }
    catch { setErr("Camera unavailable here. Use the Upload option instead."); }
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

  const t = data ? data.targets : null;
  const pct = (g: number, per: number) => (t && t.calories ? Math.round((g * per) / t.calories * 100) + "%" : "-");
  const cuisineSummary = cuisine.length ? cuisine[0] + (cuisine.length > 1 ? " +" + (cuisine.length - 1) : "") : "Not set";
  const likesSummary = [existingLikes, existingDislikes].filter(Boolean).join(" / ") || "Not set";
  const inSub = tab === "prefs" && prefView !== "list";
  const subTitle = prefView === "pattern" ? "Eating pattern" : prefView === "cuisines" ? "Cuisines" : prefView === "likes" ? "Likes & dislikes" : "";
  const showBack = inSub || pAdding;
  const title = pAdding ? "Add pantry item" : inSub ? subTitle : "Nutrition settings";
  function goBack() { if (pAdding) { resetPantryAdd(); setPAdding(false); } else setPrefView("list"); }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 49 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: INSET, border: "1px solid " + CB, borderRadius: "24px 24px 0 0", padding: "16px 18px max(18px,env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {showBack && <button onClick={goBack} aria-label="Back" style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid " + CB, background: CARD, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>}
            <div style={{ fontSize: 19, fontWeight: 800, color: H, letterSpacing: "-0.02em" }}>{title}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: SURF3, color: FAINT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {!showBack && (
          <div style={{ display: "flex", background: CHIP_IDLE, borderRadius: 999, padding: 4, marginBottom: 16 }}>
            {[["targets", "Targets"], ["prefs", "Preferences"], ["pantry", "Pantry"]].map(([k, lbl]) => (
              <button key={k} onClick={() => { setTab(k); setPrefView("list"); }} style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: tab === k ? 800 : 600, color: tab === k ? H : MUTED, background: tab === k ? CARD : "transparent", borderRadius: 999, padding: "9px 0", border: "none", cursor: "pointer", boxShadow: tab === k ? "0 2px 6px rgba(0,0,0,0.08)" : "none" }}>{lbl}</button>
            ))}
          </div>
        )}

        {err && <div style={{ marginBottom: 12, padding: 10, borderRadius: 12, border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", fontSize: 12 }}>{err}</div>}

        {data && t && tab === "targets" && (
          <div>
            <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 20, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: H }}>Daily calories</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: H }}>{t.calories.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600, color: FAINTER }}>kcal</span></div>
              </div>
              <div style={{ marginTop: 12, background: SURF3, borderRadius: 14, padding: "11px 13px", display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, background: ACCENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9.5, fontWeight: 800 }}>K</div>
                <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>Kai will dial this in from your goals and training load. Coming soon.</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <MacroBox lbl="PROTEIN" val={t.protein} sub={pct(t.protein, 4)} color={PROT} />
              <MacroBox lbl="CARBS" val={t.carbs} sub={pct(t.carbs, 4)} color={CARB} />
              <MacroBox lbl="FAT" val={t.fats} sub={pct(t.fats, 9)} color={FAT} />
              <MacroBox lbl="FIBER" val={t.fiber} sub="goal" color={FIBR} />
            </div>
            <div style={{ marginTop: 12 }}><KaiNote text="Placeholder targets for now. Kai retunes these from your goals as your weight trends." /></div>
          </div>
        )}

        {data && tab === "prefs" && prefView === "list" && (
          <div>
            <div style={{ ...label11, marginBottom: 10 }}>MY DIET</div>
            <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 20, overflow: "hidden" }}>
              <button onClick={() => setPrefView("pattern")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", borderBottom: "1px solid " + INSET, cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: H }}>Eating pattern</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_LT }}>{pattern || "Not set"}</div>
                <Chevron />
              </button>
              <button onClick={() => setPrefView("cuisines")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", borderBottom: "1px solid " + INSET, cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: H }}>Cuisines</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT_LT }}>{cuisineSummary}</div>
                <Chevron />
              </button>
              <button onClick={() => setPrefView("likes")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", borderBottom: "1px solid " + INSET, cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>Likes & dislikes</div><div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{likesSummary}</div></div>
                <Chevron />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>Use my pantry brands</div><div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>Add screens can override per entry</div></div>
                <Switch on={referDefault} onClick={() => setReferDefault((x) => !x)} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
              <div style={label11}>STARTER MENU</div>
              <button onClick={generateMenu} disabled={genBusy} style={{ background: "transparent", border: "none", fontSize: 12, fontWeight: 700, color: ACCENT_LT, cursor: "pointer", opacity: genBusy ? 0.6 : 1 }}>{genBusy ? "Generating..." : "Regenerate"}</button>
            </div>
            {genNote && <div style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{genNote}</div>}
            {!menu && !genBusy && (
              <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 18, padding: "18px 16px", textAlign: "center", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>Tap Regenerate to build a starter menu from your diet and targets.</div>
            )}
            {menu && (
              <>
                <div style={{ display: "flex", background: CHIP_IDLE, borderRadius: 999, padding: 3 }}>
                  {MEALS.map(([k, lbl]) => (
                    <button key={k} onClick={() => setStarterMeal(k)} style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: starterMeal === k ? 800 : 600, color: starterMeal === k ? H : MUTED, background: starterMeal === k ? CARD : "transparent", borderRadius: 999, padding: "6px 0", border: "none", cursor: "pointer", boxShadow: starterMeal === k ? "0 2px 6px rgba(0,0,0,0.08)" : "none" }}>{lbl}</button>
                  ))}
                </div>
                <div style={{ marginTop: 10, background: CARD, border: "1px solid " + CB, borderRadius: 18, overflow: "hidden" }}>
                  {(Array.isArray(menu[starterMeal]) ? menu[starterMeal] : []).map((it: string, i: number, arr: string[]) => {
                    const p = menuPick[it] || 0;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: i < arr.length - 1 ? "1px solid " + INSET : "none" }}>
                        <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: BODY }}>{it}</div>
                        <button onClick={() => setPick(it, 1)} aria-label="Keep" style={{ width: 28, height: 28, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: p === 1 ? LIKE : SURF3 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p === 1 ? "#fff" : FAINT} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></button>
                        <button onClick={() => setPick(it, -1)} aria-label="Skip" style={{ width: 28, height: 28, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: p === -1 ? DISLIKE : SURF3 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={p === -1 ? "#fff" : FAINT} strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: FAINTER }}>Keep what you like, skip what you don't. Built from your diet & targets.</div>
              </>
            )}
            <button onClick={savePrefs} disabled={busy} style={{ ...emberBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Save preferences"}</button>
          </div>
        )}

        {data && tab === "prefs" && prefView === "pattern" && (
          <div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>How you eat shapes every estimate and starter menu.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{PATTERNS.map((p) => <button key={p} onClick={() => setPattern(p)} style={chip(pattern === p)}>{p}</button>)}</div>
            <button onClick={() => { savePrefs(); setPrefView("list"); }} disabled={busy} style={{ ...emberBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Done"}</button>
          </div>
        )}
        {data && tab === "prefs" && prefView === "cuisines" && (
          <div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>Pick the cuisines you cook and eat most.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{CUISINES.map((c) => <button key={c} onClick={() => toggleCuisine(c)} style={chip(cuisine.indexOf(c) >= 0)}>{c}</button>)}</div>
            <button onClick={() => { savePrefs(); setPrefView("list"); }} disabled={busy} style={{ ...emberBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Done"}</button>
          </div>
        )}
        {data && tab === "prefs" && prefView === "likes" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, flex: 1, paddingRight: 10 }}>What you usually eat, love, or avoid. Kai reads this for every estimate.</div>
              <button onClick={startDictation} aria-label="Dictate" style={{ width: 38, height: 38, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + (listening ? "color-mix(in srgb, var(--danger) 45%, transparent)" : CB), background: listening ? "color-mix(in srgb, var(--danger) 12%, transparent)" : CARD, color: listening ? "var(--danger)" : MUTED, cursor: "pointer" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg></button>
            </div>
            <textarea value={typical} onChange={(e) => setTypical(e.target.value)} rows={5} placeholder="e.g. Oats + whey mornings, dal-roti-sabzi lunches, paneer often. No mushrooms, low oil." style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
            {(existingLikes || existingDislikes) && <div style={{ fontSize: 11, color: FAINTER, marginTop: 10, lineHeight: 1.5 }}>{existingLikes ? "Likes: " + existingLikes : ""}{existingLikes && existingDislikes ? " / " : ""}{existingDislikes ? "Dislikes: " + existingDislikes : ""}</div>}
            <button onClick={() => { savePrefs(); setPrefView("list"); }} disabled={busy} style={{ ...emberBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Done"}</button>
          </div>
        )}

        {data && tab === "pantry" && !pAdding && (
          <div>
            <KaiNote text="Your pantry teaches Kai your kitchen. Estimates default to these items first." />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 10px" }}>
              <div style={label11}>MY STAPLES{pantry.length ? " (" + pantry.length + ")" : ""}</div>
              <button onClick={() => { resetPantryAdd(); setPAdding(true); }} style={{ background: "transparent", border: "none", fontSize: 12, fontWeight: 700, color: ACCENT_LT, cursor: "pointer" }}>+ Add item</button>
            </div>
            {pantry.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {pantry.map((it) => <div key={it.id} style={{ fontSize: 12.5, fontWeight: 600, background: CARD, border: "1px solid " + CB, borderRadius: 999, padding: "8px 14px", color: BODY }}>{cap(it.label || it.category)}</div>)}
              </div>
            ) : (
              <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 18, padding: "18px 16px", textAlign: "center", fontSize: 12.5, color: MUTED }}>No staples yet. Add the products you keep at home.</div>
            )}

            <div style={{ ...label11, margin: "20px 0 10px" }}>BEHAVIOR</div>
            <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: H }}>Prefer pantry in estimates</div><div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>Describe & photo match pantry items first</div></div>
              <Switch on={referDefault} onClick={() => setReferDefault((x) => !x)} />
            </div>
            <button onClick={savePrefs} disabled={busy} style={{ ...emberBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Save pantry"}</button>
          </div>
        )}

        {data && tab === "pantry" && pAdding && (
          <div>
            {pantry.length > 0 && (
              <>
                <div style={{ ...label11, marginBottom: 10 }}>YOUR DEFAULTS</div>
                <div style={{ background: CARD, border: "1px solid " + CB, borderRadius: 20, overflow: "hidden", marginBottom: 18 }}>
                  {pantry.map((it, i) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < pantry.length - 1 ? "1px solid " + INSET : "none" }}>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{cap(it.category)} <span style={{ fontWeight: 600, color: FAINT }}>/ {it.label}</span></div><div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{it.kcal} kcal / P{it.protein} / C{it.carbs} / F{it.fats}{it.basis === "per_100g" ? " / per 100g" : ""}</div></div>
                      <button onClick={() => delPantry(it)} aria-label="Remove" style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: SURF3, color: FAINT, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ ...label11, marginBottom: 10 }}>CATEGORY</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{CATS.map((c) => <button key={c} onClick={() => setPCat(c)} style={chip(pCat === c)}>{cap(c)}</button>)}</div>
            <input value={pCat} onChange={(e) => setPCat(e.target.value)} placeholder="or type a category" style={{ ...inp, marginTop: 10 }} />

            <div style={{ ...label11, margin: "18px 0 10px" }}>FIND YOUR PRODUCT</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: CARD, border: "1.5px solid " + (pQ ? ACCENT : CB), borderRadius: 16, padding: "12px 15px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={pQ} onChange={(e) => setPQ(e.target.value)} placeholder="Search e.g. paneer, whey, milk..." style={{ flex: 1, border: "none", background: "transparent", color: BODY, fontSize: 13, outline: "none" }} />
            </div>
            {!pPicked && pFoods.length > 0 && (
              <div style={{ marginTop: 10, background: CARD, border: "1px solid " + CB, borderRadius: 18, overflow: "hidden" }}>
                {pFoods.slice(0, 6).map((f, i) => (
                  <button key={f.id} onClick={() => applyFood(f)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "transparent", border: "none", borderBottom: i < Math.min(pFoods.length, 6) - 1 ? "1px solid " + INSET : "none", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: H }}>{f.name}</div><div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{f.kcal} kcal / P{f.protein}</div></div>
                    <div style={{ width: 30, height: 30, borderRadius: 999, background: CHIP_SEL, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_LT} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></div>
                  </button>
                ))}
              </div>
            )}
            {!pPicked && pQ.trim() && pFoods.length === 0 && (
              <button onClick={aiPantryFood} disabled={busy} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 14, border: "1px solid " + CHIP_SEL_B, background: CHIP_SEL, color: ACCENT_LT, fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Estimating..." : "Estimate \"" + pQ.trim() + "\" with AI"}</button>
            )}

            <div style={{ ...label11, margin: "18px 0 10px" }}>OR SCAN THE NUTRITION LABEL</div>
            {camOn ? (
              <div style={{ borderRadius: 16, overflow: "hidden", background: "#000" }}>
                <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
                <div style={{ display: "flex", gap: 8, padding: 10 }}>
                  <button onClick={stopCam} style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid " + CB, background: CHIP_IDLE, color: MUTED, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                  <button onClick={captureLabel} style={{ flex: 2, padding: 11, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Capture label</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12 }}>
                <label style={{ flex: 1, background: CHIP_SEL, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: ACCENT_LT, fontSize: 13, fontWeight: 800 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M12 3v13M7 8l5-5 5 5" /></svg>Upload label
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) scanUpload(f); }} style={{ display: "none" }} />
                </label>
                <button onClick={startCam} style={{ flex: 1, background: ACCENT, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="3.4" /></svg>Camera
                </button>
              </div>
            )}
            {scanBusy && <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>Reading label...</div>}

            <div style={{ ...label11, margin: "18px 0 10px" }}>LABEL</div>
            <input value={pLabel} onChange={(e) => setPLabel(e.target.value)} placeholder="e.g. Amul High-Protein Paneer" style={inp} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Field lbl="CAL" v={pKcal} on={setPKcal} />
              <Field lbl="PROT" v={pPro} on={setPPro} />
              <Field lbl="CARB" v={pCar} on={setPCar} />
              <Field lbl="FAT" v={pFat} on={setPFat} />
              <Field lbl="FIBER" v={pFib} on={setPFib} />
            </div>
            <div style={{ fontSize: 11, color: FAINTER, marginTop: 8 }}>{pBasis === "per_serving" ? "Per serving (from the label)." : "Per 100g, or per piece/serving if picked or scanned."}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button onClick={() => { resetPantryAdd(); setPAdding(false); }} style={{ flex: 1, padding: 14, borderRadius: 16, border: "1px solid " + CB, background: CARD, color: MUTED, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={savePantryItem} disabled={busy} style={{ flex: 2, padding: 14, borderRadius: 16, border: "none", background: ACCENT, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 18px color-mix(in srgb, var(--ember) 35%, transparent)", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Save default"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
