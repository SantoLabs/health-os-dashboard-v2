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
  const meta = [id.age != null ? `${id.age} yrs` : null, id.height_cm != null ? `${id.height_cm} cm` : null, id.weight_kg != null ? `${Math.round(id.weight_kg * 10) / 10} kg` : null, id.home_city].filter(Boolean).join(" \u00b7 ");

  const basicsDone = !!(id.name && id.dob && id.height_cm);
  const healthDone = (data.goal_hierarchy || []).some((g) => g.tier === "primary");
  const trainingDone = !!(data.training_prefs.training_days?.length);
  const rem = data.reminders as { notify_workout?: boolean; notify_meal?: boolean; notify_bedtime?: boolean; quiet_start?: string | null };
  const appDone = !!(rem.notify_workout || rem.notify_meal || rem.notify_bedtime || rem.quiet_start);

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
      <SectionRow title="Health Setup" sub="Goals, priorities & sleep targets" tone={healthDone ? "done" : "todo"} chip={healthDone ? "DONE" : "SET UP"} onClick={() => onOpen("health")} />
      <SectionRow title="Training Setup" sub="Preferences, equipment & access, injuries" tone={trainingDone ? "done" : "todo"} chip={trainingDone ? "DONE" : "SET UP"} onClick={() => onOpen("training")} />
      <SectionRow title="App Preferences" sub="Connected apps, reminders & quiet hours" tone={appDone ? "done" : "todo"} chip={appDone ? "DONE" : "SET UP"} onClick={() => onOpen("appprefs")} />

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

/* ---------- goal setup: select + rank + hierarchy (P2, turn 15) ---------- */
const GOAL_CATS: { key: string; label: string; d: string }[] = [
  { key: "run", label: "Run", d: "M5 19l4-6 3 2 3-7M15 5.6a1.4 1.4 0 1 0 .01 0" },
  { key: "swim", label: "Swim", d: "M2 18c2 0 2 1.4 4 1.4S8 18 10 18s2 1.4 4 1.4S16 18 18 18s2 1.4 4 1.4M6 13l4-2 4 3M17 7.6a1.4 1.4 0 1 0 .01 0" },
  { key: "bike", label: "Bike", d: "M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M18.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M5.5 14l4-6h5l4 6M9.5 8h4" },
  { key: "triathlon", label: "Triathlon", d: "M8 8.5a2.6 2.6 0 1 0 .01 0M16 8.5a2.6 2.6 0 1 0 .01 0M12 16a2.6 2.6 0 1 0 .01 0" },
  { key: "strength", label: "Strength", d: "M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" },
  { key: "hyrox", label: "Hyrox", d: "M4 18h16l-1.5 3h-13zM7 13h10l1.2 5H5.8zM9 6h6l.8 7H8.2z" },
  { key: "body_comp", label: "Body comp", d: "M12 3.2a2.4 2.4 0 1 0 .01 0M8.5 21v-5.5l-1.8-3.6L9.5 10h5l2.8 1.9-1.8 3.6V21" },
  { key: "weight_loss", label: "Weight loss", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v8M8.5 12.5L12 16l3.5-3.5" },
  { key: "vo2max", label: "VO2 max", d: "M3 12h4l2 5 4-12 2 7h6" },
  { key: "lifestyle", label: "Lifestyle", d: "M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" },
  { key: "recovery", label: "Recovery", d: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM12 9.5v5M9.5 12h5" },
  { key: "medical", label: "Medical", d: "M6 3v5a4 4 0 0 0 8 0V3M10 15v1a4 4 0 0 0 8 0v-2M18 11.5a2 2 0 1 0 .01 0" },
  { key: "custom", label: "Custom", d: "M12 5v14M5 12h14" },
];
const CAT_BY_KEY: Record<string, { key: string; label: string; d: string }> = Object.fromEntries(GOAL_CATS.map((c) => [c.key, c]));
const catLabel = (k: string | null) => (k && CAT_BY_KEY[k] ? CAT_BY_KEY[k].label : "Goal");
const MAX_MAIN = 3;

type Chosen = { goalId: string | null; category: string; label: string };

function CatIcon({ d, color }: { d: string; color: string }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function TierPill({ rank }: { rank: number }) {
  const primary = rank === 1;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", background: primary ? "var(--ember-tint)" : "var(--surface-2)", color: primary ? "var(--ember-strong)" : "var(--muted)" }}>
      {primary ? "PRIMARY GOAL" : "SECONDARY GOAL"}
    </span>
  );
}

function HealthSetup({ data, onBack, onSaved, onData }: { data: ProfileData; onBack: () => void; onSaved: (d: ProfileData) => void; onData: (d: ProfileData) => void }) {
  const hier = data.goal_hierarchy || [];
  const tiered = hier.filter((g) => g.tier).slice().sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));

  const [step, setStep] = useState<"home" | "select" | "rank" | "saved">("home");
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [pickCat, setPickCat] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [bed, setBed] = useState<Bed | null>(null);
  const bedOrig = useRef<Bed | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    actionGet<Bed>("bedtime_goal").then((d) => { const b = { target_hour: d.target_hour, winddown_hour: d.winddown_hour, grace_hour: d.grace_hour }; setBed(b); bedOrig.current = b; }).catch(() => {});
  }, []);

  const clamp = (h: number) => Math.max(19, Math.min(26, Math.round(h * 4) / 4));
  const setBedK = (k: keyof Bed, v: number) => setBed((b) => (b ? { ...b, [k]: v } : b));
  const stepBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)", fontSize: 19, cursor: "pointer", lineHeight: 1 };
  const smallBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 14, lineHeight: 1 };
  const cta: React.CSSProperties = { width: "100%", padding: 14, borderRadius: 14, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 14.5, cursor: "pointer", boxShadow: "var(--shadow-pop)" };
  const hint: React.CSSProperties = { textAlign: "center", fontSize: 10.5, color: "var(--muted)", marginTop: 10 };

  /* ---- step 1: select ---- */
  const startFlow = () => {
    setChosen(tiered.map((g) => ({ goalId: g.id, category: g.category || "custom", label: g.label })));
    setLimitHit(false); setStep("select");
  };
  const isChosen = (cat: string) => chosen.some((c) => c.category === cat);
  const freeGoalsIn = (cat: string) => hier.filter((g) => (g.category || "custom") === cat && !chosen.some((c) => c.goalId === g.id));

  function tapCat(cat: string) {
    setLimitHit(false);
    if (isChosen(cat)) { setChosen((cs) => cs.filter((c) => c.category !== cat)); return; }
    if (chosen.length >= MAX_MAIN) { setLimitHit(true); return; }
    const existing = freeGoalsIn(cat);
    if (existing.length) { setPickCat(cat); return; }
    setChosen((cs) => [...cs, { goalId: null, category: cat, label: catLabel(cat) }]);
  }
  const attach = (cat: string, g: { id: string; label: string } | null) => {
    setChosen((cs) => [...cs, g ? { goalId: g.id, category: cat, label: g.label } : { goalId: null, category: cat, label: catLabel(cat) }]);
    setPickCat(null);
  };

  /* ---- step 2: rank ---- */
  const move = (i: number, dir: number) => setChosen((cs) => { const j = i + dir; if (j < 0 || j >= cs.length) return cs; const c = cs.slice(); const t = c[i]; c[i] = c[j]; c[j] = t; return c; });

  async function saveGoals() {
    setSaving(true); setErr(null);
    try {
      const payload = chosen.map((c, i) => ({ id: c.goalId ?? undefined, label: c.label, category: c.category, tier: i === 0 ? "primary" : "secondary", rank: i + 1 }));
      const d = await profileSave("goal_tiers_save", { goals: payload });
      onData(d); setStep("saved");
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  async function saveSleep() {
    setSaving(true); setErr(null);
    try {
      if (bed && bedOrig.current && (bed.target_hour !== bedOrig.current.target_hour || bed.winddown_hour !== bedOrig.current.winddown_hour || bed.grace_hour !== bedOrig.current.grace_hour)) {
        await actionPost("bedtime_target_save", bed); bedOrig.current = bed;
      }
      const d = await profileGet();
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const sleepRows: [string, string, () => void, () => void][] = bed ? [
    ["Target bedtime", fmtClock(bed.target_hour > 24 ? bed.target_hour - 24 : bed.target_hour), () => setBedK("target_hour", clamp(bed.target_hour - 0.25)), () => setBedK("target_hour", clamp(bed.target_hour + 0.25))],
    ["Wind-down start", fmtClock(bed.winddown_hour > 24 ? bed.winddown_hour - 24 : bed.winddown_hour), () => setBedK("winddown_hour", clamp(bed.winddown_hour - 0.25)), () => setBedK("winddown_hour", clamp(bed.winddown_hour + 0.25))],
    ["Grace window", `\u00b1 ${Math.round(bed.grace_hour * 60)} min`, () => setBedK("grace_hour", Math.max(0, Math.round((bed.grace_hour - 0.25) * 4) / 4)), () => setBedK("grace_hour", Math.min(1, Math.round((bed.grace_hour + 0.25) * 4) / 4))],
  ] : [];

  /* ================= STEP: SELECT ================= */
  if (step === "select") {
    return (
      <>
        <EdHead title="" onBack={() => setStep("home")} right={<span style={{ fontSize: 11, fontWeight: 800, color: "var(--ember-strong)" }}>{chosen.length} of {MAX_MAIN}</span>} />
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, color: "var(--text)" }}>What are you working toward?</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>Pick up to {MAX_MAIN} main goals. You{"\u2019"}ll rank them next.</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 18 }}>
          {GOAL_CATS.map((c) => {
            const on = isChosen(c.key);
            const custom = c.key === "custom";
            return (
              <button key={c.key} onClick={() => tapCat(c.key)} style={{ position: "relative", borderRadius: 16, padding: "12px 4px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer", textAlign: "center", background: on ? "var(--ember-tint)" : custom ? "transparent" : "var(--surface)", border: on ? "1.5px solid var(--ember)" : custom ? "1px dashed var(--line-2)" : "1px solid var(--line)" }}>
                {on && <span style={{ position: "absolute", top: 5, right: 5, width: 14, height: 14, borderRadius: 999, background: "var(--ember)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>}
                <CatIcon d={c.d} color={on ? "var(--ember-strong)" : custom ? "var(--muted)" : "var(--text-2)"} />
                <span style={{ fontSize: 9.5, fontWeight: on ? 800 : 700, color: on ? "var(--ember-strong)" : custom ? "var(--muted)" : "var(--text)", lineHeight: 1.2 }}>{c.label}</span>
              </button>
            );
          })}
        </div>

        {limitHit && <div style={{ marginTop: 14, background: "var(--surface-2)", borderRadius: 13, padding: "11px 14px", fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45 }}>That{"\u2019"}s your {MAX_MAIN}. You can add supporting goals later.</div>}

        {chosen.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={S.secLabel as React.CSSProperties}>Selected</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {chosen.map((c) => (
                <div key={c.category} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                  <CatIcon d={CAT_BY_KEY[c.category]?.d || ""} color="var(--ember-strong)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)", flex: "none" }}>{c.goalId ? "existing" : "new"}</span>
                  <button aria-label="Remove" onClick={() => setChosen((cs) => cs.filter((x) => x.category !== c.category))} style={{ ...smallBtn, color: "var(--danger)" }}>{"\u00d7"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{err}</div>}
        <div style={{ marginTop: 22 }}>
          <button onClick={() => setStep("rank")} disabled={!chosen.length} style={{ ...cta, opacity: chosen.length ? 1 : 0.5, cursor: chosen.length ? "pointer" : "default" }}>Continue {"\u00b7"} rank goals</button>
          <div style={hint}>You can change this later</div>
        </div>

        {pickCat && (
          <div className="sheet-back" onClick={() => setPickCat(null)}>
            <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <span className="sheet-title">{catLabel(pickCat)}</span>
                <button className="sheet-x" onClick={() => setPickCat(null)}>{"\u00d7"}</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", margin: "0 0 12px", lineHeight: 1.45 }}>You already have goals here. Pick one so Kai builds on it instead of starting a duplicate.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {freeGoalsIn(pickCat).map((g) => (
                  <button key={g.id} onClick={() => attach(pickCat, { id: g.id, label: g.label })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{g.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{g.target_date ? new Date(g.target_date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No date"}</span>
                    </span>
                    <Chevron />
                  </button>
                ))}
                <button onClick={() => attach(pickCat, null)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px dashed var(--line-2)", background: "transparent", color: "var(--ember-strong)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Create a new {catLabel(pickCat).toLowerCase()} goal</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ================= STEP: RANK ================= */
  if (step === "rank") {
    return (
      <>
        <EdHead title="" onBack={() => setStep("select")} />
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, color: "var(--text)" }}>Prioritize your goals</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>Kai will use this order when goals conflict.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
          {chosen.map((c, i) => (
            <div key={c.category} style={{ ...S.card, display: "flex", alignItems: "center", gap: 11, padding: "13px 13px", border: i === 0 ? "1.5px solid var(--ember)" : "1px solid var(--line)", background: i === 0 ? "var(--ember-tint)" : "var(--surface)" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: i === 0 ? "var(--ember)" : "var(--surface-2)", color: i === 0 ? "#fff" : "var(--muted)" }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                <span style={{ display: "block", marginTop: 3 }}><TierPill rank={i + 1} /></span>
              </span>
              <span style={{ display: "flex", gap: 6, flex: "none" }}>
                <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1 }}>{"\u2191"}</button>
                <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} style={{ ...smallBtn, opacity: i === chosen.length - 1 ? 0.4 : 1 }}>{"\u2193"}</button>
              </span>
            </div>
          ))}
        </div>

        <div style={{ ...S.card, padding: "13px 14px", marginTop: 16, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>How Kai uses this</div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
            If two goals conflict, Kai protects your primary goal first.
            {chosen.length > 1 ? ` With ${chosen[0].label} as primary, ${chosen[1].label} adapts around it rather than the other way round.` : ""}
          </div>
        </div>

        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{err}</div>}
        <div style={{ marginTop: 22 }}>
          <button onClick={saveGoals} disabled={saving} style={{ ...cta, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save goals"}</button>
          <div style={hint}>Use the arrows to reorder {"\u00b7"} change anytime</div>
        </div>
      </>
    );
  }

  /* ================= STEP: SAVED (confirmation) ================= */
  if (step === "saved") {
    const p = tiered[0], secs = tiered.slice(1);
    return (
      <>
        <div style={{ height: 8 }} />
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--success-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: "var(--text)" }}>Goals added</div>
        {p && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>{p.label} is now your primary goal.</div>}

        {p && (
          <div style={{ ...S.card, padding: "15px 15px", marginTop: 18, background: "var(--ember-tint)", border: "1.5px solid var(--ember)" }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: "var(--ember-strong)" }}>PRIMARY GOAL</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
              <CatIcon d={CAT_BY_KEY[p.category || "custom"]?.d || ""} color="var(--ember-strong)" />
              <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--text)" }}>{p.label}</span>
            </div>
          </div>
        )}

        {secs.length > 0 && (
          <>
            <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 20 }}>Secondary goals</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
              {secs.map((g) => (
                <div key={g.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 11, padding: "12px 13px" }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: "var(--surface-2)", color: "var(--muted)" }}>{g.rank}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ ...S.card, display: "flex", gap: 11, padding: "13px 14px", marginTop: 18, background: "var(--surface-2)" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>K</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>Kai will use your goal priority to personalize training, recovery, nutrition and weekly planning.</div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button onClick={() => setStep("home")} style={cta}>Done</button>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <a href="/more/goals" style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text-2)", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none" }}>View goals</a>
            <button onClick={startFlow} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text-2)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Edit goals</button>
          </div>
        </div>
      </>
    );
  }

  /* ================= STEP: HOME ================= */
  return (
    <>
      <EdHead title="Health Setup" onBack={onBack} right={<StatusChip tone={tiered.length ? "done" : "todo"} label={tiered.length ? "DONE" : "SET UP"} />} />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 2px" }}>
        <span style={S.secLabel as React.CSSProperties}>Goals</span>
        {tiered.length > 0 && <button onClick={startFlow} style={{ fontSize: 12, fontWeight: 800, color: "var(--ember-strong)", background: "none", border: "none", cursor: "pointer" }}>Edit</button>}
      </div>
      <div style={{ height: 10 }} />

      {tiered.length === 0 ? (
        <div style={{ ...S.card, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 5 }}>Tell Kai what you{"\u2019"}re working toward</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 14 }}>Pick up to {MAX_MAIN} main goals and rank them. Your primary goal drives the plan.</div>
          <button onClick={startFlow} style={{ ...cta, width: "auto", padding: "12px 22px" }}>Set up goals</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tiered.map((g, i) => (
            <div key={g.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 11, padding: "13px 13px", border: i === 0 ? "1.5px solid var(--ember)" : "1px solid var(--line)", background: i === 0 ? "var(--ember-tint)" : "var(--surface)" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: i === 0 ? "var(--ember)" : "var(--surface-2)", color: i === 0 ? "#fff" : "var(--muted)" }}>{g.rank ?? i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                <span style={{ display: "block", marginTop: 3 }}><TierPill rank={g.rank ?? i + 1} /></span>
              </span>
              <CatIcon d={CAT_BY_KEY[g.category || "custom"]?.d || ""} color={i === 0 ? "var(--ember-strong)" : "var(--muted)"} />
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "2px 2px 0" }}>Supporting goals arrive in the next update. Other goals you track live in More {"\u203a"} Goals.</div>
        </div>
      )}

      <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 22 }}>Sleep targets</div>
      <div style={{ height: 10 }} />
      {bed && (
        <div style={{ ...S.card, padding: 16 }}>
          {sleepRows.map(([label, disp, dec, inc]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: "var(--text-2)" }}>{label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button style={stepBtn} onClick={dec}>-</button>
                <span style={{ minWidth: 90, textAlign: "center", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{disp}</span>
                <button style={stepBtn} onClick={inc}>+</button>
              </span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>A night counts as on-time if you are asleep by your target plus the grace window.</div>
        </div>
      )}

      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{err}</div>}
      <button onClick={saveSleep} disabled={saving} style={{ width: "100%", margin: "18px 0 4px", padding: 14, borderRadius: 13, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save sleep targets"}</button>
    </>
  );
}

/* ---------- training setup editor (prefs + equipment + injuries) ---------- */
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const TIME_OPTS = [{ k: "morning", l: "Morning" }, { k: "midday", l: "Midday" }, { k: "evening", l: "Evening" }, { k: "flexible", l: "Flexible" }];
const STRENGTH_OPTS = [30, 45, 60, 75, 90, 120];
const CARDIO_OPTS = [30, 45, 60, 90, 120, 150, 180, 240];
const fmtSession = (m: number): string => (m < 60 ? m + " min" : m % 60 === 0 ? m / 60 + (m === 60 ? " hr" : " hrs") : Math.floor(m / 60) + "h " + (m % 60) + "m");
const CAT_ORDER = ["facility", "endurance", "home", "cardio"];
const CAT_LABEL: Record<string, string> = { facility: "Facilities", endurance: "Endurance gear", home: "Home equipment", cardio: "Cardio machines" };
const CAT_ICON: Record<string, string> = {
  facility: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  endurance: "M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11",
  home: "M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11",
  cardio: "M3 12h4l2 5 4-12 2 7h6",
};
const STATUS_LABEL: Record<string, string> = { active: "Active", managing: "Managing", recovered: "Recovered" };

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Toggle" style={{ width: 44, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "var(--ember)" : "var(--line-2)", position: "relative", flex: "none" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

function TrainingSetup({ data, onBack, onSaved }: { data: ProfileData; onBack: () => void; onSaved: (d: ProfileData) => void }) {
  const tp = data.training_prefs;
  const [days, setDays] = useState<number[]>(tp.training_days || []);
  const [ptime, setPtime] = useState<string | null>(tp.preferred_time);
  const [maxStrength, setMaxStrength] = useState<number | null>(tp.max_session_strength_min);
  const [maxCardio, setMaxCardio] = useState<number | null>(tp.max_session_cardio_min);
  const selStyle: React.CSSProperties = { ...S.input, padding: "11px 12px", fontSize: 14, cursor: "pointer" };
  const [skip, setSkip] = useState<boolean>(!!tp.skip_build_phase);
  const [selected, setSelected] = useState<string[]>(data.equipment.selected || []);
  const [sheetCat, setSheetCat] = useState<string | null>(null);
  type Inj = { id?: string; body_part: string; injury_type: string; status: string; note: string; date_resolved?: string | null };
  const [injuries, setInjuries] = useState<Inj[]>((data.injuries || []).map((x) => ({ id: x.id, body_part: x.body_part, injury_type: x.injury_type || "", status: x.status || "active", note: x.physio_note || "", date_resolved: x.date_resolved })));
  const [injEdit, setInjEdit] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const catalog = data.equipment.catalog || [];
  const byCat = (cat: string) => catalog.filter((e) => e.category === cat);
  const cats = CAT_ORDER.filter((c) => byCat(c).length);
  const selSet = new Set(selected);
  const toggleItem = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const groupSummary = (cat: string) => byCat(cat).filter((e) => selSet.has(e.item_key)).map((e) => e.label);
  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => a - b)));

  const setInj = (i: number, p: Partial<Inj>) => setInjuries((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const delInj = (i: number) => { setInjEdit(-1); setInjuries((xs) => xs.filter((_, k) => k !== i)); };
  const addInj = () => { setInjuries((xs) => [...xs, { body_part: "", injury_type: "", status: "active", note: "" }]); setInjEdit(injuries.length); };

  const smallBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 14, lineHeight: 1 };
  const seg = (on: boolean, tinted = true): React.CSSProperties => ({ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center", border: "1px solid " + (on ? "var(--ember)" : "var(--line)"), background: on ? (tinted ? "var(--ember-tint)" : "var(--ember)") : "var(--surface-2)", color: on ? (tinted ? "var(--ember-strong)" : "#fff") : "var(--text-2)" });

  async function save() {
    setSaving(true); setErr(null);
    try {
      await profileSave("training_prefs_save", { training_days: days, preferred_time: ptime, max_session_strength_min: maxStrength, max_session_cardio_min: maxCardio, skip_build_phase: skip });
      await profileSave("equipment_save", { selected });
      const today = new Date().toISOString().slice(0, 10);
      const d = await profileSave("injuries_save", { injuries: injuries.filter((x) => x.body_part.trim()).map((x) => ({ id: x.id, body_part: x.body_part.trim(), injury_type: x.injury_type.trim() || null, status: x.status, physio_note: x.note.trim() || null, date_resolved: x.status === "recovered" ? (x.date_resolved || today) : null })) });
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <>
      <EdHead title="Training Setup" onBack={onBack} right={<StatusChip tone={days.length ? "done" : "todo"} label={days.length ? "DONE" : "SET UP"} />} />

      <div style={S.secLabel as React.CSSProperties}>Preferences</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={S.fieldLabel}>Training days</label>
          <div style={{ display: "flex", gap: 6 }}>
            {DAY_LABELS.map((lab, idx) => { const d = idx + 1; const on = days.includes(d); return (
              <button key={idx} onClick={() => toggleDay(d)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: "1px solid " + (on ? "var(--ember)" : "var(--line)"), background: on ? "var(--ember)" : "var(--surface-2)", color: on ? "#fff" : "var(--text-2)" }}>{lab}</button>
            ); })}
          </div>
        </div>
        <div>
          <label style={S.fieldLabel}>Preferred time</label>
          <div style={{ display: "flex", gap: 6 }}>
            {TIME_OPTS.map((o) => (<button key={o.k} onClick={() => setPtime(ptime === o.k ? null : o.k)} style={seg(ptime === o.k)}>{o.l}</button>))}
          </div>
        </div>
        <div>
          <label style={S.fieldLabel}>Max session length</label>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 5 }}>Strength</div>
              <select value={maxStrength ?? ""} onChange={(e) => setMaxStrength(e.target.value ? Number(e.target.value) : null)} style={selStyle}>
                <option value="">Flexible</option>
                {STRENGTH_OPTS.map((m) => (<option key={m} value={m}>{fmtSession(m)}</option>))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 5 }}>Cardio</div>
              <select value={maxCardio ?? ""} onChange={(e) => setMaxCardio(e.target.value ? Number(e.target.value) : null)} style={selStyle}>
                <option value="">Flexible</option>
                {CARDIO_OPTS.map((m) => (<option key={m} value={m}>{fmtSession(m)}</option>))}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Skip build phase</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>Jump straight to peak work instead of a gradual base build.</div>
          </div>
          <Toggle on={skip} onClick={() => setSkip((s) => !s)} />
        </div>
      </div>

      <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 22 }}>Equipment & access</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {cats.map((cat, ci) => { const sel = groupSummary(cat); return (
          <button key={cat} onClick={() => setSheetCat(cat)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "transparent", border: "none", borderBottom: ci === cats.length - 1 ? "none" : "1px solid var(--line)", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, flex: "none", background: "var(--ember-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ember-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={CAT_ICON[cat]} /></svg></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{CAT_LABEL[cat]}</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--text-2)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.length ? sel.join(" \u00b7 ") : "None selected"}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
              {sel.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--success)" }}>{sel.length}</span>}
              <Chevron />
            </span>
          </button>
        ); })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "8px 2px 0" }}>Tap a group to pick items in a sheet.</div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "22px 2px 0" }}>
        <span style={S.secLabel as React.CSSProperties}>Injuries</span>
        <button onClick={addInj} style={{ fontSize: 12, fontWeight: 800, color: "var(--ember-strong)", background: "none", border: "none", cursor: "pointer" }}>+ Add</button>
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {injuries.map((x, i) => (
          <div key={i} style={{ ...S.card, padding: "12px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", background: x.status === "recovered" ? "var(--success-tint)" : "var(--ember-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={x.status === "recovered" ? "var(--success)" : "var(--ember-strong)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{x.status === "recovered" ? <path d="M4 12l5 5 11-11" /> : <path d="M12 8v5M12 16v.01" />}</svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(x.body_part || "New injury") + (x.injury_type ? " - " + x.injury_type : "")}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>{STATUS_LABEL[x.status] || x.status}{x.note ? " \u00b7 " + x.note : ""}</div>
              </div>
              <button aria-label="Edit" onClick={() => setInjEdit(injEdit === i ? -1 : i)} style={smallBtn}>{"\u270e"}</button>
              <button aria-label="Delete" onClick={() => delInj(i)} style={{ ...smallBtn, color: "var(--danger)" }}>{"\u00d7"}</button>
            </div>
            {injEdit === i && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <input style={S.input} value={x.body_part} onChange={(e) => setInj(i, { body_part: e.target.value })} placeholder="Body part (e.g. Left knee)" />
                <input style={S.input} value={x.injury_type} onChange={(e) => setInj(i, { injury_type: e.target.value })} placeholder="Type (e.g. runner's knee)" />
                <div style={{ display: "flex", gap: 6 }}>
                  {([["active", "Active"], ["managing", "Managing"], ["recovered", "Recovered"]] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setInj(i, { status: k })} style={seg(x.status === k)}>{l}</button>
                  ))}
                </div>
                <input style={S.input} value={x.note} onChange={(e) => setInj(i, { note: e.target.value })} placeholder="Note (optional)" />
              </div>
            )}
          </div>
        ))}
        {!injuries.length && <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "2px 2px 4px" }}>No injuries logged. Add one so Kai can plan around it.</div>}
      </div>

      <div style={{ ...S.card, display: "flex", gap: 11, padding: "13px 14px", margin: "18px 0 0", background: "var(--ember-tint)" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>K</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>Your days, gear and injury flags shape every session Kai plans - workouts fit the equipment you have and route around what hurts.</div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{err}</div>}
      <button onClick={save} disabled={saving} style={{ width: "100%", margin: "18px 0 4px", padding: 14, borderRadius: 13, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save Training Setup"}</button>

      {sheetCat && (
        <div className="sheet-back" onClick={() => setSheetCat(null)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <span className="sheet-title">{CAT_LABEL[sheetCat]}</span>
              <button className="sheet-x" onClick={() => setSheetCat(null)}>{"\u00d7"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
              {byCat(sheetCat).map((e) => { const on = selSet.has(e.item_key); return (
                <button key={e.item_key} onClick={() => toggleItem(e.item_key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 12, border: "1px solid " + (on ? "var(--ember)" : "var(--line)"), background: on ? "var(--ember-tint)" : "var(--surface)", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? "var(--ember-strong)" : "var(--text)" }}>{e.label}</span>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--ember)" : "transparent", border: on ? "none" : "1.5px solid var(--line-2)" }}>{on ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> : null}</span>
                </button>
              ); })}
            </div>
            <button onClick={() => setSheetCat(null)} style={{ width: "100%", marginTop: 12, padding: 13, borderRadius: 12, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- app preferences editor (connected apps + reminders + general) ---------- */
const APP_META: Record<string, { c: string }> = {
  garmin: { c: "#007CC3" }, strava: { c: "#FC4C02" }, hevy: { c: "#1B2A4A" }, withings: { c: "#00B2A9" }, calendar: { c: "#4285F4" },
};
function relSync(iso: string | null): string {
  if (!iso) return "Not connected";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000), hr = Math.floor(min / 60), day = Math.floor(hr / 24);
  if (day > 0) return "Synced " + day + (day === 1 ? " day ago" : " days ago");
  if (hr > 0) return "Synced " + hr + (hr === 1 ? " hr ago" : " hrs ago");
  if (min > 0) return "Synced " + min + " min ago";
  return "Synced just now";
}

// Applies the appearance choice to the live theme, matching the top ThemeToggle
// (localStorage key "strive-theme", data-theme on <html>). "system" clears the
// override and resolves from the OS preference.
function applyAppearance(mode: string) {
  if (typeof document === "undefined") return;
  let theme = mode;
  if (mode === "system") {
    theme = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  try {
    if (mode === "system") localStorage.removeItem("strive-theme");
    else localStorage.setItem("strive-theme", theme);
  } catch { /* ignore */ }
}

function AppPrefsEditor({ data, onBack, onSaved }: { data: ProfileData; onBack: () => void; onSaved: (d: ProfileData) => void }) {
  const r0 = data.reminders as { notify_workout?: boolean; notify_meal?: boolean; notify_bedtime?: boolean; quiet_start?: string | null; quiet_end?: string | null };
  const a0 = data.app_prefs as { appearance?: string; week_start?: string };
  const [nWorkout, setNWorkout] = useState(!!r0.notify_workout);
  const [nMeal, setNMeal] = useState(!!r0.notify_meal);
  const [nBed, setNBed] = useState(!!r0.notify_bedtime);
  const [quietOn, setQuietOn] = useState<boolean>(!!(r0.quiet_start && r0.quiet_end));
  const [qStart, setQStart] = useState<string>((r0.quiet_start as string) || "22:00");
  const [qEnd, setQEnd] = useState<string>((r0.quiet_end as string) || "07:00");
  const [appearance, setAppearance] = useState<string>(a0.appearance || "system");
  const [weekStart, setWeekStart] = useState<string>(a0.week_start || "monday");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "center", border: "1px solid " + (on ? "var(--ember)" : "var(--line)"), background: on ? "var(--ember-tint)" : "var(--surface-2)", color: on ? "var(--ember-strong)" : "var(--text-2)" });

  async function save() {
    setSaving(true); setErr(null);
    try {
      await profileSave("reminders_save", { notify_workout: nWorkout, notify_meal: nMeal, notify_bedtime: nBed, quiet_start: quietOn ? qStart : null, quiet_end: quietOn ? qEnd : null });
      const d = await profileSave("app_prefs_save", { appearance, week_start: weekStart });
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const remRow = (label: string, on: boolean, set: (v: boolean) => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 15px", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <Toggle on={on} onClick={() => set(!on)} />
    </div>
  );

  return (
    <>
      <EdHead title="App Preferences" onBack={onBack} right={<StatusChip tone={(nWorkout || nMeal || nBed || quietOn) ? "done" : "todo"} label={(nWorkout || nMeal || nBed || quietOn) ? "DONE" : "SET UP"} />} />

      <div style={S.secLabel as React.CSSProperties}>Connected apps</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {data.connected_apps.map((app, i) => { const m = APP_META[app.key] || { c: "var(--ember)" }; return (
          <div key={app.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", borderBottom: i === data.connected_apps.length - 1 ? "none" : "1px solid var(--line)" }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, flex: "none", background: m.c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>{app.label.charAt(0)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{app.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>{app.desc}</div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 999, whiteSpace: "nowrap", background: app.connected ? "var(--success-tint)" : "var(--surface-2)", color: app.connected ? "var(--success)" : "var(--muted)" }}>{app.connected ? relSync(app.last_synced) : "Not connected"}</span>
          </div>
        ); })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "8px 2px 0" }}>Connect and disconnect controls are coming - for now this shows live sync status.</div>

      <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 22 }}>Reminders</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {remRow("Workout reminders", nWorkout, setNWorkout)}
        {remRow("Meal logging nudges", nMeal, setNMeal)}
        {remRow("Bedtime wind-down", nBed, setNBed)}
        <div style={{ padding: "13px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>Quiet hours</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>No notifications in this window</div>
            </div>
            <Toggle on={quietOn} onClick={() => setQuietOn((v) => !v)} />
          </div>
          {quietOn && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <input type="time" value={qStart} onChange={(e) => setQStart(e.target.value)} style={{ ...S.input, width: "auto", flex: 1, padding: "10px 12px", fontSize: 14 }} />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>to</span>
              <input type="time" value={qEnd} onChange={(e) => setQEnd(e.target.value)} style={{ ...S.input, width: "auto", flex: 1, padding: "10px 12px", fontSize: 14 }} />
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "8px 2px 0" }}>Your choices are saved now. Nudge delivery arrives with notifications support.</div>

      <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 22 }}>General</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={S.fieldLabel}>Appearance</label>
          <div style={{ display: "flex", gap: 6 }}>
            {([["system", "System"], ["light", "Light"], ["dark", "Dark"]] as [string, string][]).map(([k, l]) => (<button key={k} onClick={() => { setAppearance(k); applyAppearance(k); }} style={seg(appearance === k)}>{l}</button>))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Changes the theme right away and stays in sync with the quick toggle up top. Save to remember it.</div>
        </div>
        <div>
          <label style={S.fieldLabel}>Week starts on</label>
          <div style={{ display: "flex", gap: 6 }}>
            {([["monday", "Monday"], ["sunday", "Sunday"]] as [string, string][]).map(([k, l]) => (<button key={k} onClick={() => setWeekStart(k)} style={seg(weekStart === k)}>{l}</button>))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{err}</div>}
      <button onClick={save} disabled={saving} style={{ width: "100%", margin: "18px 0 4px", padding: 14, borderRadius: 13, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save App Preferences"}</button>
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
      {data && view === "health" && <HealthSetup data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} onData={setData} />}
      {data && view === "training" && <TrainingSetup data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} />}
      {data && view === "appprefs" && <AppPrefsEditor data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} />}
    </Screen>
  );
}
