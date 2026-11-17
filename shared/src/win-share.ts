/**
 * A win, as it is shared: what its message is made of, and which wins are
 * offered for sharing at all.
 *
 * Somebody who solves the day's word, finishes a lesson or keeps a streak is
 * offered a quiet Share. What goes out is one modest line in their own
 * language with a small mark of Hevalo's at its end (an apple for a lesson,
 * the fire for a streak), and under it the win's own address (win-link.ts),
 * which whatever it is pasted into draws as a postcard from the village:
 * the picture is the link's.
 *
 * A share was once a row of coloured squares under its line: a square for
 * every exercise, seven for a week. It said how many and nothing else, and
 * looked like every other app's. The word game keeps a grid, because a grid
 * is how that game is told without giving its word away, but it is laid out
 * in fruit from Hevalo's orchard: a green apple for a letter in its place, a
 * lemon for a letter that is in the word, an empty plate for one that is
 * not.
 *
 * Only marks every phone and browser draws, and figures. No words: a share
 * is read in the language its sender reads, and those words are the apps'.
 * Nothing here is told who the sender is, so nothing here can say.
 */

import { FIRE_STAGE_DAYS, fireGrewToday } from './fire-stages.js';
import type { LeagueTier, LeagueWeekResult } from './leagues.js';
import { isLeagueTier } from './leagues.js';
import type { WinKind } from './win-link.js';

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

// ---- the word game's grid ------------------------------------------------------------

/** How the server scored one letter of a guess: in its place, in the word, or not in it. */
export type LetterFeedback = 'green' | 'yellow' | 'gray';

/** A guess's letters as Hevalo's fruit: a green apple in its place, a lemon in the word, an empty plate for neither. */
export const GRID_MARKS: Record<LetterFeedback, string> = { green: '🍏', yellow: '🍋', gray: '⚪' };
/** For a player who cannot tell green from yellow: an orange and a bunch of grapes, which differ in shape as well as colour. */
export const GRID_MARKS_HIGH_CONTRAST: Record<LetterFeedback, string> = { green: '🍊', yellow: '🍇', gray: '⚪' };

export function gridMark(feedback: LetterFeedback, highContrast = false): string {
  return (highContrast ? GRID_MARKS_HIGH_CONTRAST : GRID_MARKS)[feedback];
}

/** One guess as its row of fruit. */
export function gridRow(row: readonly LetterFeedback[], highContrast = false): string {
  return row.map((f) => gridMark(f, highContrast)).join('');
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
 * address, when the app hands one over. Only fruit and counts: no letter
 * of a guess or of the word is in it.
 */
export function wordGameShareText(input: WordGameShare, link?: string | null): string {
  return shareMessage({ line: wordGameHeader(input), picture: wordGrid(input.rows, input.highContrast ?? false), link });
}

// ---- the mark at the end of a line -----------------------------------------------------

/**
 * What a win's line ends on: an apple for a lesson, the fire for a streak, a
 * medal for a badge, a cup for a league week. The word game has none: its
 * line is its score, and its grid follows.
 */
export const WIN_MARKS: Readonly<Record<WinKind, string>> = { lesson: '🍎', streak: '🔥', badge: '🏅', league: '🏆', peyvok: '' };

/** A win's line with its mark after it. A line that is empty stays empty: a mark alone says nothing. */
export function winLine(line: string, kind: WinKind): string {
  const said = line.trim();
  const mark = WIN_MARKS[kind];
  return said && mark ? `${said} ${mark}` : said;
}

// ---- a streak worth telling ----------------------------------------------------------

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
