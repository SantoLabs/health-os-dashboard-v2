"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrain, useApi, actionGet, actionPost, planRange, strengthSessions, cardioActivities, type TrnPrs, type TrnProgress, type TrnPbRec, type TrnSport, type StrengthSession, type CardioActivityLite } from "../lib/api";
import { Spark, SubPills, Delta, dShort } from "./ui";
import KaiDailyCard from "../components/KaiDailyCard";
import ExerciseDetail from "./ExerciseDetail";
import { CardioActivityDetail } from "./CardioTab";
import { useRouter } from "next/navigation";

/* Goals (Chunk 8) full CRUD, ported from /more/goals */
type UGoal = { id: string; label: string; when_text?: string; target_date: string | null; goal_type: string; status: string; focus: string; deleted: boolean; created_at: string; updated_at: string; days_away: number | null; source?: string; completed_at?: string | null; early_days?: number | null };
type GoalsApiResp = { body_comp: { bia_bf: number; dexa_bf: number; goal_bf: number; goal_by: string; latest_weight: number; weight_as_of: string; weight_history: { kg: number; date: string; source: string }[] } };

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  race: { emoji: "🏁", label: "Race" }, run: { emoji: "🏃", label: "Run" }, swim: { emoji: "🏊", label: "Swim" },
  bike: { emoji: "🚴", label: "Bike" }, strength: { emoji: "💪", label: "Strength" }, triathlon: { emoji: "🏅", label: "Triathlon" },
  body: { emoji: "⚖️", label: "Body" }, other: { emoji: "🎯", label: "Other" },
};
const GTYPES = Object.keys(TYPE_META);
const tEmoji = (t: string) => TYPE_META[t]?.emoji ?? "🎯";
const G_STATUS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Yet to start", cls: "st-todo" }, in_progress: { label: "In progress", cls: "st-prog" }, done: { label: "Done", cls: "st-done" },
};
const G_STATUSES = Object.keys(G_STATUS);
const G_FOCUS: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "fo-low" }, medium: { label: "Med", cls: "fo-med" }, high: { label: "High", cls: "fo-high" },
};
const G_FOCUSES = Object.keys(G_FOCUS);
const FOCUS_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const G_STATUS_RANK: Record<string, number> = { in_progress: 0, not_started: 1, done: 2 };
const gFmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No date";
const gFmtShort = (iso?: string) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
function awayPill(days: number | null) {
  if (days == null) return null;
  const cls = days < 0 ? "ok" : days <= 30 ? "warn" : "";
  const txt = days < 0 ? `${-days}d ago` : days === 0 ? "today" : `in ${days}d`;
  return <span className={`pill ${cls}`}>{txt}</span>;
}
function completedMarker(g: UGoal): { text: string; cls: string } | null {
  if (g.early_days == null) return null;
  const n = Math.abs(g.early_days);
  const dW = n === 1 ? "day" : "days";
  if (g.early_days > 0) { const flavor = g.early_days >= 14 ? "smashed it" : g.early_days >= 4 ? "ahead of plan" : "early"; return { text: `🎯 ${n} ${dW} early — ${flavor}`, cls: "ok" }; }
  if (g.early_days < 0) return { text: `${n} ${dW} past target — done is done`, cls: "warn" };
  return { text: "🎯 right on the day", cls: "ok" };
}
type GSortKey = "date" | "priority" | "status" | "type";

function GoalsTab() {
  const { data, error } = useApi<GoalsApiResp>("goals");
  const bc = data?.body_comp;
  const progress = bc ? Math.max(0, Math.min(100, ((bc.dexa_bf - bc.bia_bf) / (bc.dexa_bf - bc.goal_bf)) * 100)) : 0;
  const wStart = bc?.weight_history?.find((w) => w.source === "withings")?.kg;
  const wDelta = bc && wStart ? bc.latest_weight - wStart : undefined;

  const [goals, setGoals] = useState<UGoal[] | null>(null);
  const [removed, setRemoved] = useState<UGoal[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ label: "", target_date: "", goal_type: "race", status: "not_started", focus: "medium" });
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<GSortKey>("date");
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [bfEdit, setBfEdit] = useState(false);
  const [bfVal, setBfVal] = useState("");
  const [bfGoal, setBfGoal] = useState<number | null>(null);
  useEffect(() => { if (bc?.goal_bf != null && bfGoal == null) setBfGoal(bc.goal_bf); }, [bc, bfGoal]);

  function apply(d: { goals: UGoal[]; deleted_goals: UGoal[] }) { setGoals(d.goals); setRemoved(d.deleted_goals || []); }
  useEffect(() => { let alive = true; actionGet<{ goals: UGoal[]; deleted_goals: UGoal[] }>("goals_list").then((d) => { if (alive) apply(d); }).catch(() => {}); return () => { alive = false; }; }, []);

  const startEdit = (g: UGoal) => { setEditing(g.id); setForm({ label: g.label, target_date: g.target_date || "", goal_type: g.goal_type, status: g.status, focus: g.focus }); };
  const startNew = () => { setEditing("new"); setForm({ label: "", target_date: "", goal_type: "race", status: "not_started", focus: "medium" }); };
  async function save() {
    if (!form.label.trim() || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...form, label: form.label.trim(), target_date: form.target_date || null };
      if (editing && editing !== "new") body.id = editing;
      apply(await actionPost("goal_save", body)); setEditing(null);
    } catch { /* keep open */ } finally { setBusy(false); }
  }
  async function runAct(route: string, id: string) {
    if (busy) return; setBusy(true);
    try { apply(await actionPost(route, { id })); if (editing === id) setEditing(null); }
    catch { /* noop */ } finally { setBusy(false); }
  }
  async function saveBf() {
    const n = parseFloat(bfVal); if (isNaN(n) || busy) return;
    setBusy(true);
    try { const r = await actionPost<{ body_fat_pct: number }>("bodyfat_target_save", { value: n }); setBfGoal(r.body_fat_pct); setBfEdit(false); }
    catch { /* noop */ } finally { setBusy(false); }
  }

  const activeGoals = (goals || []).filter((g) => g.status !== "done");
  const doneGoals = (goals || []).filter((g) => g.status === "done");
  const sorted = useMemo(() => {
    const byDate = (a: UGoal, b: UGoal) => (a.target_date || "9999").localeCompare(b.target_date || "9999");
    const arr = [...activeGoals];
    if (sort === "date") arr.sort(byDate);
    else if (sort === "priority") arr.sort((a, b) => (FOCUS_RANK[a.focus] - FOCUS_RANK[b.focus]) || byDate(a, b));
    else if (sort === "status") arr.sort((a, b) => (G_STATUS_RANK[a.status] - G_STATUS_RANK[b.status]) || byDate(a, b));
    else if (sort === "type") arr.sort((a, b) => a.goal_type.localeCompare(b.goal_type) || byDate(a, b));
    return arr;
  }, [activeGoals, sort]);
  const nextRace = useMemo(() => {
    const races = activeGoals.filter((g) => (g.goal_type === "race" || g.goal_type === "triathlon") && g.target_date);
    const hi = races.filter((g) => g.focus === "high");
    return (hi.length ? hi : races).sort((a, b) => (a.target_date || "9999").localeCompare(b.target_date || "9999"))[0] || null;
  }, [activeGoals]);

  const Seg = <T extends string>(opts: { v: T; label: string }[], val: T, set: (v: T) => void, cls = "") => (
    <div className={`seg ${cls}`}>
      {opts.map((o) => <button key={o.v} className={o.v === val ? "seg-opt active" : "seg-opt"} onClick={() => set(o.v)}>{o.label}</button>)}
    </div>
  );

  const EditForm = (
    <div className="goal-form">
      <input className="g-input" placeholder="Goal name" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus />
      <input className="g-input" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
      <div className="g-field-label">Type</div>
      <div className="type-row">
        {GTYPES.map((t) => (
          <button key={t} className={t === form.goal_type ? "type-btn active" : "type-btn"} onClick={() => setForm({ ...form, goal_type: t })}>
            <span>{TYPE_META[t].emoji}</span><span className="type-cap">{TYPE_META[t].label}</span>
          </button>
        ))}
      </div>
      <div className="g-field-label">Status</div>
      {Seg(G_STATUSES.map((s) => ({ v: s, label: G_STATUS[s].label })), form.status, (v) => setForm({ ...form, status: v }))}
      <div className="g-field-label">Focus</div>
      {Seg(G_FOCUSES.map((f) => ({ v: f, label: G_FOCUS[f].label })), form.focus, (v) => setForm({ ...form, focus: v }))}
      <div className="goal-form-row">
        <button className="btn" onClick={save} disabled={busy || !form.label.trim()}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
        {editing && editing !== "new" && <button className="btn btn-danger" onClick={() => runAct("goal_delete", editing)} disabled={busy} style={{ marginLeft: "auto" }}>Delete</button>}
      </div>
    </div>
  );

  const GoalRow = (g: UGoal) => (
    <button className="goal-row" onClick={() => startEdit(g)}>
      <span className="cardio-ic">{tEmoji(g.goal_type)}</span>
      <div className="cardio-main">
        <div className="session-title">{g.label}</div>
        <div className="subtle tiny">{gFmtDate(g.target_date)} · added {gFmtShort(g.created_at)}{g.updated_at && g.updated_at !== g.created_at ? ` · edited ${gFmtShort(g.updated_at)}` : ""}</div>
        <div className="chip-row">
          <span className={`chip ${G_STATUS[g.status]?.cls}`}>{G_STATUS[g.status]?.label}</span>
          <span className={`chip ${G_FOCUS[g.focus]?.cls}`}>{G_FOCUS[g.focus]?.label} focus</span>
        </div>
      </div>
      {awayPill(g.days_away)}
      <span className="chev-edit">✎</span>
    </button>
  );

  return (
    <div>
      {nextRace && (
        <div className="trn-race">
          <div className="top"><span>{tEmoji(nextRace.goal_type)} Next race</span><span>{gFmtDate(nextRace.target_date)}</span></div>
          <div className="nm">{nextRace.label}</div>
          <div className="meta"><span className={`chip ${G_FOCUS[nextRace.focus]?.cls}`}>{G_FOCUS[nextRace.focus]?.label} focus</span></div>
          {nextRace.days_away != null && <div className="days tnum">{Math.max(0, nextRace.days_away)}<small>days to go</small></div>}
        </div>
      )}

      {bc && (
        <>
          <h2 className="section-title">Body composition</h2>
          <section className="card">
            <div className="lever-top">
              <span>Body fat <strong>{bc.bia_bf}%</strong> <span className="subtle tiny">BIA · DEXA {bc.dexa_bf}%</span></span>
              {!bfEdit ? (
                <button className="goal-inline-edit" onClick={() => { setBfEdit(true); setBfVal(String(bfGoal ?? bc.goal_bf)); }}>goal {bfGoal ?? bc.goal_bf}% by {bc.goal_by} ✎</button>
              ) : (
                <span className="bf-edit">
                  <input className="g-input bf-input" type="number" step="0.5" value={bfVal} onChange={(e) => setBfVal(e.target.value)} autoFocus />%
                  <button className="btn btn-mini" onClick={saveBf} disabled={busy}>Save</button>
                  <button className="btn btn-ghost btn-mini" onClick={() => setBfEdit(false)}>✕</button>
                </span>
              )}
            </div>
            <div className="track" style={{ marginTop: 12 }}><div className="fill" style={{ width: `${progress}%` }} /></div>
            <div className="subtle tiny mt8">{Math.round(progress)}% of the way from {bc.dexa_bf}% → {bfGoal ?? bc.goal_bf}%</div>
            <div className="lever-top" style={{ marginTop: 14 }}>
              <span>Weight <strong>{bc.latest_weight}kg</strong></span>
              {wDelta != null && <span className={`pill ${wDelta <= 0 ? "ok" : "warn"}`}>{wDelta > 0 ? "+" : ""}{wDelta.toFixed(1)}kg</span>}
            </div>
          </section>
        </>
      )}

      <div className="lever-top" style={{ margin: "18px 4px 8px" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Goals</h2>
        {editing !== "new" && <button className="btn-add" onClick={startNew}>+ Add</button>}
      </div>

      {goals && activeGoals.length > 1 && (
        <div className="sort-row">
          <span className="subtle tiny">Sort</span>
          {Seg(([["date", "Date"], ["priority", "Priority"], ["status", "Status"], ["type", "Type"]] as [GSortKey, string][]).map(([v, l]) => ({ v, label: l })), sort, setSort, "seg-sm")}
        </div>
      )}

      {editing === "new" && <section className="card goal-card"><div className="goal-form" style={{ padding: "14px 16px" }}>{EditForm}</div></section>}

      <section className="list">
        {goals == null && !error && <div className="subtle tiny" style={{ padding: 12, textAlign: "center" }}>Loading goals…</div>}
        {error && <div className="card error"><strong>Couldn&apos;t load goals</strong><div className="subtle">{error}</div></div>}
        {goals?.length === 0 && editing !== "new" && <div className="subtle tiny" style={{ padding: "4px 4px 8px" }}>No goals yet — add your first one.</div>}
        {sorted.map((g) => (
          <div key={g.id} className="card goal-card">{editing === g.id ? EditForm : GoalRow(g)}</div>
        ))}
      </section>

      {doneGoals.length > 0 && (
        <>
          <h2 className="section-title">Completed 🎉</h2>
          <section className="list">
            {doneGoals.map((g) => {
              const mk = completedMarker(g);
              return (
                <div key={g.id} className="card goal-card done-card">
                  {editing === g.id ? EditForm : (
                    <button className="goal-row" onClick={() => startEdit(g)}>
                      <span className="cardio-ic">🥳</span>
                      <div className="cardio-main">
                        <div className="session-title done-text">{tEmoji(g.goal_type)} {g.label}</div>
                        <div className="subtle tiny">{g.completed_at ? `Completed ${gFmtDate(g.completed_at)}` : "Completed"}{g.target_date ? ` · target ${gFmtDate(g.target_date)}` : ""}</div>
                        {mk && <div className="chip-row" style={{ marginTop: 6 }}><span className={`pill ${mk.cls}`}>{mk.text}</span></div>}
                      </div>
                      <span className="chev-edit">✎</span>
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      {removed.length > 0 && (
        <>
          <h2 className="section-title">Removed</h2>
          <section className="list">
            {removed.map((g) => (
              <div key={g.id} className="card goal-card removed-card">
                {confirmPurge === g.id ? (
                  <div className="goal-row static" style={{ alignItems: "flex-start" }}>
                    <span className="cardio-ic">🗑</span>
                    <div className="cardio-main">
                      <div className="session-title">Permanently remove “{g.label}”?</div>
                      <div className="subtle tiny">This deletes it for good — it can&apos;t be restored.</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                      <button onClick={() => { setConfirmPurge(null); runAct("goal_purge", g.id); }} disabled={busy} style={{ background: "#ef4444", border: "none", color: "#fff", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Yes, delete</button>
                      <button onClick={() => setConfirmPurge(null)} disabled={busy} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "var(--muted)", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>No</button>
                    </div>
                  </div>
                ) : (
                  <div className="goal-row static">
                    <span className="cardio-ic">{tEmoji(g.goal_type)}</span>
                    <div className="cardio-main">
                      <div className="session-title struck">{g.label}</div>
                      <div className="subtle tiny">{gFmtDate(g.target_date)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                      <button className="btn-add" onClick={() => runAct("goal_restore", g.id)} disabled={busy}>↺ Restore</button>
                      <button onClick={() => setConfirmPurge(g.id)} disabled={busy} style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171", borderRadius: 999, padding: "4px 12px", fontSize: 13, cursor: "pointer" }}>🗑 Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/* ═══ Personal Bests — catalog PBs: sport selector · period slider · gold hero (server-formatted) ═══ */
const PB_PERIODS: { key: string; label: string }[] = [
  { key: "12m", label: "12m" },
  { key: "24m", label: "24m" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All-time" },
];
const MEDAL = ["🥇", "🥈", "🥉"];

function PBRow({ rec }: { rec: TrnPbRec }) {
  const [open, setOpen] = useState(false);
  const gold = rec.entries[0];
  const rest = rec.entries.slice(1);
  if (!gold) return null;
  return (
    <div className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
      <button onClick={() => rest.length && setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "none", border: "none", color: "inherit", cursor: rest.length ? "pointer" : "default", textAlign: "left", font: "inherit" }}>
        <span style={{ fontSize: 22, flex: "none", filter: "drop-shadow(0 0 7px rgba(245,197,66,0.55))" }}>🥇</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c8cde0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.label}</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{gold.primary}</div>
          <div className="subtle tiny">{gold.secondary ? `${gold.secondary} · ` : ""}{gold.date_label}</div>
        </div>
        {rest.length > 0 && <span style={{ color: "#6b7080", fontSize: 12, flex: "none" }}>{open ? "▲" : "▼"}</span>}
      </button>
      {open && rest.map((e) => (
        <div key={e.rnk} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 15px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ fontSize: 17, flex: "none" }}>{MEDAL[e.rnk - 1] || "🎖"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{e.primary}</div>
            <div className="subtle tiny">{e.secondary ? `${e.secondary} · ` : ""}{e.date_label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function History({ prs }: { prs: TrnPrs }) {
  const [tab, setTab] = useState<"Personal Bests" | "Adherence">("Personal Bests");
  const [sport, setSport] = useState<string | null>(prs.default_sport);
  const [period, setPeriod] = useState<string>("all");
  const sportKey = sport && prs.sports.some((s) => s.key === sport) ? sport : (prs.default_sport || prs.sports[0]?.key || null);
  const recs: TrnPbRec[] = sportKey ? (prs.pb[period]?.[sportKey] || []) : [];

  return (
    <div>
      <SubPills items={["Personal Bests", "Adherence"] as const} value={tab} onChange={setTab} />

      {tab === "Personal Bests" ? (
        prs.sports.length === 0 ? (
          <div className="subtle tiny center" style={{ padding: "20px 0" }}>No personal bests yet.</div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "2px 0 10px", WebkitOverflowScrolling: "touch" }}>
              {prs.sports.map((s) => (
                <button key={s.key} onClick={() => setSport(s.key)} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, border: `1px solid ${sportKey === s.key ? "rgba(162,116,255,0.6)" : "rgba(255,255,255,0.1)"}`, background: sportKey === s.key ? "linear-gradient(135deg,rgba(95,125,255,0.28),rgba(162,116,255,0.28))" : "rgba(255,255,255,0.04)", color: sportKey === s.key ? "#fff" : "#9198ad", cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                  <span>{s.emoji}</span>{s.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 2 }}>
                {PB_PERIODS.map((p) => (
                  <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding: "5px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, background: period === p.key ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: period === p.key ? "#fff" : "#8a90a6" }}>{p.label}</button>
                ))}
              </div>
            </div>

            {recs.length === 0
              ? <div className="subtle tiny center" style={{ padding: "18px 0" }}>No personal bests in this window.</div>
              : recs.map((rec) => <PBRow key={rec.label} rec={rec} />)}
          </div>
        )
      ) : (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Plan adherence</div>
            <span className="trn-soon">Phase 2</span>
          </div>
          <div className="subtle tiny" style={{ marginTop: 6, lineHeight: 1.5 }}>
            Adherence measures completed sessions against a committed weekly plan. It activates once the planner ships and starts committing plans — the layout below is a preview.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">80%</div><div className="l">on plan · 30d</div></div>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">4.2</div><div className="l">sessions · wk</div></div>
            <div className="trn-cell" style={{ flex: 1 }}><div className="v tnum">96%</div><div className="l">volume hit</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

type BodyPt = TrnProgress["body_trend"][number];
function Body({ p }: { p: TrnProgress }) {
  const b = p.body_latest;
  const trend = p.body_trend || [];
  const [range, setRange] = useState<"3M" | "6M" | "1Y" | "All">("6M");
  const win = useMemo(() => {
    if (range === "All") return trend;
    const days = range === "3M" ? 90 : range === "6M" ? 182 : 365;
    const cutoff = new Date(Date.now() + 5.5 * 3600000 - days * 86400000).toISOString().slice(0, 10);
    return trend.filter((x) => x.date >= cutoff);
  }, [trend, range]);
  const periodDelta = (pick: (x: BodyPt) => number | null): number | null => {
    const nums = win.map(pick).filter((v): v is number => v != null);
    return nums.length >= 2 ? nums[nums.length - 1] - nums[0] : null;
  };
  const RANGES: ("3M" | "6M" | "1Y" | "All")[] = ["3M", "6M", "1Y", "All"];
  const graph = (title: string, pick: (x: BodyPt) => number | null, color: string, unit: string) => (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div className="trn-eyebrow" style={{ margin: 0 }}>{title}</div>
        <Delta v={periodDelta(pick)} unit={unit} suffix={range} />
      </div>
      <Spark values={win.map(pick)} color={color} height={100} />
    </div>
  );
  return (
    <div>
      <div className="trn-statgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="trn-cell"><div className="v tnum">{b?.weight_kg != null ? b.weight_kg.toFixed(1) : "—"}</div><div className="l">weight kg</div></div>
        <div className="trn-cell hl"><div className="v tnum">{b?.body_fat_pct != null ? `${b.body_fat_pct.toFixed(1)}%` : "—"}</div><div className="l">body fat</div></div>
        <div className="trn-cell good"><div className="v tnum">{b?.lean_mass_kg != null ? b.lean_mass_kg.toFixed(1) : "—"}</div><div className="l">lean kg</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: "5px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: range === r ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: range === r ? "#fff" : "#8a90a6" }}>{r}</button>
          ))}
        </div>
      </div>
      {graph("Weight · kg", (x) => x.weight_kg, "#6d8bff", "kg")}
      {graph("Body fat · %", (x) => x.body_fat_pct, "#ffb547", "%")}
      {graph("Lean mass · kg", (x) => x.lean_mass_kg, "#34d6a4", "kg")}
      {b?.date && <div className="subtle tiny center">Last measured {dShort(b.date)}</div>}
    </div>
  );
}

/* ═══════════════ Summary (Chunk 7 · §6) ═══════════════
   Week/Month toggle over one dynamic grid + dynamic-by-sport blocks + cached AI card.
   Actuals (strength sessions ∪ cardio activities) render solid & tappable; planned
   future sessions render pale (same hue); empty days = ⭐ rest. Strength counted only
   from strengthSessions and cardio sports normalised so Garmin strength_training never
   double-counts. Week-grid duplication across Coach/Schedule/Progress is accepted per plan. */
type Sport = "run" | "cycle" | "swim" | "walk" | "strength";
const SPORT: Record<Sport, { label: string; emoji: string; color: string }> = {
  run: { label: "Run", emoji: "🏃", color: "#34d399" },
  cycle: { label: "Cycle", emoji: "🚴", color: "#a78bfa" },
  swim: { label: "Swim", emoji: "🏊", color: "#38bdf8" },
  walk: { label: "Walk", emoji: "🚶", color: "#2dd4bf" },
  strength: { label: "Strength", emoji: "🏋️", color: "#fbbf24" },
};
function normCardio(s: string): Sport | null {
  const k = (s || "").toLowerCase();
  if (k.startsWith("run")) return "run";
  if (k.startsWith("cycl") || k.startsWith("bik") || k.startsWith("rid")) return "cycle";
  if (k.startsWith("swim")) return "swim";
  if (k.startsWith("walk") || k.startsWith("hik")) return "walk";
  return null; // strength_training / other → excluded from cardio (dedupe vs native)
}
function normPlan(t: string, rest: boolean): Sport | null {
  if (rest) return null;
  const k = (t || "").toLowerCase().replace(/[^a-z]/g, "");
  if (k.startsWith("run")) return "run";
  if (k.startsWith("swim")) return "swim";
  if (k.startsWith("strength") || k === "gym" || k === "lift" || k === "hiit") return "strength";
  if (k.startsWith("cycl") || k === "bike" || k === "ride") return "cycle";
  if (k.startsWith("walk")) return "walk";
  return null;
}
// Strength calendar labels show the split (Upper push / Upper pull / Upper / Lower /
// Full body / Core), not volume — the 🏋️ already says it's strength.
function muscleRegion(mg: string): "push" | "pull" | "lower" | "core" | "other" {
  const m = (mg || "").toLowerCase();
  if (m.includes("quad") || m.includes("hamstring") || m.includes("glute") || m.includes("calf") || m.includes("calves") || m.includes("adductor") || m.includes("abductor") || m.includes("hip")) return "lower";
  if (m.includes("abdominal") || m === "abs" || m.includes("oblique") || m.includes("core")) return "core";
  if (m.includes("chest") || m.includes("pec") || m.includes("shoulder") || m.includes("delt") || m.includes("tricep")) return "push";
  if (m.includes("lat") || m.includes("back") || m.includes("bicep") || m.includes("trap") || m.includes("forearm")) return "pull";
  return "other";
}
function strengthSplit(s: StrengthSession): string {
  const nn = (s.name || "").toLowerCase().replace(/[^a-z]/g, "");
  if (nn.includes("fullbody") || nn.includes("totalbody")) return "Full body";
  const nPush = nn.includes("push"), nPull = nn.includes("pull");
  if (nPush && !nPull) return "Upper push";
  if (nPull && !nPush) return "Upper pull";
  if (nn.includes("upper")) return "Upper";
  if (nn.includes("lower") || nn.includes("leg")) return "Lower";
  if (nn.includes("core") || nn.includes("abs")) return "Core";
  const w = { push: 0, pull: 0, lower: 0, core: 0, other: 0 };
  for (const e of s.exercises || []) w[muscleRegion(e.muscle_group)] += e.sets || 1;
  const upper = w.push + w.pull;
  const total = upper + w.lower + w.core;
  if (total === 0) return "Strength";
  if (w.lower > 0 && upper > 0 && w.lower >= total * 0.3 && upper >= total * 0.3) return "Full body";
  if (w.lower >= upper && w.lower >= w.core) return "Lower";
  if (w.core > upper && w.core > w.lower) return "Core";
  if (w.push > 0 && w.pull > 0) return "Upper";
  return w.push >= w.pull ? "Upper push" : "Upper pull";
}
function hexA(h: string, a: number): string { const x = h.replace("#", ""); const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }

function istTodayISO(): string { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
function isoAdd(s: string, n: number): string { const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }
function isoAddMonths(s: string, n: number): string { const [y, m] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); }
function mondayOf(s: string): string { const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); }
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dnum(s: string): number { return Number(s.slice(8, 10)); }
function moni(s: string): number { return Number(s.slice(5, 7)) - 1; }

type PlanSession = { session_date: string; session_type: string; completed: boolean; skipped?: boolean; committed?: boolean; is_rest_day: boolean };
type Cell = { key: string; sport: Sport; label: string; stat: string; planned: boolean; date: string; cardioId?: string; strength?: StrengthSession };

function buildCells(from: string, to: string, str: StrengthSession[], car: CardioActivityLite[], plan: PlanSession[], today: string): Map<string, Cell[]> {
  const map = new Map<string, Cell[]>();
  const push = (d: string, c: Cell) => { if (d < from || d > to) return; const a = map.get(d) || []; a.push(c); map.set(d, a); };
  // strength → split label (no volume in the calendar); cardio → distance
  for (const s of str) push(s.date, { key: "s" + s.id, sport: "strength", label: strengthSplit(s), stat: "", planned: false, date: s.date, strength: s });
  for (const a of car) {
    const sp = normCardio(a.sport); if (!sp) continue;
    const stat = a.distance_km != null && a.distance_km > 0 ? `${a.distance_km.toFixed(1)} km` : a.duration_mins != null ? `${Math.round(a.duration_mins)} min` : "";
    push(a.date, { key: "c" + a.activity_id, sport: sp, label: SPORT[sp].label, stat, planned: false, date: a.date, cardioId: a.activity_id });
  }
  // committed future sessions only (dashed, tappable → calendar); uncommitted Kai proposals are NOT shown here — accept them in the Schedule planner first
  for (const p of plan) {
    const d = p.session_date; if (!d || d <= today || p.completed || p.skipped || !p.committed) continue;
    const sp = normPlan(p.session_type, p.is_rest_day); if (!sp) continue;
    if ((map.get(d) || []).some((c) => c.sport === sp)) continue;
    push(d, { key: "p" + d + sp, sport: sp, label: SPORT[sp].label, stat: "", planned: true, date: d });
  }
  return map;
}

function Chip({ c, onTap }: { c: Cell; onTap: (c: Cell) => void }) {
  const s = SPORT[c.sport];
  return (
    <button onClick={() => onTap(c)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 10, background: c.planned ? hexA(s.color, 0.05) : hexA(s.color, 0.16), border: `1px ${c.planned ? "dashed" : "solid"} ${hexA(s.color, c.planned ? 0.45 : 0.5)}`, color: c.planned ? hexA(s.color, 0.85) : "#eef", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left" }}>
      <span style={{ fontSize: 13 }}>{s.emoji}</span>
      <span>{c.label}</span>
      {c.stat ? <span className="tnum" style={{ opacity: 0.85, fontWeight: 500 }}>{c.stat}</span> : null}
    </button>
  );
}

function WeekGrid({ start, cells, today, onTap, onDate }: { start: string; cells: Map<string, Cell[]>; today: string; onTap: (c: Cell) => void; onDate: (d: string) => void }) {
  return (
    <div className="card" style={{ padding: "4px 4px" }}>
      {Array.from({ length: 7 }, (_, i) => isoAdd(start, i)).map((d, i) => {
        const cs = cells.get(d) || [];
        const isToday = d === today;
        const past = d < today;
        return (
          <div key={d} style={{ display: "flex", gap: 10, padding: "8px", alignItems: "flex-start", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ width: 40, flex: "none", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "#a274ff" : "#8a90a6" }}>{DOW[i]}</div>
              <div className="tnum" style={{ fontSize: 15, fontWeight: 700, color: isToday ? "#fff" : "#c9cede" }}>{dnum(d)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2, alignItems: "center", minHeight: 22 }}>
              {cs.length > 0
                ? cs.map((c) => <Chip key={c.key} c={c} onTap={onTap} />)
                : past
                  ? <span style={{ fontSize: 13, color: "#6b7080" }}>⭐ Rest</span>
                  : <button onClick={() => onDate(d)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 10, background: "transparent", border: "1px dashed rgba(255,255,255,0.14)", color: "#7a8194", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}>＋ Plan</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ start, cells, today, onDay }: { start: string; cells: Map<string, Cell[]>; today: string; onDay: (d: string) => void }) {
  const gridStart = mondayOf(start);
  const mon = start.slice(0, 7);
  return (
    <div className="card" style={{ padding: "8px 6px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#6b7080" }}>{d[0]}</div>)}
      </div>
      {Array.from({ length: 6 }, (_, w) => w).map((w) => (
        <div key={w} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {Array.from({ length: 7 }, (_, i) => isoAdd(gridStart, w * 7 + i)).map((d) => {
            const inMonth = d.slice(0, 7) === mon;
            const cs = cells.get(d) || [];
            const isToday = d === today;
            const tappable = cs.length > 0 || d >= today;
            return (
              <button key={d} onClick={() => tappable && onDay(d)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0 0", borderRadius: 8, border: isToday ? "1px solid #a274ff" : "1px solid transparent", background: inMonth ? "rgba(255,255,255,0.02)" : "transparent", cursor: tappable ? "pointer" : "default", opacity: inMonth ? 1 : 0.3, font: "inherit" }}>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: isToday ? "#fff" : "#9aa0b0" }}>{dnum(d)}</span>
                <span style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                  {cs.slice(0, 4).map((c) => <span key={c.key} style={{ width: 5, height: 5, borderRadius: 999, background: SPORT[c.sport].color, opacity: c.planned ? 0.45 : 1 }} />)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SportBlocks({ from, to, str, car }: { from: string; to: string; str: StrengthSession[]; car: CardioActivityLite[] }) {
  const blocks = useMemo(() => {
    const acc: Partial<Record<Sport, { sport: Sport; sessions: number; vol: number; km: number }>> = {};
    const bump = (sp: Sport) => (acc[sp] ??= { sport: sp, sessions: 0, vol: 0, km: 0 });
    for (const s of str) if (s.date >= from && s.date <= to) { const b = bump("strength"); b.sessions++; b.vol += s.volume || 0; }
    for (const a of car) { if (a.date < from || a.date > to) continue; const sp = normCardio(a.sport); if (!sp) continue; const b = bump(sp); b.sessions++; b.km += a.distance_km || 0; }
    return (["strength", "run", "cycle", "swim", "walk"] as Sport[]).map((o) => acc[o]).filter((b): b is { sport: Sport; sessions: number; vol: number; km: number } => !!b);
  }, [from, to, str, car]);
  if (!blocks.length) return <div className="subtle tiny center" style={{ padding: "16px 0" }}>No sessions logged in this window yet.</div>;
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
      {blocks.map((b) => {
        const s = SPORT[b.sport];
        const isStr = b.sport === "strength";
        const val = isStr ? Math.round(b.vol).toLocaleString("en-US") : b.km.toFixed(1);
        const unit = isStr ? "kg" : "km";
        const vfont = val.length >= 8 ? 14 : val.length >= 6 ? 17 : 20; // keep long kg totals compact
        return (
          <div key={b.sport} style={{ flex: "0 0 auto", minWidth: 92, background: hexA(s.color, 0.07), border: `1px solid ${hexA(s.color, 0.18)}`, borderRadius: 14, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, lineHeight: 1 }}>{s.emoji}</div>
            <div className="tnum" style={{ marginTop: 5, fontWeight: 800, fontSize: vfont, color: "#f4f4f7", letterSpacing: "-0.4px", lineHeight: 1.1, whiteSpace: "nowrap" }}>
              {val}<span style={{ fontSize: 10.5, fontWeight: 700, color: "#9aa0b0", marginLeft: 2 }}>{unit}</span>
            </div>
            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: "#c9cede", whiteSpace: "nowrap" }}>{s.label}</div>
            <div className="subtle tiny" style={{ whiteSpace: "nowrap" }}>{b.sessions} session{b.sessions === 1 ? "" : "s"}</div>
          </div>
        );
      })}
    </div>
  );
}

function StrengthSessionDetail({ s, onBack }: { s: StrengthSession; onBack: () => void }) {
  const [ex, setEx] = useState<string | null>(null);
  if (ex) return <ExerciseDetail title={ex} onBack={() => setEx(null)} />;
  const dt = new Date(s.date + "T00:00:00");
  return (
    <div>
      <div className="trn-back">
        <button onClick={onBack} aria-label="Back">‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{s.name}</h3>
          <div className="sub">{dt.getDate()} {MON[dt.getMonth()]} {dt.getFullYear()} · {s.sets} sets{s.volume ? ` · ${Math.round(s.volume).toLocaleString("en-US")} kg` : ""}</div>
        </div>
      </div>
      <div className="eyebrow" style={{ marginTop: 0 }}>Exercises · tap for history</div>
      {s.exercises.map((e, i) => (
        <button key={e.title + i} onClick={() => setEx(e.title)} className="card" style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", marginBottom: 6, border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
            <div className="subtle tiny" style={{ textTransform: "capitalize" }}>{e.muscle_group.replace(/_/g, " ")}</div>
          </div>
          <div className="subtle tiny tnum">{e.sets} sets{e.volume ? ` · ${Math.round(e.volume).toLocaleString("en-US")} kg` : ""}</div>
          <span style={{ color: "#6b7080", fontSize: 16 }}>›</span>
        </button>
      ))}
    </div>
  );
}

type Open = { kind: "strength"; s: StrengthSession } | { kind: "cardio"; id: string; sport: string } | null;
const CARDIO_API: Record<Sport, string> = { run: "running", cycle: "cycling", swim: "swimming", walk: "walking", strength: "strength" };

function DaySheet({ date, cells, today, onTap, onDate, onClose }: { date: string; cells: Map<string, Cell[]>; today: string; onTap: (c: Cell) => void; onDate: (d: string) => void; onClose: () => void }) {
  const cs = cells.get(date) || [];
  const past = date < today;
  const dt = new Date(date + "T00:00:00");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 480, margin: 0, borderRadius: "18px 18px 0 0", padding: 16, maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{DOW[(dt.getDay() + 6) % 7]} {dt.getDate()} {MON[dt.getMonth()]}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#8a90a6", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {cs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: past ? 0 : 12 }}>
            {cs.map((c) => <Chip key={c.key} c={c} onTap={(cc) => { onClose(); onTap(cc); }} />)}
          </div>
        )}
        {cs.length === 0 && past && <div className="subtle tiny">⭐ Rest day</div>}
        {!past && (
          <button onClick={() => { onClose(); onDate(date); }} style={{ width: "100%", padding: "11px", borderRadius: 12, background: "transparent", border: "1px dashed rgba(255,255,255,0.18)", color: "#c9b6ff", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>＋ Add or edit in calendar</button>
        )}
      </div>
    </div>
  );
}

function Summary() {
  const router = useRouter();
  const [mode, setMode] = useState<"Week" | "Month">("Week");
  const [off, setOff] = useState(0); // 0 = current window; + = older, − = future
  const [str, setStr] = useState<StrengthSession[] | null>(null);
  const [car, setCar] = useState<CardioActivityLite[] | null>(null);
  const [plan, setPlan] = useState<PlanSession[]>([]);
  const [open, setOpen] = useState<Open>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const today = istTodayISO();

  useEffect(() => {
    let a = true;
    strengthSessions().then((d) => a && setStr(d)).catch(() => a && setStr([]));
    cardioActivities().then((d) => a && setCar(d)).catch(() => a && setCar([]));
    return () => { a = false; };
  }, []);

  const { from, to } = useMemo(() => {
    if (mode === "Week") { const st = isoAdd(mondayOf(today), -off * 7); return { from: st, to: isoAdd(st, 6) }; }
    const st = isoAddMonths(today.slice(0, 8) + "01", -off); return { from: st, to: isoAdd(isoAddMonths(st, 1), -1) };
  }, [mode, off, today]);

  useEffect(() => {
    let a = true;
    planRange<{ sessions: PlanSession[] }>(from, to).then((r) => a && setPlan(r.sessions || [])).catch(() => a && setPlan([]));
    return () => { a = false; };
  }, [from, to]);

  if (open?.kind === "cardio") return <CardioActivityDetail id={open.id} sport={open.sport} onBack={() => setOpen(null)} />;
  if (open?.kind === "strength") return <StrengthSessionDetail s={open.s} onBack={() => setOpen(null)} />;

  const loading = str == null || car == null;
  const cells = loading ? new Map<string, Cell[]>() : buildCells(from, to, str ?? [], car ?? [], plan, today);
  const openDate = (d: string) => router.push(`/more/schedule?date=${d}`);
  const onTap = (c: Cell) => {
    if (c.cardioId) setOpen({ kind: "cardio", id: c.cardioId, sport: CARDIO_API[c.sport] });
    else if (c.strength) setOpen({ kind: "strength", s: c.strength });
    else openDate(c.date); // planned/future → jump to the calendar at that date
  };
  const label = mode === "Week" ? `${dnum(from)} ${MON[moni(from)]} – ${dnum(to)} ${MON[moni(to)]}` : `${MON[moni(from)]} ${from.slice(0, 4)}`;

  return (
    <div>
      {/* 1 · filter */}
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 10px" }}>
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 3 }}>
          {(["Week", "Month"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setOff(0); }} style={{ padding: "6px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: mode === m ? "linear-gradient(135deg,#5f7dff,#a274ff)" : "transparent", color: mode === m ? "#fff" : "#8a90a6" }}>{m}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", marginBottom: 10 }}>
        <button aria-label="Older" onClick={() => setOff((o) => Math.min(o + 1, 104))} style={{ background: "none", border: "none", color: "#c9b6ff", fontSize: 18, cursor: "pointer", padding: "0 12px", lineHeight: 1 }}>◀</button>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        <button aria-label="Newer" disabled={off <= -4} onClick={() => setOff((o) => Math.max(o - 1, -4))} style={{ background: "none", border: "none", color: off <= -4 ? "rgba(255,255,255,0.2)" : "#c9b6ff", fontSize: 18, cursor: off <= -4 ? "default" : "pointer", padding: "0 12px", lineHeight: 1 }}>▶</button>
      </div>

      {loading ? <div className="muted center pad">Loading…</div> : (
        <>
          {/* 2 · summary boxes */}
          <SportBlocks from={from} to={to} str={str ?? []} car={car ?? []} />
          {/* 3 · calendar */}
          <div className="eyebrow">Calendar</div>
          {mode === "Week"
            ? <WeekGrid start={from} cells={cells} today={today} onTap={onTap} onDate={openDate} />
            : <MonthGrid start={from} cells={cells} today={today} onDay={setDaySheet} />}
          {/* 4 · AI card */}
          <div style={{ height: 12 }} />
          <KaiDailyCard scope="training" />
        </>
      )}

      {daySheet && <DaySheet date={daySheet} cells={cells} today={today} onTap={onTap} onDate={openDate} onClose={() => setDaySheet(null)} />}
    </div>
  );
}

export default function ProgressTab() {
  const [sub, setSub] = useState<"Summary" | "Goals" | "Records" | "Body">("Summary");
  const { data: prs, error: e1 } = useTrain<TrnPrs>("prs");
  const { data: prog, error: e2 } = useTrain<TrnProgress>("progress");
  const error = e1 || e2;

  return (
    <div>
      <SubPills items={["Summary", "Goals", "Records", "Body"] as const} value={sub} onChange={setSub} />
      {sub === "Summary" ? (
        <Summary />
      ) : sub === "Goals" ? (
        <GoalsTab />
      ) : error ? (
        <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>
      ) : sub === "Records" ? (
        prs ? <History prs={prs} /> : <div className="muted center pad">Loading…</div>
      ) : (
        prog ? <Body p={prog} /> : <div className="muted center pad">Loading…</div>
      )}
    </div>
  );
}
