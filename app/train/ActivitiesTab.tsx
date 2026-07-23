"use client";

import { useState } from "react";
import StrengthTab from "./StrengthTab";
import CardioTab from "./CardioTab";
import Icon from "../components/Icon";

// Progress → Activities. Strength + cardio history, migrated out of the Train
// hub. Segmented Strength|Cardio toggle (14a); each surface owns its filters + detail sheet.
export default function ActivitiesTab() {
  const [mode, setMode] = useState<"Strength" | "Cardio">("Strength");
  return (
    <div>
      <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 12, padding: 3, marginBottom: 10 }}>
        {([["Strength", "strength"], ["Cardio", "run"]] as const).map(([m, ic]) => {
          const on = mode === m;
          return (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, padding: "7px 0", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", background: on ? "var(--t-grad)" : "transparent", color: on ? "#fff" : "var(--muted)" }}><Icon name={ic} size={13} /> {m}</button>
          );
        })}
      </div>
      {mode === "Strength" ? <StrengthTab /> : <CardioTab />}
    </div>
  );
}
