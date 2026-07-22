"use client";

import { useState } from "react";
import { SubPills } from "./ui";
import StrengthTab from "./StrengthTab";
import CardioTab from "./CardioTab";

// Progress → Activities. Strength + cardio history, migrated out of the Train
// hub. Strength|Cardio toggle; each surface owns its own filters + detail sheet.
export default function ActivitiesTab() {
  const [mode, setMode] = useState<"Strength" | "Cardio">("Strength");
  return (
    <div>
      <SubPills items={["Strength", "Cardio"] as const} value={mode} onChange={setMode} />
      {mode === "Strength" ? <StrengthTab /> : <CardioTab />}
    </div>
  );
}
