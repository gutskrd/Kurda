/**
 * What else a finished lesson did, beside the lesson itself: met today's goal,
 * kept the streak going for today, reached a new level, moved today's XP and
 * the week's league place on.
 *
 * The server's results say how the lesson went and where the streak now
 * stands; whether any of this just *happened* is what changed between before
 * the lesson and after it. So the player — the phone's and the browser's
 * alike — notes where things stood as the lesson opened, asks again as it
 * closes, and these rules compare the two. A number that could not be read
 * either time is a moment not claimed — never a guess that turns into a
 * celebration for nothing.
 *
 * All of them are celebrated together on the results, felt once.
 */

export interface LessonStreakMark {
  current: number;
  lastActiveOn: string | null;
}

/**
 * Where things stood, as read from `/me`, `/me/daily-goal` and `/me/league`;
 * null where it could not be read. The last three are newer than the rest,
 * so a caller that does not read them leaves them out.
 */
export interface LessonStanding {
  level: number | null;
  goalCompleted: boolean | null;
  streak: LessonStreakMark | null;
  /** today's XP and the goal it is judged against (`earnedXp`, and `effectiveGoal` or else `goal`) */
  goal?: { earned: number; target: number } | null;
  /** the week's league: only while the learner races in one (`mode: 'league'`, joined, not opted out) */
  league?: { rank: number; weeklyXp: number; tier: string } | null;
  /** how far through the level, 0..1 (`level.progress`) */
  levelProgress?: number | null;
}

export interface LessonMoments {
  /** today's goal was not met before this lesson and is now */
  goalMet: boolean;
  /** the streak counted today for the first time with this lesson */
  streakKept: boolean;
  /** the level reached, when this lesson reached a new one */
  level: number | null;
  /** today's XP before the lesson and after it, of the goal; null when either was not read */
  goal?: { from: number; to: number; target: number } | null;
  /** the league place before and after, and the week's XP this lesson added; null outside a league */
  league?: { fromRank: number; toRank: number; gainedXp: number; tier: string } | null;
  /** every first answer right and nothing put off, in a lesson (a review is not called perfect) */
  perfect?: boolean;
}

export const NO_LESSON_MOMENTS: LessonMoments = { goalMet: false, streakKept: false, level: null, goal: null, league: null, perfect: false };

/** How the session itself went, from its results: for `perfect`. */
export interface LessonOutcome {
  kind: 'lesson' | 'practice';
  accuracy: number;
  /** exercises put off and never answered */
  skipped: number;
}

export function lessonMoments(
  before: LessonStanding | null,
  after: LessonStanding | null,
  streakNow: LessonStreakMark | null,
  outcome: LessonOutcome | null = null,
): LessonMoments {
  const perfect = outcome !== null && outcome.kind === 'lesson' && outcome.accuracy === 1 && outcome.skipped === 0;
  if (!before) return { ...NO_LESSON_MOMENTS, perfect };
  const goalMet = before.goalCompleted === false && after?.goalCompleted === true;
  const streakKept =
    before.streak !== null &&
    streakNow !== null &&
    streakNow.current > 0 &&
    streakNow.lastActiveOn !== null &&
    streakNow.lastActiveOn !== before.streak.lastActiveOn;
  const level =
    before.level !== null && after?.level != null && after.level > before.level ? after.level : null;
  // never backwards: a lesson that ran past midnight starts a new day's count
  const goal =
    before.goal && after?.goal ? { from: Math.min(before.goal.earned, after.goal.earned), to: after.goal.earned, target: after.goal.target } : null;
  const league =
    before.league && after?.league
      ? {
          fromRank: before.league.rank,
          toRank: after.league.rank,
          gainedXp: Math.max(0, after.league.weeklyXp - before.league.weeklyXp),
          tier: after.league.tier,
        }
      : null;
  return { goalMet, streakKept, level, goal, league, perfect };
}

/** Whether anything beside the lesson is worth a word on the results. */
export function anyLessonMoment(m: LessonMoments): boolean {
  return m.goalMet || m.streakKept || m.level !== null;
}

/**
 * A kind word for how many were right first time, always a kind one: a lesson
 * that went badly is still practice done, and is called that.
 */
export type ResultsGrade = 'excellent' | 'solid' | 'practice';

export function resultsGrade(accuracy: number): ResultsGrade {
  if (accuracy >= 0.9) return 'excellent';
  if (accuracy >= 0.7) return 'solid';
  return 'practice';
}

/**
 * What the results offer, in the place Check was. With today's goal still to
 * meet and a next lesson in the course, the next lesson leads. With the goal
 * met, "Done" leads and the results say this is a good place to stop
 * (`stopHere`), the next lesson still there for whoever wants it. Practising
 * the mistakes is offered when there are any to practise; "Back to the path"
 * whenever the main action is not already the way out.
 */
export type ResultsAction = 'next' | 'practise' | 'done';

export interface ResultsActions {
  primary: ResultsAction;
  secondary: ResultsAction | null;
  stopHere: boolean;
  backLink: boolean;
}

export function resultsActions({ next, practise, goalDone }: { next: boolean; practise: boolean; goalDone: boolean }): ResultsActions {
  if (goalDone) return { primary: 'done', secondary: next ? 'next' : practise ? 'practise' : null, stopHere: true, backLink: false };
  if (next) return { primary: 'next', secondary: practise ? 'practise' : null, stopHere: false, backLink: true };
  if (practise) return { primary: 'practise', secondary: null, stopHere: false, backLink: true };
  return { primary: 'done', secondary: null, stopHere: false, backLink: false };
}

/**
 * The streak's freezes, for the "Day N" card: those saved, when there are any
 * (the count waits, full, while the most a learner may hold is held), or how
 * far the sessions since the last one have got towards the next. Null when
 * the server did not say.
 */
export type FreezeLine = { kind: 'ready'; count: number } | { kind: 'toward'; done: number; per: number };

export function freezeLine(streak: { freezes?: number; freezeProgress?: number; sessionsPerFreeze?: number }): FreezeLine | null {
  if ((streak.freezes ?? 0) > 0) return { kind: 'ready', count: streak.freezes! };
  if (typeof streak.freezeProgress !== 'number' || !streak.sessionsPerFreeze) return null;
  return { kind: 'toward', done: Math.min(streak.freezeProgress, streak.sessionsPerFreeze), per: streak.sessionsPerFreeze };
}

/**
 * When the results' parts arrive, in ms from the start of the celebration
 * (`celebrationPlan`, unchanged): the tiles one after another from as the
 * words land (`tilesAtMs`, `tileStaggerMs` apart), the XP counting from then
 * too, today's goal bar moving from before to after (`goalAtMs`, over
 * `goalMs`), and the league and level rows fading in (`rowsAtMs`, over
 * `rowsMs`). Nothing moves on by itself after that: the learner taps on.
 */
export const RESULTS_TIMING = { tilesAtMs: 420, tileStaggerMs: 40, xpAtMs: 420, goalAtMs: 900, goalMs: 400, rowsAtMs: 1000, rowsMs: 200 } as const;

/**
 * The "Day N" card, in ms from when it opens: the flame arrives on a spring
 * (`flameMs`), the day counts on from the day before (`countAtMs`), the reward
 * is heard and felt as it does (`rewardAtMs`), and the freeze bar fills
 * (`freezeAtMs`, over `freezeMs`).
 */
export const STREAK_DAY_TIMING = { flameMs: 520, countAtMs: 300, rewardAtMs: 300, freezeAtMs: 600, freezeMs: 400 } as const;
