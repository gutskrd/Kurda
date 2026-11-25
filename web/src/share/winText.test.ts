import { describe, expect, it } from 'vitest';
import { parseWinLink, winLinkLocale, type AppLocale, type LeagueWin } from '@kurda/shared';
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
 * What each win says when shared: the catalogue's warm line ending on its mark, then the win's address, which names the
 * sharer's language. The buttons that send these are tested where they are used.
 */

const t = translator(en);
const SITE = window.location.origin;

describe('a finished lesson', () => {
  it('names the lesson, asks the friend along, ends its line on an apple, and puts the lesson’s own address under it', () => {
    expect(lessonShare(t, 'en', 'Hello!')).toBe(`Look, I just finished “Hello!” in Kurdish! Come learn with me on Hevalo 🍎\n${SITE}/win/lesson?l=en`);
  });

  it('says a Kurdish lesson was finished when the page was not told its name', () => {
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
    const count = new Intl.NumberFormat('ckb').format(30);
    const [line, link] = streakShare(translator(ckb), 'ckb', 30).split('\n') as [string, string];
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
  const miss: WordleGuessRow = { guess: 'mal', letters: ['m', 'a', 'l'], feedback: ['gray', 'green', 'gray'] };
  const lost = (over: Partial<WordleGame>): WordleGame => game({ status: 'lost', guesses: Array.from({ length: 6 }, () => miss), remainingAttempts: 0, ...over });

  it('opens on the news and a challenge, then the guesses as rows of fruit, then the address with the score in it', () => {
    expect(wordGameShare(t, 'en', game({}))).toBe(`Look, I just solved today’s Peyvok in 2/6! Can you beat me?\n\n🍋🍏⚪\n🍏🍏🍏\n\n${SITE}/win/peyvok/2-6?l=en`);
  });

  it('names the difficulty only for a hard word, where it is worth a boast', () => {
    expect(wordGameShare(t, 'en', game({ difficulty: 'hard' })).split('\n')[0]).toBe('Look, I just solved today’s Peyvok in 2/6 on Hard! Can you beat me?');
    expect(wordGameShare(t, 'en', game({ difficulty: 'easy' })).split('\n')[0]).toBe('Look, I just solved today’s Peyvok in 2/6! Can you beat me?');
  });

  it('calls a practice word one, and never today’s', () => {
    const text = wordGameShare(t, 'en', game({ mode: 'practice' }));
    expect(text.split('\n')[0]).toBe('Look, I just solved a Peyvok in 2/6! Can you beat me?');
    expect(text.endsWith(`${SITE}/win/peyvok/practice-2-6?l=en`)).toBe(true);
  });

  it('owns up to a word that was not found, and asks the friend to crack it', () => {
    const text = wordGameShare(t, 'en', lost({}));
    expect(text.split('\n')[0]).toBe('Today’s Peyvok got the better of me… can you crack it?');
    expect(text.split('\n\n')[1]!.split('\n')).toHaveLength(6);
    expect(text.endsWith(`${SITE}/win/peyvok/x-6?l=en`)).toBe(true);
    expect(wordGameShare(t, 'en', lost({ mode: 'practice' })).split('\n')[0]).toBe('This Peyvok got the better of me… can you crack it?');
  });

  it('gives nothing of the word away: no guess and no answer is in it', () => {
    const text = wordGameShare(t, 'en', game({}));
    expect(text).not.toMatch(/\bmal\b|\bdar\b/i);
    expect(/\p{L}/u.test(text.split('\n\n')[1]!)).toBe(false);
  });

  it('says the score in the reader’s own figures, and in plain ones in the address', () => {
    const text = wordGameShare(translator(ckb), 'ckb', game({}));
    const figures = new Intl.NumberFormat('ckb');
    expect(text.split('\n')[0]).toContain(`${figures.format(2)}/${figures.format(6)}`);
    expect(text.endsWith(`${SITE}/win/peyvok/2-6?l=ckb`)).toBe(true);
  });
});

describe('every share', () => {
  const win: LeagueWin = { kind: 'podium', rank: 3, tier: 'kani' };
  const all = (tt: typeof t, locale: AppLocale): string[] => [
    lessonShare(tt, locale, 'Hello!'),
    lessonShare(tt, locale),
    streakShare(tt, locale, 14),
    badgeShare(tt, locale, 'Agir'),
    leagueShare(tt, locale, { kind: 'promoted', tier: 'cem' }, 'Çem'),
    leagueShare(tt, locale, win, 'Kanî'),
  ];

  it('points at a win’s own page on the site and nowhere else: never a profile, never a page about a person', () => {
    expect(siteUrl()).toBe(SITE);
    for (const text of all(t, 'en')) {
      const links = text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toHaveLength(1);
      expect(text.endsWith(links[0]!)).toBe(true);
      expect(links[0]!.startsWith(`${SITE}/win/`)).toBe(true);
      // The site reads the address as a win, with a kind and at most one detail, and the language it was sent in.
      const url = new URL(links[0]!);
      expect(parseWinLink(url.pathname)).not.toBeNull();
      expect(url.search).toBe('?l=en');
      expect(winLinkLocale(url.search)).toBe('en');
      expect(text).not.toMatch(/\/users\/|\/profile|@/);
    }
  });

  it('is said in all nine languages with every value in its place, and its link names the language', () => {
    const catalogues = { en, ku, ckb, nl, de, es, fr, tr, ar };
    const lineKeys = ['share.win.lesson', 'share.win.lessonPlain', 'share.win.streak', 'share.win.badge', 'share.win.leagueUp', 'share.win.leaguePlace'] as const;
    const peyvokKeys = [
      'share.win.peyvok',
      'share.win.peyvokHard',
      'share.win.peyvokLost',
      'share.win.peyvokPractice',
      'share.win.peyvokPracticeHard',
      'share.win.peyvokPracticeLost',
    ] as const;
    for (const [locale, catalogue] of Object.entries(catalogues) as Array<[AppLocale, typeof en]>) {
      const [lesson, plain, streak, badge, up, place] = all(translator(catalogue), locale) as [string, string, string, string, string, string];
      for (const text of [lesson, plain, streak, badge, up, place]) {
        expect(text, locale).not.toMatch(/[{}]/);
        expect(winLinkLocale(new URL(text.split('\n').at(-1)!).search), locale).toBe(locale);
      }
      expect(lesson, locale).toContain('Hello!');
      expect(plain.split('\n')[0], locale).not.toBe(lesson.split('\n')[0]);
      expect(streak.split('\n')[0], locale).toContain(new Intl.NumberFormat(locale).format(14));
      expect(badge, locale).toContain('Agir');
      expect(up, locale).toContain('Çem');
      expect(place, locale).toContain('Kanî');
      expect(place, locale).toContain('3');
      // Every word game line names the game as this language writes it, and a solved one gives the score.
      for (const key of peyvokKeys) {
        const line = translator(catalogue)(key, { score: '4/6' });
        expect(line, `${locale} ${key}`).toContain(catalogue['games.wordle.name']!);
        expect(line, `${locale} ${key}`).not.toMatch(/[{}]/);
        if (!key.endsWith('Lost')) expect(line, `${locale} ${key}`).toContain('4/6');
      }
      // Each language has its own words for these, with none left in English.
      if (locale === 'en') continue;
      for (const key of [...lineKeys, ...peyvokKeys]) {
        expect(catalogue[key], `${locale} ${key}`).not.toBe(en[key]);
      }
    }
  });
});
