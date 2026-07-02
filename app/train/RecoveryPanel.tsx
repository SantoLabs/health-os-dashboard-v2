"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recoveryGet, planWeek, type RecMuscle, type RecMobility } from "../lib/api";

type Mode = "recovery" | "load";
type Ctx = { readiness: number | null; readiness_label: string | null; acwr: number | null } | null;

const MUS: Record<string, { label: string; aliases: string[] }> = {
  shoulders: { label: "Shoulders", aliases: ["Shoulders", "Front Delts", "Side Delts", "Rear Delts"] },
  chest: { label: "Chest", aliases: ["Chest", "Upper Chest", "Lower Chest"] },
  biceps: { label: "Biceps", aliases: ["Biceps"] },
  triceps: { label: "Triceps", aliases: ["Triceps"] },
  forearms: { label: "Forearms", aliases: ["Forearms", "Wrists"] },
  abdominals: { label: "Abs / Core", aliases: ["Core", "Abs", "Obliques", "Serratus"] },
  upper_back: { label: "Upper back", aliases: ["Upper Back", "Back"] },
  lats: { label: "Lats", aliases: ["Lats"] },
  traps: { label: "Traps", aliases: ["Traps", "Neck"] },
  lower_back: { label: "Lower back", aliases: ["Lower Back", "Spine"] },
  glutes: { label: "Glutes", aliases: ["Glutes", "Hips"] },
  quadriceps: { label: "Quads", aliases: ["Quads", "Hip Flexors"] },
  hamstrings: { label: "Hamstrings", aliases: ["Hamstrings"] },
  calves: { label: "Calves", aliases: ["Calves", "Ankles"] },
  adductors: { label: "Adductors", aliases: ["Adductors"] },
  abductors: { label: "Abductors", aliases: ["Abductors", "IT Band"] },
};

type Zone = { key: string; fig: "front" | "back"; cx: number; cy: number; rx: number; ry: number };
const ZONES: Zone[] = [
  { key: "shoulders", fig: "front", cx: 31, cy: 40, rx: 8, ry: 7 },
  { key: "shoulders", fig: "front", cx: 89, cy: 40, rx: 8, ry: 7 },
  { key: "chest", fig: "front", cx: 52, cy: 52, rx: 9, ry: 7 },
  { key: "chest", fig: "front", cx: 68, cy: 52, rx: 9, ry: 7 },
  { key: "biceps", fig: "front", cx: 27, cy: 62, rx: 6, ry: 11 },
  { key: "biceps", fig: "front", cx: 93, cy: 62, rx: 6, ry: 11 },
  { key: "abdominals", fig: "front", cx: 60, cy: 80, rx: 10, ry: 15 },
  { key: "adductors", fig: "front", cx: 60, cy: 122, rx: 5, ry: 14 },
  { key: "forearms", fig: "front", cx: 24, cy: 88, rx: 6, ry: 12 },
  { key: "forearms", fig: "front", cx: 96, cy: 88, rx: 6, ry: 12 },
  { key: "quadriceps", fig: "front", cx: 52, cy: 152, rx: 8, ry: 26 },
  { key: "quadriceps", fig: "front", cx: 68, cy: 152, rx: 8, ry: 26 },
  { key: "traps", fig: "back", cx: 60, cy: 36, rx: 12, ry: 7 },
  { key: "shoulders", fig: "back", cx: 31, cy: 42, rx: 7, ry: 6 },
  { key: "shoulders", fig: "back", cx: 89, cy: 42, rx: 7, ry: 6 },
  { key: "upper_back", fig: "back", cx: 60, cy: 54, rx: 13, ry: 9 },
  { key: "lats", fig: "back", cx: 48, cy: 70, rx: 7, ry: 12 },
  { key: "lats", fig: "back", cx: 72, cy: 70, rx: 7, ry: 12 },
  { key: "triceps", fig: "back", cx: 27, cy: 62, rx: 6, ry: 11 },
  { key: "triceps", fig: "back", cx: 93, cy: 62, rx: 6, ry: 11 },
  { key: "forearms", fig: "back", cx: 24, cy: 88, rx: 6, ry: 12 },
  { key: "forearms", fig: "back", cx: 96, cy: 88, rx: 6, ry: 12 },
  { key: "lower_back", fig: "back", cx: 60, cy: 92, rx: 9, ry: 8 },
  { key: "glutes", fig: "back", cx: 52, cy: 114, rx: 8, ry: 8 },
  { key: "glutes", fig: "back", cx: 68, cy: 114, rx: 8, ry: 8 },
  { key: "hamstrings", fig: "back", cx: 52, cy: 154, rx: 8, ry: 24 },
  { key: "hamstrings", fig: "back", cx: 68, cy: 154, rx: 8, ry: 24 },
  { key: "calves", fig: "back", cx: 52, cy: 198, rx: 7, ry: 16 },
  { key: "calves", fig: "back", cx: 68, cy: 198, rx: 7, ry: 16 },
];

function Leg({ c, t }: { c: string; t: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#8a90a6" }}><i style={{ width: 9, height: 9, borderRadius: 3, background: c, display: "inline-block" }} />{t}</span>;
}
function Stat({ v, l }: { v: string; l: string }) {
  return <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 6px", textAlign: "center" }}><div className="tnum" style={{ fontSize: 15, fontWeight: 800 }}>{v}</div><div className="subtle tiny" style={{ marginTop: 1 }}>{l}</div></div>;
}
function MobRow({ x }: { x: RecMobility }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}><span style={{ fontSize: 14 }}>🧘</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{x.name}</div><div className="subtle tiny">{[x.primary_muscle, x.default_prescription].filter(Boolean).join(" · ")}</div></div></div>;
}

export default function RecoveryPanel() {
  const router = useRouter();
  const [muscles, setMuscles] = useState<RecMuscle[]>([]);
  const [mobility, setMobility] = useState<RecMobility[]>([]);
  const [ctx, setCtx] = useState<Ctx>(null);
  const [mode, setMode] = useState<Mode>("recovery");
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    recoveryGet()
      .then((r) => { if (alive) { setMuscles(r.muscles || []); setMobility(r.mobility || []); } })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    planWeek<{ context?: { readiness: number | null; readiness_label: string | null; acwr: number | null } }>()
      .then((w) => { if (alive) setCtx(w.context || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const M: Record<string, RecMuscle> = {};
  muscles.forEach((m) => { M[m.muscle_group] = m; });

  function col(key: string): string {
    const m = M[key];
    if (!m) return "rgba(255,255,255,0.06)";
    if (mode === "recovery") return m.freshness >= 67 ? "#34d399" : m.freshness >= 34 ? "#fbbf24" : "#fb7185";
    return m.load_pct >= 80 ? "#fb7185" : m.load_pct >= 50 ? "#a274ff" : m.load_pct >= 20 ? "#5f7dff" : "rgba(130,140,170,0.35)";
  }

  const selKey = sel;
  const selM = selKey ? (M[selKey] || null) : null;
  const selAliases = selKey ? (MUS[selKey]?.aliases || []) : [];
  const selMob = selKey ? mobility.filter((x) => x.primary_muscle != null && selAliases.includes(x.primary_muscle)).slice(0, 6) : [];

  function figure(fig: "front" | "back", label: string) {
    return (
      <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
        <svg viewBox="0 0 120 250" style={{ width: "100%", maxWidth: 150, height: "auto" }}>
          <g fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.8}>
            <circle cx={60} cy={16} r={11} />
            <rect x={42} y={28} width={36} height={78} rx={14} />
            <rect x={20} y={34} width={13} height={62} rx={6} />
            <rect x={87} y={34} width={13} height={62} rx={6} />
            <rect x={44} y={100} width={32} height={18} rx={9} />
            <rect x={46} y={114} width={13} height={104} rx={6} />
            <rect x={61} y={114} width={13} height={104} rx={6} />
          </g>
          {ZONES.filter((z) => z.fig === fig).map((z, i) => (
            <ellipse key={i} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={col(z.key)} stroke={sel === z.key ? "#ffffff" : "rgba(0,0,0,0.28)"} strokeWidth={sel === z.key ? 1.6 : 0.5} style={{ cursor: "pointer" }} onClick={() => setSel(z.key)} />
          ))}
        </svg>
        <div className="subtle tiny" style={{ marginTop: 2 }}>{label}</div>
      </div>
    );
  }

  return (
    <div>
      {ctx && (ctx.readiness != null || ctx.acwr != null) ? (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "center", minWidth: 46 }}>
            <div className="tnum" style={{ fontSize: 24, fontWeight: 800, color: ctx.readiness != null && ctx.readiness < 40 ? "#fb7185" : ctx.readiness != null && ctx.readiness < 65 ? "#fbbf24" : "#34d399" }}>{ctx.readiness ?? "—"}</div>
            <div className="subtle tiny">readiness</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{ctx.readiness_label || "Recovery snapshot"}</div>
            <div className="subtle tiny" style={{ marginTop: 2 }}>{ctx.acwr != null ? `Training-load ratio (ACWR) ${ctx.acwr.toFixed(2)}` : "Based on your training recency and volume"}</div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Muscle map</div>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: 3 }}>
            {(["recovery", "load"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "capitalize", background: mode === m ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: mode === m ? "#fff" : "#8a90a6" }}>{m}</button>
            ))}
          </div>
        </div>
        {err ? <div className="subtle tiny" style={{ color: "#ff8a8a", marginBottom: 6 }}>{err}</div> : null}
        {loading ? <div className="muted center pad">Loading…</div> : (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              {figure("front", "Front")}
              {figure("back", "Back")}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {mode === "recovery" ? (
                <>
                  <Leg c="#fb7185" t="Fatigued" />
                  <Leg c="#fbbf24" t="Recovering" />
                  <Leg c="#34d399" t="Fresh" />
                </>
              ) : (
                <>
                  <Leg c="rgba(130,140,170,0.5)" t="Neglected" />
                  <Leg c="#5f7dff" t="Light" />
                  <Leg c="#a274ff" t="Heavy" />
                  <Leg c="#fb7185" t="Peak" />
                </>
              )}
            </div>
            <div className="subtle tiny" style={{ textAlign: "center", marginTop: 8, opacity: 0.7, lineHeight: 1.5 }}>Tap a muscle for detail. Derived from your training recency and volume — not soreness sensors.</div>
          </>
        )}
      </div>

      {selKey ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{MUS[selKey]?.label || selKey}</div>
            <button className="trn-sub" onClick={() => setSel(null)} style={{ padding: "4px 10px" }}>Close</button>
          </div>
          {selM ? (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Stat v={selM.days_ago != null ? (selM.days_ago === 0 ? "Today" : selM.days_ago + "d") : "—"} l="last trained" />
                <Stat v={selM.freshness + "%"} l="fresh" />
                <Stat v={selM.load_pct + "%"} l="load · 14d" />
              </div>
              <div className="subtle tiny" style={{ marginTop: 8 }}>{Math.round(selM.vol_14d).toLocaleString("en-US")} kg over the last 14 days · {selM.sets_14d} sets.</div>
            </>
          ) : (
            <div className="subtle tiny" style={{ marginTop: 8 }}>No strength work recorded here recently — fully recovered (and possibly under-trained).</div>
          )}
          {selMob.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Mobility for {MUS[selKey]?.label || selKey}</div>
              {selMob.map((x) => <MobRow key={x.name} x={x} />)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Suggested mobility and recovery</div>
        {mobility.length === 0 ? <div className="subtle tiny">Loading…</div> : mobility.slice(0, 8).map((x) => <MobRow key={x.name} x={x} />)}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>💚</span><div style={{ fontSize: 13, fontWeight: 700 }}>Something hurts?</div></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {["My right trap is sore", "Full-body stretch", "Post-run cooldown"].map((q) => (
            <button key={q} className="trn-sub" onClick={() => { try { window.sessionStorage.setItem("kai_seed", q); } catch { /* ignore */ } router.push("/more/ask"); }}>{q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
