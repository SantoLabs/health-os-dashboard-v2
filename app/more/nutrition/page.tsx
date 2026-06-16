"use client";

import { useEffect, useState, useCallback } from "react";
import { actionGet, actionPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Target = { n: number; raw: string } | null;
type Meal = {
  id: string; meal_type: string | null; description: string | null;
  calories: number | null; protein_g: number | null; carbs_g: number | null;
  fat_g: number | null; fiber_g: number | null; water_ml: number | null;
  confidence: string | null; source: string | null; created_at: string;
};
type Estimate = {
  calories: number | null; protein_g: number | null; carbs_g: number | null;
  fat_g: number | null; fiber_g: number | null; confidence: string; assumptions: string;
  items: { name: string; calories?: number }[];
};
type Day = {
  date: string;
  targets: { calories: Target; protein: Target; carbs: Target; fats: Target; fiber: Target; water: Target; basis: string };
  totals: { calories: number; protein: number; carbs: number; fats: number; fiber: number; water: number };
  meals: Meal[];
};

function ProteinRing({ have, goal }: { have: number; goal: number | null }) {
  const pct = goal ? Math.max(0, Math.min(1, have / goal)) : 0;
  const r = 54, C = 2 * Math.PI * r;
  const hit = goal != null && have >= goal;
  const color = hit ? "#34d399" : pct >= 0.6 ? "#fbbf24" : "#f472b6";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg viewBox="0 0 130 130" width="120" height="120" style={{ flexShrink: 0 }}>
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 65 65)" />
        <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--fg)">{Math.round(have)}</text>
        <text x="65" y="80" textAnchor="middle" fontSize="12" fill="var(--muted)">{goal ? `/ ${goal}g` : "g"}</text>
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Protein</div>
        {goal != null ? (
          hit
            ? <div className="pill ok" style={{ marginTop: 6 }}>Goal hit 💪</div>
            : <div className="subtle" style={{ marginTop: 4 }}><strong style={{ color: "var(--fg)", fontSize: 18 }}>{Math.max(0, Math.round(goal - have))}g</strong> to go</div>
        ) : <div className="subtle tiny" style={{ marginTop: 4 }}>No target set</div>}
        <div className="subtle tiny" style={{ marginTop: 6 }}>Your binding constraint for the recomp goal — veg, no eggs/whey.</div>
      </div>
    </div>
  );
}

function MacroBar({ label, have, target, unit }: { label: string; have: number; target: number | null; unit: string }) {
  const pct = target ? Math.max(0, Math.min(1, have / target)) : 0;
  const over = target != null && have > target * 1.05;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="lever-top" style={{ marginBottom: 4 }}>
        <span className="subtle">{label}</span>
        <span className="tiny"><strong>{Math.round(have)}</strong>{target ? <span className="subtle"> / {target}{unit}</span> : <span className="subtle">{unit}</span>}</span>
      </div>
      <div className="track"><div className="fill" style={{ width: `${pct * 100}%`, background: over ? "#f87171" : undefined }} /></div>
    </div>
  );
}

export default function NutritionPage() {
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estErr, setEstErr] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [logging, setLogging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setDay(await actionGet<Day>("nutrition")); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function onEstimate() {
    if (!text.trim()) return;
    setEstimating(true); setEstErr(null); setEstimate(null);
    try {
      const res = await actionPost<{ ok: boolean; estimate?: Estimate; error?: string }>("nutrition_estimate", { description: text.trim() });
      if (res.ok && res.estimate) setEstimate(res.estimate);
      else setEstErr(res.error || "Couldn't estimate that — try adding a bit more detail.");
    } catch (e) { setEstErr((e as Error).message); }
    finally { setEstimating(false); }
  }

  async function onLog() {
    if (!estimate) return;
    setLogging(true);
    try {
      const res = await actionPost<{ ok: boolean; day: Day }>("nutrition_log", {
        description: text.trim(), source: "ai", confidence: estimate.confidence, ai_note: estimate.assumptions,
        calories: estimate.calories, protein_g: estimate.protein_g, carbs_g: estimate.carbs_g,
        fat_g: estimate.fat_g, fiber_g: estimate.fiber_g,
      });
      if (res.day) setDay(res.day);
      setText(""); setEstimate(null);
    } catch (e) { setEstErr((e as Error).message); }
    finally { setLogging(false); }
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await actionPost<{ ok: boolean; day: Day }>("nutrition_delete", { id });
      if (res.day) setDay(res.day);
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  const t = day?.targets, tot = day?.totals;

  return (
    <Screen title="Nutrition" back="/more" error={error} loading={!day && !error}>
      {day && t && tot && (
        <>
          <section className="card">
            <ProteinRing have={tot.protein} goal={t.protein?.n ?? null} />
          </section>

          <section className="card">
            <MacroBar label="Calories" have={tot.calories} target={t.calories?.n ?? null} unit=" kcal" />
            <MacroBar label="Carbs" have={tot.carbs} target={t.carbs?.n ?? null} unit="g" />
            <MacroBar label="Fats" have={tot.fats} target={t.fats?.n ?? null} unit="g" />
            <MacroBar label="Fiber" have={tot.fiber} target={t.fiber?.n ?? null} unit="g" />
          </section>

          <h2 className="section-title">Quick log</h2>
          <section className="card">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did you eat? e.g. 2 rotis, dal, paneer bhurji, a glass of milk"
              rows={2}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "var(--fg)", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
            />
            {!estimate && (
              <button onClick={onEstimate} disabled={estimating || !text.trim()}
                style={{ marginTop: 10, width: "100%", padding: "11px", borderRadius: 10, border: "none", background: text.trim() ? "var(--accent, #6366f1)" : "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: text.trim() ? "pointer" : "default" }}>
                {estimating ? "Estimating…" : "✨ Estimate macros"}
              </button>
            )}
            {estErr && <div className="subtle tiny" style={{ marginTop: 8, color: "#f87171" }}>{estErr}</div>}

            {estimate && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="lever-top">
                  <strong>AI estimate</strong>
                  <span className={`pill ${estimate.confidence === "high" ? "ok" : estimate.confidence === "low" ? "bad" : "warn"}`}>{estimate.confidence} confidence</span>
                </div>
                <div style={{ display: "flex", marginTop: 10, flexWrap: "wrap", gap: 6 }}>
                  <span className="pill">{estimate.calories ?? "?"} kcal</span>
                  <span className="pill" style={{ background: "rgba(244,114,182,0.18)" }}>{estimate.protein_g ?? "?"}g protein</span>
                  <span className="pill">{estimate.carbs_g ?? "?"}g carbs</span>
                  <span className="pill">{estimate.fat_g ?? "?"}g fat</span>
                  <span className="pill">{estimate.fiber_g ?? "?"}g fiber</span>
                </div>
                {estimate.assumptions && <div className="subtle tiny" style={{ marginTop: 8 }}>{estimate.assumptions}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={onLog} disabled={logging}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#34d399", color: "#04291d", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    {logging ? "Logging…" : "Log it"}
                  </button>
                  <button onClick={() => setEstimate(null)} disabled={logging}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "var(--muted)", fontSize: 14, cursor: "pointer" }}>
                    Redo
                  </button>
                </div>
              </div>
            )}
          </section>

          <h2 className="section-title">Today{day.meals.length ? ` · ${day.meals.length}` : ""}</h2>
          {day.meals.length === 0 ? (
            <div className="card subtle tiny">Nothing logged yet. Add your first meal above ↑</div>
          ) : (
            <section className="list">
              {day.meals.map((m) => (
                <div key={m.id} className="card" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description || m.meal_type || "Meal"}</div>
                    <div className="subtle tiny" style={{ marginTop: 2 }}>
                      {m.calories != null ? `${m.calories} kcal` : ""}{m.protein_g != null ? ` · ${m.protein_g}g protein` : ""}{m.source === "ai" ? " · ✨" : ""}
                    </div>
                  </div>
                  <button onClick={() => onDelete(m.id)} disabled={deletingId === m.id}
                    aria-label="Delete" style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", padding: 4, flexShrink: 0 }}>
                    {deletingId === m.id ? "…" : "✕"}
                  </button>
                </div>
              ))}
            </section>
          )}
          <div style={{ height: 8 }} />
        </>
      )}
    </Screen>
  );
}
