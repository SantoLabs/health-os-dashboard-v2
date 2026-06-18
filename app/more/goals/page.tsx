"use client";

import { useState, useEffect } from "react";
import { useApi, actionGet, actionPost } from "../../lib/api";
import { Screen } from "../../components/Screen";

type Goals = {
  body_comp: {
    bia_bf: number; dexa_bf: number; goal_bf: number; goal_by: string;
    latest_weight: number; weight_as_of: string;
    weight_history: { kg: number; date: string; source: string }[];
  };
};

type UGoal = { id: string; label: string; when_text?: string; target_date: string | null; days_away: number | null; source?: string };

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No date set";

function awayPill(days: number | null) {
  if (days == null) return null;
  const cls = days < 0 ? "ok" : days <= 30 ? "warn" : "";
  const txt = days < 0 ? `${-days}d ago` : days === 0 ? "today" : `in ${days}d`;
  return <span className={`pill ${cls}`}>{txt}</span>;
}

export default function GoalsPage() {
  const { data, error } = useApi<Goals>("goals");
  const bc = data?.body_comp;
  const progress = bc ? Math.max(0, Math.min(100, ((bc.dexa_bf - bc.bia_bf) / (bc.dexa_bf - bc.goal_bf)) * 100)) : 0;
  const wStart = bc?.weight_history?.find((w) => w.source === "withings")?.kg;
  const wDelta = bc && wStart ? bc.latest_weight - wStart : undefined;

  const [goals, setGoals] = useState<UGoal[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<{ label: string; target_date: string }>({ label: "", target_date: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    actionGet<{ goals: UGoal[] }>("goals_list").then((d) => { if (alive) setGoals(d.goals); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const startEdit = (g: UGoal) => { setEditing(g.id); setForm({ label: g.label, target_date: g.target_date || "" }); };
  const startNew = () => { setEditing("new"); setForm({ label: "", target_date: "" }); };

  async function save() {
    if (!form.label.trim() || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { label: form.label.trim(), target_date: form.target_date || null };
      if (editing && editing !== "new") body.id = editing;
      const d = await actionPost<{ goals: UGoal[] }>("goal_save", body);
      setGoals(d.goals); setEditing(null);
    } catch { /* keep form open on error */ } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (busy) return;
    setBusy(true);
    try { const d = await actionPost<{ goals: UGoal[] }>("goal_delete", { id }); setGoals(d.goals); setEditing(null); }
    catch { /* noop */ } finally { setBusy(false); }
  }

  const EditForm = (
    <div className="goal-form">
      <input className="g-input" placeholder="Goal (e.g. Malnad Ultra)" value={form.label}
        onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus />
      <input className="g-input" type="date" value={form.target_date}
        onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
      <div className="goal-form-row">
        <button className="btn" onClick={save} disabled={busy || !form.label.trim()}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
        {editing && editing !== "new" && (
          <button className="btn btn-danger" onClick={() => del(editing)} disabled={busy} style={{ marginLeft: "auto" }}>Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <Screen title="Goals & Body" back="/more" error={error} loading={!data && !error}>
      {bc && (
        <>
          <h2 className="section-title">Body composition</h2>
          <section className="card">
            <div className="lever-top">
              <span>Body fat <strong>{bc.bia_bf}%</strong> <span className="subtle tiny">BIA · DEXA {bc.dexa_bf}%</span></span>
              <span className="subtle tiny">goal {bc.goal_bf}% by {bc.goal_by}</span>
            </div>
            <div className="track" style={{ marginTop: 12 }}>
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="subtle tiny mt8">{Math.round(progress)}% of the way from {bc.dexa_bf}% → {bc.goal_bf}%</div>
            <div className="lever-top" style={{ marginTop: 14 }}>
              <span>Weight <strong>{bc.latest_weight}kg</strong></span>
              {wDelta != null && <span className={`pill ${wDelta <= 0 ? "ok" : "warn"}`}>{wDelta > 0 ? "+" : ""}{wDelta.toFixed(1)}kg</span>}
            </div>
          </section>
        </>
      )}

      <div className="lever-top" style={{ margin: "18px 4px 10px" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Race goals</h2>
        {editing !== "new" && <button className="btn-add" onClick={startNew}>+ Add</button>}
      </div>

      {editing === "new" && <section className="card">{EditForm}</section>}

      <section className="list">
        {goals == null && <div className="subtle tiny pad center">Loading goals…</div>}
        {goals?.length === 0 && editing !== "new" && <div className="subtle tiny" style={{ padding: "4px 4px 8px" }}>No goals yet — add your first race.</div>}
        {goals?.map((g) => (
          <div key={g.id} className="card goal-card">
            {editing === g.id ? EditForm : (
              <button className="goal-row" onClick={() => startEdit(g)}>
                <span className="cardio-ic">🏁</span>
                <div className="cardio-main">
                  <div className="session-title">{g.label}</div>
                  <div className="subtle tiny">{fmtDate(g.target_date)}</div>
                </div>
                {awayPill(g.days_away)}
                <span className="chev-edit">✎</span>
              </button>
            )}
          </div>
        ))}
      </section>
    </Screen>
  );
}
