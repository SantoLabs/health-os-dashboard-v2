"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { actionGet, actionPost, profileGet, profileSave, uploadAvatar, type ProfileData } from "../../lib/api";
import { Screen } from "../../components/Screen";

type View = "hub" | "basics" | "health" | "training" | "appprefs";
type Bed = { target_hour: number; winddown_hour: number; grace_hour: number };

function initials(name: string | null): string {
  if (!name) return "AM";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AM";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}
function fmtClock(h: number): string {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 && hh < 24 ? "PM" : "AM";
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

/* ---------- tiny inline icons (ASCII-safe) ---------- */
const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
);
const Back = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
);
const Camera = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
);

/* ---------- shared styles ---------- */
const S = {
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 18, boxShadow: "var(--shadow-card)" } as React.CSSProperties,
  secLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted)" } as React.CSSProperties,
  input: { width: "100%", boxSizing: "border-box", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 13px", color: "var(--text)", fontSize: 15, fontFamily: "inherit" } as React.CSSProperties,
  fieldLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6, display: "block" } as React.CSSProperties,
};

function StatusChip({ tone, label }: { tone: "done" | "todo" | "none"; label: string }) {
  const map = {
    done: { bg: "var(--success-tint)", fg: "var(--success)" },
    todo: { bg: "var(--ember-tint)", fg: "var(--ember-strong)" },
    none: { bg: "var(--surface-2)", fg: "var(--muted)" },
  }[tone];
  return <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: "3px 8px", borderRadius: 999, background: map.bg, color: map.fg, whiteSpace: "nowrap" }}>{label}</span>;
}

function SectionRow({ title, sub, tone, chip, onClick }: { title: string; sub: string; tone: "done" | "todo" | "none"; chip: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...S.card, width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "15px 15px", marginBottom: 11, cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</span>
          <StatusChip tone={tone} label={chip} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.35 }}>{sub}</div>
      </div>
      <Chevron />
    </button>
  );
}

/* ---------- hub ---------- */
function Hub({ data, onOpen, onPickPhoto, uploading }: { data: ProfileData; onOpen: (v: View) => void; onPickPhoto: () => void; uploading: boolean }) {
  const id = data.identity;
  const meta = [id.age != null ? `${id.age} yrs` : null, id.height_cm != null ? `${id.height_cm} cm` : null, id.weight_kg != null ? `${id.weight_kg} kg` : null, id.home_city].filter(Boolean).join(" \u00b7 ");

  const basicsDone = !!(id.name && id.dob && id.height_cm);
  const healthDone = !!(data.health_mode.primary && data.goals.length);
  const trainingDone = !!(data.training_prefs.training_days?.length && data.training_prefs.sports?.length);

  return (
    <>
      {/* identity card */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 15, padding: "16px 16px", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "none" }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", overflow: "hidden", background: "var(--ember-tint)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}>
            {id.avatar_url
              ? <img src={id.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: uploading ? 0.5 : 1 }} />
              : <span style={{ fontSize: 22, fontWeight: 800, color: "var(--ember-strong)" }}>{initials(id.name)}</span>}
          </div>
          <button onClick={onPickPhoto} aria-label="Change photo" style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", border: "2px solid var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Camera />
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{id.name || "Your name"}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>{meta || "Add your basics"}</div>
        </div>
      </div>

      <div style={S.secLabel as React.CSSProperties}>Setup</div>
      <div style={{ height: 10 }} />
      <SectionRow title="Account + Basics" sub="Name, DOB, body stats, units, location" tone={basicsDone ? "done" : "todo"} chip={basicsDone ? "DONE" : "SET UP"} onClick={() => onOpen("basics")} />
      <SectionRow title="Health Setup" sub="Health Mode, goals & sleep targets" tone={healthDone ? "done" : "todo"} chip={healthDone ? "DONE" : "SET UP"} onClick={() => onOpen("health")} />
      <SectionRow title="Training Setup" sub="Preferences, equipment & access, injuries" tone={trainingDone ? "done" : "todo"} chip={trainingDone ? "DONE" : "SET UP"} onClick={() => onOpen("training")} />
      <SectionRow title="App Preferences" sub="Connected apps, reminders & quiet hours" tone="none" chip="NOT SET" onClick={() => onOpen("appprefs")} />

      <div style={{ ...S.card, display: "flex", gap: 11, padding: "13px 14px", marginTop: 7, background: "var(--ember-tint)", border: "1px solid var(--line)" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>K</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>This is where you tell StriveOS how to plan for you. The more you fill in, the sharper your coaching gets.</div>
      </div>
    </>
  );
}

/* ---------- editor header ---------- */
function EdHead({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 18px" }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}><Back /></button>
      <span style={{ flex: 1, fontSize: 19, fontWeight: 800, color: "var(--text)" }}>{title}</span>
      {right}
    </div>
  );
}

/* ---------- basics editor ---------- */
function BasicsEditor({ data, onBack, onSaved, onPickPhoto, uploading }: { data: ProfileData; onBack: () => void; onSaved: (d: ProfileData) => void; onPickPhoto: () => void; uploading: boolean }) {
  const id = data.identity;
  const [name, setName] = useState(id.name || "");
  const [email, setEmail] = useState(id.email || "");
  const [sex, setSex] = useState(id.sex || "");
  const [dob, setDob] = useState(id.dob || "");
  const [height, setHeight] = useState(id.height_cm != null ? String(id.height_cm) : "");
  const [weight, setWeight] = useState(id.weight_kg != null ? String(id.weight_kg) : "");
  const [mass, setMass] = useState(id.units?.mass || "kg");
  const [dist, setDist] = useState(id.units?.distance || "km");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (s: string): number | null => { const n = parseFloat(s); return isFinite(n) ? n : null; };
  async function save() {
    setSaving(true); setErr(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim() || null, email: email.trim() || null, sex: sex || null,
        dob: dob || null, height_cm: num(height), units_mass: mass, units_distance: dist,
      };
      // manual weight only if it differs from the synced value
      if (num(weight) != null && num(weight) !== id.weight_kg) payload.weight_kg_override = num(weight);
      const d = await profileSave("identity_save", payload);
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const localAge = ageFrom(dob);
  const seg = (active: boolean): React.CSSProperties => ({ flex: 1, textAlign: "center", padding: "9px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer", borderRadius: 9, background: active ? "var(--ember)" : "transparent", color: active ? "#fff" : "var(--text-2)" });

  return (
    <>
      <EdHead title="Account + Basics" onBack={onBack} right={<StatusChip tone={name && dob && height ? "done" : "todo"} label={name && dob && height ? "DONE" : "SET UP"} />} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", overflow: "hidden", background: "var(--ember-tint)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}>
            {id.avatar_url ? <img src={id.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: uploading ? 0.5 : 1 }} /> : <span style={{ fontSize: 28, fontWeight: 800, color: "var(--ember-strong)" }}>{initials(name)}</span>}
          </div>
          <button onClick={onPickPhoto} aria-label="Change photo" style={{ position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: "50%", background: "var(--ember)", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Camera /></button>
        </div>
        <button onClick={onPickPhoto} style={{ marginTop: 9, fontSize: 13, fontWeight: 700, color: "var(--ember-strong)", background: "none", border: "none", cursor: "pointer" }}>{uploading ? "Uploading\u2026" : "Upload photo"}</button>
      </div>

      <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 15 }}>
        <div><label style={S.fieldLabel}>Name</label><input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
        <div><label style={S.fieldLabel}>Email</label><input style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" /></div>
        <div><label style={S.fieldLabel}>Gender</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Male", "Female", "Other"].map((g) => (
              <button key={g} onClick={() => setSex(g)} style={{ flex: 1, padding: "10px 0", fontSize: 13.5, fontWeight: 700, borderRadius: 10, cursor: "pointer", border: "1px solid " + (sex === g ? "var(--ember)" : "var(--line)"), background: sex === g ? "var(--ember-tint)" : "var(--surface-2)", color: sex === g ? "var(--ember-strong)" : "var(--text-2)" }}>{g}</button>
            ))}
          </div>
        </div>
        <div><label style={S.fieldLabel}>Date of birth{localAge != null ? `  \u00b7  age ${localAge}` : ""}</label><input type="date" style={S.input} value={dob} onChange={(e) => setDob(e.target.value)} /></div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><label style={S.fieldLabel}>Height (cm)</label><input style={S.input} value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" /></div>
          <div style={{ flex: 1 }}><label style={S.fieldLabel}>Weight (kg)</label><input style={S.input} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" /></div>
        </div>
        {id.weight_source === "withings" && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: -8 }}>Weight syncs from Withings. Editing here sets a manual override.</div>}
        <div><label style={S.fieldLabel}>Units</label>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, display: "flex", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: 3 }}>
              <div style={seg(mass === "kg")} onClick={() => setMass("kg")}>kg</div>
              <div style={seg(mass === "lb")} onClick={() => setMass("lb")}>lb</div>
            </div>
            <div style={{ flex: 1, display: "flex", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 11, padding: 3 }}>
              <div style={seg(dist === "km")} onClick={() => setDist("km")}>km</div>
              <div style={seg(dist === "mi")} onClick={() => setDist("mi")}>mi</div>
            </div>
          </div>
        </div>
        <div><label style={S.fieldLabel}>Location</label>
          <div style={{ ...S.input, display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-2)" }}>
            <span>{id.home_city || "Not set"}</span><span style={{ fontSize: 11, color: "var(--muted)" }}>auto-detected</span>
          </div>
        </div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{err}</div>}
      <button onClick={save} disabled={saving} style={{ width: "100%", marginTop: 18, padding: 14, borderRadius: 13, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save basics"}</button>
    </>
  );
}

/* ---------- interim sleep editor (folds into Health Setup fully in a later unit) ---------- */
function HealthInterim({ onBack }: { onBack: () => void }) {
  const [bed, setBed] = useState<Bed | null>(null);
  const [orig, setOrig] = useState<Bed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    actionGet<Bed>("bedtime_goal").then((d) => { const b = { target_hour: d.target_hour, winddown_hour: d.winddown_hour, grace_hour: d.grace_hour }; setBed(b); setOrig(b); }).catch((e) => setErr((e as Error).message));
  }, []);
  const clamp = (h: number) => Math.max(19, Math.min(26, Math.round(h * 4) / 4));
  const set = (k: keyof Bed, v: number) => { setBed((b) => (b ? { ...b, [k]: v } : b)); setSaved(false); };
  const dirty = bed && orig && (bed.target_hour !== orig.target_hour || bed.winddown_hour !== orig.winddown_hour || bed.grace_hour !== orig.grace_hour);
  async function save() {
    if (!bed) return; setSaving(true);
    try { await actionPost("bedtime_target_save", bed); setOrig(bed); setSaved(true); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  const stepBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)", fontSize: 20, cursor: "pointer", lineHeight: 1 };
  const Row = ({ label, display, dec, inc }: { label: string; display: string; dec: () => void; inc: () => void }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <span style={{ fontSize: 14, color: "var(--text-2)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button style={stepBtn} onClick={dec}>-</button>
        <span style={{ minWidth: 94, textAlign: "center", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{display}</span>
        <button style={stepBtn} onClick={inc}>+</button>
      </span>
    </div>
  );
  return (
    <>
      <EdHead title="Health Setup" onBack={onBack} />
      <div style={{ ...S.card, padding: "13px 14px", marginBottom: 14, display: "flex", gap: 11, background: "var(--ember-tint)" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>K</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>Health Mode and priority goals arrive in the next update. Your sleep targets live here.</div>
      </div>
      <div style={S.secLabel as React.CSSProperties}>Sleep targets</div>
      <div style={{ height: 10 }} />
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {bed && (
        <div style={{ ...S.card, padding: 16 }}>
          <Row label="Target bedtime" display={fmtClock(bed.target_hour > 24 ? bed.target_hour - 24 : bed.target_hour)} dec={() => set("target_hour", clamp(bed.target_hour - 0.25))} inc={() => set("target_hour", clamp(bed.target_hour + 0.25))} />
          <Row label="Wind-down start" display={fmtClock(bed.winddown_hour > 24 ? bed.winddown_hour - 24 : bed.winddown_hour)} dec={() => set("winddown_hour", clamp(bed.winddown_hour - 0.25))} inc={() => set("winddown_hour", clamp(bed.winddown_hour + 0.25))} />
          <Row label="Grace window" display={`\u00b1 ${Math.round(bed.grace_hour * 60)} min`} dec={() => set("grace_hour", Math.max(0, Math.round((bed.grace_hour - 0.25) * 4) / 4))} inc={() => set("grace_hour", Math.min(1, Math.round((bed.grace_hour + 0.25) * 4) / 4))} />
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, margin: "4px 0 14px" }}>A night counts as on-time if you are asleep by your target plus the grace window. Wind-down is your nudge to start slowing down.</div>
          <button onClick={save} disabled={!dirty || saving} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: dirty ? "var(--ember)" : "var(--surface-2)", color: dirty ? "#fff" : "var(--muted)", fontWeight: 800, fontSize: 14.5, cursor: dirty ? "pointer" : "default" }}>{saving ? "Saving\u2026" : saved ? "Saved" : "Save targets"}</button>
        </div>
      )}
    </>
  );
}

/* ---------- placeholder for sections shipping in later units ---------- */
function Soon({ title, onBack, note }: { title: string; onBack: () => void; note: string }) {
  return (
    <>
      <EdHead title={title} onBack={onBack} />
      <div style={{ ...S.card, padding: "22px 18px", textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--ember-tint)", color: "var(--ember-strong)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 18 }}>K</div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Coming in the next update</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{note}</div>
      </div>
    </>
  );
}

/* ---------- avatar crop + downscale modal ---------- */
function CropModal({ src, onCancel, onUse }: { src: string; onCancel: () => void; onUse: (f: File) => void }) {
  const FRAME = 264;
  const OUT = 512;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const busy = useRef(false);

  const cover = nat ? FRAME / Math.min(nat.w, nat.h) : 1;
  const scale = cover * zoom;
  const dispW = nat ? nat.w * scale : FRAME;
  const dispH = nat ? nat.h * scale : FRAME;

  const fit = (x: number, y: number, dw: number, dh: number) => ({ x: Math.min(0, Math.max(FRAME - dw, x)), y: Math.min(0, Math.max(FRAME - dh, y)) });

  function onLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const im = e.currentTarget, w = im.naturalWidth, h = im.naturalHeight;
    setNat({ w, h });
    const c = FRAME / Math.min(w, h);
    setOff({ x: (FRAME - w * c) / 2, y: (FRAME - h * c) / 2 });
  }
  function onZoom(z: number) {
    if (!nat) { setZoom(z); return; }
    const oldScale = cover * zoom, newScale = cover * z;
    const cx = (-off.x + FRAME / 2) / oldScale, cy = (-off.y + FRAME / 2) / oldScale;
    setZoom(z);
    setOff(fit(FRAME / 2 - cx * newScale, FRAME / 2 - cy * newScale, nat.w * newScale, nat.h * newScale));
  }
  function down(e: React.PointerEvent) { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setOff((o) => fit(o.x + dx, o.y + dy, dispW, dispH));
  }
  function up() { drag.current = null; }

  function use() {
    if (!nat || busy.current || !imgRef.current) return;
    busy.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) { busy.current = false; return; }
    const sx = -off.x / scale, sy = -off.y / scale, sSize = FRAME / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    canvas.toBlob((blob) => { busy.current = false; if (blob) onUse(new File([blob], "avatar.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,14,10,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...S.card, width: "100%", maxWidth: 360, padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 14, textAlign: "center" }}>Position your photo</div>
        <div style={{ width: FRAME, height: FRAME, margin: "0 auto", borderRadius: "50%", overflow: "hidden", position: "relative", background: "var(--surface-2)", touchAction: "none", cursor: "grab", border: "1px solid var(--line)" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <img ref={imgRef} src={src} alt="" onLoad={onLoad} draggable={false} style={{ position: "absolute", left: off.x, top: off.y, width: dispW, height: dispH, maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
        </div>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} style={{ width: "100%", margin: "16px 0 4px", accentColor: "var(--ember)" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text-2)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={use} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Use photo</button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("hub");
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try { setData(await profileGet()); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setCropSrc(URL.createObjectURL(f));
  }
  function closeCrop() { setCropSrc((s) => { if (s) URL.revokeObjectURL(s); return null; }); }
  async function onCropped(file: File) {
    closeCrop(); setUploading(true);
    try { setData(await uploadAvatar(file)); } catch (err) { setError((err as Error).message); } finally { setUploading(false); }
  }
  const pickPhoto = () => fileRef.current?.click();

  return (
    <Screen title={view === "hub" ? "Profile" : ""} error={error} loading={!data && !error}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      {cropSrc && <CropModal src={cropSrc} onCancel={closeCrop} onUse={onCropped} />}
      {data && view === "hub" && <Hub data={data} onOpen={setView} onPickPhoto={pickPhoto} uploading={uploading} />}
      {data && view === "basics" && <BasicsEditor data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} onPickPhoto={pickPhoto} uploading={uploading} />}
      {view === "health" && <HealthInterim onBack={() => setView("hub")} />}
      {view === "training" && <Soon title="Training Setup" onBack={() => setView("hub")} note="Training preferences, equipment & access, and injuries land here next." />}
      {view === "appprefs" && <Soon title="App Preferences" onBack={() => setView("hub")} note="Connected apps, reminders and quiet hours are on the way. Appearance is in the theme toggle up top for now." />}
    </Screen>
  );
}
