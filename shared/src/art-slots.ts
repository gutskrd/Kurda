/**
 * Every picture the apps draw from their own art that an admin can replace
 * with an uploaded one: a "slot" per picture, named `family:key` (one picture
 * for every level of a badge) or `family:key:level` (one level only, which
 * wins over the first).
 *
 * The art that ships stays the default. An uploaded picture is laid in place
 * of it wherever the slot is drawn, on the website and on the phone, and
 * taking it away brings the original back. The server keeps which slot holds
 * which upload; the apps load that list once (`GET /art/overrides`) and look
 * a slot up with `overrideFor`.
 *
 * Shop backgrounds and profile icons are items in the shop, with their own
 * pictures (Shop in the admin); every other shop item can carry a picture too.
 * The three characters are drawn and animated in layers to speak, so they are
 * not pictures that a single upload could stand in for.
 */
import { BADGES, BADGE_TIERS, type BadgeTierKey } from './badges.js';
import { LEAGUE_TIERS } from './leagues.js';
import { RANK_TIER_KEYS } from './ranks.js';

export const ART_SLOT_FAMILIES = ['badge', 'rank', 'league', 'frame', 'avatar', 'event'] as const;
export type ArtSlotFamily = (typeof ART_SLOT_FAMILIES)[number];

/** What an upload for a family must be: the shop's square icon art, or its 16:9 background art. */
export type ArtSlotShape = 'square' | 'wide';

export interface ArtSlotFamilyInfo {
  label: string;
  /** what the pictures are, and what makes a good replacement */
  hint: string;
  shape: ArtSlotShape;
}

export const ART_SLOT_FAMILY_INFO: Readonly<Record<ArtSlotFamily, ArtSlotFamilyInfo>> = {
  badge: {
    label: 'Badges',
    hint: 'A square picture with a transparent background, at least 256 × 256. One picture for every level, or a picture for each level.',
    shape: 'square',
  },
  rank: { label: 'Rank emblems', hint: 'A square emblem with a transparent background, at least 256 × 256.', shape: 'square' },
  league: { label: 'League emblems', hint: 'A square emblem with a transparent background, at least 256 × 256.', shape: 'square' },
  frame: {
    label: 'Season frames',
    hint: 'A square ring with a transparent middle, at least 256 × 256: the profile picture shows through the middle two-thirds of it.',
    shape: 'square',
  },
  avatar: { label: 'Default profile pictures', hint: 'A square picture, at least 256 × 256. Shown for everyone who has not uploaded a photo.', shape: 'square' },
  event: { label: 'Event banners', hint: 'A 16:9 picture, at least 1280 × 720, behind an event’s name in the app.', shape: 'wide' },
};

/** The events that have a look of their own in the apps; an event with another theme can still be given a banner. */
export const EVENT_THEMES = ['newroz', 'yalda'] as const;

/** How many default profile pictures there are (`default-01` …). */
export const DEFAULT_AVATAR_COUNT = 17;

const KEY = '[a-z0-9][a-z0-9_-]{0,47}';
const SLOT = new RegExp(`^(${ART_SLOT_FAMILIES.join('|')}):(${KEY})(?::(${KEY}))?$`);

export interface ArtSlotParts {
  family: ArtSlotFamily;
  key: string;
  level: string | null;
}

/** A slot's name in parts, or null when it is not a slot's name at all. */
export function parseArtSlot(slot: string): ArtSlotParts | null {
  const m = SLOT.exec(slot);
  return m ? { family: m[1] as ArtSlotFamily, key: m[2]!, level: m[3] ?? null } : null;
}

export function artSlot(family: ArtSlotFamily, key: string, level?: string | null): string {
  return level ? `${family}:${key}:${level}` : `${family}:${key}`;
}

const badgeTiers = new Map(BADGES.map((b) => [b.key, b.tiers.length]));

/**
 * Whether a slot is one the apps draw: a known badge (and one of its levels,
 * when it has more than one), rank tier, league tier, season frame, default
 * profile picture, or an event theme. A level only where a badge has levels.
 */
export function isArtSlot(slot: string): boolean {
  const p = parseArtSlot(slot);
  if (!p) return false;
  switch (p.family) {
    case 'badge': {
      const tiers = badgeTiers.get(p.key);
      if (tiers === undefined) return false;
      return p.level === null || (tiers > 1 && (BADGE_TIERS as readonly string[]).slice(0, tiers).includes(p.level));
    }
    case 'rank':
    case 'frame':
      return p.level === null && (RANK_TIER_KEYS as readonly string[]).includes(p.key);
    case 'league':
      return p.level === null && (LEAGUE_TIERS as readonly string[]).includes(p.key);
    case 'avatar': {
      const n = /^default-(\d{2})$/.exec(p.key);
      return p.level === null && !!n && Number(n[1]) >= 1 && Number(n[1]) <= DEFAULT_AVATAR_COUNT;
    }
    case 'event':
      return p.level === null;
  }
}

export interface ArtSlotEntry {
  slot: string;
  family: ArtSlotFamily;
  key: string;
  level: string | null;
}

/** Every slot of a family the apps know of, in the order the admin shows them. */
export function artSlotsOf(family: ArtSlotFamily): ArtSlotEntry[] {
  const entry = (key: string, level: string | null = null): ArtSlotEntry => ({ slot: artSlot(family, key, level), family, key, level });
  switch (family) {
    case 'badge':
      return BADGES.flatMap((b) => [entry(b.key), ...(b.tiers.length > 1 ? BADGE_TIERS.slice(0, b.tiers.length).map((t) => entry(b.key, t)) : [])]);
    case 'rank':
    case 'frame':
      return RANK_TIER_KEYS.map((t) => entry(t));
    case 'league':
      return LEAGUE_TIERS.map((t) => entry(t));
    case 'avatar':
      return Array.from({ length: DEFAULT_AVATAR_COUNT }, (_, i) => entry(`default-${String(i + 1).padStart(2, '0')}`));
    case 'event':
      return EVENT_THEMES.map((t) => entry(t));
  }
}

/** Slot → the URL of the picture that replaces its art. */
export type ArtOverrides = Readonly<Record<string, string>>;

/** What `GET /art/overrides` answers: the list, and a version that changes whenever it does. */
export interface ArtOverridesResponse {
  version: string;
  overrides: ArtOverrides;
}

/**
 * The uploaded picture for a slot, or null to draw the art that ships: the
 * level's own picture first, then the one for every level.
 */
export function overrideFor(overrides: ArtOverrides | null | undefined, family: ArtSlotFamily, key: string, level?: string | null): string | null {
  if (!overrides) return null;
  return (level ? overrides[artSlot(family, key, level)] : undefined) ?? overrides[artSlot(family, key)] ?? null;
}

/** A badge level as the apps count it (1–4) by its name in the catalogue, for `overrideFor`. */
export function badgeLevelName(tier: number): BadgeTierKey | null {
  return BADGE_TIERS[Math.floor(tier) - 1] ?? null;
}
