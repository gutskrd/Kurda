/**
 * What there is art for: the badge catalogue's keys and families, the badge
 * tiers, the game-rank tiers and the league tiers (contract 4, B1/B3, R4, L1;
 * research §7.4).
 *
 * None of it is the art's own list. The badges, their families and how many
 * tiers each has are read from the catalogue (`shared/src/badges.ts`), the
 * rank tiers and seasons from `shared/src/ranks.ts`, the league tiers from
 * `shared/src/leagues.ts` — so a badge added to the catalogue is a badge the
 * art is asked to draw, and the art test fails until it has a picture.
 *
 * Names here are labels for the drawings' default `<title>` only. Every app
 * passes its own translated title; these are the fallback.
 */
import { BADGE_FAMILIES as CATALOGUE_FAMILIES, BADGES as CATALOGUE, BADGE_TIERS as CATALOGUE_TIERS, BADGE_TIER_META } from '../badges.js';
import type { BadgeFamily as CatalogueFamily } from '../badges.js';
import { LEAGUE_TIERS as CATALOGUE_LEAGUE_TIERS, LEAGUE_TIER_META } from '../leagues.js';
import type { LeagueTier as CatalogueLeagueTier } from '../leagues.js';
import { APEX_TIER, RANK_TIERS as POINTS_TIERS, RANK_TIER_KEYS, SEASON_LABELS, SEASON_NAMES as CATALOGUE_SEASONS } from '../ranks.js';
import type { Division, RankTier as CatalogueRankTier, SeasonName } from '../ranks.js';

export const BADGE_FAMILIES = CATALOGUE_FAMILIES;
export type BadgeFamily = CatalogueFamily;

/**
 * Badge tiers 1–4: Sifir (copper), Zîv (silver), Zêr (gold), Firûze
 * (turquoise). The art numbers them; the catalogue keys them by name, in the
 * same order. The metals (palette.ts) are four, so the catalogue's tiers must
 * be four too — the line below stops the build if they are not.
 */
export const BADGE_TIERS = [1, 2, 3, 4] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];
const FOUR_TIERS: (typeof CATALOGUE_TIERS)['length'] extends (typeof BADGE_TIERS)['length'] ? true : never = true;
void FOUR_TIERS;
export const BADGE_TIER_NAMES = Object.fromEntries(
  BADGE_TIERS.map((tier, i) => [tier, BADGE_TIER_META[CATALOGUE_TIERS[i] ?? 'sifir'].nameKu]),
) as Readonly<Record<BadgeTier, string>>;

/** Game-rank tiers, lowest first, Stêrk last (R4). */
export const RANK_TIERS: readonly RankTier[] = RANK_TIER_KEYS;
export type RankTier = CatalogueRankTier;
export const RANK_TIER_NAMES = Object.fromEntries(
  [...POINTS_TIERS, APEX_TIER].map((t) => [t.key, { ku: t.name, en: t.meaning }]),
) as Readonly<Record<RankTier, { ku: string; en: string }>>;
/** Divisions within a tier: 3 is III (the lowest), 1 is I (the top). Stêrk has none. */
export const RANK_DIVISIONS = [3, 2, 1] as const satisfies readonly Division[];
export type RankDivision = Division;

/** The seasons, in calendar order: Q1 Zivistan, Q2 Bihar, Q3 Havîn, Q4 Payîz (R5). */
export const SEASONS = CATALOGUE_SEASONS;
export type Season = SeasonName;
export const SEASON_NAMES: Readonly<Record<Season, { ku: string; en: string }>> = SEASON_LABELS;

/** Learning-league tiers, lowest first (L1). */
export const LEAGUE_TIERS = CATALOGUE_LEAGUE_TIERS;
export type LeagueTier = CatalogueLeagueTier;
export const LEAGUE_TIER_NAMES = Object.fromEntries(
  LEAGUE_TIERS.map((t) => [t, { ku: LEAGUE_TIER_META[t].nameKu, en: LEAGUE_TIER_META[t].meaningEn }]),
) as Readonly<Record<LeagueTier, { ku: string; en: string }>>;

/** What the art needs to know of a badge. */
export interface BadgeArt {
  family: BadgeFamily;
  /** Kurmancî name, for the default title */
  name: string;
  /** how many tiers it has; 1 = a single badge with no tier pips */
  tiers: number;
  /** what each tier is earned at, low to high — the number on the badge; `all` is every unit of the course */
  milestones: readonly (number | 'all')[];
}

/** A badge key of the catalogue, such as `agir` or `rank-ciya`. */
export type BadgeKey = string;

/** Every badge of the catalogue, by key, as the art sees it. */
export const BADGES: Readonly<Record<BadgeKey, BadgeArt>> = Object.fromEntries(
  CATALOGUE.map((b) => [b.key, { family: b.family, name: b.nameKu, tiers: b.tiers.length, milestones: b.tiers }]),
);
/** The catalogue's badge keys, in its order (family by family). */
export const BADGE_KEYS: readonly BadgeKey[] = CATALOGUE.map((b) => b.key);

export function isBadgeKey(key: unknown): key is BadgeKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(BADGES, key);
}

/** The art's view of one badge; throws for a key the catalogue does not have. */
export function badgeArt(key: BadgeKey): BadgeArt {
  const def = isBadgeKey(key) ? BADGES[key] : undefined;
  if (!def) throw new RangeError(`art: no badge art for key ${String(key)}`);
  return def;
}

/** The ranked family's tier badges, by the rank tier they show: `rank-<tier>` in the catalogue. */
export const RANK_BADGE = Object.fromEntries(RANK_TIERS.map((t) => [t, `rank-${t}`])) as Readonly<Record<RankTier, BadgeKey>>;
