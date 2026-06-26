"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { nutriProfile, nutriFoods, nutriPost } from "../../lib/api";

const CARD = "#101626", INSET = "#0e1320", CB = "#1a2232", IB = "#1f2838";
const H = "#f3f6fb", BODY = "#e8ecf3", MUTED = "#aeb6c4", FAINT = "#7b8597", FAINTER = "#5c6573";
const ACCENT = "#4f9cf9", ACCENT_LT = "#7fb0ff", CHIP_SEL = "#13203a", CHIP_SEL_B = "#294063", CHIP_IDLE = "#141b29", CHIP_IDLE_B = "#222c3d";
const PROT = "#5b9bff", CARB = "#f3b14e", FAT = "#f0735a", FIBR = "#46c79a", FIBR2 = "#46c79a";

type Targets = { calories: number; protein: number; carbs: number; fats: number; fiber: number; micros_rda: Record<string, number> };
type Profile = { cuisine: string[]; eating_pattern: string; restrictions: string; refer_pantry_default: boolean; typical_meals: string; biggest_challenge: string; starter_menu: unknown; likes: string; narrative: string; height_cm: number | null; age: number | null; sex: string; activity_level: string };
type PantryItem = { id: string; category: string; food_id: string | null; label: string; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; unit_grams: Record<string, number>; micros: Record<string, number> };
type Food = { id: string; name: string; brand: string | null; category: string | null; basis: string; kcal: number; protein: number; carbs: number; fats: number; fiber: number; micros: Record<string, number>; unit_grams: Record<string, number>; source: string; verified: boolean };
type ProfileResp = { profile: Profile; targets: Targets; pantry: PantryItem[] };
type Sug = { rationale: string; bmr?: number; tdee?: number; weight?: number; bf?: number | null };

const CUISINES = ["North Indian", "South Indian", "Gujarati", "Punjabi", "Bengali", "Maharashtrian", "Continental", "Chinese", "Mediterranean", "Mexican"];
const PATTERNS = ["Vegetarian", "Eggetarian", "Non-veg", "Vegan", "Jain"];
const CATS = ["milk", "paneer", "curd", "whey", "atta", "oats", "oil", "ghee", "bread", "rice", "dal"];
const GOALS = ["cut", "recomp", "maintain", "gain"];

const numv = (s: string) => Number(s) || 0;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const tiny: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: FAINT };
const inp: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 10, border: "1px solid " + IB, background: "#0b101b", color: BODY, fontSize: 13.5, outline: "none" };
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

  // targets
  const [cal, setCal] = useState(""); const [pro, setPro] = useState(""); const [car, setCar] = useState(""); const [fat, setFat] = useState(""); const [fib, setFib] = useState("");
  const [ht, setHt] = useState(""); const [age, setAge] = useState(""); const [sex, setSex] = useState("male"); const [goal, setGoal] = useState("recomp");
  const [sugBusy, setSugBusy] = useState(false); const [sug, setSug] = useState<Sug | null>(null);
  // prefs
  const [cuisine, setCuisine] = useState<string[]>([]); const [pattern, setPattern] = useState(""); const [referDefault, setReferDefault] = useState(true);
  const [typical, setTypical] = useState(""); const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<any>(null); const [genBusy, setGenBusy] = useState(false); const [genNote, setGenNote] = useState<string | null>(null);
  // pantry
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [pAdding, setPAdding] = useState(false); const [pCat, setPCat] = useState(""); const [pQ, setPQ] = useState(""); const [pFoods, setPFoods] = useState<Food[]>([]); const [pPicked, setPPicked] = useState(false);
  const [pLabel, setPLabel] = useState(""); const [pKcal, setPKcal] = useState(""); const [pPro, setPPro] = useState(""); const [pCar, setPCar] = useState(""); const [pFat, setPFat] = useState(""); const [pFib, setPFib] = useState("");
  const [pBasis, setPBasis] = useState("per_100g"); const [pUnitGrams, setPUnitGrams] = useState<Record<string, number>>({}); const [pMicros, setPMicros] = useState<Record<string, number>>({});
  const [scanBusy, setScanBusy] = useState(false); const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null); const streamRef = useRef<MediaStream | null>(null);

  function hydrate(d: ProfileResp) {
    setData(d);
    setCal(String(d.targets.calories || "")); setPro(String(d.targets.protein || "")); setCar(String(d.targets.carbs || "")); setFat(String(d.targets.fats || "")); setFib(String(d.targets.fiber || ""));
    setCuisine(d.profile.cuisine || []); setPattern(d.profile.eating_pattern || ""); setReferDefault(d.profile.refer_pantry_default !== false);
    setTypical(d.profile.typical_meals || "");
    if (d.profile.height_cm != null) setHt(String(d.profile.height_cm)); if (d.profile.age != null) setAge(String(d.profile.age)); if (d.profile.sex) setSex(d.profile.sex);
    setPantry(d.pantry || []);
    setMenu(d.profile.starter_menu && (d.profile.starter_menu as any).breakfast ? d.profile.starter_menu : null);
  }
  useEffect(() => { nutriProfile<ProfileResp>().then(hydrate).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!pAdding) return;
    const t = setTimeout(() => { nutriFoods<{ foods: Food[] }>(pQ).then((r) => setPFoods(r.foods || [])).catch(() => {}); }, 220);
    return () => clearTimeout(t);
  }, [pQ, pAdding]);
  useEffect(() => { if (camOn && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {}); } }, [camOn]);
  useEffect(() => () => { const s = streamRef.current; if (s) s.getTracks().forEach((t) => t.stop()); }, []);

  async function aiSuggestTargets() {
    setSugBusy(true); setErr(null); setSug(null);
    try {
      const r = await nutriPost<any>("targets_suggest", { height_cm: numv(ht) || null, age: numv(age) || null, sex: sex || null, goal });
      if (r && r.needs) setErr("Add " + (r.needs as string[]).join(", ") + " above for a personalised suggestion.");
      else if (r && r.suggestion) {
        const s = r.suggestion; setCal(String(s.calories)); setPro(String(s.protein)); setCar(String(s.carbs)); setFat(String(s.fats)); setFib(String(s.fiber));
        setSug({ rationale: r.rationale || "", bmr: r.inputs?.bmr, tdee: r.inputs?.tdee, weight: r.inputs?.weight_kg, bf: r.inputs?.body_fat_pct });
      } else setErr((r && r.note) || "Couldn't suggest right now.");
    } catch (e) { setErr((e as Error).message); } finally { setSugBusy(false); }
  }
  async function saveTargets() {
    setBusy(true); setErr(null);
    try { const d = await nutriPost<ProfileResp>("targets_save", { calories: numv(cal), protein: numv(pro), carbs: numv(car), fats: numv(fat), fiber: numv(fib) }); hydrate(d); if (onChanged) onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
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
    setGenBusy(true); setGenNote(null);
    try { const r = await nutriPost<{ menu: any; note?: string }>("menu_generate", { cuisine, eating_pattern: pattern, typical_meals: typical }); if (r && r.menu) setMenu(r.menu); else setGenNote((r && r.note) || "Couldn't generate right now."); }
    catch (e) { setGenNote((e as Error).message); } finally { setGenBusy(false); }
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
              <div style={{ ...tiny, marginBottom: 8 }}>✨ Suggest from your data</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}><div style={{ ...tiny, marginBottom: 4 }}>Height cm</div><NumIn v={ht} on={setHt} /></div>
                <div style={{ flex: 1 }}><div style={{ ...tiny, marginBottom: 4 }}>Age</div><NumIn v={age} on={setAge} /></div>
                <div style={{ flex: 1.4 }}><div style={{ ...tiny, marginBottom: 4 }}>Sex</div>
                  <div style={{ display: "flex", gap: 5 }}>{["male", "female"].map((s) => <button key={s} onClick={() => setSex(s)} style={{ ...chip(sex === s), flex: 1, padding: "8px 0", textAlign: "center", fontSize: 11 }}>{cap(s)}</button>)}</div>
                </div>
              </div>
              <div style={{ ...tiny, margin: "10px 0 4px" }}>Goal</div>
              <div style={{ display: "flex", gap: 5 }}>{GOALS.map((g) => <button key={g} onClick={() => setGoal(g)} style={{ ...chip(goal === g), flex: 1, padding: "8px 0", textAlign: "center", fontSize: 11 }}>{cap(g)}</button>)}</div>
              <button onClick={aiSuggestTargets} disabled={sugBusy} style={{ ...softBtn, marginTop: 10, opacity: sugBusy ? 0.6 : 1 }}>{sugBusy ? "Calculating…" : "✨ Suggest targets with AI"}</button>
              {sug && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: INSET, border: "1px solid " + CB }}>
                  <div style={{ fontSize: 11.5, color: BODY, lineHeight: 1.45 }}>{sug.rationale}</div>
                  <div style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>BMR ~{sug.bmr} · TDEE ~{sug.tdee} kcal{sug.weight ? " · " + Math.round(sug.weight) + "kg" : ""}{sug.bf ? " · " + sug.bf + "% BF" : ""} — applied above, edit freely.</div>
                </div>
              )}
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>Uses your weight, body-fat, training load &amp; goal. A starting point, not medical advice.</div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 6px" }}>
              <div style={tiny}>What you typically eat · likes &amp; dislikes</div>
              <button onClick={startDictation} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9, border: "1px solid " + (listening ? "#5a2532" : CHIP_IDLE_B), background: listening ? "#1a0f12" : CHIP_IDLE, color: listening ? "#ff9aa5" : ACCENT_LT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{listening ? "● Listening…" : "🎤 Speak"}</button>
            </div>
            <textarea value={typical} onChange={(e) => setTypical(e.target.value)} rows={3} placeholder="e.g. I usually have idli or oats for breakfast, dal-roti-sabzi lunches, paneer often. Love filter coffee. Dislike mushrooms; no eggs." style={{ ...inp, resize: "vertical", lineHeight: 1.45 }} />
            <button onClick={() => setReferDefault((x) => !x)} style={{ width: "100%", marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: CARD, border: "1px solid " + CB, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, color: BODY, textAlign: "left" }}>Use my Pantry brands by default<br /><span style={{ fontSize: 10.5, color: FAINT }}>When logging, prefer your saved products over generic values.</span></span>
              <span style={{ fontSize: 12, fontWeight: 800, color: referDefault ? FIBR2 : FAINTER }}>{referDefault ? "ON" : "OFF"}</span>
            </button>
            <div style={{ marginTop: 14 }}>
              <button onClick={generateMenu} disabled={genBusy} style={{ ...softBtn, opacity: genBusy ? 0.6 : 1 }}>{genBusy ? "Generating…" : "✨ Generate starter menu"}</button>
              <div style={{ fontSize: 10.5, color: FAINTER, marginTop: 6 }}>Built from your cuisines, eating pattern, the notes above &amp; your targets.</div>
              {genNote && <div style={{ fontSize: 11, color: "#ff9aa5", marginTop: 6 }}>{genNote}</div>}
              {menu && ["breakfast", "lunch", "dinner", "snacks"].map((k) => (Array.isArray(menu[k]) && menu[k].length ? (
                <div key={k} style={{ marginTop: 10 }}>
                  <div style={{ ...tiny, marginBottom: 5 }}>{cap(k)}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{menu[k].map((it: string, i: number) => <span key={i} style={{ fontSize: 11.5, color: BODY, background: CARD, border: "1px solid " + CB, borderRadius: 9, padding: "5px 9px" }}>{it}</span>)}</div>
                </div>
              ) : null))}
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
