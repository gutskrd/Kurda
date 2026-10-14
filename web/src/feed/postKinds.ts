import type { MessageKey } from '../i18n/en';

/**
 * What the wall is made of, in the words the app uses for it.
 *
 * Two halves — what people write and what they picture — because they read
 * differently and are looked for differently. The database keeps its own names
 * (`story`, `poem`, `image`, `meme`); these are what a reader sees, and the two
 * are mapped in one place so neither leaks into the other.
 */

export type FeedSection = 'all' | 'gotin' | 'dimen';

export interface KindOption {
  /** what the API is asked for */
  key: string;
  /** looked up at render time, so it follows the chosen language */
  labelKey: MessageKey;
  /** what the database calls it, for posting */
  postAs: string;
}

/** Written posts. A gotin is a saying and needs no title; the others do. */
export const GOTIN_KINDS: readonly KindOption[] = [
  { key: 'gotin', labelKey: 'civak.kind.saying', postAs: 'gotin' },
  { key: 'cirok', labelKey: 'civak.kind.story', postAs: 'story' },
  { key: 'helbest', labelKey: 'civak.kind.poem', postAs: 'poem' },
];

/** Pictures. */
export const DIMEN_KINDS: readonly KindOption[] = [
  { key: 'wene', labelKey: 'civak.kind.photo', postAs: 'image' },
  { key: 'mim', labelKey: 'civak.kind.meme', postAs: 'meme' },
];

/**
 * The two halves, plus everything.
 *
 * Nothing here carries its own words. Gotin and Dîmen are Kurdish, and Kurdish
 * is one of the eight languages this app is read in rather than a layer on top
 * of the others — somebody reading in Spanish gets "Escritos" and "Imágenes",
 * and somebody reading in Kurmancî gets "Gotin" and "Dîmen", because there that
 * IS the translation.
 */
export const SECTIONS: ReadonlyArray<{
  key: FeedSection;
  labelKey: MessageKey;
  kinds: readonly KindOption[];
}> = [
  { key: 'all', labelKey: 'civak.filter.everything', kinds: [] },
  { key: 'gotin', labelKey: 'civak.section.writing', kinds: GOTIN_KINDS },
  { key: 'dimen', labelKey: 'civak.section.pictures', kinds: DIMEN_KINDS },
];

/** Only a gotin may go without a title. */
export function titleRequired(postAs: string): boolean {
  return postAs !== 'gotin';
}

/**
 * What a card's badge says, keyed by what the API sends back.
 *
 * Deliberately open: a kind the server ships before the web knows its name has
 * no entry here, and the card falls back to printing the raw kind rather than
 * an empty chip. That is why this maps to keys that may be absent instead of
 * being a closed `Record<Kind, …>`.
 */
export const CARD_LABEL_KEY: Record<string, MessageKey> = {
  gotin: 'civak.kind.saying',
  story: 'civak.kind.story',
  poem: 'civak.kind.poem',
  image: 'civak.kind.photo',
  meme: 'civak.kind.meme',
};

/**
 * Which badge a wall card wears.
 *
 * The API's `kind` is what the database calls the row, and a written post with
 * pictures is still a `gotin` there — so a meme would be badged "Saying", and
 * a post that is only a photo would claim to be words. A post marked as a meme
 * is a Meme, a saying that is nothing but pictures is a Photo, and everything
 * else is what the database says.
 */
export function cardKind(item: { kind: string; meme?: boolean; excerpt: string | null; images?: readonly unknown[] }): string {
  if (item.meme) return 'meme';
  if (item.kind === 'gotin' && !item.excerpt && (item.images?.length ?? 0) > 0) return 'image';
  return item.kind;
}

export function asSection(value: string | null): FeedSection {
  return SECTIONS.some((s) => s.key === value) ? (value as FeedSection) : 'all';
}

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
