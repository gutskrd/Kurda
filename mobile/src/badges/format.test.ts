import { describe, expect, it } from 'vitest';
import { BADGES, BADGE_FAMILIES, BADGE_TIERS, type BadgeView } from '@kurda/shared';
import { LOCALES, TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import {
  FAMILY_KEY,
  TIER_KEY,
  TIER_MEANING_KEY,
  UNIT_KEY,
  UNIT_ONE_KEY,
  badgeLabel,
  badgeMeaning,
  badgeName,
  badgeTextKey,
  byFamily,
  isKnownBadge,
  nextFraction,
  nextTierLine,
  progressText,
  rarityText,
  tierKeyAt,
  tierLabel,
  tierName,
  unitWord,
} from './format';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key] ?? key, vars);
const tKu = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.ku[key] ?? key, vars);

const view = (over: Partial<BadgeView> = {}): BadgeView => ({
  key: 'agir',
  family: 'habit',
  tier: 1,
  tierCount: 4,
  tierKey: 'sifir',
  progress: 12,
  thresholds: [7, 30, 100, 365],
  next: 30,
  unit: 'days',
  earnedAt: '2026-09-01T00:00:00.000Z',
  tierEarnedAt: ['2026-09-01T00:00:00.000Z'],
  secret: false,
  hidden: false,
  hintKey: null,
  rarity: null,
  ...over,
});

describe('the catalogue’s words', () => {
  it('has a name, a meaning and how it is earned for every badge, in every language — and a hint for every secret', () => {
    for (const locale of LOCALES) {
      const cat = TRANSLATIONS[locale] as Record<string, string>;
      for (const b of BADGES) {
        for (const part of ['name', 'meaning', 'how'] as const) expect(cat[badgeTextKey(b.key, part)], `${locale} ${b.key}.${part}`).toBeTruthy();
        if (b.secret) expect(cat[badgeTextKey(b.key, 'hint')], `${locale} ${b.key}.hint`).toBeTruthy();
      }
      for (const f of BADGE_FAMILIES) expect(cat[FAMILY_KEY[f]], `${locale} ${f}`).toBeTruthy();
      for (const tier of BADGE_TIERS) {
        expect(cat[TIER_KEY[tier]]).toBeTruthy();
        expect(cat[TIER_MEANING_KEY[tier]]).toBeTruthy();
      }
      for (const key of Object.values(UNIT_KEY)) expect(cat[key], `${locale} ${key}`).toBeTruthy();
      for (const key of Object.values(UNIT_ONE_KEY)) expect(cat[key], `${locale} ${key}`).toBeTruthy();
    }
  });

  it('keeps the Kurdish name everywhere but ckb, which writes it in Soranî script', () => {
    expect(TRANSLATIONS.de['badges.agir.name' as TranslationKey]).toBe('Agir');
    expect(TRANSLATIONS.ar['badges.agir.name' as TranslationKey]).toBe('Agir');
    expect(TRANSLATIONS.ckb['badges.agir.name' as TranslationKey]).toBe('ئاگر');
  });

  it('says the meaning, unless the reader already reads the name', () => {
    expect(badgeName(t, 'agir')).toBe('Agir');
    expect(badgeMeaning(t, 'agir')).toBe('Fire');
    expect(badgeMeaning(tKu, 'agir')).toBeNull();
  });
});

describe('tiers', () => {
  it('names a tier, but not for a badge with a single one', () => {
    expect(tierName(t, 'ziv', 4)).toBe('Zîv');
    expect(tierName(t, 'zer', 1)).toBeNull();
    expect(tierLabel(t, 'firuze')).toBe('Firûze (Turquoise)');
    expect(tierKeyAt(1)).toBe('sifir');
    expect(tierKeyAt(9)).toBe('firuze');
  });
});

describe('progress', () => {
  it('reads "7 / 30 days", and nothing once every tier is earned', () => {
    expect(progressText(t, view())).toBe('12 / 30 days');
    expect(progressText(t, view({ next: null, tier: 4 }))).toBeNull();
    // never more than the target, however far past it the count has gone
    expect(progressText(t, view({ progress: 45, next: 30 }))).toBe('30 / 30 days');
  });

  it('says what is left once past halfway, and one of a thing in the singular', () => {
    expect(progressText(t, view({ progress: 20 }))).toBe('10 days to go');
    expect(progressText(t, view({ progress: 29 }))).toBe('1 day to go');
    expect(progressText(t, view({ key: 'rank-dest', unit: 'seasons', tier: 0, progress: 0, next: 1, thresholds: [1, 3, 5, 8] }))).toBe('0 / 1 season');
    expect(unitWord(t, 'seasons', 1)).toBe('season');
    expect(unitWord(t, 'seasons', 3)).toBe('seasons');
  });

  it('names the tier after the one just won', () => {
    expect(nextTierLine(t, 'ders', 1)).toBe('Next: Zîv at 75 lessons');
    expect(nextTierLine(t, 'rank-dest', 0)).toBe('Next: Sifir at 1 season');
    expect(nextTierLine(t, 'rewi', 3)).toBe('Next: Firûze, for the whole course');
    expect(nextTierLine(t, 'agir', 4)).toBeNull();
    expect(nextTierLine(t, 'vegera', 1)).toBeNull();
  });

  it('fills from the tier reached, not from zero', () => {
    expect(nextFraction(view())).toBeCloseTo((12 - 7) / (30 - 7));
    expect(nextFraction(view({ tier: 0, progress: 3, next: 7 }))).toBeCloseTo(3 / 7);
    expect(nextFraction(view({ next: null }))).toBe(1);
  });

  it('says rarity in whole percent, and "under 1%" below it', () => {
    expect(rarityText(t, 12.4)).toBe('12% of learners have this');
    expect(rarityText(t, 0.4)).toBe('Fewer than 1% of learners have this');
  });
});

describe('labels', () => {
  it('names a secret not yet found without giving it away', () => {
    expect(badgeLabel(t, view({ key: 'tire-rast', hidden: true, tier: 0, tierCount: 1 }))).toBe('A secret badge, not found yet');
  });

  it('says a badge not earned yet plainly, and an earned one with its tier', () => {
    expect(badgeLabel(t, view({ tier: 0, tierKey: null }))).toBe('Agir, not earned yet');
    expect(badgeLabel(t, view({ tier: 2, tierKey: 'ziv' }))).toBe('Agir · Zîv');
    expect(badgeLabel(t, view({ key: 'vegera', tier: 1, tierCount: 1, tierKey: 'zer' }))).toBe('Vegera');
  });
});

describe('byFamily', () => {
  it('groups in the families’ order and leaves empty families out', () => {
    const groups = byFamily([view({ key: 'ders', family: 'learning' }), view(), view({ key: 'heval', family: 'friends' })]);
    expect(groups.map((g) => g.family)).toEqual(['learning', 'habit', 'friends']);
  });
});

describe('isKnownBadge', () => {
  it('knows the catalogue and nothing else', () => {
    expect(isKnownBadge('agir')).toBe(true);
    expect(isKnownBadge('tournament-win')).toBe(false);
    expect(isKnownBadge(3)).toBe(false);
  });
});
