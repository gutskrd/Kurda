import { describe, expect, it } from 'vitest';
import { parseWinLink, winLinkLocale, type LeagueWin, type LetterFeedback } from '@kurda/shared';
import { SITE_ORIGIN } from '../feed/api';
import { formatNumber, interpolate } from '../i18n/format';
import { LOCALES, TRANSLATIONS, type Locale, type TranslationKey } from '../i18n/translations';
import { SITE_URL, badgeShare, leagueShare, lessonShare, streakShare, wordGameShare } from './winText';

/* What each win says when shared: the catalogue's warm line ending on its mark, then the win's address on the site, naming the sharer's language. */

const translate =
  (locale: Locale) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = translate('en');
const SITE = 'https://hevalo.app';

describe('a finished lesson', () => {
  it('names the lesson, asks the friend along, ends its line on an apple, and puts the lesson’s own address under it', () => {
    expect(lessonShare(t, 'en', 'Hello!')).toBe(`Look, I just finished “Hello!” in Kurdish! Come learn with me on Hevalo 🍎\n${SITE}/win/lesson?l=en`);
  });

  it('says a Kurdish lesson was finished when the player was not told its name', () => {
    for (const title of [undefined, null, '', '   ']) {
      expect(lessonShare(t, 'en', title).split('\n')[0], String(title)).toBe('Look, I just finished a Kurdish lesson! Come learn with me on Hevalo 🍎');
    }
  });

  it('is a line and an address, and no rows of squares', () => {
    const text = lessonShare(t, 'en', 'Hello!');
    expect(text.split('\n')).toHaveLength(2);
    expect(text).not.toMatch(/[🟩🟨🟧🟦⬜⬛]/u);
  });
});

describe('a streak', () => {
  it('is its days, the fire, and the address of the card with those days on its stamp', () => {
    expect(streakShare(t, 'en', 7)).toBe(`7 days of Kurdish in a row, and I’m not stopping! Join me on Hevalo 🔥\n${SITE}/win/streak/7?l=en`);
    expect(streakShare(t, 'en', 365).split('\n')[1]).toBe(`${SITE}/win/streak/365?l=en`);
  });

  it('writes the number in the reader’s own figures in the line, and in plain ones in the address', () => {
    const count = formatNumber(30, 'ckb');
    const [line, link] = streakShare(translate('ckb'), 'ckb', 30).split('\n') as [string, string];
    expect(line).toContain(count);
    expect(link).toBe(`${SITE}/win/streak/30?l=ckb`);
  });
});

describe('a badge', () => {
  it('is said by its name and ends on a medal, with the badge’s address under it', () => {
    expect(badgeShare(t, 'en', 'Agir')).toBe(`I just earned the “Agir” badge on Hevalo! 🏅\n${SITE}/win/badge?l=en`);
  });

  it('keeps the badge’s name out of the address: a name is words, and an address is drawn from a fixed list', () => {
    expect(badgeShare(t, 'en', 'Agir & <b>').split('\n')[1]).toBe(`${SITE}/win/badge?l=en`);
  });
});

describe('a league week', () => {
  it('says the league moved up to', () => {
    const win: LeagueWin = { kind: 'promoted', tier: 'cem' };
    expect(leagueShare(t, 'en', win, 'Çem')).toBe(`I just moved up to the Çem League on Hevalo! 🏆\n${SITE}/win/league/cem?l=en`);
  });

  it('says a place in the first three and the league it was taken in', () => {
    const win: LeagueWin = { kind: 'podium', rank: 2, tier: 'okyanus' };
    expect(leagueShare(t, 'en', win, 'Okyanûs')).toBe(`I finished #2 in the Okyanûs League this week! 🏆\n${SITE}/win/league/okyanus?l=en`);
  });
});

describe('the word game', () => {
  const row = (marks: string): { feedback: LetterFeedback[] } => ({ feedback: [...marks].map((m) => (m === 'g' ? 'green' : m === 'y' ? 'yellow' : 'gray')) });
  const won = { guesses: [row('ygx'), row('ggg')], status: 'won' as const, mode: 'daily' as const, difficulty: 'medium' as const, remainingAttempts: 4 };
  const lost = { guesses: Array.from({ length: 6 }, () => row('xgx')), status: 'lost' as const, mode: 'daily' as const, difficulty: 'medium' as const, remainingAttempts: 0 };

  it('opens on the news and a challenge, then the guesses as rows of fruit, then the address with the score in it', () => {
    expect(wordGameShare(t, 'en', won)).toBe(`Look, I just solved today’s Peyvok in 2/6! Can you beat me?\n\n🍋🍏⚪\n🍏🍏🍏\n\n${SITE}/win/peyvok/2-6?l=en`);
  });

  it('draws a guess a row, in the order they were made', () => {
    const three = { ...won, guesses: [row('xyxxx'), row('gxyxx'), row('ggggg')], remainingAttempts: 3 };
    expect(wordGameShare(t, 'en', three).split('\n\n')[1]).toBe('⚪🍋⚪⚪⚪\n🍏⚪🍋⚪⚪\n🍏🍏🍏🍏🍏');
  });

  it('names the difficulty only for a hard word, where it is worth a boast', () => {
    expect(wordGameShare(t, 'en', { ...won, difficulty: 'hard' }).split('\n')[0]).toBe('Look, I just solved today’s Peyvok in 2/6 on Hard! Can you beat me?');
    expect(wordGameShare(t, 'en', { ...won, difficulty: 'easy' }).split('\n')[0]).toBe('Look, I just solved today’s Peyvok in 2/6! Can you beat me?');
  });

  it('calls a practice word one, and never today’s', () => {
    const text = wordGameShare(t, 'en', { ...won, mode: 'practice' });
    expect(text.split('\n')[0]).toBe('Look, I just solved a Peyvok in 2/6! Can you beat me?');
    expect(text.endsWith(`${SITE}/win/peyvok/practice-2-6?l=en`)).toBe(true);
  });

  it('owns up to a word that was not found, and asks the friend to crack it', () => {
    const text = wordGameShare(t, 'en', lost);
    expect(text.split('\n')[0]).toBe('Today’s Peyvok got the better of me… can you crack it?');
    expect(text.split('\n\n')[1]!.split('\n')).toHaveLength(6);
    expect(text.endsWith(`${SITE}/win/peyvok/x-6?l=en`)).toBe(true);
    expect(wordGameShare(t, 'en', { ...lost, mode: 'practice', difficulty: 'hard' }).split('\n')[0]).toBe('This Peyvok got the better of me… can you crack it?');
  });

  it('gives nothing of the word away: the grid has no letter in it', () => {
    expect(/\p{L}/u.test(wordGameShare(t, 'en', won).split('\n\n')[1]!)).toBe(false);
  });

  it('says the score in the reader’s own figures, and in plain ones in the address', () => {
    const text = wordGameShare(translate('ckb'), 'ckb', won);
    expect(text.split('\n')[0]).toContain(`${formatNumber(2, 'ckb')}/${formatNumber(6, 'ckb')}`);
    expect(text.endsWith(`${SITE}/win/peyvok/2-6?l=ckb`)).toBe(true);
  });
});

describe('every share', () => {
  const all = (tt: typeof t, locale: Locale): [string, string, string, string, string, string] => [
    lessonShare(tt, locale, 'Hello!'),
    lessonShare(tt, locale),
    streakShare(tt, locale, 14),
    badgeShare(tt, locale, 'Agir'),
    leagueShare(tt, locale, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, locale, { kind: 'podium', rank: 3, tier: 'kani' }, 'Kanî'),
  ];
  const LINE_KEYS = ['share.win.lesson', 'share.win.lessonPlain', 'share.win.streak', 'share.win.badge', 'share.win.leagueUp', 'share.win.leaguePlace'] as const;
  const PEYVOK_KEYS = [
    'share.win.peyvok',
    'share.win.peyvokHard',
    'share.win.peyvokLost',
    'share.win.peyvokPractice',
    'share.win.peyvokPracticeHard',
    'share.win.peyvokPracticeLost',
  ] as const;

  it('points at a win’s own page on the site the app’s other shares point at, and nowhere else: never a profile, never a page about a person', () => {
    expect(SITE_URL).toBe(SITE_ORIGIN);
    for (const text of all(t, 'en')) {
      const links = text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toHaveLength(1);
      expect(text.endsWith(links[0]!)).toBe(true);
      expect(links[0]!.startsWith(`${SITE}/win/`)).toBe(true);
      // The address is one the site reads as a win, with a kind and at most one detail, and the language it was sent in.
      const [path, search] = links[0]!.slice(SITE.length).split('?') as [string, string];
      expect(parseWinLink(path)).not.toBeNull();
      expect(search).toBe('l=en');
      expect(winLinkLocale(`?${search}`)).toBe('en');
      expect(path).not.toMatch(/[?#]/);
      expect(text).not.toMatch(/\/users\/|\/profile|@/);
    }
  });

  it('is said in all nine languages with every value in its place, and its link names the language', () => {
    expect(LOCALES).toHaveLength(9);
    for (const locale of LOCALES) {
      const tl = translate(locale);
      const [lesson, plain, streak, badge, up, place] = all(tl, locale);
      for (const text of [lesson, plain, streak, badge, up, place]) {
        expect(text, locale).not.toMatch(/[{}]/);
        expect(text.endsWith(`?l=${locale}`), locale).toBe(true);
      }
      expect(lesson, locale).toContain('Hello!');
      expect(plain.split('\n')[0], locale).not.toBe(lesson.split('\n')[0]);
      expect(streak.split('\n')[0], locale).toContain(formatNumber(14, locale));
      expect(badge, locale).toContain('Agir');
      expect(up, locale).toContain('Çem');
      expect(place, locale).toContain('Kanî');
      expect(place, locale).toContain('3');
      // Every word game line names the game as this language writes it, and a solved one gives the score.
      for (const key of PEYVOK_KEYS) {
        const line = tl(key, { score: '4/6' });
        expect(line, `${locale} ${key}`).toContain(TRANSLATIONS[locale]['games.wordle.name']);
        expect(line, `${locale} ${key}`).not.toMatch(/[{}]/);
        if (!key.endsWith('Lost')) expect(line, `${locale} ${key}`).toContain('4/6');
      }
      // Every language has its own words for these; none is left in English.
      if (locale === 'en') continue;
      for (const key of [...LINE_KEYS, ...PEYVOK_KEYS]) {
        expect(TRANSLATIONS[locale][key], `${locale} ${key}`).not.toBe(TRANSLATIONS.en[key]);
      }
    }
  });
});
