/**
 * A win as it is shared, and which wins are offered for sharing. A share is one modest line in the sender's language with
 * a small Hevalo mark at its end (an apple for a lesson, the fire for a streak) and the win's own address under it
 * (win-link.ts), which chats draw as a postcard. The word game also shares a grid, since that is how its result is told
 * without giving the word away, drawn in fruit. Only marks every phone and browser draws, and figures; the words are the
 * apps', and nothing here knows who the sender is.
 */

import { FIRE_STAGE_DAYS, fireGrewToday, whole } from './fire-stages.js';
import type { LeagueTier, LeagueWeekResult } from './leagues.js';
import { isLeagueTier } from './leagues.js';
import type { WinKind } from './win-link.js';

// ---- the word game's grid ------------------------------------------------------------

/** How the server scored one letter of a guess: in its place, in the word, or not in it. */
export type LetterFeedback = 'green' | 'yellow' | 'gray';

/** A guess's letters as fruit: a green apple in its place, a lemon in the word, an empty plate for neither. */
export const GRID_MARKS: Record<LetterFeedback, string> = { green: '🍏', yellow: '🍋', gray: '⚪' };
/** For players who cannot tell green from yellow: an orange and grapes, which differ in shape as well as colour. */
export const GRID_MARKS_HIGH_CONTRAST: Record<LetterFeedback, string> = { green: '🍊', yellow: '🍇', gray: '⚪' };

export function gridMark(feedback: LetterFeedback, highContrast = false): string {
  return (highContrast ? GRID_MARKS_HIGH_CONTRAST : GRID_MARKS)[feedback];
}

/** One guess as a row of fruit. */
export function gridRow(row: readonly LetterFeedback[], highContrast = false): string {
  return row.map((f) => gridMark(f, highContrast)).join('');
}

/** Every guess, one row under another. */
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

/** The line over the grid: the game, which one, and guesses taken of allowed, X when not found ("Hevalo Peyvok #123 (Hard) 4/6"). */
export function wordGameHeader(input: WordGameShare): string {
  const parts = [input.name];
  if (input.practice) parts.push(input.practice);
  else if (input.dayNumber !== undefined) parts.push(`#${input.dayNumber}`);
  if (input.difficulty) parts.push(`(${input.difficulty})`);
  parts.push(`${input.solved ? input.rows.length : 'X'}/${input.maxAttempts}`);
  return parts.join(' ');
}

/** The header, an empty line, the grid, and the address set apart under them when given; only fruit and counts, never a letter. */
export function wordGameShareText(input: WordGameShare, link?: string | null): string {
  return shareMessage({ line: wordGameHeader(input), picture: wordGrid(input.rows, input.highContrast ?? false), link });
}

// ---- the mark at the end of a line -----------------------------------------------------

/** What a win's line ends on: an apple for a lesson, fire for a streak, a medal for a badge, a cup for a league week; none for the word game. */
export const WIN_MARKS: Readonly<Record<WinKind, string>> = { lesson: '🍎', streak: '🔥', badge: '🏅', league: '🏆', peyvok: '' };

/** A win's line with its mark after it; an empty line stays empty, since a mark alone says nothing. */
export function winLine(line: string, kind: WinKind): string {
  const said = line.trim();
  const mark = WIN_MARKS[kind];
  return said && mark ? `${said} ${mark}` : said;
}

// ---- a streak worth telling ----------------------------------------------------------

/**
 * Whether today's streak is offered for sharing: from a full week, on the days the fire grows from the campfire on (7, 14,
 * 30, 100, 365), then every hundredth day and every full year. A button there every day is a button nobody sees.
 */
export function streakMilestone(days: number): boolean {
  const kept = whole(days);
  if (kept < FIRE_STAGE_DAYS.campfire) return false;
  return fireGrewToday(kept) !== null || kept % 100 === 0 || kept % 365 === 0;
}

// ---- a league week that is good news -------------------------------------------------

/** The places that are a podium. */
export const PODIUM_PLACES = 3;

/** A closed week worth telling: moved up a league, or finished in its first three. */
export type LeagueWin = { kind: 'promoted'; tier: LeagueTier } | { kind: 'podium'; rank: number; tier: LeagueTier };

/**
 * What of a closed league week is offered for sharing: a promotion, by the league reached, or a podium place, by its
 * league (the top league's trophy counts). Never a week that moved the learner down or simply stayed, nor a personal week.
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

/** A share as one message: the line, the picture set apart under it, and the address last, where a chat draws its card. */
export function shareMessage({ line, picture, link }: { line: string; picture?: string | null; link?: string | null }): string {
  const gap = picture ? '\n\n' : '\n';
  return [line, picture, link].filter((part): part is string => !!part).join(gap);
}
