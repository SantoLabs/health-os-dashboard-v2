"use client";

import { useMemo, useState } from "react";
import { useTrain, type TrnProgress, type TrnBody } from "../../lib/api";
import { Screen } from "../../components/Screen";
import { Spark, Delta, dShort } from "../../train/ui";

// Body composition — measurements + trends. Ported out of the old Train > Progress
// "Body" tab during the P6 revamp (that tab was dropped, not migrated). Body-fat
// *target* editing lives with Goals; this page owns the measured data.
const RANGES = ["3M", "6M", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

export default function BodyPage() {
  const { data, error } = useTrain<TrnProgress>("progress");
  const [range, setRange] = useState<Range>("3M");

  const trend = useMemo(() => data?.body_trend || [], [data]);
  const b = data?.body_latest || null;

  const win = useMemo(() => {
    if (range === "All") return trend;
    const days = range === "3M" ? 90 : range === "6M" ? 182 : 365;
    const cutoff = new Date(Date.now() + 5.5 * 3600000 - days * 86400000).toISOString().slice(0, 10);
    return trend.filter((x) => x.date >= cutoff);
  }, [trend, range]);

  const periodDelta = (pick: (x: TrnBody) => number | null): number | null => {
    const nums = win.map(pick).filter((v): v is number => v != null);
    return nums.length >= 2 ? nums[nums.length - 1] - nums[0] : null;
  };

  const cell = (val: string, label: string, divider: boolean) => (
    <div style={{ flex: 1, textAlign: "center", borderRight: divider ? "1px solid var(--line)" : "none" }}>
      <div className="tnum" style={{ fontWeight: 900, fontSize: 15 }}>{val}</div>
      <div className="subtle" style={{ fontSize: 9, fontWeight: 700 }}>{label}</div>
    </div>
  );

  const graph = (title: string, pick: (x: TrnBody) => number | null, color: string, unit: string) => (
    <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>{title}</span>
        <Delta v={periodDelta(pick)} unit={unit} suffix={range} />
      </div>
      <Spark values={win.map(pick)} color={color} height={92} />
    </div>
  );

  return (
    <Screen title="Body" back="/more" error={error} loading={!data && !error}>
      {data ? (
        <>
          <div className="card" style={{ padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 900 }}>Composition</span>
              <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", borderRadius: 999, padding: 2 }}>
                {RANGES.map((r) => (
                  <button key={r} onClick={() => setRange(r)} style={{ padding: "3px 9px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 800, fontFamily: "inherit", background: range === r ? "var(--t-grad)" : "transparent", color: range === r ? "#fff" : "var(--muted)" }}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex" }}>
              {cell(b?.weight_kg != null ? b.weight_kg.toFixed(1) : "—", "weight kg", true)}
              {cell(b?.body_fat_pct != null ? `${b.body_fat_pct.toFixed(1)}%` : "—", "body fat", true)}
              {cell(b?.lean_mass_kg != null ? b.lean_mass_kg.toFixed(1) : "—", "lean kg", false)}
            </div>
          </div>

          {trend.length === 0 ? (
            <div className="card"><div className="subtle tiny" style={{ lineHeight: 1.5 }}>No body measurements logged yet — once your scale syncs, weight, body fat and lean mass trends will show up here.</div></div>
          ) : (
            <>
              {graph("Weight · kg", (x) => x.weight_kg, "var(--ember)", "kg")}
              {graph("Body fat · %", (x) => x.body_fat_pct, "var(--gold)", "%")}
              {graph("Lean mass · kg", (x) => x.lean_mass_kg, "var(--success)", "kg")}
            </>
          )}

          {b?.date ? <div className="subtle tiny center" style={{ marginTop: 4 }}>Last measured {dShort(b.date)}</div> : null}
        </>
      ) : null}
    </Screen>
  );
}
