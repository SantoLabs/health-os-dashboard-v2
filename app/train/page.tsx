"use client";

import { useState } from "react";
import { Screen } from "../components/Screen";
import { Pills, SubPills, type Primary } from "./ui";
import CoachPanel from "./CoachPanel";
import WorkoutsTab from "./WorkoutsTab";
import StrengthTab from "./StrengthTab";
import CardioTab from "./CardioTab";
import RecoveryPanel from "./RecoveryPanel";
import ProgressTab from "./ProgressTab";

const TRAIN_SUBS = ["Workouts", "Strength", "Cardio"] as const;
type TrainSub = (typeof TRAIN_SUBS)[number];

// Training mega-hub. Four primary pills (Coach · Train · Recovery · Progress); Train
// carries Workouts/Strength/Cardio; Progress carries its own Goals/History/Body.
// Phase 1 is read-only intelligence — no planner, no logger yet.
export default function TrainPage() {
  const [primary, setPrimary] = useState<Primary>("Train");
  const [trainSub, setTrainSub] = useState<TrainSub>("Workouts");

  return (
    <Screen title="Training">
      <div className="trainv2">
        <Pills value={primary} onChange={setPrimary} />

        {primary === "Coach" && <CoachPanel />}

        {primary === "Train" && (
          <>
            <SubPills items={TRAIN_SUBS} value={trainSub} onChange={setTrainSub} />
            {trainSub === "Workouts" && <WorkoutsTab />}
            {trainSub === "Strength" && <StrengthTab />}
            {trainSub === "Cardio" && <CardioTab />}
          </>
        )}

        {primary === "Recovery" && <RecoveryPanel />}

        {primary === "Progress" && <ProgressTab />}
      </div>
    </Screen>
  );
}
