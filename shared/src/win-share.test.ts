import { describe, expect, it } from 'vitest';
import type { LeagueWeekResult } from './leagues.js';
import {
  GRID_SQUARES,
  GRID_SQUARES_HIGH_CONTRAST,
  LESSON_SQUARES,
  STREAK_SQUARES,
  gridRow,
  gridSquare,
  leagueWin,
  lessonMarks,
  lessonStrip,
  shareMessage,
  streakMilestone,
  streakRow,
  wordGameHeader,
  wordGameShareText,
  wordGrid,
  type LessonMark,
  type LetterFeedback,
  type WordGameShare,
} from './win-share.js';

/** Every letter of any alphabet: a picture has none. */
const LETTERS = /\p{L}/u;

const win: LetterFeedback[][] = [
  ['gray', 'yellow', 'gray', 'gray', 'gray'],
  ['green', 'gray', 'yellow', 'gray', 'gray'],
  ['green', 'green', 'green', 'green', 'green'],
];

describe('the word game’s squares', () => {
  it('draws each mark as its square', () => {
    expect(gridSquare('green')).toBe(GRID_SQUARES.green);
    expect(gridSquare('yellow')).toBe(GRID_SQUARES.yellow);
    expect(gridSquare('gray')).toBe(GRID_SQUARES.gray);
  });

  it('draws orange and blue for a player who cannot tell green from yellow', () => {
    expect(gridSquare('green', true)).toBe(GRID_SQUARES_HIGH_CONTRAST.green);
    expect(gridSquare('yellow', true)).toBe(GRID_SQUARES_HIGH_CONTRAST.yellow);
    expect(GRID_SQUARES_HIGH_CONTRAST.green).not.toBe(GRID_SQUARES.green);
    expect(GRID_SQUARES_HIGH_CONTRAST.yellow).not.toBe(GRID_SQUARES.yellow);
  });

  it('draws a guess as a row of squares', () => {
    expect(gridRow(['green', 'gray', 'yellow'])).toBe('🟩⬜🟨');
    expect(gridRow(['green'], true)).toBe('🟧');
    expect(gridRow([])).toBe('');
  });

  it('draws the guesses a row under a row', () => {
    const grid = wordGrid(win);
    expect(grid.split('\n')).toEqual(['⬜🟨⬜⬜⬜', '🟩⬜🟨⬜⬜', '🟩🟩🟩🟩🟩']);
    expect(wordGrid([])).toBe('');
  });
});

describe('the line over the grid', () => {
  const base: WordGameShare = { rows: win, solved: true, maxAttempts: 6, name: 'Hevalo Peyvok' };

  it('gives the day’s word its number and the guesses it took', () => {
    expect(wordGameHeader({ ...base, dayNumber: 123 })).toBe('Hevalo Peyvok #123 3/6');
  });

  it('says how hard it was, in the word the app gives', () => {
    expect(wordGameHeader({ ...base, dayNumber: 123, difficulty: 'Hard' })).toBe('Hevalo Peyvok #123 (Hard) 3/6');
    expect(wordGameHeader({ ...base, difficulty: 'Dijwar' })).toBe('Hevalo Peyvok (Dijwar) 3/6');
  });

  it('names a practice game as one, and gives it no number', () => {
    expect(wordGameHeader({ ...base, practice: 'Practice', dayNumber: 123 })).toBe('Hevalo Peyvok Practice 3/6');
    expect(wordGameHeader({ ...base, practice: 'Practice', difficulty: 'Medium' })).toBe('Hevalo Peyvok Practice (Medium) 3/6');
  });

  it('writes an X for a word that was not found', () => {
    expect(wordGameHeader({ ...base, solved: false, dayNumber: 123 })).toBe('Hevalo Peyvok #123 X/6');
  });

  it('has no words of its own: with none handed to it, only the score is left', () => {
    expect(wordGameHeader({ ...base, name: '' }).trim()).toBe('3/6');
  });
});

describe('the word game’s share', () => {
  it('is the header, an empty line, and the grid', () => {
    const text = wordGameShareText({ rows: win, solved: true, maxAttempts: 6, name: 'Hevalo Peyvok', dayNumber: 7 });
    const [header, blank, ...gridLines] = text.split('\n');
    expect(header).toBe('Hevalo Peyvok #7 3/6');
    expect(blank).toBe('');
    expect(gridLines).toEqual(['⬜🟨⬜⬜⬜', '🟩⬜🟨⬜⬜', '🟩🟩🟩🟩🟩']);
  });

  it('reads as it did when the phone built it', () => {
    expect(wordGameShareText({ rows: win, solved: true, maxAttempts: 6, name: 'Hevalo Peyvok', difficulty: 'Medium' })).toBe(
      'Hevalo Peyvok (Medium) 3/6\n\n⬜🟨⬜⬜⬜\n🟩⬜🟨⬜⬜\n🟩🟩🟩🟩🟩',
    );
  });

  it('ends on the address when it is handed one, set apart under the grid', () => {
    const input: WordGameShare = { rows: win, solved: true, maxAttempts: 6, name: 'Hevalo Peyvok', difficulty: 'Medium' };
    expect(wordGameShareText(input, 'https://example.org')).toBe(`${wordGameShareText(input)}\n\nhttps://example.org`);
    expect(wordGameShareText(input, null)).toBe(wordGameShareText(input));
  });

  it('gives nothing of the word away: no letter is in the grid', () => {
    const text = wordGameShareText({ rows: win, solved: false, maxAttempts: 6, name: 'Hevalo Peyvok', practice: 'Practice' });
    const grid = text.split('\n\n')[1] ?? '';
    expect(grid.length).toBeGreaterThan(0);
    expect(LETTERS.test(grid)).toBe(false);
  });

  it('draws the high-contrast squares when asked', () => {
    const text = wordGameShareText({ rows: [['green', 'yellow', 'gray']], solved: true, maxAttempts: 6, name: 'Hevalo Peyvok', highContrast: true });
    expect(text.split('\n\n')[1]).toBe('🟧🟦⬜');
  });
});

describe('a lesson’s marks', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('marks each exercise in the lesson’s order: right the first time, or only later', () => {
    expect(lessonMarks({ exerciseIds: ids, missedIds: ['b', 'e'], correct: 3, total: 5 })).toEqual(['first', 'later', 'first', 'first', 'later']);
  });

  it('marks a lesson with no mistakes as all right the first time', () => {
    expect(lessonMarks({ exerciseIds: ids, missedIds: [], correct: 5, total: 5 })).toEqual(['first', 'first', 'first', 'first', 'first']);
  });

  it('leaves out an exercise that was put off, as the score does', () => {
    expect(lessonMarks({ exerciseIds: ids, missedIds: ['a'], putOffIds: ['c', 'd'], correct: 2, total: 3 })).toEqual(['later', 'first', 'first']);
  });

  it('tallies the score, the right ones first, when the list does not account for it', () => {
    // no list at all
    expect(lessonMarks({ exerciseIds: [], missedIds: [], correct: 5, total: 6 })).toEqual(['first', 'first', 'first', 'first', 'first', 'later']);
    // a list shorter than the score
    expect(lessonMarks({ exerciseIds: ['a'], missedIds: [], correct: 1, total: 3 })).toEqual(['first', 'later', 'later']);
    // a miss on an exercise the list does not have: the list says two right and the score says one, and the score is what the screen shows
    expect(lessonMarks({ exerciseIds: ['a', 'b'], missedIds: ['zz'], correct: 1, total: 2 })).toEqual(['first', 'later']);
  });

  it('draws nothing it was not told: a score of nothing is no marks, and never more right than answered', () => {
    expect(lessonMarks({ exerciseIds: [], missedIds: [], correct: 0, total: 0 })).toEqual([]);
    expect(lessonMarks({ exerciseIds: [], missedIds: [], correct: 9, total: 2 })).toEqual(['first', 'first']);
    expect(lessonMarks({ exerciseIds: [], missedIds: [], correct: Number.NaN, total: -4 })).toEqual([]);
  });
});

describe('a lesson’s strip', () => {
  const marks = (first: number, later = 0): LessonMark[] => [...Array<LessonMark>(first).fill('first'), ...Array<LessonMark>(later).fill('later')];

  it('is nothing for no marks', () => {
    expect(lessonStrip([])).toBe('');
  });

  it('is one square for one exercise', () => {
    expect(lessonStrip(['first'])).toBe('🟩');
    expect(lessonStrip(['later'])).toBe('🟨');
  });

  it('keeps ten squares on one row', () => {
    const strip = lessonStrip(marks(10));
    expect(strip).toBe('🟩'.repeat(10));
    expect(strip).not.toContain('\n');
  });

  it('wraps the eleventh onto a second row', () => {
    expect(lessonStrip(marks(11)).split('\n')).toEqual(['🟩'.repeat(10), '🟩']);
  });

  it('wraps a long lesson into rows of ten, the last one what is left', () => {
    const rows = lessonStrip(marks(18, 7)).split('\n');
    expect(rows.map((r) => [...r].length)).toEqual([10, 10, 5]);
    expect(rows[2]).toBe('🟨'.repeat(5));
  });

  it('keeps the order it was given: a pattern of the lesson, not a count', () => {
    expect(lessonStrip(['first', 'later', 'first', 'first', 'later'])).toBe('🟩🟨🟩🟩🟨');
  });

  it('uses two different squares, and no letters', () => {
    expect(LESSON_SQUARES.first).not.toBe(LESSON_SQUARES.later);
    expect(LETTERS.test(lessonStrip(marks(12, 9)))).toBe(false);
  });
});

describe('a streak’s row', () => {
  const lit = STREAK_SQUARES.kept;
  const dim = STREAK_SQUARES.ahead;

  it('lights one square of the week on the first day', () => {
    expect(streakRow(1)).toBe(lit + dim.repeat(6));
  });

  it('lights as many as days were kept, in a week of seven', () => {
    expect(streakRow(3)).toBe(lit.repeat(3) + dim.repeat(4));
    expect([...streakRow(5)]).toHaveLength(7);
  });

  it('is a full week at seven days, with nothing beside it', () => {
    expect(streakRow(7)).toBe(lit.repeat(7));
  });

  it('writes the count beside the week from the eighth day', () => {
    expect(streakRow(8)).toBe(`${lit.repeat(7)} 8`);
  });

  it('stays a week and a number at thirty days and at a year: never a wall of squares', () => {
    expect(streakRow(30)).toBe(`${lit.repeat(7)} 30`);
    expect(streakRow(365)).toBe(`${lit.repeat(7)} 365`);
    expect(streakRow(365).split('\n')).toHaveLength(1);
    expect([...streakRow(3650)].filter((c) => c === lit)).toHaveLength(7);
  });

  it('writes the count as the reader’s language does, when it is handed one', () => {
    expect(streakRow(30, '٣٠')).toBe(`${lit.repeat(7)} ٣٠`);
    // within the week there is no count to write
    expect(streakRow(7, '٧')).toBe(lit.repeat(7));
  });

  it('is nothing for no streak, or a number that is not one', () => {
    expect(streakRow(0)).toBe('');
    expect(streakRow(-3)).toBe('');
    expect(streakRow(Number.NaN)).toBe('');
  });

  it('has no letters in it', () => {
    for (const days of [1, 7, 8, 30, 365]) expect(LETTERS.test(streakRow(days))).toBe(false);
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
    gems: 0,
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
    expect(shareMessage({ line: 'A line.', picture: '🟩🟨', link: 'https://example.org' })).toBe('A line.\n\n🟩🟨\n\nhttps://example.org');
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
