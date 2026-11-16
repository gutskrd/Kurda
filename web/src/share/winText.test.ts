import { describe, expect, it } from 'vitest';
import type { LeagueWin } from '@kurda/shared';
import { translator } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { nl } from '../i18n/nl';
import { de } from '../i18n/de';
import { es } from '../i18n/es';
import { fr } from '../i18n/fr';
import { tr } from '../i18n/tr';
import { ar } from '../i18n/ar';
import type { WordleGame, WordleGuessRow } from '../lib/types';
import { badgeShare, leagueShare, lessonShare, siteUrl, streakShare, wordGameShare } from './winText';

/*
 * What each win says when it is shared, word for word: the catalogue's line,
 * the shared builder's picture, and the site's address. The buttons that send
 * these are tested where they stand (learn/Results, badges, leagues, the word
 * game's page).
 */

const t = translator(en);
const SITE = window.location.origin;

const exercises = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id }));
const mistake = (exerciseId: string) => ({ exerciseId, verdict: 'wrong' as const });

describe('a finished lesson', () => {
  it('names the lesson, draws a square for each exercise in order, and ends on the site’s address', () => {
    const text = lessonShare(t, { title: 'Hello!', exercises, results: { correct: 4, total: 6, mistakes: [mistake('e2'), mistake('e5')] } });
    expect(text).toBe(`I finished “Hello!” in Kurdish on Hevalo.\n\n🟩🟨🟩🟩🟨🟩\n\n${SITE}`);
  });

  it('says a Kurdish lesson was finished when the page was not told its name', () => {
    const results = { correct: 6, total: 6, mistakes: [] };
    expect(lessonShare(t, { exercises, results }).split('\n')[0]).toBe('I finished a Kurdish lesson on Hevalo.');
    expect(lessonShare(t, { title: '   ', exercises, results }).split('\n')[0]).toBe('I finished a Kurdish lesson on Hevalo.');
    expect(lessonShare(t, { title: null, exercises, results }).split('\n\n')[1]).toBe('🟩🟩🟩🟩🟩🟩');
  });

  it('leaves out an exercise that was put off, as the score does', () => {
    const text = lessonShare(t, { title: 'Hello!', exercises, results: { correct: 3, total: 4, mistakes: [mistake('e1')] }, putOff: ['e3', 'e6'] });
    expect(text.split('\n\n')[1]).toBe('🟨🟩🟩🟩');
  });

  it('wraps a long lesson into rows of ten', () => {
    const long = Array.from({ length: 14 }, (_, i) => ({ id: `x${i}` }));
    const strip = lessonShare(t, { exercises: long, results: { correct: 14, total: 14, mistakes: [] } }).split('\n\n')[1]!;
    expect(strip.split('\n').map((row) => [...row].length)).toEqual([10, 4]);
  });

  it('draws the score as a tally when the list of exercises did not arrive', () => {
    const text = lessonShare(t, { exercises: [], results: { correct: 5, total: 6 } });
    expect(text.split('\n\n')[1]).toBe('🟩🟩🟩🟩🟩🟨');
  });
});

describe('a streak', () => {
  it('is its days, a week of squares, and the address', () => {
    expect(streakShare(t, 'en', 7)).toBe(`7 days of Kurdish in a row.\n\n🟧🟧🟧🟧🟧🟧🟧\n\n${SITE}`);
  });

  it('writes the count beside the week once the streak has outgrown it', () => {
    expect(streakShare(t, 'en', 30)).toBe(`30 days of Kurdish in a row.\n\n🟧🟧🟧🟧🟧🟧🟧 30\n\n${SITE}`);
    expect(streakShare(t, 'en', 365).split('\n\n')[1]).toBe('🟧🟧🟧🟧🟧🟧🟧 365');
  });

  it('writes the number in the reader’s own figures, in the line and beside the squares alike', () => {
    const count = new Intl.NumberFormat('ckb').format(30);
    const text = streakShare(translator(ckb), 'ckb', 30);
    expect(text.split('\n')[0]).toContain(count);
    expect(text.split('\n\n')[1]).toBe(`🟧🟧🟧🟧🟧🟧🟧 ${count}`);
  });
});

describe('a badge', () => {
  it('is said by its name, with the address under it and no picture', () => {
    expect(badgeShare(t, 'Agir')).toBe(`I earned the “Agir” badge on Hevalo.\n${SITE}`);
  });
});

describe('a league week', () => {
  it('says the league moved up to', () => {
    const win: LeagueWin = { kind: 'promoted', tier: 'cem' };
    expect(leagueShare(t, win, 'Çem')).toBe(`I moved up to the Çem League on Hevalo.\n${SITE}`);
  });

  it('says a place in the first three and the league it was taken in', () => {
    const win: LeagueWin = { kind: 'podium', rank: 2, tier: 'okyanus' };
    expect(leagueShare(t, win, 'Okyanûs')).toBe(`I finished #2 in the Okyanûs League on Hevalo.\n${SITE}`);
  });
});

describe('the word game', () => {
  const game = (over: Partial<WordleGame>): WordleGame => ({
    id: 'w1',
    mode: 'daily',
    difficulty: 'medium',
    status: 'won',
    targetLength: 3,
    guesses: [
      { guess: 'mal', letters: ['m', 'a', 'l'], feedback: ['yellow', 'green', 'gray'] },
      { guess: 'dar', letters: ['d', 'a', 'r'], feedback: ['green', 'green', 'green'] },
    ],
    keyboard: {},
    remainingAttempts: 4,
    target: 'dar',
    xpAwarded: 0,
    ...over,
  });
  const words = { practice: 'Practice', difficulty: 'Medium' };

  it('is the game’s name with the score, the grid of the guesses, and the address', () => {
    expect(wordGameShare(game({}), words)).toBe(`Hevalo Peyvok (Medium) 2/6\n\n🟨🟩⬜\n🟩🟩🟩\n\n${SITE}`);
  });

  it('calls a practice game one, and writes an X for a word that was not found', () => {
    const miss: WordleGuessRow = { guess: 'mal', letters: ['m', 'a', 'l'], feedback: ['gray', 'green', 'gray'] };
    const lost = game({ mode: 'practice', status: 'lost', guesses: Array.from({ length: 6 }, () => miss), remainingAttempts: 0 });
    const text = wordGameShare(lost, words);
    expect(text.split('\n')[0]).toBe('Hevalo Peyvok Practice (Medium) X/6');
    expect(text.split('\n\n')[1]!.split('\n')).toHaveLength(6);
  });

  it('gives nothing of the word away: no guess and no answer is in it', () => {
    const text = wordGameShare(game({}), words);
    expect(text).not.toMatch(/\bmal\b|\bdar\b/i);
    expect(/\p{L}/u.test(text.split('\n\n')[1]!)).toBe(false);
  });
});

describe('every share', () => {
  const win: LeagueWin = { kind: 'podium', rank: 3, tier: 'kani' };
  const all = (tt: typeof t, locale: string): string[] => [
    lessonShare(tt, { title: 'Hello!', exercises, results: { correct: 6, total: 6, mistakes: [] } }),
    lessonShare(tt, { exercises, results: { correct: 6, total: 6, mistakes: [] } }),
    streakShare(tt, locale, 14),
    badgeShare(tt, 'Agir'),
    leagueShare(tt, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, win, 'Kanî'),
  ];

  it('points at the site’s front door and nowhere else: never a profile, never a page about a person', () => {
    expect(siteUrl()).toBe(SITE);
    for (const text of all(t, 'en')) {
      const links = text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toEqual([SITE]);
      expect(text.endsWith(SITE)).toBe(true);
      expect(text).not.toMatch(/\/users\/|\/profile|@/);
    }
  });

  it('is said in all nine languages with every value in its place', () => {
    const catalogues = { en, ku, ckb, nl, de, es, fr, tr, ar };
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      const [lesson, plain, streak, badge, up, place] = all(translator(catalogue), locale) as [string, string, string, string, string, string];
      for (const text of [lesson, plain, streak, badge, up, place]) expect(text, locale).not.toMatch(/[{}]/);
      expect(lesson, locale).toContain('Hello!');
      expect(plain.split('\n')[0], locale).not.toBe(lesson.split('\n')[0]);
      expect(streak.split('\n')[0], locale).toContain(new Intl.NumberFormat(locale).format(14));
      expect(badge, locale).toContain('Agir');
      expect(up, locale).toContain('Çem');
      expect(place, locale).toContain('Kanî');
      expect(place, locale).toContain('3');
      // each language has its own words for these: none is left in English
      if (locale === 'en') continue;
      for (const key of ['share.win.lesson', 'share.win.lessonPlain', 'share.win.streak', 'share.win.badge', 'share.win.leagueUp', 'share.win.leaguePlace'] as const) {
        expect(catalogue[key], `${locale} ${key}`).not.toBe(en[key]);
      }
    }
  });
});
