/**
 * How big the streak's fire burns: a fire that grows the longer the streak
 * is kept, drawn the same by the phone and the website.
 *
 * Kept from nothing: cold logs on day 0, a spark caught on the first day, a
 * little flame by the third, a campfire at a week, then a big fire, a
 * bonfire at a month, a blaze at a hundred days, and the Newroz fire, the
 * biggest there is, at a year. The steps come quickly at first, so the first
 * days each show the fire coming alive, and further apart later, so each one
 * after a month is something to look forward to. Between steps the fire
 * still grows a little every day (`growth`), so no kept day leaves it as it
 * was.
 *
 * A run of right answers in a lesson grows the same fire, faster and only so
 * far: the Newroz fire is a year's streak and nothing else.
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

/** The stage's place in `FIRE_STAGES`: 0 for cold, 7 for the Newroz fire. */
export const fireStageIndex = (stage: FireStage): number => FIRE_STAGES.indexOf(stage);

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

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

/** The fire for a streak of `days`. The Newroz fire grows on through its first year, and is full from two years on. */
export function fireLevel(days: number): FireLevel {
  return levelOn(STREAK_LADDER, whole(days), 365);
}

/** The fire for a run of `run` right answers in a row. */
export function runFireLevel(run: number): FireLevel {
  return levelOn(RUN_STAGE_AT, whole(run), 10);
}

/** The stage a streak of `days` reached today, when today is the day it grew (the 1st, the 3rd, the 7th...); null on any other day. */
export function fireGrewToday(days: number): FireStage | null {
  const d = whole(days);
  if (d === 0) return null;
  return FIRE_STAGES.find((s) => FIRE_STAGE_DAYS[s] === d) ?? null;
}

/** The stage before `stage`: what the fire grew from. */
export function stageBefore(stage: FireStage): FireStage {
  return FIRE_STAGES[Math.max(0, fireStageIndex(stage) - 1)] as FireStage;
}

/** The next stage a streak of `days` grows into, and the day it does; null once it is the Newroz fire. */
export function nextFireStage(days: number): { stage: FireStage; at: number } | null {
  const d = whole(days);
  const stage = FIRE_STAGES.find((s) => FIRE_STAGE_DAYS[s] > d);
  return stage ? { stage, at: FIRE_STAGE_DAYS[stage] } : null;
}
