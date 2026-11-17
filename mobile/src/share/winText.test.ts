import { describe, expect, it } from 'vitest';
import { parseWinLink, type LeagueWin, type LetterFeedback } from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber, interpolate } from '../i18n/format';
import { LOCALES, TRANSLATIONS, type Locale, type TranslationKey } from '../i18n/translations';
import { SITE_URL, badgeShare, leagueShare, lessonShare, streakShare, wordGameShare } from './winText';

/*
 * What each win says when it is shared, word for word: the catalogue's line
 * ended on its mark, and the win's own address on the site, which is drawn
 * as its postcard wherever it is pasted. The buttons that send these are
 * tested where they stand (the lesson's results, the streak's card, a badge's
 * and a league week's moment, the word game's screen).
 */

const translate =
  (locale: Locale) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = translate('en');
const SITE = 'https://hevalo.app';

describe('a finished lesson', () => {
  it('names the lesson, ends its line on an apple, and puts the lesson’s own address under it', () => {
    expect(lessonShare(t, 'Hello!')).toBe(`I finished “Hello!” in Kurdish on Hevalo. 🍎\n${SITE}/win/lesson`);
  });

  it('says a Kurdish lesson was finished when the player was not told its name', () => {
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
    const count = formatNumber(30, 'ckb');
    const [line, link] = streakShare(translate('ckb'), 'ckb', 30).split('\n') as [string, string];
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
  const row = (marks: string): { feedback: LetterFeedback[] } => ({ feedback: [...marks].map((m) => (m === 'g' ? 'green' : m === 'y' ? 'yellow' : 'gray')) });
  const words = { practice: 'Practice', difficulty: 'Medium' };

  it('is the game’s name with the score, the guesses as rows of fruit, and the game’s address', () => {
    const won = { guesses: [row('ygx'), row('ggg')], status: 'won' as const, mode: 'daily' as const, remainingAttempts: 4 };
    expect(wordGameShare(won, words)).toBe(`Hevalo Peyvok (Medium) 2/6\n\n🍋🍏⚪\n🍏🍏🍏\n\n${SITE}/win/peyvok`);
  });

  it('draws a guess a row, in the order they were made', () => {
    const won = { guesses: [row('xyxxx'), row('gxyxx'), row('ggggg')], status: 'won' as const, mode: 'daily' as const, remainingAttempts: 3 };
    expect(wordGameShare(won, words).startsWith('Hevalo Peyvok (Medium) 3/6\n\n⚪🍋⚪⚪⚪\n🍏⚪🍋⚪⚪\n🍏🍏🍏🍏🍏')).toBe(true);
  });

  it('calls a practice game one, and writes an X for a word that was not found', () => {
    const lost = { guesses: Array.from({ length: 6 }, () => row('xgx')), status: 'lost' as const, mode: 'practice' as const, remainingAttempts: 0 };
    const text = wordGameShare(lost, { ...words, difficulty: 'Hard' });
    expect(text.split('\n')[0]).toBe('Hevalo Peyvok Practice (Hard) X/6');
    expect(text.split('\n\n')[1]!.split('\n')).toHaveLength(6);
  });

  it('gives nothing of the word away: the grid has no letter in it', () => {
    const won = { guesses: [row('ygx'), row('ggg')], status: 'won' as const, mode: 'daily' as const, remainingAttempts: 4 };
    expect(/\p{L}/u.test(wordGameShare(won, words).split('\n\n')[1]!)).toBe(false);
  });
});

describe('every share', () => {
  const all = (tt: typeof t, locale: Locale): [string, string, string, string, string, string] => [
    lessonShare(tt, 'Hello!'),
    lessonShare(tt),
    streakShare(tt, locale, 14),
    badgeShare(tt, 'Agir'),
    leagueShare(tt, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, { kind: 'podium', rank: 3, tier: 'kani' }, 'Kanî'),
  ];

  it('points at a win’s own page on the site the app’s other shares point at, and nowhere else: never a profile, never a page about a person', () => {
    expect(SITE_URL).toBe(SITE_ORIGIN);
    for (const text of all(t, 'en')) {
      const links = text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toHaveLength(1);
      expect(text.endsWith(links[0]!)).toBe(true);
      expect(links[0]!.startsWith(`${SITE}/win/`)).toBe(true);
      // the address is one the site reads as a win, and it says a kind and at most one detail
      const path = links[0]!.slice(SITE.length);
      expect(parseWinLink(path)).not.toBeNull();
      expect(path).not.toMatch(/[?#]/);
      expect(text).not.toMatch(/\/users\/|\/profile|@/);
    }
  });

  it('is said in all nine languages with every value in its place', () => {
    expect(LOCALES).toHaveLength(9);
    for (const locale of LOCALES) {
      const [lesson, plain, streak, badge, up, place] = all(translate(locale), locale);
      for (const text of [lesson, plain, streak, badge, up, place]) expect(text, locale).not.toMatch(/[{}]/);
      expect(lesson, locale).toContain('Hello!');
      expect(plain.split('\n')[0], locale).not.toBe(lesson.split('\n')[0]);
      expect(streak.split('\n')[0], locale).toContain(formatNumber(14, locale));
      expect(badge, locale).toContain('Agir');
      expect(up, locale).toContain('Çem');
      expect(place, locale).toContain('Kanî');
      expect(place, locale).toContain('3');
      // each language has its own words for these: none is left in English
      if (locale === 'en') continue;
      for (const key of ['share.win.lesson', 'share.win.lessonPlain', 'share.win.streak', 'share.win.badge', 'share.win.leagueUp', 'share.win.leaguePlace'] as const) {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).not.toBe(TRANSLATIONS.en[key]);
      }
    }
  });
});
