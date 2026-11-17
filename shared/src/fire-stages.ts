/**
 * How big the streak's fire burns, drawn the same by both apps: cold logs on day 0, a spark on the first day, a little
 * flame by the third, a campfire at a week, then a big fire, a bonfire at a month, a blaze at a hundred days and the
 * Newroz fire at a year. Steps come quickly at first and further apart later, and the fire still grows a little each day
 * between them (`growth`). A run of right answers grows the same fire faster but only so far: the Newroz fire is a year's
 * streak and nothing else.
 */

/** The fire's stages, smallest first. */
export const FIRE_STAGES = ['cold', 'spark', 'kindling', 'campfire', 'bigfire', 'bonfire', 'blaze', 'newroz'] as const;
export type FireStage = (typeof FIRE_STAGES)[number];

/** The day of the streak each stage is reached on. */
export const FIRE_STAGE_DAYS: Readonly<Record<FireStage, number>> = {
  cold: 0,
  spark: 1,
  kindling: 3,
  campfire: 7,
  bigfire: 14,
  bonfire: 30,
  blaze: 100,
  newroz: 365,
};

/** The length of a run of right answers each stage is reached at; a run never lights the Newroz fire. */
const RUN_STAGE_AT: readonly (readonly [FireStage, number])[] = [
  ['cold', 0],
  ['spark', 1],
  ['kindling', 3],
  ['campfire', 5],
  ['bigfire', 10],
  ['bonfire', 15],
  ['blaze', 20],
];

/** How the fire burns: its stage, and how far it has grown since (0 just reached, toward 1 the day before the next). */
export interface FireLevel {
  stage: FireStage;
  growth: number;
}

/** A fire not burning: a streak of 0. */
export const COLD_FIRE: FireLevel = { stage: 'cold', growth: 0 };

/** The fire growing into its new stage on the day it grew: the delay after it appears and the growth's length; what is said lands as it ends. */
export const FIRE_GROW = { delayMs: 600, ms: 1100 } as const;

/** The stage's place in `FIRE_STAGES`: 0 for cold, 7 for the Newroz fire. */
export const fireStageIndex = (stage: FireStage): number => FIRE_STAGES.indexOf(stage);

/** A count as a whole number: never negative, and 0 for anything that is not a number. */
export const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** The level on a ladder of stages and the counts they start at, for a count of `n`. */
function levelOn(ladder: readonly (readonly [FireStage, number])[], n: number, after: number): FireLevel {
  let i = ladder.length - 1;
  while (i > 0 && n < (ladder[i] as readonly [FireStage, number])[1]) i -= 1;
  const [stage, from] = ladder[i] as readonly [FireStage, number];
  if (stage === 'cold') return COLD_FIRE;
  const next = ladder[i + 1]?.[1] ?? from + after;
  return { stage, growth: Math.min(1, (n - from) / (next - from)) };
}

const STREAK_LADDER = FIRE_STAGES.map((s) => [s, FIRE_STAGE_DAYS[s]] as const);

/** The fire for a streak of `days`; the Newroz fire keeps growing through its first year and is full from two years on. */
export function fireLevel(days: number): FireLevel {
  return levelOn(STREAK_LADDER, whole(days), 365);
}

/** The fire for a run of `run` right answers in a row. */
export function runFireLevel(run: number): FireLevel {
  return levelOn(RUN_STAGE_AT, whole(run), 10);
}

/** The stage a streak of `days` reached today when today is a growth day (the 1st, the 3rd, the 7th…); null otherwise. */
export function fireGrewToday(days: number): FireStage | null {
  const d = whole(days);
  if (d === 0) return null;
  return FIRE_STAGES.find((s) => FIRE_STAGE_DAYS[s] === d) ?? null;
}

/** The next stage a streak of `days` grows into and the day it does; null once it is the Newroz fire. */
export function nextFireStage(days: number): { stage: FireStage; at: number } | null {
  const d = whole(days);
  const stage = FIRE_STAGES.find((s) => FIRE_STAGE_DAYS[s] > d);
  return stage ? { stage, at: FIRE_STAGE_DAYS[stage] } : null;
}
