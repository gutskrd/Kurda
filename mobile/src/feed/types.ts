import type { FeedImage } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/**
 * What the wall is made of, in the app's own words: the same two halves as the web app, what people write and
 * what they picture. The database names (`story`, `poem`, `image`, `meme`) are mapped to reader-facing words here
 * only.
 *
 * This mirrors `web/src/feed/postKinds.ts` key for key. It is a copy because the two apps key their catalogues
 * with different union types, and a shared module would have to be generic over both; if a third app needs it,
 * move the shape into `shared/` with the key type as a parameter.
 */

export type FeedSection = 'all' | 'gotin' | 'dimen';

export interface KindOption {
  /** What the API is asked for. */
  key: string;
  /** Looked up at render time, so it follows the chosen language. */
  labelKey: TranslationKey;
}

/** Written posts. A gotin is a saying and needs no title; the others do. */
export const GOTIN_KINDS: readonly KindOption[] = [
  { key: 'gotin', labelKey: 'civak.kind.saying' },
  { key: 'cirok', labelKey: 'civak.kind.story' },
  { key: 'helbest', labelKey: 'civak.kind.poem' },
];

/** Pictures. */
export const DIMEN_KINDS: readonly KindOption[] = [
  { key: 'wene', labelKey: 'civak.kind.photo' },
  { key: 'mim', labelKey: 'civak.kind.meme' },
];

/**
 * The two halves, plus everything. Nothing here carries its own words: Gotin and Dîmen are Kurdish, and Kurdish
 * is one of the app's languages, so a German reader gets "Texte" and "Bilder" and a Kurmancî reader "Gotin" and
 * "Dîmen".
 */
export const SECTIONS: ReadonlyArray<{
  key: FeedSection;
  labelKey: TranslationKey;
  kinds: readonly KindOption[];
}> = [
  { key: 'all', labelKey: 'civak.filter.everything', kinds: [] },
  { key: 'gotin', labelKey: 'civak.section.writing', kinds: GOTIN_KINDS },
  { key: 'dimen', labelKey: 'civak.section.pictures', kinds: DIMEN_KINDS },
];

/** A half of the wall named by a link or the menu; anything else is the whole wall. */
export function asSection(value: unknown): FeedSection {
  return value === 'gotin' || value === 'dimen' ? value : 'all';
}

/**
 * What a card's badge says, keyed by the API's kind. Deliberately open: an unknown kind has no entry and the card
 * prints the raw kind instead of an empty chip.
 */
export const CARD_LABEL_KEY: Record<string, TranslationKey> = {
  gotin: 'civak.kind.saying',
  story: 'civak.kind.story',
  poem: 'civak.kind.poem',
  image: 'civak.kind.photo',
  meme: 'civak.kind.meme',
};

/**
 * A kind is only valid inside its own half; switching from Gotin to Dîmen with `helbest` selected would be a
 * contradiction, so the kind is dropped.
 */
export function kindWithin(section: FeedSection, kind: string | null): string | null {
  if (!kind || kind === 'all') return null;
  const allowed = SECTIONS.find((s) => s.key === section)?.kinds ?? [];
  return allowed.some((k) => k.key === kind) ? kind : null;
}

/** Who wrote it, as the wall needs them. */
export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** What the wall has done with a post, and whether you are one of them. */
export interface PostEngagement {
  likes: number;
  bookmarks: number;
  reposts: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
}

/** The three things a post can be done to. */
export type EngagementKind = 'like' | 'bookmark' | 'repost';

/** One card on the wall (GET /feed). */
export interface FeedItem {
  /** Unique across both source tables. */
  key: string;
  targetType: 'library' | 'image';
  id: string;
  kind: string;
  author: FeedAuthor;
  title: string | null;
  excerpt: string | null;
  /** The first picture, for apps from before posts had several. */
  imageUrl: string | null;
  /** The first picture's alt text; older APIs leave it out. */
  imageAlt?: string | null;
  /** Every picture, in order (at most four); older APIs leave it out and `imageUrl` stands in. */
  images?: FeedImage[];
  /** Marked as a meme. */
  meme?: boolean;
  href: string;
  viewCount: number;
  commentCount: number;
  engagement: PostEngagement;
  at: string;
}

/** A card's pictures. Older APIs send only `imageUrl`, which stands in as one picture without description or size. */
export function feedImages(item: Pick<FeedItem, 'images' | 'imageUrl' | 'imageAlt'>): FeedImage[] {
  if (item.images && item.images.length > 0) return item.images.slice(0, 4);
  return item.imageUrl ? [{ url: item.imageUrl, alt: item.imageAlt ?? null, width: null, height: null }] : [];
}
