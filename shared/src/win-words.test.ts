import { describe, expect, it } from 'vitest';
import { LEAGUE_TIER_META } from './leagues.js';
import { APP_LOCALE_CODES } from './locales.js';
import { WIN_LEAGUES, winCards, type WinLink } from './win-link.js';
import { winLeagueName, winWords } from './win-words.js';

const solved: WinLink = { kind: 'peyvok', result: { tries: 4, of: 6, practice: false } };
const lost: WinLink = { kind: 'peyvok', result: { tries: null, of: 6, practice: false } };
const practice: WinLink = { kind: 'peyvok', result: { tries: 3, of: 6, practice: true } };
const practiceLost: WinLink = { kind: 'peyvok', result: { tries: null, of: 6, practice: true } };

const EVERY: WinLink[] = [
  ...winCards(),
  { kind: 'streak', days: 31 },
  solved,
  lost,
  practice,
  practiceLost,
];

describe('what a win’s card says', () => {
  it('tells the news of a word game with its score, and asks the friend to try', () => {
    expect(winWords(solved, 'en')).toEqual({
      title: 'Solved today’s Peyvok in 4/6! Can you beat it?',
      description: 'Six tries to find the day’s Kurdish word. Play it on Hevalo.',
    });
    expect(winWords(lost, 'en').title).toBe('Today’s Peyvok won this round. Can you crack it?');
    expect(winWords(practice, 'en').title).toBe('Solved a Peyvok in 3/6! Can you beat it?');
    expect(winWords(practiceLost, 'en').title).toBe('A Peyvok won this round. Can you crack today’s?');
  });

  it('names the word game and not how it went when the link does not say', () => {
    expect(winWords({ kind: 'peyvok', result: null }, 'en').title).toBe('Peyvok: the day’s Kurdish word');
  });

  it('says a practice word was not the day’s, in every language', () => {
    for (const locale of APP_LOCALE_CODES) {
      expect(winWords(practice, locale).title, locale).not.toBe(winWords({ ...solved, result: { tries: 3, of: 6, practice: false } }, locale).title);
      expect(winWords(practiceLost, locale).title, locale).not.toBe(winWords(lost, locale).title);
    }
  });

  it('is said in the sender’s language, with the score in that language’s own figures', () => {
    expect(winWords(solved, 'ku').title).toBe('Min Peyvoka îro bi 4/6 çareser kir! Tu dikarî baştir bikî?');
    const figures = (n: number): string => new Intl.NumberFormat('ckb').format(n);
    expect(winWords(solved, 'ckb').title).toContain(`${figures(4)}/${figures(6)}`);
    expect(winWords({ kind: 'streak', days: 30 }, 'de').title).toBe('30 Tage Kurdisch am Stück, und es geht weiter!');
  });

  it('is English where no language is given', () => {
    expect(winWords({ kind: 'lesson' })).toEqual(winWords({ kind: 'lesson' }, 'en'));
  });

  it('says a streak’s days only from two up, as one day is not yet a row', () => {
    for (const locale of APP_LOCALE_CODES) {
      expect(winWords({ kind: 'streak', days: 1 }, locale).title, locale).toBe(winWords({ kind: 'streak', days: null }, locale).title);
      expect(winWords({ kind: 'streak', days: 14 }, locale).title, locale).toContain(new Intl.NumberFormat(locale).format(14));
    }
  });

  it('names a league as the reader’s language writes it: Soranî in its own script, every other in Kurmancî', () => {
    for (const tier of WIN_LEAGUES) {
      for (const locale of APP_LOCALE_CODES) {
        const name = winLeagueName(tier, locale);
        if (locale === 'ckb') expect(name, tier).not.toBe(LEAGUE_TIER_META[tier].nameKu);
        else expect(name, `${locale} ${tier}`).toBe(LEAGUE_TIER_META[tier].nameKu);
        expect(winWords({ kind: 'league', tier }, locale).title, `${locale} ${tier}`).toContain(name);
      }
    }
  });

  it('has a title and a line for every win in every language, short enough for a chat to show whole', () => {
    for (const locale of APP_LOCALE_CODES) {
      for (const win of EVERY) {
        const { title, description } = winWords(win, locale);
        const what = `${locale} ${JSON.stringify(win)}`;
        expect(title.length, what).toBeGreaterThan(8);
        expect(title.length, what).toBeLessThanOrEqual(60);
        expect(description.length, what).toBeGreaterThan(20);
        expect(description.length, what).toBeLessThanOrEqual(120);
        expect(`${title} ${description}`, what).not.toMatch(/[{}]/);
      }
    }
  });

  it('has its own words in each language, none left in English', () => {
    for (const locale of APP_LOCALE_CODES) {
      if (locale === 'en') continue;
      for (const win of EVERY) {
        const words = winWords(win, locale);
        expect(words.title, `${locale} ${JSON.stringify(win)}`).not.toBe(winWords(win, 'en').title);
        expect(words.description, `${locale} ${JSON.stringify(win)}`).not.toBe(winWords(win, 'en').description);
      }
    }
  });
});
