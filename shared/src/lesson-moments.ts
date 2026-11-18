/**
 * What else a finished lesson did: met today's goal, kept today's streak, reached a level, moved today's XP and the
 * week's league place. Whether any of it just happened is the difference between before and after, so both players read
 * the standing as a lesson opens and again as it closes, and these rules compare the two. A number not read either time
 * claims nothing, so nothing is celebrated by guesswork. All of them are celebrated together on the results.
 */

export interface LessonStreakMark {
  current: number;
  lastActiveOn: string | null;
}

/** Where things stood, from `/me`, `/me/daily-goal` and `/me/league`, null where unread; callers that do not read the newer three leave them out. */
export interface LessonStanding {
  level: number | null;
  goalCompleted: boolean | null;
  streak: LessonStreakMark | null;
  /** today's XP and the goal it is judged against (`earnedXp`, and `effectiveGoal` or else `goal`) */
  goal?: { earned: number; target: number } | null;
  /** the week's league, only while the learner races in one (`mode: 'league'`, joined, not opted out) */
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
  /** today's XP before and after the lesson, of the goal; null when either was not read */
  goal?: { from: number; to: number; target: number } | null;
  /** the league place before and after, and the week's XP this lesson added; null outside a league */
  league?: { fromRank: number; toRank: number; gainedXp: number; tier: string } | null;
  /** every first answer right and nothing put off, in a lesson; a review is never called perfect */
  perfect?: boolean;
}

export const NO_LESSON_MOMENTS: LessonMoments = { goalMet: false, streakKept: false, level: null, goal: null, league: null, perfect: false };

/** How the session went, from its results, for `perfect`. */
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
  // Never backwards: a lesson that ran past midnight starts a new day's count.
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

/** A kind word for the first-time-right share, always kind: a lesson that went badly is still practice done. */
export type ResultsGrade = 'excellent' | 'solid' | 'practice';

export function resultsGrade(accuracy: number): ResultsGrade {
  if (accuracy >= 0.9) return 'excellent';
  if (accuracy >= 0.7) return 'solid';
  return 'practice';
}

/**
 * What the results offer where Check was. With today's goal unmet and a next lesson, the next lesson leads; with the goal
 * met, "Done" leads and the results say this is a good place to stop (`stopHere`). Practising mistakes is offered when
 * there are any, and "Back to the path" whenever the main action is not already the way out.
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
 * The streak's freezes for the "Day N" card: those saved, when any (the count stays full while the maximum is held), or
 * progress toward the next. Null when the server did not say.
 */
export type FreezeLine = { kind: 'ready'; count: number } | { kind: 'toward'; done: number; per: number };

export function freezeLine(streak: { freezes?: number; freezeProgress?: number; sessionsPerFreeze?: number }): FreezeLine | null {
  if ((streak.freezes ?? 0) > 0) return { kind: 'ready', count: streak.freezes! };
  if (typeof streak.freezeProgress !== 'number' || !streak.sessionsPerFreeze) return null;
  return { kind: 'toward', done: Math.min(streak.freezeProgress, streak.sessionsPerFreeze), per: streak.sessionsPerFreeze };
}

/**
 * When the results' parts arrive, in ms from the celebration's start (`celebrationPlan`): the tiles in turn as the words
 * land (`tilesAtMs`, `tileStaggerMs` apart) with the XP counting from then, the goal bar moving (`goalAtMs`, over
 * `goalMs`), and the league and level rows fading in (`rowsAtMs`, over `rowsMs`). Nothing moves on by itself after that.
 */
export const RESULTS_TIMING = { tilesAtMs: 420, tileStaggerMs: 40, xpAtMs: 420, goalAtMs: 900, goalMs: 400, rowsAtMs: 1000, rowsMs: 200 } as const;
