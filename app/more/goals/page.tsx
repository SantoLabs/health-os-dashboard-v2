"use client";

import { useState, useEffect, useMemo } from "react";
import { useApi, actionGet, actionPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Goals = {
  body_comp: {
    bia_bf: number; dexa_bf: number; goal_bf: number; goal_by: string;
    latest_weight: number; weight_as_of: string;
    weight_history: { kg: number; date: string; source: string }[];
  };
};

type UGoal = {
  id: string; label: string; when_text?: string; target_date: string | null;
  goal_type: string; status: string; focus: string; deleted: boolean;
  created_at: string; updated_at: string; days_away: number | null; source?: string;
};

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  race: { emoji: "🏁", label: "Race" }, run: { emoji: "🏃", label: "Run" }, swim: { emoji: "🏊", label: "Swim" },
  bike: { emoji: "🚴", label: "Bike" }, strength: { emoji: "💪", label: "Strength" }, triathlon: { emoji: "🏅", label: "Triathlon" },
  body: { emoji: "⚖️", label: "Body" }, other: { emoji: "🎯", label: "Other" },
};
const TYPES = Object.keys(TYPE_META);
const tEmoji = (t: string) => TYPE_META[t]?.emoji ?? "🎯";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Yet to start", cls: "st-todo" },
  in_progress: { label: "In progress", cls: "st-prog" },
  done: { label: "Done", cls: "st-done" },
};
const STATUSES = Object.keys(STATUS_META);
const FOCUS_META: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "fo-low" }, medium: { label: "Med", cls: "fo-med" }, high: { label: "High", cls: "fo-high" },
};
const FOCUSES = Object.keys(FOCUS_META);
const FOCUS_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Record<string, number> = { in_progress: 0, not_started: 1, done: 2 };

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No date";
const fmtShort = (iso?: string) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

function awayPill(days: number | null) {
  if (days == null) return null;
  const cls = days < 0 ? "ok" : days <= 30 ? "warn" : "";
  const txt = days < 0 ? `${-days}d ago` : days === 0 ? "today" : `in ${days}d`;
  return <span className={`pill ${cls}`}>{txt}</span>;
}

// ---- Month calendar ----
function MonthCalendar({ goals }: { goals: UGoal[] }) {
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState<number | null>(null);

  const first = new Date(cur.y, cur.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const byDay: Record<number, UGoal[]> = {};
  for (const g of goals) {
    if (!g.target_date) continue;
    const d = new Date(g.target_date + "T00:00:00");
    if (d.getFullYear() === cur.y && d.getMonth() === cur.m) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(g);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prev = () => { setSel(null); setCur((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })); };
  const next = () => { setSel(null); setCur((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })); };
  const isToday = (d: number) => now.getFullYear() === cur.y && now.getMonth() === cur.m && now.getDate() === d;
  const selGoals = sel != null ? byDay[sel] || [] : [];

  return (
    <section className="card cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={prev}>‹</button>
        <span className="cal-title">{title}</span>
        <button className="cal-nav" onClick={next}>›</button>
      </div>
      <div className="cal-grid cal-dow">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="cal-dowc">{d}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d == null) return <span key={i} className="cal-cell empty" />;
          const has = byDay[d];
          return (
            <button key={i} className={`cal-cell${has ? " has" : ""}${isToday(d) ? " today" : ""}${sel === d ? " sel" : ""}`}
              onClick={() => setSel(sel === d ? null : d)} disabled={!has}>
              {d}
              {has && <span className="cal-dot" />}
            </button>
          );
        })}
      </div>
      {selGoals.length > 0 && (
        <div className="cal-day-goals">
          {selGoals.map((g) => (
            <div key={g.id} className="cal-gline"><span>{tEmoji(g.goal_type)}</span><span>{g.label}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}

type SortKey = "date" | "priority" | "status" | "type";

export default function GoalsPage() {
  const { data, error } = useApi<Goals>("goals");
  const bc = data?.body_comp;
  const progress = bc ? Math.max(0, Math.min(100, ((bc.dexa_bf - bc.bia_bf) / (bc.dexa_bf - bc.goal_bf)) * 100)) : 0;
  const wStart = bc?.weight_history?.find((w) => w.source === "withings")?.kg;
  const wDelta = bc && wStart ? bc.latest_weight - wStart : undefined;

  const [goals, setGoals] = useState<UGoal[] | null>(null);
  const [removed, setRemoved] = useState<UGoal[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ label: "", target_date: "", goal_type: "race", status: "not_started", focus: "medium" });
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortKey>("date");

  // editable body-fat goal
  const [bfEdit, setBfEdit] = useState(false);
  const [bfVal, setBfVal] = useState("");
  const [bfGoal, setBfGoal] = useState<number | null>(null);
  useEffect(() => { if (bc?.goal_bf != null && bfGoal == null) setBfGoal(bc.goal_bf); }, [bc, bfGoal]);

  function apply(d: { goals: UGoal[]; deleted_goals: UGoal[] }) { setGoals(d.goals); setRemoved(d.deleted_goals || []); }
  useEffect(() => {
    let alive = true;
    actionGet<{ goals: UGoal[]; deleted_goals: UGoal[] }>("goals_list").then((d) => { if (alive) apply(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

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
  async function act(route: string, id: string) {
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

  const active = (goals || []).filter((g) => g.status !== "done");
  const done = (goals || []).filter((g) => g.status === "done");
  const sorted = useMemo(() => {
    const byDate = (a: UGoal, b: UGoal) => (a.target_date || "9999").localeCompare(b.target_date || "9999");
    const arr = [...active];
    if (sort === "date") arr.sort(byDate);
    else if (sort === "priority") arr.sort((a, b) => (FOCUS_RANK[a.focus] - FOCUS_RANK[b.focus]) || byDate(a, b));
    else if (sort === "status") arr.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || byDate(a, b));
    else if (sort === "type") arr.sort((a, b) => a.goal_type.localeCompare(b.goal_type) || byDate(a, b));
    return arr;
  }, [active, sort]);

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
        {TYPES.map((t) => (
          <button key={t} className={t === form.goal_type ? "type-btn active" : "type-btn"} onClick={() => setForm({ ...form, goal_type: t })}>
            <span>{TYPE_META[t].emoji}</span><span className="type-cap">{TYPE_META[t].label}</span>
          </button>
        ))}
      </div>
      <div className="g-field-label">Status</div>
      {Seg(STATUSES.map((s) => ({ v: s, label: STATUS_META[s].label })), form.status, (v) => setForm({ ...form, status: v }))}
      <div className="g-field-label">Focus</div>
      {Seg(FOCUSES.map((f) => ({ v: f, label: FOCUS_META[f].label })), form.focus, (v) => setForm({ ...form, focus: v }))}
      <div className="goal-form-row">
        <button className="btn" onClick={save} disabled={busy || !form.label.trim()}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
        {editing && editing !== "new" && <button className="btn btn-danger" onClick={() => act("goal_delete", editing)} disabled={busy} style={{ marginLeft: "auto" }}>Delete</button>}
      </div>
    </div>
  );

  const GoalRow = (g: UGoal) => (
    <button className="goal-row" onClick={() => startEdit(g)}>
      <span className="cardio-ic">{tEmoji(g.goal_type)}</span>
      <div className="cardio-main">
        <div className="session-title">{g.label}</div>
        <div className="subtle tiny">{fmtDate(g.target_date)} · added {fmtShort(g.created_at)}{g.updated_at && g.updated_at !== g.created_at ? ` · edited ${fmtShort(g.updated_at)}` : ""}</div>
        <div className="chip-row">
          <span className={`chip ${STATUS_META[g.status]?.cls}`}>{STATUS_META[g.status]?.label}</span>
          <span className={`chip ${FOCUS_META[g.focus]?.cls}`}>{FOCUS_META[g.focus]?.label} focus</span>
        </div>
      </div>
      {awayPill(g.days_away)}
      <span className="chev-edit">✎</span>
    </button>
  );

  return (
    <Screen title="Goals & Body" back="/more" error={error} loading={!data && !error}>
      {goals && <MonthCalendar goals={active} />}

      {bc && (
        <>
          <h2 className="section-title">Body composition</h2>
          <section className="card">
            <div className="lever-top">
              <span>Body fat <strong>{bc.bia_bf}%</strong> <span className="subtle tiny">BIA · DEXA {bc.dexa_bf}%</span></span>
              {!bfEdit ? (
                <button className="goal-inline-edit" onClick={() => { setBfEdit(true); setBfVal(String(bfGoal ?? bc.goal_bf)); }}>
                  goal {bfGoal ?? bc.goal_bf}% by {bc.goal_by} ✎
                </button>
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

      {goals && active.length > 1 && (
        <div className="sort-row">
          <span className="subtle tiny">Sort</span>
          {Seg(([["date", "Date"], ["priority", "Priority"], ["status", "Status"], ["type", "Type"]] as [SortKey, string][]).map(([v, l]) => ({ v, label: l })), sort, setSort, "seg-sm")}
        </div>
      )}

      {editing === "new" && <section className="card goal-card"><div className="goal-form" style={{ padding: "14px 16px" }}>{EditForm}</div></section>}

      <section className="list">
        {goals == null && <div className="subtle tiny" style={{ padding: 12, textAlign: "center" }}>Loading goals…</div>}
        {goals?.length === 0 && editing !== "new" && <div className="subtle tiny" style={{ padding: "4px 4px 8px" }}>No goals yet — add your first one.</div>}
        {sorted.map((g) => (
          <div key={g.id} className="card goal-card">{editing === g.id ? EditForm : GoalRow(g)}</div>
        ))}
      </section>

      {done.length > 0 && (
        <>
          <h2 className="section-title">Completed 🎉</h2>
          <section className="list">
            {done.map((g) => (
              <div key={g.id} className="card goal-card done-card">
                {editing === g.id ? EditForm : (
                  <button className="goal-row" onClick={() => startEdit(g)}>
                    <span className="cardio-ic">🥳</span>
                    <div className="cardio-main">
                      <div className="session-title done-text">{tEmoji(g.goal_type)} {g.label}</div>
                      <div className="subtle tiny">{fmtDate(g.target_date)} · done</div>
                    </div>
                    <span className="chev-edit">✎</span>
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}

      {removed.length > 0 && (
        <>
          <h2 className="section-title">Removed</h2>
          <section className="list">
            {removed.map((g) => (
              <div key={g.id} className="card goal-card removed-card">
                <div className="goal-row static">
                  <span className="cardio-ic">{tEmoji(g.goal_type)}</span>
                  <div className="cardio-main">
                    <div className="session-title struck">{g.label}</div>
                    <div className="subtle tiny">{fmtDate(g.target_date)}</div>
                  </div>
                  <button className="btn-add" onClick={() => act("goal_restore", g.id)} disabled={busy}>↺ Restore</button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </Screen>
  );
}
