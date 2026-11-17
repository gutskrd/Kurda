import { describe, expect, it } from 'vitest';
import { LEAGUE_TIERS } from './leagues.js';
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
  { kind: 'peyvok' },
];

describe('a win’s address', () => {
  it('is the kind of win, and nothing about who won it', () => {
    expect(winLinkPath({ kind: 'lesson' })).toBe('/win/lesson');
    expect(winLinkPath({ kind: 'badge' })).toBe('/win/badge');
    expect(winLinkPath({ kind: 'peyvok' })).toBe('/win/peyvok');
  });

  it('says a streak’s days and a league’s name after it', () => {
    expect(winLinkPath({ kind: 'streak', days: 30 })).toBe('/win/streak/30');
    expect(winLinkPath({ kind: 'league', tier: 'cem' })).toBe('/win/league/cem');
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
    expect(winCardPath({ kind: 'peyvok' })).toBe(`${WIN_CARD_DIR}/peyvok.png`);
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
