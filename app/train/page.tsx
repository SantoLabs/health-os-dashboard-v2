"use client";

import { useState } from "react";
import { Screen } from "../components/Screen";
import { Pills, type Primary } from "./ui";
import CoachPanel from "./CoachPanel";
import WorkoutsTab from "./WorkoutsTab";
import RecoveryPanel from "./RecoveryPanel";
import ProgressTab from "./ProgressTab";

// Training mega-hub. Four primary pills (Coach · Workouts · Recovery · Progress).
// Workouts = the doing surface; strength/cardio history now live under Progress → Activities.
export default function TrainPage() {
  const [primary, setPrimary] = useState<Primary>("Train");

  return (
    <Screen title="Training">
      <div className="trainv2">
        <Pills value={primary} onChange={setPrimary} />

        {primary === "Coach" && <CoachPanel />}

        {primary === "Train" && <WorkoutsTab onAskCoach={() => setPrimary("Coach")} />}

        {primary === "Recovery" && <RecoveryPanel onGoWorkouts={() => setPrimary("Train")} />}

        {primary === "Progress" && <ProgressTab />}
      </div>
    </Screen>
  );
}
