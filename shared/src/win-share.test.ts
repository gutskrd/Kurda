import { describe, expect, it } from 'vitest';
import type { LeagueWeekResult } from './leagues.js';
import {
  GRID_MARKS,
  GRID_MARKS_HIGH_CONTRAST,
  WIN_MARKS,
  gridMark,
  gridRow,
  leagueWin,
  shareMessage,
  streakMilestone,
  winLine,
  wordGameResult,
  wordGameShareText,
  wordGrid,
  type LetterFeedback,
  type WordGameShare,
} from './win-share.js';
import { WIN_KINDS } from './win-link.js';

/** Every letter of any alphabet: a picture has none. */
const LETTERS = /\p{L}/u;

const win: LetterFeedback[][] = [
  ['gray', 'yellow', 'gray', 'gray', 'gray'],
  ['green', 'gray', 'yellow', 'gray', 'gray'],
  ['green', 'green', 'green', 'green', 'green'],
];

describe('the word game’s fruit', () => {
  it('draws each mark as its fruit: a green apple in its place, a lemon in the word, an empty plate for neither', () => {
    expect(gridMark('green')).toBe(GRID_MARKS.green);
    expect(gridMark('yellow')).toBe(GRID_MARKS.yellow);
    expect(gridMark('gray')).toBe(GRID_MARKS.gray);
    expect(new Set(Object.values(GRID_MARKS)).size).toBe(3);
  });

  it('draws fruit of another shape for a player who cannot tell green from yellow', () => {
    expect(gridMark('green', true)).toBe(GRID_MARKS_HIGH_CONTRAST.green);
    expect(gridMark('yellow', true)).toBe(GRID_MARKS_HIGH_CONTRAST.yellow);
    expect(GRID_MARKS_HIGH_CONTRAST.green).not.toBe(GRID_MARKS.green);
    expect(GRID_MARKS_HIGH_CONTRAST.yellow).not.toBe(GRID_MARKS.yellow);
    expect(GRID_MARKS_HIGH_CONTRAST.green).not.toBe(GRID_MARKS_HIGH_CONTRAST.yellow);
  });

  it('draws a guess as a row of fruit', () => {
    expect(gridRow(['green', 'gray', 'yellow'])).toBe('🍏⚪🍋');
    expect(gridRow(['green'], true)).toBe('🍊');
    expect(gridRow([])).toBe('');
  });

  it('draws the guesses a row under a row', () => {
    const grid = wordGrid(win);
    expect(grid.split('\n')).toEqual(['⚪🍋⚪⚪⚪', '🍏⚪🍋⚪⚪', '🍏🍏🍏🍏🍏']);
    expect(wordGrid([])).toBe('');
  });

  it('is never a coloured square: a share is not a row of blocks', () => {
    for (const mark of [...Object.values(GRID_MARKS), ...Object.values(GRID_MARKS_HIGH_CONTRAST)]) expect(mark).not.toMatch(/[🟩🟨🟧🟦⬜⬛🟥🟪🟫]/u);
  });
});

describe('how the word game went, as its link says it', () => {
  const base: WordGameShare = { rows: win, solved: true, maxAttempts: 6, practice: false };

  it('is the guesses it took of those allowed', () => {
    expect(wordGameResult(base)).toEqual({ tries: 3, of: 6, practice: false });
  });

  it('takes no count of guesses from a word that was not found', () => {
    expect(wordGameResult({ ...base, solved: false })).toEqual({ tries: null, of: 6, practice: false });
  });

  it('says whether it was a practice word', () => {
    expect(wordGameResult({ ...base, practice: true })).toEqual({ tries: 3, of: 6, practice: true });
  });
});

describe('the word game’s share', () => {
  const line = 'Look, I just solved today’s Peyvok in 3/6! Can you beat me?';
  const game: WordGameShare = { rows: win, solved: true, maxAttempts: 6, practice: false };

  it('opens on the app’s line, then an empty line and the grid', () => {
    const [first, blank, ...gridLines] = wordGameShareText(line, game).split('\n');
    expect(first).toBe(line);
    expect(blank).toBe('');
    expect(gridLines).toEqual(['⚪🍋⚪⚪⚪', '🍏⚪🍋⚪⚪', '🍏🍏🍏🍏🍏']);
  });

  it('ends on the address when it is handed one, set apart under the grid', () => {
    expect(wordGameShareText(line, game, 'https://example.org')).toBe(`${wordGameShareText(line, game)}\n\nhttps://example.org`);
    expect(wordGameShareText(line, game, null)).toBe(wordGameShareText(line, game));
  });

  it('gives nothing of the word away: no letter is in the grid', () => {
    const grid = wordGameShareText(line, { ...game, solved: false }).split('\n\n')[1] ?? '';
    expect(grid.length).toBeGreaterThan(0);
    expect(LETTERS.test(grid)).toBe(false);
  });

  it('draws the high-contrast fruit when asked', () => {
    const text = wordGameShareText(line, { ...game, rows: [['green', 'yellow', 'gray']], highContrast: true });
    expect(text.split('\n\n')[1]).toBe('🍊🍇⚪');
  });
});

describe('the mark at the end of a line', () => {
  it('ends a lesson’s line on an apple and a streak’s on the fire', () => {
    expect(winLine('I finished “Silav!” on Hevalo.', 'lesson')).toBe('I finished “Silav!” on Hevalo. 🍎');
    expect(winLine('7 days in a row.', 'streak')).toBe('7 days in a row. 🔥');
  });

  it('has a mark for every win but the word game, whose line is its score', () => {
    for (const kind of WIN_KINDS) {
      if (kind === 'peyvok') expect(WIN_MARKS[kind]).toBe('');
      else expect(WIN_MARKS[kind], kind).not.toBe('');
    }
    expect(winLine('Look, I just solved today’s Peyvok in 3/6!', 'peyvok')).toBe('Look, I just solved today’s Peyvok in 3/6!');
    expect(new Set(WIN_KINDS.filter((k) => k !== 'peyvok').map((k) => WIN_MARKS[k])).size).toBe(WIN_KINDS.length - 1);
  });

  it('says nothing where there is no line: a mark alone is not a message', () => {
    expect(winLine('', 'lesson')).toBe('');
    expect(winLine('   ', 'streak')).toBe('');
  });

  it('adds one mark and no letters', () => {
    for (const kind of WIN_KINDS) expect(LETTERS.test(WIN_MARKS[kind]), kind).toBe(false);
    expect(winLine('  A line.  ', 'badge')).toBe(`A line. ${WIN_MARKS.badge}`);
  });
});

describe('the days a streak is offered for sharing', () => {
  it('are the days the fire grows from a whole week on', () => {
    for (const days of [7, 14, 30, 100, 365]) expect(streakMilestone(days), String(days)).toBe(true);
  });

  it('are not the first days, though the fire grows on them too', () => {
    for (const days of [0, 1, 2, 3, 6]) expect(streakMilestone(days), String(days)).toBe(false);
  });

  it('are not the days in between', () => {
    for (const days of [8, 13, 15, 29, 31, 99, 101, 364, 366]) expect(streakMilestone(days), String(days)).toBe(false);
  });

  it('go on past a year: every hundredth day and every full year', () => {
    for (const days of [200, 300, 400, 500, 730, 1000, 1095]) expect(streakMilestone(days), String(days)).toBe(true);
    for (const days of [450, 731, 999]) expect(streakMilestone(days), String(days)).toBe(false);
  });

  it('is never a day that is not a number', () => {
    expect(streakMilestone(Number.NaN)).toBe(false);
    expect(streakMilestone(-7)).toBe(false);
  });
});

describe('a league week that is good news', () => {
  const week = (over: Partial<LeagueWeekResult>): LeagueWeekResult => ({
    weekKey: '2026-10-05',
    mode: 'league',
    tier: 'kani',
    tierAfter: 'kani',
    outcome: 'stayed',
    rank: 9,
    groupSize: 20,
    weeklyXp: 340,
    goalXp: 200,
    goalMet: true,
    trophy: false,
    zer: 0,
    ...over,
  });

  it('is a promotion, by the league moved up to', () => {
    expect(leagueWin(week({ outcome: 'promoted', tierAfter: 'cem', rank: 4 }))).toEqual({ kind: 'promoted', tier: 'cem' });
    // and still a promotion from the podium: moving up is the news
    expect(leagueWin(week({ outcome: 'promoted', tierAfter: 'cem', rank: 1 }))).toEqual({ kind: 'promoted', tier: 'cem' });
  });

  it('is a place in the first three, by the league it was won in', () => {
    for (const rank of [1, 2, 3]) expect(leagueWin(week({ rank }))).toEqual({ kind: 'podium', rank, tier: 'kani' });
  });

  it('is the top league’s trophy, which is a place in its first three', () => {
    expect(leagueWin(week({ tier: 'okyanus', tierAfter: 'okyanus', rank: 2, trophy: true }))).toEqual({ kind: 'podium', rank: 2, tier: 'okyanus' });
  });

  it('is never a week that simply stayed', () => {
    expect(leagueWin(week({ rank: 4 }))).toBeNull();
    expect(leagueWin(week({ rank: 15 }))).toBeNull();
    expect(leagueWin(week({ rank: null }))).toBeNull();
  });

  it('is never a week that moved down, whatever its place', () => {
    expect(leagueWin(week({ outcome: 'demoted', tier: 'cem', tierAfter: 'kani', rank: 19 }))).toBeNull();
    expect(leagueWin(week({ outcome: 'demoted', tier: 'cem', tierAfter: 'kani', rank: 2 }))).toBeNull();
  });

  it('is never a personal week, or no week, or a league the app does not know', () => {
    expect(leagueWin(week({ mode: 'personal', tier: null, tierAfter: null, outcome: null, rank: null }))).toBeNull();
    expect(leagueWin(null)).toBeNull();
    expect(leagueWin(undefined)).toBeNull();
    expect(leagueWin(week({ tier: 'diamond' as never, rank: 1 }))).toBeNull();
    expect(leagueWin(week({ outcome: 'promoted', tierAfter: 'diamond' as never }))).toBeNull();
  });

  it('is no place that is not a place', () => {
    expect(leagueWin(week({ rank: 0 }))).toBeNull();
    expect(leagueWin(week({ rank: 2.5 }))).toBeNull();
  });
});

describe('the message', () => {
  it('is the line, the picture set apart under it, and the address last', () => {
    expect(shareMessage({ line: 'A line.', picture: '🍏🍋', link: 'https://example.org' })).toBe('A line.\n\n🍏🍋\n\nhttps://example.org');
  });

  it('puts the address straight under the line when there is no picture', () => {
    expect(shareMessage({ line: 'A line.', link: 'https://example.org' })).toBe('A line.\nhttps://example.org');
    expect(shareMessage({ line: 'A line.', picture: '', link: 'https://example.org' })).toBe('A line.\nhttps://example.org');
  });

  it('is only the line when that is all there is', () => {
    expect(shareMessage({ line: 'A line.' })).toBe('A line.');
    expect(shareMessage({ line: 'A line.', picture: null, link: null })).toBe('A line.');
  });
});
