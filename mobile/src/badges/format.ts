/**
 * Pure badge view helpers (contract 4 §B, §U) — no React Native.
 *
 * A badge's words are catalogue keys the shared catalogue names
 * (`badges.<key>.name`, `.meaning`, `.how`, and `.hint` for a secret), so the
 * phone, the browser and the admin translate the same badge under the same
 * key; a test checks every badge has its words here in every language.
 */
import {
  BADGE_FAMILIES,
  BADGE_TIERS,
  badgeDef,
  type BadgeFamily,
  type BadgeTierKey,
  type BadgeUnit,
  type BadgeView,
} from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export const FAMILY_KEY: Record<BadgeFamily, TranslationKey> = {
  learning: 'badges.family.learning',
  habit: 'badges.family.habit',
  games: 'badges.family.games',
  ranked: 'badges.family.ranked',
  friends: 'badges.family.friends',
  events: 'badges.family.events',
  secret: 'badges.family.secret',
};

export const TIER_KEY: Record<BadgeTierKey, TranslationKey> = {
  sifir: 'badges.tier.sifir',
  ziv: 'badges.tier.ziv',
  zer: 'badges.tier.zer',
  firuze: 'badges.tier.firuze',
};

export const TIER_MEANING_KEY: Record<BadgeTierKey, TranslationKey> = {
  sifir: 'badges.tierMeaning.sifir',
  ziv: 'badges.tierMeaning.ziv',
  zer: 'badges.tierMeaning.zer',
  firuze: 'badges.tierMeaning.firuze',
};

/** "7 / 30 days": what each progress number counts. */
export const UNIT_KEY: Record<BadgeUnit, TranslationKey> = {
  lessons: 'badges.unit.lessons',
  words: 'badges.unit.words',
  reviews: 'badges.unit.reviews',
  stories: 'badges.unit.stories',
  units: 'badges.unit.units',
  days: 'badges.unit.days',
  weeks: 'badges.unit.weeks',
  wins: 'badges.unit.wins',
  wpm: 'badges.unit.wpm',
  races: 'badges.unit.races',
  games: 'badges.unit.games',
  gifts: 'badges.unit.gifts',
  seasons: 'badges.unit.seasons',
  years: 'badges.unit.years',
  months: 'badges.unit.months',
  times: 'badges.unit.times',
};

/** The catalogue key of one of a badge's words. */
export function badgeTextKey(key: string, part: 'name' | 'meaning' | 'how' | 'hint'): TranslationKey {
  return `badges.${key}.${part}` as TranslationKey;
}

/** A badge's name in the reader's script: Kurmancî, or Soranî in ckb. */
export function badgeName(t: Translate, key: string): string {
  return t(badgeTextKey(key, 'name'));
}

/** What the name means, or null where it would only repeat the name (in Kurmancî). */
export function badgeMeaning(t: Translate, key: string): string | null {
  const meaning = t(badgeTextKey(key, 'meaning'));
  return meaning.trim().toLocaleLowerCase() === badgeName(t, key).trim().toLocaleLowerCase() ? null : meaning;
}

/** The tier's name for a badge at `tier` (a single badge has none to name). */
export function tierName(t: Translate, tierKey: BadgeTierKey | null, tierCount: number): string | null {
  if (!tierKey || tierCount <= 1) return null;
  return t(TIER_KEY[tierKey]);
}

/** "Zîv (Silver)", for a screen reader and the detail sheet. */
export function tierLabel(t: Translate, tierKey: BadgeTierKey): string {
  const name = t(TIER_KEY[tierKey]);
  const meaning = t(TIER_MEANING_KEY[tierKey]);
  return meaning.toLocaleLowerCase() === name.toLocaleLowerCase() ? name : `${name} (${meaning})`;
}

/** The tier key of tier n (1…4) of a badge with four tiers. */
export function tierKeyAt(n: number): BadgeTierKey {
  return BADGE_TIERS[Math.max(1, Math.min(4, n)) - 1]!;
}

/** "7 / 30 days", or null once every tier is earned. */
export function progressText(t: Translate, view: Pick<BadgeView, 'progress' | 'next' | 'unit'>): string | null {
  if (view.next === null) return null;
  return t('badges.progress', { progress: Math.min(view.progress, view.next), next: view.next, unit: t(UNIT_KEY[view.unit]) });
}

/** 0…1 towards the next tier, from the last one reached. */
export function nextFraction(view: Pick<BadgeView, 'progress' | 'next' | 'tier' | 'thresholds'>): number {
  if (view.next === null) return 1;
  const from = view.tier > 0 ? (view.thresholds[view.tier - 1] ?? 0) : 0;
  const span = view.next - from;
  return span > 0 ? Math.max(0, Math.min(1, (view.progress - from) / span)) : 0;
}

/** The badges in the families' order, each family's in the catalogue's. */
export function byFamily(badges: readonly BadgeView[]): Array<{ family: BadgeFamily; badges: BadgeView[] }> {
  return BADGE_FAMILIES.map((family) => ({ family, badges: badges.filter((b) => b.family === family) })).filter((g) => g.badges.length > 0);
}

/** A badge's accessible name: its name and tier, or that it is a secret not found yet. */
export function badgeLabel(t: Translate, view: Pick<BadgeView, 'key' | 'tier' | 'tierKey' | 'tierCount' | 'hidden'>): string {
  if (view.hidden) return t('badges.secretUnfound');
  const name = badgeName(t, view.key);
  if (view.tier <= 0) return t('badges.lockedLabel', { name });
  const tier = tierName(t, view.tierKey, view.tierCount);
  return tier ? `${name} · ${tier}` : name;
}

/** "12 % of learners" with a whole number, or "under 1 %". */
export function rarityText(t: Translate, share: number): string {
  if (share < 1) return t('badges.rarityUnder');
  return t('badges.rarity', { share: Math.round(share) });
}

/** Whether a catalogue key is a badge (a notification's key may be from a later version). */
export function isKnownBadge(key: unknown): key is string {
  return typeof key === 'string' && badgeDef(key) !== undefined;
}
