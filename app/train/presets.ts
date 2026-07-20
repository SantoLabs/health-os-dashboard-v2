import type { CardioStructure, CardioStep, CardioLoop, CardioStepOrLoop, CardioTarget, WkRoutineItem } from "../lib/api";

// ------------------------------------------------------------------ //
// Cardio preset library — shipped seed templates (Phase 3).
// A preset is static curated content, not user data: "Load" opens it
// in CardioBuilder as a fresh, editable, unsaved session. Structures
// use the same unified CardioStructure the builder round-trips, so
// loading is just splitToLegs / loadStructure with no id (Save makes
// it the user's own routine). Targets are RPE-based on purpose — no
// personal thresholds required; dial in exact pace/power after load.
// Swim presets omit pool length, so the builder defaults to 25 m.
// ------------------------------------------------------------------ //

export type PresetSport = "run" | "bike" | "swim" | "brick";
export type GlyphKey = "run" | "runEasy" | "bike" | "swim" | "brick" | "stopwatch" | "bolt" | "hill";

export type CardioPreset = {
  id: string;
  name: string;
  sport: PresetSport;
  meta: string;
  glyph: GlyphKey;
  structure: CardioStructure;
};

// ---- tiny typed factories ----
const rpe = (lo: number, hi: number = lo): CardioTarget[] => [{ metric: "rpe", low: lo, high: hi }];
const tSec = (sport: string, kind: CardioStep["kind"], role: string, seconds: number, targets?: CardioTarget[], label?: string): CardioStep =>
  ({ block_type: "step", sport, kind, role, measure: { type: "time", seconds }, ...(targets ? { targets } : {}), ...(label ? { label } : {}) });
const tDist = (sport: string, kind: CardioStep["kind"], role: string, meters: number, targets?: CardioTarget[], label?: string): CardioStep =>
  ({ block_type: "step", sport, kind, role, measure: { type: "distance", meters }, ...(targets ? { targets } : {}), ...(label ? { label } : {}) });
const loop = (repeat: number, steps: CardioStepOrLoop[]): CardioLoop => ({ block_type: "loop", repeat, steps });
const trans = (toSport: string): CardioStep => ({ block_type: "step", sport: toSport, kind: "transition", role: "transition", measure: { type: "time", seconds: 60 }, label: "Transition" });
const min = (n: number) => n * 60;

export const CARDIO_PRESETS: CardioPreset[] = [
  // ---------------- RUN ----------------
  {
    id: "run-easy-z2", name: "Easy run · Z2", sport: "run", meta: "Run · 45 min easy", glyph: "runEasy",
    structure: { schema_version: 1, blocks: [tSec("run", "segment", "steady", min(45), rpe(3, 4))] },
  },
  {
    id: "run-tempo-20", name: "Tempo 20", sport: "run", meta: "Run · 20 min at tempo", glyph: "stopwatch",
    structure: { schema_version: 1, blocks: [
      tSec("run", "warmup", "steady", min(10), rpe(3)),
      tSec("run", "segment", "steady", min(20), rpe(6), "Tempo"),
      tSec("run", "cooldown", "steady", min(10), rpe(2)),
    ] },
  },
  {
    id: "run-intervals-400", name: "Interval repeats", sport: "run", meta: "Run · 6 × 400 m", glyph: "bolt",
    structure: { schema_version: 1, blocks: [
      tSec("run", "warmup", "steady", min(10), rpe(3)),
      loop(6, [tDist("run", "segment", "work", 400, rpe(8)), tDist("run", "segment", "recovery", 200, rpe(3))]),
      tSec("run", "cooldown", "steady", min(10), rpe(2)),
    ] },
  },
  {
    id: "run-long-z2", name: "Long run · Z2", sport: "run", meta: "Run · 75 min easy", glyph: "run",
    structure: { schema_version: 1, blocks: [tSec("run", "segment", "steady", min(75), rpe(3, 4))] },
  },
  {
    id: "run-hills", name: "Hill repeats", sport: "run", meta: "Run · 8 × 1 min hills", glyph: "hill",
    structure: { schema_version: 1, blocks: [
      tSec("run", "warmup", "steady", min(10), rpe(3)),
      loop(8, [tSec("run", "segment", "work", 60, rpe(8), "Hill"), tSec("run", "segment", "recovery", 120, rpe(2))]),
      tSec("run", "cooldown", "steady", min(10), rpe(2)),
    ] },
  },

  // ---------------- BIKE ----------------
  {
    id: "bike-long-z2", name: "Long ride · Z2", sport: "bike", meta: "Bike · 90 min · fuel cues", glyph: "bike",
    structure: { schema_version: 1,
      blocks: [tSec("bike", "segment", "steady", min(90), rpe(3))],
      reminders: [{ type: "fuel", every_s: 1800, note: "Take on fuel" }, { type: "hydrate", every_s: 1200 }],
    },
  },
  {
    id: "bike-threshold", name: "Threshold intervals", sport: "bike", meta: "Bike · 4 × 8 min", glyph: "bolt",
    structure: { schema_version: 1, blocks: [
      tSec("bike", "warmup", "steady", min(15), rpe(3)),
      loop(4, [tSec("bike", "segment", "work", min(8), rpe(8)), tSec("bike", "segment", "recovery", min(4), rpe(2))]),
      tSec("bike", "cooldown", "steady", min(10), rpe(2)),
    ] },
  },
  {
    id: "bike-sweetspot", name: "Sweet-spot", sport: "bike", meta: "Bike · 3 × 12 min", glyph: "stopwatch",
    structure: { schema_version: 1, blocks: [
      tSec("bike", "warmup", "steady", min(15), rpe(3)),
      loop(3, [tSec("bike", "segment", "work", min(12), rpe(7)), tSec("bike", "segment", "recovery", min(5), rpe(2))]),
      tSec("bike", "cooldown", "steady", min(10), rpe(2)),
    ] },
  },
  {
    id: "bike-recovery", name: "Recovery spin", sport: "bike", meta: "Bike · 40 min easy", glyph: "bike",
    structure: { schema_version: 1, blocks: [tSec("bike", "segment", "steady", min(40), rpe(2))] },
  },

  // ---------------- SWIM (pool defaults to 25 m on load) ----------------
  {
    id: "swim-endurance", name: "Endurance swim", sport: "swim", meta: "Swim · ~1.6 km · 25 m", glyph: "swim",
    structure: { schema_version: 1, blocks: [
      tDist("swim", "warmup", "steady", 200, rpe(3)),
      loop(6, [tDist("swim", "segment", "work", 200, rpe(5)), tSec("swim", "rest", "rest", 20)]),
      tDist("swim", "cooldown", "steady", 200, rpe(2)),
    ] },
  },
  {
    id: "swim-threshold-css", name: "Threshold · CSS", sport: "swim", meta: "Swim · 8 × 100 m", glyph: "bolt",
    structure: { schema_version: 1, blocks: [
      tDist("swim", "warmup", "steady", 100, rpe(3)),
      loop(8, [tDist("swim", "segment", "work", 100, rpe(8)), tSec("swim", "rest", "rest", 15)]),
      tDist("swim", "cooldown", "steady", 100, rpe(2)),
    ] },
  },
  {
    id: "swim-drills", name: "Technique drills", sport: "swim", meta: "Swim · 8 × 50 m drills", glyph: "swim",
    structure: { schema_version: 1, blocks: [
      tDist("swim", "warmup", "steady", 200, rpe(3)),
      loop(8, [tDist("swim", "segment", "work", 50, rpe(4), "Drill"), tSec("swim", "rest", "rest", 15)]),
      tDist("swim", "cooldown", "steady", 100, rpe(2)),
    ] },
  },

  // ---------------- BRICK (multisport) ----------------
  {
    id: "brick-bike-run", name: "Brick: Bike → Run", sport: "brick", meta: "Multisport · 40′ + 15′ + T2", glyph: "brick",
    structure: { schema_version: 1, blocks: [
      tSec("bike", "segment", "steady", min(40), rpe(4)),
      trans("run"),
      tSec("run", "segment", "steady", min(15), rpe(5)),
    ] },
  },
  {
    id: "brick-swim-bike", name: "Brick: Swim → Bike", sport: "brick", meta: "Multisport · 800 m + 30′ + T1", glyph: "brick",
    structure: { schema_version: 1, blocks: [
      tDist("swim", "segment", "steady", 800, rpe(5)),
      trans("bike"),
      tSec("bike", "segment", "steady", min(30), rpe(4)),
    ] },
  },
  {
    id: "brick-run-off-bike", name: "Brick: Run off bike", sport: "brick", meta: "Multisport · 30′ bike + 4 × 2 min run", glyph: "brick",
    structure: { schema_version: 1, blocks: [
      tSec("bike", "segment", "steady", min(30), rpe(4)),
      trans("run"),
      loop(4, [tSec("run", "segment", "work", min(2), rpe(7)), tSec("run", "segment", "recovery", min(1), rpe(2))]),
    ] },
  },
];

// ------------------------------------------------------------------ //
// Strength & mobility presets (Phase 3 unit 2). Same "shipped seed
// template" model — "Load" opens one in the strength RoutineBuilder as
// a fresh, unsaved routine (Save makes it the user's own). Items
// reference real exercise_catalog names + muscle groups; sets/reps are
// starting points to tweak. Mobility presets carry focus "Mobility" so
// the app classifies + glyphs them as recovery work. No media needed —
// this is authoring, not the guided engine (that's P4/P5, media-blocked).
// ------------------------------------------------------------------ //

export type StrengthGlyph = "strength" | "mobility";
export type StrengthPreset = {
  id: string;
  name: string;
  focus: string;
  glyph: StrengthGlyph;
  meta: string;
  items: WkRoutineItem[];
};

const ex = (exercise_name: string, muscle_group: string | null, target_sets: number, target_reps: string): WkRoutineItem =>
  ({ exercise_name, muscle_group, target_sets, target_reps });

export const STRENGTH_PRESETS: StrengthPreset[] = [
  // ---------------- STRENGTH ----------------
  {
    id: "str-push", name: "Push day", focus: "Push", glyph: "strength", meta: "Chest · shoulders · triceps · 5 moves",
    items: [
      ex("Barbell Bench Press", "Chest", 4, "5-8"),
      ex("Dumbbell Shoulder Press", "Shoulders", 3, "8-12"),
      ex("Dumbbell Bench Press", "Chest", 3, "8-12"),
      ex("Dumbbell Lateral Raise", "Side Delts", 3, "12-15"),
      ex("Triceps Pushdown", "Triceps", 3, "10-15"),
    ],
  },
  {
    id: "str-pull", name: "Pull day", focus: "Pull", glyph: "strength", meta: "Back · biceps · 5 moves",
    items: [
      ex("Pull Up", "Lats", 4, "6-10"),
      ex("Cable Lat Pulldown", "Lats", 3, "8-12"),
      ex("Dumbbell Row", "Lats", 3, "8-12"),
      ex("Face Pull", "Rear Delts", 3, "12-15"),
      ex("Barbell Bicep Curl", "Biceps", 3, "10-12"),
    ],
  },
  {
    id: "str-legs", name: "Leg day", focus: "Legs", glyph: "strength", meta: "Quads · hams · glutes · 5 moves",
    items: [
      ex("Barbell Squat", "Quads", 4, "5-8"),
      ex("Barbell Romanian Deadlift", "Hamstrings", 3, "8-10"),
      ex("Machine Leg Press", "Quads", 3, "10-12"),
      ex("Machine Seated Leg Curl", "Hamstrings", 3, "10-12"),
      ex("Standing Calf Raise", "Calves", 4, "12-15"),
    ],
  },
  {
    id: "str-upper", name: "Upper body", focus: "Upper", glyph: "strength", meta: "4-day split · A · 7 moves",
    items: [
      ex("Barbell Bench Press", "Chest", 4, "5-8"),
      ex("Barbell Overhead Press", "Shoulders", 3, "6-10"),
      ex("Dumbbell Row", "Lats", 3, "8-12"),
      ex("Cable Lat Pulldown", "Lats", 3, "8-12"),
      ex("Dumbbell Lateral Raise", "Side Delts", 3, "12-15"),
      ex("Barbell Bicep Curl", "Biceps", 3, "10-12"),
      ex("Triceps Pushdown", "Triceps", 3, "10-15"),
    ],
  },
  {
    id: "str-lower", name: "Lower body", focus: "Lower", glyph: "strength", meta: "4-day split · B · 6 moves",
    items: [
      ex("Barbell Squat", "Quads", 4, "5-8"),
      ex("Barbell Romanian Deadlift", "Hamstrings", 3, "8-10"),
      ex("Dumbbell Walking Lunge", "Quads", 3, "10-12"),
      ex("Machine Seated Leg Curl", "Hamstrings", 3, "10-12"),
      ex("Standing Calf Raise", "Calves", 4, "12-15"),
      ex("Hanging Leg Raise", "Core", 3, "10-15"),
    ],
  },
  {
    id: "str-fullbody", name: "Full body", focus: "Full body", glyph: "strength", meta: "2–3×/week · 6 moves",
    items: [
      ex("Barbell Squat", "Quads", 3, "5-8"),
      ex("Barbell Bench Press", "Chest", 3, "5-8"),
      ex("Dumbbell Row", "Lats", 3, "8-12"),
      ex("Barbell Overhead Press", "Shoulders", 3, "8-10"),
      ex("Barbell Romanian Deadlift", "Hamstrings", 3, "8-10"),
      ex("Plank", "Core", 3, "30-45s"),
    ],
  },

  // ---------------- MOBILITY ----------------
  {
    id: "mob-postrun", name: "Post-run cooldown", focus: "Mobility", glyph: "mobility", meta: "Lower body · ~10 min",
    items: [
      ex("Foam Roll Quads", "Quads", 1, "45s"),
      ex("Foam Roll Calves", "Calves", 1, "45s"),
      ex("Couch Stretch", "Hip Flexors", 1, "45s/side"),
      ex("Figure-4 Stretch", "Glutes", 1, "45s/side"),
      ex("Pigeon Pose", "Glutes", 1, "60s/side"),
      ex("Child's Pose", "Lower Back", 1, "60s"),
    ],
  },
  {
    id: "mob-hips-spine", name: "Hips & spine", focus: "Mobility", glyph: "mobility", meta: "Post-bike · ~10 min",
    items: [
      ex("90/90 Hip Switch", "Hips", 1, "10 reps"),
      ex("Hip CARs", "Hips", 1, "5/side"),
      ex("Kneeling Hip Flexor Stretch", "Hip Flexors", 1, "45s/side"),
      ex("Cat-Cow", "Spine", 1, "10 reps"),
      ex("Foam Roll IT Band", "IT Band", 1, "45s/side"),
      ex("Child's Pose", "Lower Back", 1, "60s"),
    ],
  },
  {
    id: "mob-fullflow", name: "Full flow", focus: "Mobility", glyph: "mobility", meta: "Whole body · ~12 min",
    items: [
      ex("Diaphragmatic Breathing", "Core", 1, "60s"),
      ex("Cat-Cow", "Spine", 1, "10 reps"),
      ex("Down-Dog to Cobra", null, 1, "8 reps"),
      ex("Doorway Chest Stretch", "Chest", 1, "45s"),
      ex("Lat Stretch (Overhead Hang)", "Lats", 1, "45s"),
      ex("Pigeon Pose", "Glutes", 1, "60s/side"),
      ex("Legs-Up-the-Wall", "Full Body", 1, "90s"),
    ],
  },
];
