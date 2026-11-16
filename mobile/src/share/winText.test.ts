import { describe, expect, it } from 'vitest';
import type { LeagueWin, LetterFeedback } from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber, interpolate } from '../i18n/format';
import { LOCALES, TRANSLATIONS, type Locale, type TranslationKey } from '../i18n/translations';
import { SITE_URL, badgeShare, leagueShare, lessonShare, streakShare, wordGameShare } from './winText';

/*
 * What each win says when it is shared, word for word: the catalogue's line,
 * the shared builder's picture, and the site's address. The buttons that send
 * these are tested where they stand (the lesson's results, the streak's card,
 * a badge's and a league week's moment, the word game's screen).
 */

const translate =
  (locale: Locale) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = translate('en');
const SITE = 'https://hevalo.app';

const exercises = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id }));
const mistake = (exerciseId: string) => ({ exerciseId, verdict: 'wrong' as const });

describe('a finished lesson', () => {
  it('names the lesson, draws a square for each exercise in order, and ends on the site’s address', () => {
    const text = lessonShare(t, { title: 'Hello!', exercises, results: { correct: 4, total: 6, mistakes: [mistake('e2'), mistake('e5')] } });
    expect(text).toBe(`I finished “Hello!” in Kurdish on Hevalo.\n\n🟩🟨🟩🟩🟨🟩\n\n${SITE}`);
  });

  it('says a Kurdish lesson was finished when the player was not told its name', () => {
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
    const count = formatNumber(30, 'ckb');
    const text = streakShare(translate('ckb'), 'ckb', 30);
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
  const row = (marks: string): { feedback: LetterFeedback[] } => ({ feedback: [...marks].map((m) => (m === 'g' ? 'green' : m === 'y' ? 'yellow' : 'gray')) });
  const words = { practice: 'Practice', difficulty: 'Medium' };

  it('is the game’s name with the score, the grid of the guesses, and the address', () => {
    const won = { guesses: [row('ygx'), row('ggg')], status: 'won' as const, mode: 'daily' as const, remainingAttempts: 4 };
    expect(wordGameShare(won, words)).toBe(`Hevalo Peyvok (Medium) 2/6\n\n🟨🟩⬜\n🟩🟩🟩\n\n${SITE}`);
  });

  it('opens as it did before it carried the address: the same line, the same grid', () => {
    const won = { guesses: [row('xyxxx'), row('gxyxx'), row('ggggg')], status: 'won' as const, mode: 'daily' as const, remainingAttempts: 3 };
    expect(wordGameShare(won, words).startsWith('Hevalo Peyvok (Medium) 3/6\n\n⬜🟨⬜⬜⬜\n🟩⬜🟨⬜⬜\n🟩🟩🟩🟩🟩')).toBe(true);
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
    lessonShare(tt, { title: 'Hello!', exercises, results: { correct: 6, total: 6, mistakes: [] } }),
    lessonShare(tt, { exercises, results: { correct: 6, total: 6, mistakes: [] } }),
    streakShare(tt, locale, 14),
    badgeShare(tt, 'Agir'),
    leagueShare(tt, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, { kind: 'podium', rank: 3, tier: 'kani' }, 'Kanî'),
  ];

  it('points at the site the app’s other shares point at, and nowhere else: never a profile, never a page about a person', () => {
    expect(SITE_URL).toBe(SITE_ORIGIN);
    for (const text of all(t, 'en')) {
      expect(text.match(/https?:\/\/\S+/g)).toEqual([SITE]);
      expect(text.endsWith(SITE)).toBe(true);
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
