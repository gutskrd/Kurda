import { describe, expect, it } from 'vitest';
import { LEAGUE_TIERS } from './leagues.js';
import { APP_LOCALE_CODES } from './locales.js';
import { streakMilestone } from './win-share.js';
import {
  WIN_CARD_DIR,
  WIN_KINDS,
  WIN_LEAGUES,
  WIN_STREAK_CARDS,
  isWinLeague,
  parseWinLink,
  winCardName,
  winCardNames,
  winCardPath,
  winCards,
  winLinkLocale,
  winLinkPath,
  winLinkUrl,
  type WinLink,
} from './win-link.js';

const EVERY: WinLink[] = [
  { kind: 'lesson' },
  { kind: 'streak', days: 30 },
  { kind: 'streak', days: null },
  { kind: 'badge' },
  { kind: 'league', tier: 'cem' },
  { kind: 'league', tier: null },
  { kind: 'peyvok', result: null },
  { kind: 'peyvok', result: { tries: 4, of: 6, practice: false } },
  { kind: 'peyvok', result: { tries: null, of: 6, practice: false } },
  { kind: 'peyvok', result: { tries: 3, of: 6, practice: true } },
  { kind: 'peyvok', result: { tries: null, of: 6, practice: true } },
];

describe('a win’s address', () => {
  it('is the kind of win, and nothing about who won it', () => {
    expect(winLinkPath({ kind: 'lesson' })).toBe('/win/lesson');
    expect(winLinkPath({ kind: 'badge' })).toBe('/win/badge');
    expect(winLinkPath({ kind: 'peyvok', result: null })).toBe('/win/peyvok');
  });

  it('says a streak’s days and a league’s name after it', () => {
    expect(winLinkPath({ kind: 'streak', days: 30 })).toBe('/win/streak/30');
    expect(winLinkPath({ kind: 'league', tier: 'cem' })).toBe('/win/league/cem');
  });

  it('says how a word game went: the guesses of those allowed, an x for a word not found, and a practice word as one', () => {
    expect(winLinkPath({ kind: 'peyvok', result: { tries: 4, of: 6, practice: false } })).toBe('/win/peyvok/4-6');
    expect(winLinkPath({ kind: 'peyvok', result: { tries: null, of: 6, practice: false } })).toBe('/win/peyvok/x-6');
    expect(winLinkPath({ kind: 'peyvok', result: { tries: 3, of: 6, practice: true } })).toBe('/win/peyvok/practice-3-6');
    expect(winLinkPath({ kind: 'peyvok', result: { tries: null, of: 6, practice: true } })).toBe('/win/peyvok/practice-x-6');
  });

  it('leaves out a word game’s result that cannot be one: more guesses than allowed, none allowed, or counts of two figures', () => {
    for (const result of [
      { tries: 7, of: 6, practice: false },
      { tries: 0, of: 6, practice: false },
      { tries: 2.5, of: 6, practice: false },
      { tries: 4, of: 0, practice: false },
      { tries: 4, of: 10, practice: false },
      { tries: null, of: Number.NaN, practice: false },
    ]) {
      expect(winLinkPath({ kind: 'peyvok', result }), JSON.stringify(result)).toBe('/win/peyvok');
    }
  });

  it('leaves out a detail that is not one: days that are not a count, a league there is none of', () => {
    for (const days of [0, -3, 2.5, Number.NaN, 10000, null]) expect(winLinkPath({ kind: 'streak', days }), String(days)).toBe('/win/streak');
    expect(winLinkPath({ kind: 'league', tier: null })).toBe('/win/league');
    expect(winLinkPath({ kind: 'league', tier: 'gold' as never })).toBe('/win/league');
  });

  it('is written on the site it is given, whether or not that ends in a slash', () => {
    expect(winLinkUrl('https://example.org', { kind: 'lesson' })).toBe('https://example.org/win/lesson');
    expect(winLinkUrl('https://example.org/', { kind: 'streak', days: 7 })).toBe('https://example.org/win/streak/7');
  });

  it('names the sender’s language after it, and only a language the app speaks', () => {
    expect(winLinkUrl('https://example.org', { kind: 'lesson' }, 'ku')).toBe('https://example.org/win/lesson?l=ku');
    expect(winLinkUrl('https://example.org', { kind: 'peyvok', result: { tries: 4, of: 6, practice: false } }, 'ckb')).toBe('https://example.org/win/peyvok/4-6?l=ckb');
    expect(winLinkUrl('https://example.org', { kind: 'lesson' }, null)).toBe('https://example.org/win/lesson');
    expect(winLinkUrl('https://example.org', { kind: 'lesson' }, 'xx' as never)).toBe('https://example.org/win/lesson');
  });

  it('reads the sender’s language back, for every language the app speaks', () => {
    for (const code of APP_LOCALE_CODES) {
      const url = new URL(winLinkUrl('https://example.org', { kind: 'badge' }, code));
      expect(winLinkLocale(url.search), code).toBe(code);
      expect(parseWinLink(url.pathname), code).toEqual({ kind: 'badge' });
    }
  });

  it('reads no language from a link that names none, or names something else', () => {
    for (const search of ['', '?', '?l=', '?l=KU', '?l=ku-IQ', '?l=klingon', '?lang=ku', '?l=%3Cb%3E', '?l=ku%20']) expect(winLinkLocale(search), search).toBeNull();
    expect(winLinkLocale('?ref=chat&l=de')).toBe('de');
  });

  it('is read back as the win it was written from', () => {
    for (const win of EVERY) expect(parseWinLink(winLinkPath(win)), winLinkPath(win)).toEqual(win);
    expect(parseWinLink('/win/lesson/')).toEqual({ kind: 'lesson' });
  });

  it('is nobody’s address but a win’s: anything else reads as none', () => {
    for (const path of ['/', '/win', '/win/', '/win/unknown', '/winner/lesson', '/win/lesson/extra/more', '/app/win/lesson', '/win/LESSON', '/win/les son', '/win/../admin', '/win/lesson?x=1']) {
      expect(parseWinLink(path), path).toBeNull();
    }
  });

  it('still lands on its kind when the end of it is mistyped', () => {
    expect(parseWinLink('/win/streak/many')).toEqual({ kind: 'streak', days: null });
    expect(parseWinLink('/win/streak/007')).toEqual({ kind: 'streak', days: null });
    expect(parseWinLink('/win/streak/12345')).toEqual({ kind: 'streak', days: null });
    expect(parseWinLink('/win/league/gold')).toEqual({ kind: 'league', tier: null });
    expect(parseWinLink('/win/lesson/anything')).toEqual({ kind: 'lesson' });
    expect(parseWinLink('/win/peyvok')).toEqual({ kind: 'peyvok', result: null });
    for (const detail of ['7-6', '0-6', '4-0', '4-10', 'X-6', '46', 'practice', 'practice-', 'test-4-6', 'practice-practice-4-6', '-4-6', '4-6-']) {
      expect(parseWinLink(`/win/peyvok/${detail}`), detail).toEqual({ kind: 'peyvok', result: null });
    }
  });

  it('knows the leagues by the tiers’ own names', () => {
    expect([...WIN_LEAGUES]).toEqual([...LEAGUE_TIERS]);
    for (const tier of LEAGUE_TIERS) expect(isWinLeague(tier)).toBe(true);
    expect(isWinLeague('gold')).toBe(false);
    expect(isWinLeague(null)).toBe(false);
  });
});

describe('the picture a win’s link is drawn with', () => {
  it('is the kind’s own card', () => {
    expect(winCardPath({ kind: 'lesson' })).toBe(`${WIN_CARD_DIR}/lesson.png`);
    expect(winCardPath({ kind: 'badge' })).toBe(`${WIN_CARD_DIR}/badge.png`);
    expect(winCardPath({ kind: 'peyvok', result: null })).toBe(`${WIN_CARD_DIR}/peyvok.png`);
    // however the game went: the result is in the card's words, not its picture
    expect(winCardPath({ kind: 'peyvok', result: { tries: 4, of: 6, practice: false } })).toBe(`${WIN_CARD_DIR}/peyvok.png`);
  });

  it('has the streak’s days on it on the days a streak is shared, and the fire alone on any other', () => {
    expect(winCardName({ kind: 'streak', days: 30 })).toBe('streak-30');
    expect(winCardName({ kind: 'streak', days: 31 })).toBe('streak');
    expect(winCardName({ kind: 'streak', days: null })).toBe('streak');
    // every length a streak is offered for sharing at, for its first three years, has its own card
    for (let days = 1; days <= 1000; days++) {
      if (streakMilestone(days)) expect(WIN_STREAK_CARDS as readonly number[], String(days)).toContain(days);
    }
    for (const days of WIN_STREAK_CARDS) expect(streakMilestone(days), String(days)).toBe(true);
  });

  it('is the league’s own stone, and the first league’s where none is named', () => {
    expect(winCardName({ kind: 'league', tier: 'derya' })).toBe('league-derya');
    expect(winCardName({ kind: 'league', tier: null })).toBe('league');
  });

  it('is one of the cards there is a picture of, whatever the win', () => {
    const names = new Set(winCardNames());
    expect(names.size).toBe(winCardNames().length);
    for (const win of EVERY) expect(names.has(winCardName(win)), winCardName(win)).toBe(true);
    for (const kind of WIN_KINDS) expect(names.has(kind), kind).toBe(true);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z0-9]+)?$/);
  });

  it('lists each card once, as a win whose link is drawn with it', () => {
    const cards = winCards();
    expect(cards.map(winCardName)).toEqual(winCardNames());
    // a card's own win is read back from its own address: nothing in the list is a win no link can name
    for (const win of cards) expect(parseWinLink(winLinkPath(win)), winCardName(win)).toEqual(win);
    expect(cards).toHaveLength(WIN_KINDS.length + WIN_STREAK_CARDS.length + WIN_LEAGUES.length);
  });
});
