/**
 * A win, as it is shared: the picture a share carries, drawn in text, and
 * which wins are offered for sharing at all.
 *
 * Somebody who solves the day's word, finishes a lesson or keeps a streak is
 * offered a quiet Share. What goes out is one modest line in their own
 * language, a small picture made of squares, and the site's address. The
 * line is each app's own, from its catalogue; the picture and the rules are
 * here, so the website and the phone send the same thing:
 *
 *   - the word game's grid, a row of squares per guess: how the game went,
 *     and nothing of the word;
 *   - a finished lesson's strip, a square per exercise in the lesson's order,
 *     right the first time or not, in rows of ten;
 *   - a streak's row, a week of seven squares, with the count beside it once
 *     the streak has outgrown the week.
 *
 * Only squares that every phone and browser draws, and figures. No words: a
 * share is read in the language its sender reads, and those words are the
 * apps'. Nothing here is told who the sender is, so nothing here can say.
 */

import { FIRE_STAGE_DAYS, fireGrewToday } from './fire-stages.js';
import type { LeagueTier, LeagueWeekResult } from './leagues.js';
import { isLeagueTier } from './leagues.js';

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

// ---- the word game's grid ------------------------------------------------------------

/** How the server scored one letter of a guess: in its place, in the word, or not in it. */
export type LetterFeedback = 'green' | 'yellow' | 'gray';

export const GRID_SQUARES: Record<LetterFeedback, string> = { green: '🟩', yellow: '🟨', gray: '⬜' };
/** For a player who cannot tell green from yellow: orange and blue instead. */
export const GRID_SQUARES_HIGH_CONTRAST: Record<LetterFeedback, string> = { green: '🟧', yellow: '🟦', gray: '⬜' };

export function gridSquare(feedback: LetterFeedback, highContrast = false): string {
  return (highContrast ? GRID_SQUARES_HIGH_CONTRAST : GRID_SQUARES)[feedback];
}

/** One guess as its row of squares. */
export function gridRow(row: readonly LetterFeedback[], highContrast = false): string {
  return row.map((f) => gridSquare(f, highContrast)).join('');
}

/** Every guess, a row under a row. */
export function wordGrid(rows: readonly (readonly LetterFeedback[])[], highContrast = false): string {
  return rows.map((r) => gridRow(r, highContrast)).join('\n');
}

export interface WordGameShare {
  rows: readonly (readonly LetterFeedback[])[];
  solved: boolean;
  maxAttempts: number;
  /** the game's name, as the app writes it */
  name: string;
  /** the app's word for a practice game; absent for the day's word */
  practice?: string;
  /** the day's word by its number, where there is one; a practice game has none */
  dayNumber?: number;
  /** the app's word for how hard the game was */
  difficulty?: string;
  highContrast?: boolean;
}

/**
 * The line over the grid: the game's name, which game it was, and the score
 * as guesses taken of guesses allowed, with an X for a word that was not
 * found ("Hevalo Peyvok #123 (Hard) 4/6", "Hevalo Peyvok Practice X/6").
 */
export function wordGameHeader(input: WordGameShare): string {
  const parts = [input.name];
  if (input.practice) parts.push(input.practice);
  else if (input.dayNumber !== undefined) parts.push(`#${input.dayNumber}`);
  if (input.difficulty) parts.push(`(${input.difficulty})`);
  parts.push(`${input.solved ? input.rows.length : 'X'}/${input.maxAttempts}`);
  return parts.join(' ');
}

/**
 * The header, an empty line, and the grid; and set apart under them the
 * address, when the app hands one over. Only squares and counts: no letter
 * of a guess or of the word is in it.
 */
export function wordGameShareText(input: WordGameShare, link?: string | null): string {
  return shareMessage({ line: wordGameHeader(input), picture: wordGrid(input.rows, input.highContrast ?? false), link });
}

// ---- a finished lesson's strip -------------------------------------------------------

/** An exercise as the strip shows it: answered right the first time, or only later. */
export type LessonMark = 'first' | 'later';

export const LESSON_SQUARES: Record<LessonMark, string> = { first: '🟩', later: '🟨' };

/** How many squares a row of the strip holds. */
export const STRIP_ROW = 10;

/**
 * A lesson's exercises as the strip's marks, from what a results screen is
 * told: the exercises in the order the lesson asked them, which of them the
 * first answer missed, which were put off and never answered, and the score.
 *
 * An exercise put off is left out, as the score leaves it out. When the list
 * does not account for the score (an older server, a list that did not
 * arrive), the marks are a tally of the score instead, the right ones first:
 * still how many, though no longer where.
 */
export function lessonMarks({
  exerciseIds,
  missedIds,
  putOffIds = [],
  correct,
  total,
}: {
  exerciseIds: readonly string[];
  missedIds: readonly string[];
  putOffIds?: readonly string[];
  /** answered right the first time, and how many were answered at all: the score as the screen shows it */
  correct: number;
  total: number;
}): LessonMark[] {
  const missed = new Set(missedIds);
  const putOff = new Set(putOffIds);
  const marks = exerciseIds.filter((id) => !putOff.has(id)).map((id): LessonMark => (missed.has(id) ? 'later' : 'first'));
  const all = whole(total);
  const right = Math.min(all, whole(correct));
  if (marks.length === all && marks.filter((m) => m === 'first').length === right) return marks;
  return [...Array<LessonMark>(right).fill('first'), ...Array<LessonMark>(all - right).fill('later')];
}

/** The strip: a square per mark, in rows of at most `STRIP_ROW`. Nothing for a lesson with no marks. */
export function lessonStrip(marks: readonly LessonMark[]): string {
  const rows: string[] = [];
  for (let at = 0; at < marks.length; at += STRIP_ROW) {
    rows.push(marks.slice(at, at + STRIP_ROW).map((m) => LESSON_SQUARES[m]).join(''));
  }
  return rows.join('\n');
}

// ---- a streak's row ------------------------------------------------------------------

export const STREAK_SQUARES = { kept: '🟧', ahead: '⬜' } as const;

/** A week: how many squares the row is, whatever the streak. */
export const STREAK_ROW = 7;

/**
 * A streak as a row: a week of seven squares, as many lit as days were kept.
 * Past a week all seven are lit and the count stands beside them, however
 * long the streak: never a wall of squares. `count` is the number as the
 * reader's language writes it, where that is not plain figures. Nothing for
 * no streak.
 */
export function streakRow(days: number, count: string = String(whole(days))): string {
  const kept = whole(days);
  if (kept === 0) return '';
  const lit = Math.min(kept, STREAK_ROW);
  const row = STREAK_SQUARES.kept.repeat(lit) + STREAK_SQUARES.ahead.repeat(STREAK_ROW - lit);
  return kept > STREAK_ROW ? `${row} ${count}` : row;
}

/**
 * Whether today's streak is one to offer for sharing. Not every day: a whole
 * week at least, on the days the fire grows from the campfire on (7, 14, 30,
 * 100, 365), and after those every hundredth day and every full year. A
 * button that is there every day is a button nobody sees.
 */
export function streakMilestone(days: number): boolean {
  const kept = whole(days);
  if (kept < FIRE_STAGE_DAYS.campfire) return false;
  return fireGrewToday(kept) !== null || kept % 100 === 0 || kept % 365 === 0;
}

// ---- a league week that is good news -------------------------------------------------

/** The places that are a podium. */
export const PODIUM_PLACES = 3;

/** A closed week worth telling somebody: moved up a league, or finished in the first three of one. */
export type LeagueWin = { kind: 'promoted'; tier: LeagueTier } | { kind: 'podium'; rank: number; tier: LeagueTier };

/**
 * What of a closed league week is offered for sharing: a promotion, by the
 * league moved up to, or a place on the podium, by the league it was won in
 * (the top league's trophy is one). Never a week that moved the learner
 * down, whatever its place, nor one that simply stayed; nor a personal week,
 * which has no league.
 */
export function leagueWin(week: LeagueWeekResult | null | undefined): LeagueWin | null {
  if (!week || week.mode !== 'league' || week.outcome === 'demoted' || !isLeagueTier(week.tier)) return null;
  if (week.outcome === 'promoted') {
    const tier = week.tierAfter ?? week.tier;
    return isLeagueTier(tier) ? { kind: 'promoted', tier } : null;
  }
  const rank = week.rank;
  if (rank !== null && Number.isInteger(rank) && rank >= 1 && rank <= PODIUM_PLACES) return { kind: 'podium', rank, tier: week.tier };
  return null;
}

// ---- the message ---------------------------------------------------------------------

/**
 * A share as one message: the line, the picture set apart under it when
 * there is one, and the address last, where a chat draws it as the site's
 * card. Without a picture the address follows the line directly.
 */
export function shareMessage({ line, picture, link }: { line: string; picture?: string | null; link?: string | null }): string {
  const gap = picture ? '\n\n' : '\n';
  return [line, picture, link].filter((part): part is string => !!part).join(gap);
}
