/**
 * A profile's collection besides its badges (`GET /users/:id/collection`): the icons they own and the gifts they were
 * given, each with who gave it as far as the viewer may see them, and for the owner alone what they gave. Shared so
 * the API and both apps agree on the shape, and on the badge row a profile shows beside its handle.
 */
import { hasTreeArt } from './art/trees.js';
import type { ProfileBadge, ShowcaseBadge } from './badges.js';
import type { LeagueTier } from './leagues.js';
import type { TreeGlimpse } from './tree.js';

/** Most icons, and most distinct gift items in each list, one answer holds; `total` says how many there are. */
export const COLLECTION_LIST_MAX = 60;
/** Most givers or receivers named under one gift item, newest first; its `count` still counts them all. */
export const COLLECTION_PEOPLE_MAX = 20;

/**
 * Somebody a gift came from or went to; null where the viewer may not see them: gone, not available, blocked either
 * way, or a minor who is not the viewer's friend. The apps then say "a Hevalo member".
 */
export interface CollectionPerson {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CollectionIcon {
  sku: string;
  name: string;
  assetUrl: string | null;
  /** the icon worn on their profile now */
  worn: boolean;
}

/** One kind of gift item, however many times it came or went. */
export interface CollectionGift {
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  count: number;
  /** the newest time it came or went */
  lastAt: string;
  /** who sent it, or to whom it went, and when, newest first; cut at `COLLECTION_PEOPLE_MAX` */
  people: Array<{ person: CollectionPerson | null; at: string }>;
}

export interface CollectionList<T> {
  items: T[];
  total: number;
}

export interface CollectionResponse {
  /** true when the profile keeps its detail from this viewer; the lists are then empty */
  private: boolean;
  icons: CollectionList<CollectionIcon>;
  received: CollectionList<CollectionGift>;
  /** the owner only */
  sent?: CollectionList<CollectionGift>;
}

/** Most pictures the badge row beside a profile's handle holds; the rest are counted as "+N". */
export const BADGE_ROW_MAX = 6;

export type BadgeRowItem = { kind: 'league'; tier: LeagueTier } | { kind: 'tree'; tree: TreeGlimpse } | { kind: 'badge'; badge: ShowcaseBadge };

/**
 * Earned badges in the order a profile shows them: the chosen three first, then the rest newest first. A server that
 * sends only the three gives just those.
 */
export function badgesInOrder(showcase: readonly ShowcaseBadge[] = [], earned?: readonly ProfileBadge[]): ProfileBadge[] {
  const all = earned ?? showcase.map((b) => ({ ...b, earnedAt: null, rarity: null }));
  const chosen = showcase.flatMap((s) => all.filter((b) => b.key === s.key).slice(0, 1));
  return [...chosen, ...all.filter((b) => !showcase.some((s) => s.key === b.key))];
}

/** The badge row: the league, the tree where it can be drawn, then the badges in order, cut at `BADGE_ROW_MAX`. */
export function badgeRow({
  league,
  tree,
  badges,
}: {
  league?: LeagueTier | null;
  tree?: TreeGlimpse | null;
  badges: readonly ShowcaseBadge[];
}): { shown: BadgeRowItem[]; more: number } {
  const all: BadgeRowItem[] = [
    ...(league ? [{ kind: 'league' as const, tier: league }] : []),
    ...(tree && hasTreeArt(tree.species) ? [{ kind: 'tree' as const, tree }] : []),
    ...badges.map((badge) => ({ kind: 'badge' as const, badge })),
  ];
  return { shown: all.slice(0, BADGE_ROW_MAX), more: Math.max(0, all.length - BADGE_ROW_MAX) };
}
