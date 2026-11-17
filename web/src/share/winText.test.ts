import { describe, expect, it } from 'vitest';
import { parseWinLink, type LeagueWin } from '@kurda/shared';
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
 * What each win says when it is shared, word for word: the catalogue's line
 * ended on its mark, and the win's own address on the site, which is drawn
 * as its postcard wherever it is pasted. The buttons that send these are
 * tested where they stand (learn/Results, badges, leagues, the word game's
 * page).
 */

const t = translator(en);
const SITE = window.location.origin;

describe('a finished lesson', () => {
  it('names the lesson, ends its line on an apple, and puts the lesson’s own address under it', () => {
    expect(lessonShare(t, 'Hello!')).toBe(`I finished “Hello!” in Kurdish on Hevalo. 🍎\n${SITE}/win/lesson`);
  });

  it('says a Kurdish lesson was finished when the page was not told its name', () => {
    for (const title of [undefined, null, '', '   ']) expect(lessonShare(t, title).split('\n')[0], String(title)).toBe('I finished a Kurdish lesson on Hevalo. 🍎');
  });

  it('is a line and an address, and no rows of squares', () => {
    const text = lessonShare(t, 'Hello!');
    expect(text.split('\n')).toHaveLength(2);
    expect(text).not.toMatch(/[🟩🟨🟧🟦⬜⬛]/u);
  });
});

describe('a streak', () => {
  it('is its days, the fire, and the address of the card with those days on its stamp', () => {
    expect(streakShare(t, 'en', 7)).toBe(`7 days of Kurdish in a row. 🔥\n${SITE}/win/streak/7`);
    expect(streakShare(t, 'en', 365)).toBe(`365 days of Kurdish in a row. 🔥\n${SITE}/win/streak/365`);
  });

  it('writes the number in the reader’s own figures in the line, and in plain ones in the address', () => {
    const count = new Intl.NumberFormat('ckb').format(30);
    const [line, link] = streakShare(translator(ckb), 'ckb', 30).split('\n') as [string, string];
    expect(line).toContain(count);
    expect(link).toBe(`${SITE}/win/streak/30`);
  });
});

describe('a badge', () => {
  it('is said by its name and ends on a medal, with the badge’s address under it', () => {
    expect(badgeShare(t, 'Agir')).toBe(`I earned the “Agir” badge on Hevalo. 🏅\n${SITE}/win/badge`);
  });

  it('keeps the badge’s name out of the address: a name is words, and an address is drawn from a fixed list', () => {
    expect(badgeShare(t, 'Agir & <b>').split('\n')[1]).toBe(`${SITE}/win/badge`);
  });
});

describe('a league week', () => {
  it('says the league moved up to', () => {
    const win: LeagueWin = { kind: 'promoted', tier: 'cem' };
    expect(leagueShare(t, win, 'Çem')).toBe(`I moved up to the Çem League on Hevalo. 🏆\n${SITE}/win/league/cem`);
  });

  it('says a place in the first three and the league it was taken in', () => {
    const win: LeagueWin = { kind: 'podium', rank: 2, tier: 'okyanus' };
    expect(leagueShare(t, win, 'Okyanûs')).toBe(`I finished #2 in the Okyanûs League on Hevalo. 🏆\n${SITE}/win/league/okyanus`);
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

  it('is the game’s name with the score, the guesses as rows of fruit, and the game’s address', () => {
    expect(wordGameShare(game({}), words)).toBe(`Hevalo Peyvok (Medium) 2/6\n\n🍋🍏⚪\n🍏🍏🍏\n\n${SITE}/win/peyvok`);
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
    lessonShare(tt, 'Hello!'),
    lessonShare(tt),
    streakShare(tt, locale, 14),
    badgeShare(tt, 'Agir'),
    leagueShare(tt, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, win, 'Kanî'),
  ];

  it('points at a win’s own page on the site and nowhere else: never a profile, never a page about a person', () => {
    expect(siteUrl()).toBe(SITE);
    for (const text of all(t, 'en')) {
      const links = text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toHaveLength(1);
      expect(text.endsWith(links[0]!)).toBe(true);
      expect(links[0]!.startsWith(`${SITE}/win/`)).toBe(true);
      // the address is one the site reads as a win, and it says a kind and at most one detail
      expect(parseWinLink(new URL(links[0]!).pathname)).not.toBeNull();
      expect(new URL(links[0]!).search).toBe('');
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
