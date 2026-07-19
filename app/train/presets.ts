import type { CardioStructure, CardioStep, CardioLoop, CardioStepOrLoop, CardioTarget } from "../lib/api";

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
