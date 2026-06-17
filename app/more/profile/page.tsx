"use client";

import { useEffect, useState, useCallback } from "react";
import { actionGet, actionPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Bed = { target_hour: number; winddown_hour: number; grace_hour: number };

function fmtClock(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 && hh < 24 ? "PM" : "AM";
  let h12 = hh % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

const btn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)", color: "var(--fg)", fontSize: 18, cursor: "pointer", lineHeight: 1,
};

function Stepper({ label, display, onDec, onInc }: { label: string; display: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className="lever-top" style={{ marginBottom: 16 }}>
      <span className="subtle">{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button style={btn} onClick={onDec}>−</button>
        <span style={{ minWidth: 92, textAlign: "center", fontWeight: 600, fontSize: 15 }}>{display}</span>
        <button style={btn} onClick={onInc}>+</button>
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const [orig, setOrig] = useState<Bed | null>(null);
  const [bed, setBed] = useState<Bed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await actionGet<Bed>("bedtime_goal");
      const b = { target_hour: d.target_hour, winddown_hour: d.winddown_hour, grace_hour: d.grace_hour };
      setBed(b); setOrig(b);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const clamp = (h: number) => Math.max(19, Math.min(26, Math.round(h * 4) / 4));
  const set = (k: keyof Bed, v: number) => { setBed((b) => (b ? { ...b, [k]: v } : b)); setSaved(false); };
  const dirty = bed && orig && (bed.target_hour !== orig.target_hour || bed.winddown_hour !== orig.winddown_hour || bed.grace_hour !== orig.grace_hour);

  async function save() {
    if (!bed) return;
    setSaving(true);
    try {
      await actionPost("bedtime_target_save", bed);
      setOrig(bed); setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Screen title="Profile" back="/more" error={error} loading={!bed && !error}>
      {bed && (
        <>
          <h2 className="section-title">Sleep targets</h2>
          <section className="card">
            <Stepper label="Target bedtime" display={fmtClock(bed.target_hour > 24 ? bed.target_hour - 24 : bed.target_hour)}
              onDec={() => set("target_hour", clamp(bed.target_hour - 0.25))}
              onInc={() => set("target_hour", clamp(bed.target_hour + 0.25))} />
            <Stepper label="Wind-down start" display={fmtClock(bed.winddown_hour > 24 ? bed.winddown_hour - 24 : bed.winddown_hour)}
              onDec={() => set("winddown_hour", clamp(bed.winddown_hour - 0.25))}
              onInc={() => set("winddown_hour", clamp(bed.winddown_hour + 0.25))} />
            <Stepper label="Grace window" display={`± ${Math.round(bed.grace_hour * 60)} min`}
              onDec={() => set("grace_hour", Math.max(0, Math.round((bed.grace_hour - 0.25) * 4) / 4))}
              onInc={() => set("grace_hour", Math.min(1, Math.round((bed.grace_hour + 0.25) * 4) / 4))} />
            <div className="subtle tiny" style={{ marginBottom: 14 }}>
              A night counts as on-time if you&apos;re asleep by your target plus the grace window. Wind-down is your nudge to start slowing down.
            </div>
            <button onClick={save} disabled={!dirty || saving}
              style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: dirty ? "#34d399" : "rgba(255,255,255,0.08)", color: dirty ? "#04291d" : "var(--muted)", fontWeight: 700, fontSize: 14, cursor: dirty ? "pointer" : "default" }}>
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save targets"}
            </button>
          </section>
          <div className="subtle tiny" style={{ textAlign: "center" }}>Weekday vs weekend split is coming next.</div>
        </>
      )}
    </Screen>
  );
}
