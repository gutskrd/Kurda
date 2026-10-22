import { describe, expect, it } from 'vitest';
import {
  BADGES,
  BADGE_FAMILIES,
  BADGE_FAMILY_SHAPE,
  LEGACY_ACHIEVEMENTS,
  badgeDef,
  badgeLeft,
  badgeProgress,
  badgeTierFor,
  badgeTierKey,
  badgeViewFraction,
  isBadgeKey,
  nearestBadges,
  resolveThresholds,
  type BadgeView,
} from './badges.js';

describe('the badge catalogue', () => {
  it('has the seven families, each with its own shape', () => {
    expect(new Set(BADGES.map((b) => b.family))).toEqual(new Set(BADGE_FAMILIES));
    expect(new Set(Object.values(BADGE_FAMILY_SHAPE)).size).toBe(BADGE_FAMILIES.length);
  });

  it('has 62 badges: the research catalogue’s 43, the Okyanûs trophy and the eighteen that came after', () => {
    expect(BADGES).toHaveLength(62);
    const count = (f: string) => BADGES.filter((b) => b.family === f).length;
    expect([count('learning'), count('habit'), count('games'), count('ranked'), count('friends'), count('events'), count('secret')]).toEqual([
      11, 8, 10, 8, 5, 10, 10,
    ]);
  });

  it('has unique, URL-safe keys and the catalogue keys clients translate', () => {
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(b.key).toMatch(/^[a-z][a-z-]*[a-z]$/);
      expect(b.nameKey).toBe(`badges.${b.key}.name`);
      expect(b.descKey).toBe(`badges.${b.key}.desc`);
      expect(b.howKey).toBe(`badges.${b.key}.how`);
      expect(b.hintKey !== undefined).toBe(b.secret);
    }
  });

  it('has one to four tiers, rising, and secrets have one', () => {
    for (const b of BADGES) {
      expect(b.tiers.length === 1 || b.tiers.length === 4).toBe(true);
      const numbers = b.tiers.filter((t): t is number => typeof t === 'number');
      expect([...numbers].sort((x, y) => x - y)).toEqual(numbers);
      expect(numbers.every((n) => n > 0)).toBe(true);
      if (b.secret) expect(b.tiers).toHaveLength(1);
    }
  });

  it('has nothing for staying up late, spending or inviting', () => {
    for (const b of BADGES) expect(b.measure).not.toMatch(/night|midnight|spend|gems|invite|purchase/);
  });

  it('maps every old achievement as the contract says', () => {
    expect(LEGACY_ACHIEVEMENTS['streak-30']).toEqual({ badge: 'agir', floorTier: 2 });
    expect(LEGACY_ACHIEVEMENTS['newroz-2026']).toEqual({ badge: 'newroz', floorTier: 1 });
    expect(LEGACY_ACHIEVEMENTS['words-1000']).toEqual({ badge: 'peyven-min', floorTier: 3 });
    expect(LEGACY_ACHIEVEMENTS['tournament-win']).toBeNull();
    for (const m of Object.values(LEGACY_ACHIEVEMENTS)) if (m) expect(isBadgeKey(m.badge)).toBe(true);
    // Agir's second tier is the thirty days the old achievement stood for
    expect(badgeDef('agir')!.tiers[1]).toBe(30);
    expect(badgeDef('peyven-min')!.tiers[2]).toBe(1000);
  });
});

describe('badge progress', () => {
  const agir = badgeDef('agir')!;

  it('reaches tiers in order', () => {
    expect(badgeTierFor(agir, 0)).toBe(0);
    expect(badgeTierFor(agir, 7)).toBe(1);
    expect(badgeTierFor(agir, 29)).toBe(1);
    expect(badgeTierFor(agir, 30)).toBe(2);
    expect(badgeTierFor(agir, 1000)).toBe(4);
  });

  it('says how far it is to the next tier', () => {
    expect(badgeProgress(agir, 7)).toEqual({ tier: 1, next: 30, fraction: 0 });
    expect(badgeProgress(agir, 18.5)).toEqual({ tier: 1, next: 30, fraction: 0.5 });
    expect(badgeProgress(agir, 3)).toEqual({ tier: 0, next: 7, fraction: 3 / 7 });
    expect(badgeProgress(agir, 400)).toEqual({ tier: 4, next: null, fraction: 1 });
  });

  it('resolves "the whole course" from the course, and a short course still finishes the badge', () => {
    const rewi = badgeDef('rewi')!;
    expect(resolveThresholds(rewi, 30)).toEqual([1, 5, 15, 30]);
    expect(resolveThresholds(rewi, 3)).toEqual([1, 3, 3, 3]);
    expect(badgeTierFor(rewi, 3, 3)).toBe(4);
    expect(badgeTierFor(rewi, 15, 30)).toBe(3);
    // until the course is known the last tier is out of reach, never reached by accident
    expect(badgeTierFor(rewi, 10_000)).toBe(3);
    expect(badgeProgress(rewi, 20).next).toBeNull();
  });

  it('draws a single-tier badge in gold, and a ladder by its tier', () => {
    expect(badgeTierKey(badgeDef('vegera')!, 1)).toBe('zer');
    expect(badgeTierKey(agir, 1)).toBe('sifir');
    expect(badgeTierKey(agir, 4)).toBe('firuze');
    expect(badgeTierKey(agir, 0)).toBeNull();
  });
});

describe('the ladder', () => {
  it('gives a first-session badge, and never asks more than a year of a streak', () => {
    // one flawless lesson is a badge at once; every other first tier comes within about a week
    expect(badgeDef('bekemasi')!.tiers[0]).toBe(1);
    expect(badgeDef('agir')!.tiers.at(-1)).toBe(365);
    for (const b of BADGES) if (b.tiers.length === 4 && b.family === 'learning') expect(b.tiers[0]).not.toBe('all');
  });

  it('at least doubles from each tier to the next where it counts what you do', () => {
    // dates (years, seasons) and typing speed climb on their own scales
    const ownScale = new Set(['bilez', 'heyva-cardehe', 'mehane', 'dilpak']);
    for (const b of BADGES) {
      if (b.tiers.length !== 4 || b.unit === 'years' || b.unit === 'seasons' || ownScale.has(b.key)) continue;
      const n = b.tiers.filter((t): t is number => typeof t === 'number');
      for (let i = 1; i < n.length; i++) expect(n[i]! / n[i - 1]!, `${b.key} tier ${i + 1}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('what to show first', () => {
  const view = (key: string, progress: number, tier: number, thresholds: number[], extra: Partial<BadgeView> = {}): BadgeView => ({
    key,
    family: 'learning',
    tier,
    tierCount: thresholds.length,
    tierKey: null,
    progress,
    thresholds,
    next: tier < thresholds.length ? thresholds[tier]! : null,
    unit: 'lessons',
    earnedAt: null,
    tierEarnedAt: [],
    secret: false,
    hidden: false,
    hintKey: null,
    rarity: null,
    ...extra,
  });

  it('puts the badges nearest their next tier first, and leaves out the untouched, the finished and the hidden', () => {
    const list = [
      view('a', 9, 0, [10, 75]),
      view('b', 40, 1, [10, 75]),
      view('c', 0, 0, [10, 75]),
      view('d', 75, 2, [10, 75]),
      view('e', 5, 0, [10, 75], { hidden: true, secret: true }),
      view('f', 70, 1, [10, 75]),
      view('g', 1, 0, [2, 20]),
    ];
    expect(nearestBadges(list).map((v) => v.key)).toEqual(['f', 'a', 'g']);
    expect(nearestBadges(list, 5).map((v) => v.key)).toEqual(['f', 'a', 'g', 'b']);
  });

  it('measures from the last tier reached, so a tier kept from an easier ladder starts the bar at nothing', () => {
    // a silver earned when it took 50 lessons, now that it takes 75: the bar to gold starts empty, never below
    expect(badgeViewFraction(view('x', 60, 2, [10, 75, 250]))).toBe(0);
    expect(badgeViewFraction(view('x', 30, 1, [10, 75, 250]))).toBeCloseTo(20 / 65);
  });

  it('says what is left only once past halfway', () => {
    expect(badgeLeft(view('x', 30, 1, [10, 75, 250]))).toBeNull();
    expect(badgeLeft(view('x', 70, 1, [10, 75, 250]))).toBe(5);
    expect(badgeLeft(view('x', 250, 3, [10, 75, 250]))).toBeNull();
    expect(badgeLeft(view('x', 9, 0, [10, 75], { hidden: true }))).toBeNull();
  });
});
