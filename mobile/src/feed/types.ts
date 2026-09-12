import type { TranslationKey } from '../i18n/translations';

/**
 * What the wall is made of, in the words the app uses for it.
 *
 * The same two halves the web app has, deliberately: what people write and what
 * they picture. The database keeps its own names (`story`, `poem`, `image`,
 * `meme`) and these are what a reader sees, mapped in one place so neither
 * leaks into the other.
 *
 * This mirrors `web/src/feed/postKinds.ts` key for key. It is a copy rather
 * than a shared module because the two apps key their catalogues differently —
 * web has a `MessageKey` union of 888, this one a `TranslationKey` union of its
 * own — and a shared file would have to be generic over both to say anything.
 * If a third app ever needs it, that is the moment to lift the shape into
 * `shared/` and pass the key type in.
 */

export type FeedSection = 'all' | 'gotin' | 'dimen';

export interface KindOption {
  /** what the API is asked for */
  key: string;
  /** looked up at render time, so it follows the chosen language */
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
 * The two halves, plus everything.
 *
 * Nothing here carries its own words. Gotin and Dîmen are Kurdish, and Kurdish
 * is one of the languages this app is read in rather than a layer on top of the
 * others — somebody reading in German gets "Texte" and "Bilder", and somebody
 * reading in Kurmancî gets "Gotin" and "Dîmen", because there that IS the
 * translation.
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

/**
 * What a card's badge says, keyed by what the API sends back.
 *
 * Deliberately open: a kind the server ships before the app knows its name has
 * no entry here, and the card falls back to printing the raw kind rather than
 * an empty chip.
 */
export const CARD_LABEL_KEY: Record<string, TranslationKey> = {
  gotin: 'civak.kind.saying',
  story: 'civak.kind.story',
  poem: 'civak.kind.poem',
  image: 'civak.kind.photo',
  meme: 'civak.kind.meme',
};

/**
 * A kind is only valid inside its own half.
 *
 * Switching from Gotin to Dîmen with `helbest` still selected would ask the
 * server for a contradiction, so the kind is dropped when the half changes
 * under it.
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

/** One card on the wall (GET /feed). */
export interface FeedItem {
  /** unique across both source tables */
  key: string;
  targetType: 'library' | 'image';
  id: string;
  kind: string;
  author: FeedAuthor;
  title: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  href: string;
  viewCount: number;
  commentCount: number;
  at: string;
}
