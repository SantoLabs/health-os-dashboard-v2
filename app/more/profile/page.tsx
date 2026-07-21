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
      <SectionRow title="Health Setup" sub="Health Mode, goals & sleep targets" tone={healthDone ? "done" : "todo"} chip={healthDone ? "DONE" : "SET UP"} onClick={() => onOpen("health")} />
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

/* ---------- health setup editor (mode + goals + sleep) ---------- */
type Goal = { id?: string; title: string; detail: string; kind: string };
const MODES = [
  { key: "performance", label: "Performance", sub: "Train to compete" },
  { key: "longevity", label: "Longevity", sub: "Health-first" },
  { key: "recomp", label: "Recomp", sub: "Body change" },
];
const GOAL_PRESETS = ["Marathon", "Hyrox", "10k PR", "VO2 max", "Body fat %"];

function HealthSetup({ data, onBack, onSaved }: { data: ProfileData; onBack: () => void; onSaved: (d: ProfileData) => void }) {
  const [primary, setPrimary] = useState<string | null>(data.health_mode.primary);
  const [goals, setGoals] = useState<Goal[]>((data.goals || []).map((g) => ({ id: g.id, title: g.title, kind: g.kind || "custom", detail: String((g.target_json as { detail?: string })?.detail || "") })));
  const [editIdx, setEditIdx] = useState(-1);
  const [adding, setAdding] = useState(false);
  const [dTitle, setDTitle] = useState("");
  const [dDetail, setDDetail] = useState("");
  const [bed, setBed] = useState<Bed | null>(null);
  const bedOrig = useRef<Bed | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    actionGet<Bed>("bedtime_goal").then((d) => { const b = { target_hour: d.target_hour, winddown_hour: d.winddown_hour, grace_hour: d.grace_hour }; setBed(b); bedOrig.current = b; }).catch(() => {});
  }, []);

  const move = (i: number, dir: number) => setGoals((gs) => { const j = i + dir; if (j < 0 || j >= gs.length) return gs; const c = gs.slice(); const t = c[i]; c[i] = c[j]; c[j] = t; return c; });
  const del = (i: number) => { setEditIdx(-1); setGoals((gs) => gs.filter((_, k) => k !== i)); };
  const patch = (i: number, p: Partial<Goal>) => setGoals((gs) => gs.map((g, k) => (k === i ? { ...g, ...p } : g)));
  const addGoal = () => { const t = dTitle.trim(); if (!t) return; setGoals((gs) => [...gs, { title: t, detail: dDetail.trim(), kind: "custom" }]); setDTitle(""); setDDetail(""); setAdding(false); };

  const clamp = (h: number) => Math.max(19, Math.min(26, Math.round(h * 4) / 4));
  const setBedK = (k: keyof Bed, v: number) => setBed((b) => (b ? { ...b, [k]: v } : b));
  const stepBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)", fontSize: 19, cursor: "pointer", lineHeight: 1 };
  const smallBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 14, lineHeight: 1 };

  async function save() {
    setSaving(true); setErr(null);
    try {
      await profileSave("health_mode_save", { health_mode_primary: primary });
      const d = await profileSave("goals_save", { goals: goals.map((g, i) => ({ id: g.id, title: g.title.trim(), kind: g.kind, target_json: g.detail.trim() ? { detail: g.detail.trim() } : {}, priority: i })) });
      if (bed && bedOrig.current && (bed.target_hour !== bedOrig.current.target_hour || bed.winddown_hour !== bedOrig.current.winddown_hour || bed.grace_hour !== bedOrig.current.grace_hour)) {
        await actionPost("bedtime_target_save", bed); bedOrig.current = bed;
      }
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const sleepRows: [string, string, () => void, () => void][] = bed ? [
    ["Target bedtime", fmtClock(bed.target_hour > 24 ? bed.target_hour - 24 : bed.target_hour), () => setBedK("target_hour", clamp(bed.target_hour - 0.25)), () => setBedK("target_hour", clamp(bed.target_hour + 0.25))],
    ["Wind-down start", fmtClock(bed.winddown_hour > 24 ? bed.winddown_hour - 24 : bed.winddown_hour), () => setBedK("winddown_hour", clamp(bed.winddown_hour - 0.25)), () => setBedK("winddown_hour", clamp(bed.winddown_hour + 0.25))],
    ["Grace window", `\u00b1 ${Math.round(bed.grace_hour * 60)} min`, () => setBedK("grace_hour", Math.max(0, Math.round((bed.grace_hour - 0.25) * 4) / 4)), () => setBedK("grace_hour", Math.min(1, Math.round((bed.grace_hour + 0.25) * 4) / 4))],
  ] : [];

  return (
    <>
      <EdHead title="Health Setup" onBack={onBack} />

      <div style={S.secLabel as React.CSSProperties}>Health Mode</div>
      <div style={{ height: 10 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {MODES.map((m) => {
          const on = primary === m.key;
          return (
            <button key={m.key} onClick={() => setPrimary(m.key)} style={{ flex: 1, borderRadius: 16, padding: "13px 8px", textAlign: "center", cursor: "pointer", border: "1px solid " + (on ? "var(--text)" : "var(--line)"), background: on ? "var(--text)" : "var(--surface)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: on ? "var(--surface)" : "var(--text-2)" }}>{m.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: on ? "var(--surface-2)" : "var(--muted)" }}>{m.sub}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 2px" }}>
        <span style={S.secLabel as React.CSSProperties}>{"Goals & targets"}</span>
        <span style={{ fontSize: 10.5, color: "var(--muted)" }}>Priority order</span>
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {goals.map((g, i) => (
          <div key={i} style={{ ...S.card, padding: "12px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: i === 0 ? "var(--ember)" : "var(--surface-2)", color: i === 0 ? "#fff" : "var(--muted)" }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title || "Untitled goal"}</div>
                {g.detail && <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 1 }}>{g.detail}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...smallBtn, opacity: i === 0 ? 0.4 : 1 }}>{"\u2191"}</button>
                <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === goals.length - 1} style={{ ...smallBtn, opacity: i === goals.length - 1 ? 0.4 : 1 }}>{"\u2193"}</button>
                <button aria-label="Edit" onClick={() => setEditIdx(editIdx === i ? -1 : i)} style={smallBtn}>{"\u270e"}</button>
                <button aria-label="Delete" onClick={() => del(i)} style={{ ...smallBtn, color: "var(--danger)" }}>{"\u00d7"}</button>
              </div>
            </div>
            {editIdx === i && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <input style={S.input} value={g.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Goal" />
                <input style={S.input} value={g.detail} onChange={(e) => patch(i, { detail: e.target.value })} placeholder="Detail (optional)" />
              </div>
            )}
          </div>
        ))}
        {!goals.length && !adding && <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "2px 2px 4px" }}>No goals yet. Add what you are working toward - priority 1 shapes your plan.</div>}
      </div>

      {adding ? (
        <div style={{ ...S.card, padding: 13, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={S.input} value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="Goal (e.g. Ironman 70.3)" />
          <input style={S.input} value={dDetail} onChange={(e) => setDDetail(e.target.value)} placeholder="Detail (optional)" />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {GOAL_PRESETS.map((p) => (
              <button key={p} onClick={() => setDTitle(p)} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>{p}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
            <button onClick={() => { setAdding(false); setDTitle(""); setDDetail(""); }} style={{ flex: 1, padding: 11, borderRadius: 11, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text-2)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Cancel</button>
            <button onClick={addGoal} disabled={!dTitle.trim()} style={{ flex: 1, padding: 11, borderRadius: 11, border: "none", background: dTitle.trim() ? "var(--ember)" : "var(--surface-2)", color: dTitle.trim() ? "#fff" : "var(--muted)", fontWeight: 800, fontSize: 13.5, cursor: dTitle.trim() ? "pointer" : "default" }}>Add goal</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: 10, width: "100%", padding: 11, borderRadius: 12, border: "1px dashed var(--line-2)", background: "transparent", color: "var(--ember-strong)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add goal</button>
      )}

      <div style={{ ...S.card, display: "flex", gap: 11, padding: "13px 14px", margin: "18px 0 0", background: "var(--ember-tint)" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>K</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>Priority 1 drives your plan - Kai builds around it and rebalances when your mode changes. Nothing is lost.</div>
      </div>

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
      <button onClick={save} disabled={saving} style={{ width: "100%", margin: "18px 0 4px", padding: 14, borderRadius: 13, border: "none", background: "var(--ember)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving\u2026" : "Save Health Setup"}</button>
    </>
  );
}

/* ---------- training setup editor (prefs + equipment + injuries) ---------- */
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const TIME_OPTS = [{ k: "morning", l: "Morning" }, { k: "midday", l: "Midday" }, { k: "evening", l: "Evening" }, { k: "flexible", l: "Flexible" }];
const SESSION_OPTS = [30, 45, 60, 75, 90, 120];
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
  const [maxMin, setMaxMin] = useState<number | null>(tp.max_session_min);
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
      await profileSave("training_prefs_save", { training_days: days, preferred_time: ptime, max_session_min: maxMin, skip_build_phase: skip });
      await profileSave("equipment_save", { selected });
      const today = new Date().toISOString().slice(0, 10);
      const d = await profileSave("injuries_save", { injuries: injuries.filter((x) => x.body_part.trim()).map((x) => ({ id: x.id, body_part: x.body_part.trim(), injury_type: x.injury_type.trim() || null, status: x.status, physio_note: x.note.trim() || null, date_resolved: x.status === "recovered" ? (x.date_resolved || today) : null })) });
      onSaved(d);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <>
      <EdHead title="Training Setup" onBack={onBack} />

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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SESSION_OPTS.map((m) => (<button key={m} onClick={() => setMaxMin(maxMin === m ? null : m)} style={{ ...seg(maxMin === m), flex: "1 0 28%" }}>{m} min</button>))}
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
      <EdHead title="App Preferences" onBack={onBack} />

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

      <div style={{ ...(S.secLabel as React.CSSProperties), marginTop: 22 }}>General</div>
      <div style={{ height: 10 }} />
      <div style={{ ...S.card, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={S.fieldLabel}>Appearance</label>
          <div style={{ display: "flex", gap: 6 }}>
            {([["system", "System"], ["light", "Light"], ["dark", "Dark"]] as [string, string][]).map(([k, l]) => (<button key={k} onClick={() => setAppearance(k)} style={seg(appearance === k)}>{l}</button>))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Saved as your preference. The quick toggle up top still controls the live theme.</div>
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
      {data && view === "health" && <HealthSetup data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} />}
      {data && view === "training" && <TrainingSetup data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} />}
      {data && view === "appprefs" && <AppPrefsEditor data={data} onBack={() => setView("hub")} onSaved={(d) => { setData(d); setView("hub"); }} />}
    </Screen>
  );
}
