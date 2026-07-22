"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrain, useApi, actionGet, actionPost, planRange, strengthSessions, cardioActivities, trainingLoad, useBadges, markBadgesSeen, type TrnPrs, type TrnProgress, type TrnPbRec, type TrnSport, type TrnBadge, type StrengthSession, type CardioActivityLite, type TrnLoadPoint, type TrnThreshold } from "../lib/api";
import { Spark, SubPills, Delta, dShort } from "./ui";
import KaiDailyCard from "../components/KaiDailyCard";
import ExerciseDetail from "./ExerciseDetail";
import { CardioActivityDetail } from "./CardioTab";
import Sheet from "../components/Sheet";
import { useRouter } from "next/navigation";
import InsightsTab from "./InsightsTab";
import ActivitiesTab from "./ActivitiesTab";

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
                      <button onClick={() => { setConfirmPurge(null); runAct("goal_purge", g.id); }} disabled={busy} style={{ background: "var(--danger)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Yes, delete</button>
                      <button onClick={() => setConfirmPurge(null)} disabled={busy} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>No</button>
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
                      <button onClick={() => setConfirmPurge(g.id)} disabled={busy} style={{ background: "transparent", border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", color: "var(--danger)", borderRadius: 999, padding: "4px 12px", fontSize: 13, cursor: "pointer" }}>🗑 Remove</button>
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
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.label}</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{gold.primary}</div>
          <div className="subtle tiny">{gold.secondary ? `${gold.secondary} · ` : ""}{gold.date_label}</div>
        </div>
        {rest.length > 0 && <span style={{ color: "var(--muted)", fontSize: 12, flex: "none" }}>{open ? "▲" : "▼"}</span>}
      </button>
      {open && rest.map((e) => (
        <div key={e.rnk} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 15px", borderTop: "1px solid var(--line)" }}>
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

/* ═══ Badges (Chunk 10) — hexagonal tiered badges, Earned / Available ═══ */
const TIER_COLORS: Record<string, [string, string]> = {
  bronze: ["#a4703c", "#d89a5f"],
  silver: ["#7d8595", "#c3ccdb"],
  gold: ["#c99a2e", "#f5cf5e"],
  platinum: ["#3f93b3", "#8fe6ff"],
};
const HEX_CLIP = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
function badgeDate(iso?: string): string { if (!iso) return ""; const d = new Date(iso + "T00:00:00Z"); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); }

function BadgeHex({ b, earned }: { b: TrnBadge; earned: boolean }) {
  const [c1, c2] = TIER_COLORS[b.tier] || TIER_COLORS.bronze;
  const prog = earned ? 1 : (b.progress || 0);
  return (
    <div style={{ width: "33.333%", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 3px 12px" }}>
      <div style={{ position: "relative", width: 76, height: 84 }}>
        <div style={{ position: "absolute", inset: 0, clipPath: HEX_CLIP, background: earned ? `linear-gradient(150deg, ${c1}, ${c2})` : "var(--surface-2)" }} />
        <div style={{ position: "absolute", inset: 3, clipPath: HEX_CLIP, background: earned ? "rgba(0,0,0,0.14)" : "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 27, opacity: earned ? 1 : 0.32, filter: earned ? "none" : "grayscale(1)" }}>{earned ? b.icon : "🔒"}</span>
        </div>
        {earned && b.seen === false && <span style={{ position: "absolute", top: -3, right: 2, background: "var(--t-grad)", color: "#fff", fontSize: 8, fontWeight: 800, letterSpacing: "0.04em", padding: "2px 5px", borderRadius: 999, boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>NEW</span>}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2, color: earned ? "var(--text)" : "var(--muted)", minHeight: 25 }}>{b.title}</div>
      {earned
        ? <div className="subtle" style={{ fontSize: 9, opacity: 0.7 }}>{badgeDate(b.earned_on)}</div>
        : <div style={{ width: "68%", height: 3, borderRadius: 2, background: "var(--line-2)", overflow: "hidden" }}><div style={{ width: `${Math.round(prog * 100)}%`, height: "100%", background: c2, borderRadius: 2 }} /></div>}
    </div>
  );
}

function Badges() {
  const [tab, setTab] = useState<"Earned" | "Available">("Earned");
  const { data, error } = useBadges();
  useEffect(() => { if (data && data.counts.unseen > 0) markBadgesSeen(); }, [data]);
  if (error) return <div className="card"><div className="subtle tiny">Couldn&apos;t load badges. {error}</div></div>;
  if (!data) return <div className="muted center pad">Loading…</div>;
  const list = tab === "Earned" ? data.earned : data.available;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 7, margin: "2px 0 10px" }}>
        <span className="tnum" style={{ fontSize: 20, fontWeight: 800 }}>{data.counts.earned}</span>
        <span className="subtle tiny">of {data.counts.total} badges earned</span>
      </div>
      <SubPills items={["Earned", "Available"] as const} value={tab} onChange={setTab} />
      {list.length === 0
        ? <div className="subtle tiny center" style={{ padding: "18px 0" }}>{tab === "Earned" ? "No badges yet — keep training!" : "Everything unlocked. Legend."}</div>
        : <div style={{ display: "flex", flexWrap: "wrap", marginTop: 10 }}>{list.map((b) => <BadgeHex key={b.id} b={b} earned={tab === "Earned"} />)}</div>}
    </div>
  );
}

function DropPill({ options, value, onChange, placeholder }: { options: { key: string; label: string; icon?: string }[]; value: string; onChange: (k: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.key === value);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, border: `1px solid ${open ? "color-mix(in srgb, var(--ember) 55%, transparent)" : "var(--line)"}`, background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
        {cur?.icon ? <span>{cur.icon}</span> : null}<span>{cur?.label ?? placeholder ?? "Select"}</span><span style={{ color: "var(--muted)", fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 41, minWidth: 156, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.28)", overflow: "hidden", maxHeight: 264, overflowY: "auto" }}>
            {options.map((o, i) => (
              <button key={o.key} onClick={() => { onChange(o.key); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", background: o.key === value ? "var(--surface-2)" : "transparent", border: "none", borderTop: i ? "1px solid var(--line)" : "none", color: o.key === value ? "var(--ember)" : "var(--text)", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: o.key === value ? 700 : 600, textAlign: "left" }}>
                {o.icon ? <span>{o.icon}</span> : null}<span style={{ flex: 1 }}>{o.label}</span>{o.key === value ? <span style={{ fontSize: 12, color: "var(--ember)" }}>✓</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function History({ prs }: { prs: TrnPrs }) {
  const [tab, setTab] = useState<"Bests" | "Badges">("Bests");
  const [sport, setSport] = useState<string | null>(prs.default_sport);
  const [period, setPeriod] = useState<string>("all");
  const sportKey = sport && prs.sports.some((s) => s.key === sport) ? sport : (prs.default_sport || prs.sports[0]?.key || null);
  const recs: TrnPbRec[] = sportKey ? (prs.pb[period]?.[sportKey] || []) : [];

  return (
    <div>
      <SubPills items={["Bests", "Badges"] as const} value={tab} onChange={setTab} />

      {tab === "Bests" ? (
        prs.sports.length === 0 ? (
          <div className="subtle tiny center" style={{ padding: "20px 0" }}>No personal bests yet.</div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 8, margin: "2px 0 12px" }}>
              <DropPill options={prs.sports.map((s) => ({ key: s.key, label: s.label, icon: s.emoji }))} value={sportKey || ""} onChange={setSport} placeholder="Sport" />
              <DropPill options={PB_PERIODS.map((p) => ({ key: p.key, label: p.label }))} value={period} onChange={setPeriod} placeholder="All-time" />
            </div>

            {recs.length === 0
              ? <div className="subtle tiny center" style={{ padding: "18px 0" }}>No personal bests in this window.</div>
              : recs.map((rec) => <PBRow key={rec.label} rec={rec} />)}
          </div>
        )
      ) : (
        <Badges />
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
        <div style={{ display: "flex", gap: 3, background: "var(--surface-2)", borderRadius: 999, padding: 3 }}>
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} style={{ padding: "5px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: range === r ? "var(--t-grad)" : "transparent", color: range === r ? "#fff" : "var(--muted)" }}>{r}</button>
          ))}
        </div>
      </div>
      {graph("Weight · kg", (x) => x.weight_kg, "var(--ember)", "kg")}
      {graph("Body fat · %", (x) => x.body_fat_pct, "var(--gold)", "%")}
      {graph("Lean mass · kg", (x) => x.lean_mass_kg, "var(--success)", "kg")}
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
    <button onClick={() => onTap(c)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 10, background: c.planned ? hexA(s.color, 0.05) : hexA(s.color, 0.16), border: `1px ${c.planned ? "dashed" : "solid"} ${hexA(s.color, c.planned ? 0.45 : 0.5)}`, color: c.planned ? hexA(s.color, 0.85) : "var(--text)", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left" }}>
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
          <div key={d} style={{ display: "flex", gap: 10, padding: "8px", alignItems: "flex-start", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
            <div style={{ width: 40, flex: "none", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--ember)" : "var(--muted)" }}>{DOW[i]}</div>
              <div className="tnum" style={{ fontSize: 15, fontWeight: 700, color: isToday ? "var(--text)" : "var(--text-2)" }}>{dnum(d)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2, alignItems: "center", minHeight: 22 }}>
              {cs.length > 0
                ? cs.map((c) => <Chip key={c.key} c={c} onTap={onTap} />)
                : past
                  ? <span style={{ fontSize: 13, color: "var(--muted)" }}>⭐ Rest</span>
                  : <button onClick={() => onDate(d)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 10, background: "transparent", border: "1px dashed var(--line)", color: "var(--muted)", cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}>＋ Plan</button>}
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
        {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{d[0]}</div>)}
      </div>
      {Array.from({ length: 6 }, (_, w) => w).map((w) => (
        <div key={w} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {Array.from({ length: 7 }, (_, i) => isoAdd(gridStart, w * 7 + i)).map((d) => {
            const inMonth = d.slice(0, 7) === mon;
            const cs = cells.get(d) || [];
            const isToday = d === today;
            const tappable = cs.length > 0 || d >= today;
            return (
              <button key={d} onClick={() => tappable && onDay(d)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0 0", borderRadius: 8, border: isToday ? "1px solid var(--ember)" : "1px solid transparent", background: inMonth ? "var(--surface-2)" : "transparent", cursor: tappable ? "pointer" : "default", opacity: inMonth ? 1 : 0.3, font: "inherit" }}>
                <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: isToday ? "var(--ember)" : "var(--muted)" }}>{dnum(d)}</span>
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

function VolDelta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return null;
  const d = cur - prev;
  if (d === 0) return <span className="subtle tiny">±0</span>;
  const up = d > 0;
  const pct = Math.round((d / prev) * 100);
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? "var(--success)" : "var(--danger)" }}>{up ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function SportBlocks({ from, to, prevFrom, prevTo, str, car }: { from: string; to: string; prevFrom: string; prevTo: string; str: StrengthSession[]; car: CardioActivityLite[] }) {
  const blocks = useMemo(() => {
    const acc: Partial<Record<Sport, { sport: Sport; sessions: number; vol: number; km: number }>> = {};
    const bump = (sp: Sport) => (acc[sp] ??= { sport: sp, sessions: 0, vol: 0, km: 0 });
    for (const s of str) if (s.date >= from && s.date <= to) { const b = bump("strength"); b.sessions++; b.vol += s.volume || 0; }
    for (const a of car) { if (a.date < from || a.date > to) continue; const sp = normCardio(a.sport); if (!sp) continue; const b = bump(sp); b.sessions++; b.km += a.distance_km || 0; }
    return (["strength", "run", "cycle", "swim", "walk"] as Sport[]).map((o) => acc[o]).filter((b): b is { sport: Sport; sessions: number; vol: number; km: number } => !!b);
  }, [from, to, str, car]);
  const prevVol = useMemo(() => {
    const acc: Partial<Record<Sport, number>> = {};
    for (const s of str) if (s.date >= prevFrom && s.date <= prevTo) acc.strength = (acc.strength || 0) + (s.volume || 0);
    for (const a of car) { if (a.date < prevFrom || a.date > prevTo) continue; const sp = normCardio(a.sport); if (!sp) continue; acc[sp] = (acc[sp] || 0) + (a.distance_km || 0); }
    return acc;
  }, [prevFrom, prevTo, str, car]);
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
            <div className="tnum" style={{ marginTop: 5, fontWeight: 800, fontSize: vfont, color: "var(--text)", letterSpacing: "-0.4px", lineHeight: 1.1, whiteSpace: "nowrap" }}>
              {val}<span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginLeft: 2 }}>{unit}</span>
            </div>
            <div style={{ height: 15, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}><VolDelta cur={isStr ? b.vol : b.km} prev={prevVol[b.sport] || 0} /></div>
            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{s.label}</div>
            <div className="subtle tiny" style={{ whiteSpace: "nowrap" }}>{b.sessions} session{b.sessions === 1 ? "" : "s"}</div>
          </div>
        );
      })}
    </div>
  );
}

function StrengthSessionDetail({ s, onBack, embedded }: { s: StrengthSession; onBack: () => void; embedded?: boolean }) {
  const [ex, setEx] = useState<string | null>(null);
  if (ex) return <ExerciseDetail title={ex} onBack={() => setEx(null)} />;
  const dt = new Date(s.date + "T00:00:00");
  return (
    <div>
      <div className="trn-back">
        {embedded ? null : <button onClick={onBack} aria-label="Back">‹</button>}
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
          <span style={{ color: "var(--muted)", fontSize: 16 }}>›</span>
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
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {cs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: past ? 0 : 12 }}>
            {cs.map((c) => <Chip key={c.key} c={c} onTap={(cc) => { onClose(); onTap(cc); }} />)}
          </div>
        )}
        {cs.length === 0 && past && <div className="subtle tiny">⭐ Rest day</div>}
        {!past && (
          <button onClick={() => { onClose(); onDate(date); }} style={{ width: "100%", padding: "11px", borderRadius: 12, background: "transparent", border: "1px dashed var(--line)", color: "var(--ember)", cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700 }}>＋ Add or edit in calendar</button>
        )}
      </div>
    </div>
  );
}

function overviewStats(str: StrengthSession[], car: CardioActivityLite[], from: string, to: string) {
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const pTo = isoAdd(from, -1), pFrom = isoAdd(pTo, -(len - 1));
  const cur: Partial<Record<Sport, number>> = {}, prev: Partial<Record<Sport, number>> = {};
  const add = (o: Partial<Record<Sport, number>>, sp: Sport, v: number) => { o[sp] = (o[sp] || 0) + v; };
  for (const s of str) { const v = s.volume || 0; if (s.date >= from && s.date <= to) add(cur, "strength", v); else if (s.date >= pFrom && s.date <= pTo) add(prev, "strength", v); }
  for (const a of car) { const sp = normCardio(a.sport); if (!sp) continue; const v = a.distance_km || 0; if (a.date >= from && a.date <= to) add(cur, sp, v); else if (a.date >= pFrom && a.date <= pTo) add(prev, sp, v); }
  const order: Sport[] = ["strength", "run", "cycle", "swim", "walk"];
  return order.filter((sp) => (cur[sp] || 0) > 0).map((sp) => {
    const isStr = sp === "strength"; const c = cur[sp] || 0, p = prev[sp] || 0;
    return { sport: sp, emoji: SPORT[sp].emoji, val: isStr ? Math.round(c).toLocaleString("en-US") : c.toFixed(1), unit: isStr ? "kg" : "km", delta: p > 0 ? Math.round(((c - p) / p) * 100) : null };
  });
}

function Summary() {
  const router = useRouter();
  const [mode, setMode] = useState<"Week" | "Month">("Week");
  const [off, setOff] = useState(0);
  const [str, setStr] = useState<StrengthSession[] | null>(null);
  const [car, setCar] = useState<CardioActivityLite[] | null>(null);
  const [plan, setPlan] = useState<PlanSession[]>([]);
  const [selWeekStart, setSelWeekStart] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
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
    planRange<{ sessions: PlanSession[] }>(mondayOf(from), isoAdd(mondayOf(to), 6)).then((r) => a && setPlan(r.sessions || [])).catch(() => a && setPlan([]));
    return () => { a = false; };
  }, [from, to]);
  useEffect(() => { setSelWeekStart(null); }, [mode, off]);

  const loading = str == null || car == null;
  const label = mode === "Week" ? `${dnum(from)} ${MON[moni(from)]} – ${dnum(to)} ${MON[moni(to)]}` : `${MON[moni(from)]} ${from.slice(0, 4)}`;

  const weeks: { start: string; label: string }[] = [];
  if (mode === "Month") { let ws = mondayOf(from), i = 1; while (ws <= to) { weeks.push({ start: ws, label: "W" + i }); ws = isoAdd(ws, 7); i++; } }
  const planWeek = mode === "Week" ? from : selWeekStart; // Month: null until a week chip is tapped (inline expand)
  const planEnd = planWeek ? isoAdd(planWeek, 6) : "";

  const stats = loading ? [] : overviewStats(str ?? [], car ?? [], from, to);
  const weekCells = (!loading && planWeek) ? buildCells(planWeek, planEnd, str ?? [], car ?? [], plan, today) : new Map<string, Cell[]>();

  const openDate = (d: string) => router.push(`/more/schedule?date=${d}`);
  const onTap = (c: Cell) => {
    if (c.cardioId) setOpen({ kind: "cardio", id: c.cardioId, sport: CARDIO_API[c.sport] });
    else if (c.strength) setOpen({ kind: "strength", s: c.strength });
    else openDate(c.date);
  };
  const weekCount = (ws: string) => { const we = isoAdd(ws, 6); let n = 0; for (const s of (str ?? [])) if (s.date >= ws && s.date <= we) n++; for (const a of (car ?? [])) if (a.date >= ws && a.date <= we && normCardio(a.sport)) n++; return n; };
  const weekDots = (ws: string) => { const we = isoAdd(ws, 6); const out: string[] = []; for (const s of (str ?? [])) if (s.date >= ws && s.date <= we) out.push(SPORT.strength.color); for (const a of (car ?? [])) { const sp = normCardio(a.sport); if (sp && a.date >= ws && a.date <= we) out.push(SPORT[sp].color); } return out.slice(0, 7); };
  const seg: React.CSSProperties = { fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 9, cursor: "pointer", border: "none" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 10 }}>
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 12, padding: 3 }}>
          {(["Week", "Month"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setOff(0); }} style={{ ...seg, background: mode === m ? "var(--t-grad)" : "transparent", color: mode === m ? "#fff" : "var(--muted)" }}>{m}</button>
          ))}
        </div>
        <div className="card" style={{ flex: 1, margin: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <button aria-label="Older" onClick={() => setOff((o) => Math.min(o + 1, 104))} style={{ background: "none", border: "none", color: "var(--ember)", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>◀</button>
          <span style={{ fontWeight: 800, fontSize: 13 }}>{label}</span>
          <button aria-label="Newer" disabled={off <= -4} onClick={() => setOff((o) => Math.max(o - 1, -4))} style={{ background: "none", border: "none", color: off <= -4 ? "var(--faint)" : "var(--ember)", fontSize: 14, cursor: off <= -4 ? "default" : "pointer", lineHeight: 1 }}>▶</button>
        </div>
      </div>

      {loading ? <div className="muted center pad">Loading…</div> : (
        <>
          {stats.length > 0 ? (
            <div className="card" style={{ display: "flex", alignItems: "stretch", padding: "10px 0", marginBottom: 8 }}>
              {stats.map((s, i) => (
                <div key={s.sport} style={{ flex: 1, textAlign: "center", borderRight: i < stats.length - 1 ? "1px solid var(--line)" : "none", padding: "0 4px" }}>
                  <div style={{ fontSize: 14, lineHeight: 1 }}>{s.emoji}</div>
                  <div className="tnum" style={{ fontWeight: 900, fontSize: 13, marginTop: 3, whiteSpace: "nowrap" }}>{s.val}</div>
                  <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{s.unit}{s.delta != null ? <> · <span style={{ color: s.delta >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 800 }}>{s.delta >= 0 ? "▲" : "▼"}{Math.abs(s.delta)}%</span></> : null}</div>
                </div>
              ))}
            </div>
          ) : <div className="subtle tiny center" style={{ padding: "14px 0" }}>No sessions logged in this window yet.</div>}

          {mode === "Month" && weeks.length > 0 ? (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {weeks.map((w) => {
                const sel = w.start === selWeekStart;
                const cnt = weekCount(w.start);
                return (
                  <button key={w.start} onClick={() => setSelWeekStart(sel ? null : w.start)} style={{ flex: 1, background: sel ? hexA("#c0704d", 0.10) : "var(--surface)", borderRadius: 10, padding: "6px 4px", textAlign: "center", border: `1px solid ${sel ? "var(--ember)" : "var(--line)"}`, cursor: "pointer", fontFamily: "inherit" }}>
                    <div className="subtle" style={{ fontSize: 9, fontWeight: 800 }}>{w.label}</div>
                    <div className="tnum" style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.3 }}>{cnt || "—"}</div>
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", height: 4 }}>{weekDots(w.start).map((c, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: 999, background: c }} />)}</div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {planWeek ? (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 900 }}>Weekly Plan</span>
                <span className="subtle tiny">{dnum(planWeek)} {MON[moni(planWeek)]} – {dnum(planEnd)} {MON[moni(planEnd)]}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const date = isoAdd(planWeek, i);
                  const cs = weekCells.get(date) || [];
                  const isToday = date === today;
                  return (
                    <div key={date} style={{ textAlign: "center", borderRadius: 8, padding: "3px 1px", background: isToday ? hexA("#c0704d", 0.10) : "transparent" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: isToday ? "var(--ember)" : "var(--muted)", marginBottom: 4 }}>{DOW[i][0]}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", minHeight: 16 }}>
                        {cs.slice(0, 3).map((c) => {
                          const sc = SPORT[c.sport];
                          return <button key={c.key} onClick={() => (c.planned ? openDate(c.date) : onTap(c))} style={{ display: "block", width: "100%", fontSize: 9, fontWeight: 700, padding: "3px 2px", borderRadius: 6, background: c.planned ? "transparent" : hexA(sc.color, 0.16), border: `1px ${c.planned ? "dashed" : "solid"} ${hexA(sc.color, c.planned ? 0.4 : 0.5)}`, color: c.planned ? hexA(sc.color, 0.9) : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.25 }}>{c.sport === "strength" ? "Gym" : sc.label}</button>;
                        })}
                        {cs.length === 0 && date < today ? <div style={{ fontSize: 15, lineHeight: 1, color: "var(--gold)", filter: "drop-shadow(0 0 3px rgba(245,197,66,0.5))" }}>★</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <KaiDailyCard scope="training" />
          <div style={{ height: 14 }} />
          <OverviewFitness />
        </>
      )}

      <Sheet open={open?.kind === "cardio"} title="Activity" onClose={() => setOpen(null)}>
        {open?.kind === "cardio" ? <CardioActivityDetail id={open.id} sport={open.sport} onBack={() => setOpen(null)} embedded /> : null}
      </Sheet>
      <Sheet open={open?.kind === "strength"} title="Workout" onClose={() => setOpen(null)}>
        {open?.kind === "strength" ? <StrengthSessionDetail s={open.s} onBack={() => setOpen(null)} embedded /> : null}
      </Sheet>
    </div>
  );
}

const OVR_RANGES = ["6W", "3M", "6M"] as const;
const OVR_DAYS: Record<string, number> = { "6W": 42, "3M": 91, "6M": 182 };
const FC = { ctl: "#6d8bff", atl: "#ff7aa8", tsb: "#ffb547" };
function ovrForm(tsb: number): { label: string; color: string } {
  if (tsb > 5) return { label: "Fresh", color: "var(--success)" };
  if (tsb >= -10) return { label: "Neutral", color: "var(--muted)" };
  if (tsb >= -30) return { label: "Tired", color: "var(--gold)" };
  return { label: "Very tired", color: "var(--danger)" };
}
const ovrPad2 = (n: number) => String(n).padStart(2, "0");
const ovrPaceKm = (s: number) => `${Math.floor(s / 60)}:${ovrPad2(Math.round(s % 60))}/km`;
const ovrPace100 = (s: number) => `${Math.floor(s / 60)}:${ovrPad2(Math.round(s % 60))}/100m`;

function OverviewFitness() {
  const [range, setRange] = useState<(typeof OVR_RANGES)[number]>("3M");
  const [resp, setResp] = useState<{ load: TrnLoadPoint[]; thresholds: TrnThreshold[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState<number | null>(null);
  useEffect(() => { let a = true; trainingLoad(190).then((d) => a && setResp({ load: d.load || [], thresholds: d.thresholds || [] })).catch(() => a && setFailed(true)); return () => { a = false; }; }, []);
  if (failed) return null;

  const pts = resp ? resp.load.slice(-OVR_DAYS[range]) : [];
  const n = pts.length;
  const idx = cur == null ? n - 1 : Math.max(0, Math.min(n - 1, cur));
  const sel = pts[idx];
  const last = resp && resp.load.length ? resp.load[resp.load.length - 1] : null;
  const ctl = last?.ctl ?? 0, atl = last?.atl ?? 0, tsb = last?.tsb ?? 0;
  const st = ovrForm(tsb);

  const W = 330, H = 60, pd = 6;
  const xs = (i: number) => (n <= 1 ? pd : pd + (i / (n - 1)) * (W - 2 * pd));
  const load = pts.flatMap((p) => [p.ctl, p.atl]);
  let lo = load.length ? Math.min(...load) : 0, hi = load.length ? Math.max(...load) : 1; if (hi === lo) hi = lo + 1;
  const ys = (v: number) => pd + (1 - (v - lo) / (hi - lo)) * (H - 2 * pd);
  const line = (k: "ctl" | "atl") => pts.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)} ${ys(p[k]).toFixed(1)}`).join(" ");
  const onMove = (e: React.PointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); if (r.width > 0) setCur(Math.round(((e.clientX - r.left) / r.width) * (n - 1))); };
  const cursorPct = `${(xs(idx) / W) * 100}%`;

  const thr = (sport: string, metric: string) => resp?.thresholds.find((t) => t.sport === sport && t.metric === metric);
  const ftp = thr("bike", "ftp_w"), lthrB = thr("bike", "lthr"), lthrR = thr("run", "lthr"), tpace = thr("run", "threshold_pace_s_per_km"), css = thr("swim", "css_pace_s_per_100m");
  const thCell = (icon: string, lbl: string, val: string, span?: boolean) => (
    <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gridColumn: span ? "1 / -1" : undefined }}>
      <span className="subtle tiny">{icon} {lbl}</span><b style={{ fontSize: 12 }}>{val}</b>
    </div>
  );

  return (
    <>
      <section className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>Fitness &amp; Form</span>
          <SubPills items={OVR_RANGES} value={range} onChange={(r) => { setRange(r); setCur(null); }} />
        </div>
        {resp == null ? <div className="muted center pad">Loading…</div> : (
          <>
            <div style={{ display: "flex", marginBottom: 8 }}>
              <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--line)" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 16, color: FC.ctl }}>{ctl.toFixed(0)}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>Fitness · CTL 42d</div></div>
              <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--line)" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 16, color: FC.atl }}>{atl.toFixed(0)}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>Fatigue · ATL 7d</div></div>
              <div style={{ flex: 1, textAlign: "center" }}><div className="tnum" style={{ fontWeight: 900, fontSize: 16, color: st.color }}>{tsb > 0 ? "+" : ""}{tsb.toFixed(0)}</div><div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>Form · {st.label}</div></div>
            </div>
            {sel ? <div style={{ textAlign: "center", fontSize: 9, fontWeight: 800, color: "var(--ember)", background: hexA("#c0704d", 0.12), borderRadius: 999, padding: "3px 0", marginBottom: 6 }}>{dnum(sel.date)} {MON[moni(sel.date)]} · Fitness {sel.ctl.toFixed(0)} · Fatigue {sel.atl.toFixed(0)}</div> : null}
            {n < 2 ? <div className="subtle tiny center" style={{ padding: "20px 0" }}>Not enough data yet</div> : (
              <div style={{ position: "relative", height: H, touchAction: "none" }} onPointerDown={onMove} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") onMove(e); }}>
                <svg className="trn-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", position: "absolute", inset: 0, height: H, width: "100%" }}>
                  <path d={line("atl")} fill="none" stroke={FC.atl} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  <path d={line("ctl")} fill="none" stroke={FC.ctl} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </svg>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: cursorPct, width: 1, background: "var(--line)" }} />
                <div style={{ position: "absolute", left: cursorPct, top: ys(sel.ctl), width: 7, height: 7, borderRadius: 999, background: FC.ctl, border: "1.5px solid var(--surface)", transform: "translate(-50%,-50%)" }} />
                <div style={{ position: "absolute", left: cursorPct, top: ys(sel.atl), width: 7, height: 7, borderRadius: 999, background: FC.atl, border: "1.5px solid var(--surface)", transform: "translate(-50%,-50%)" }} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {[0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].map((i, k) => (pts[i] ? <span key={k} className="subtle" style={{ fontSize: 8, fontWeight: 700 }}>{dnum(pts[i].date)} {MON[moni(pts[i].date)]}</span> : <span key={k} />))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 5 }}>
              <span className="subtle" style={{ fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: FC.ctl }} />Fitness</span>
              <span className="subtle" style={{ fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: FC.atl }} />Fatigue</span>
            </div>
          </>
        )}
      </section>
      {resp && resp.thresholds.length ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 2px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 900 }}>Thresholds</span>
            <span className="subtle tiny">auto-updated · TSS per session</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {thCell("🚴", "FTP", ftp ? `${ftp.value.toFixed(0)} W` : "—")}
            {thCell("🚴", "LTHR", lthrB ? `${lthrB.value.toFixed(0)} bpm` : "—")}
            {thCell("🏃", "Thr pace", tpace ? ovrPaceKm(tpace.value) : "—")}
            {thCell("🏃", "LTHR", lthrR ? `${lthrR.value.toFixed(0)} bpm` : "—")}
            {thCell("🏊", "CSS", css ? ovrPace100(css.value) : "—", true)}
          </div>
        </>
      ) : null}
    </>
  );
}

export default function ProgressTab() {
  const [sub, setSub] = useState<"Overview" | "Activities" | "Insights" | "Milestones">("Overview");
  const { data: prs, error } = useTrain<TrnPrs>("prs");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["Overview", "Activities", "Insights", "Milestones"] as const).map((t) => {
          const on = sub === t;
          return (
            <button key={t} onClick={() => setSub(t)} style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 800, padding: "7px 2px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.1, background: on ? "var(--t-grad)" : "var(--surface-2)", color: on ? "#fff" : "var(--muted)", border: `1px solid ${on ? "transparent" : "var(--line)"}`, whiteSpace: "nowrap" }}>{t}</button>
          );
        })}
      </div>
      {sub === "Overview" ? (
        <Summary />
      ) : sub === "Activities" ? (
        <ActivitiesTab />
      ) : sub === "Insights" ? (
        <InsightsTab />
      ) : error ? (
        <div className="card error"><strong>Couldn&apos;t load</strong><div className="subtle">{error}</div></div>
      ) : (
        prs ? <History prs={prs} /> : <div className="muted center pad">Loading…</div>
      )}
    </div>
  );
}
