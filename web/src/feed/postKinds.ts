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
  label: string;
  /** what the database calls it, for posting */
  postAs: string;
}

/** Written posts. A gotin is a saying and needs no title; the others do. */
export const GOTIN_KINDS: readonly KindOption[] = [
  { key: 'gotin', label: 'Gotin', postAs: 'gotin' },
  { key: 'cirok', label: 'Çîrok', postAs: 'story' },
  { key: 'helbest', label: 'Helbest', postAs: 'poem' },
];

/** Pictures. */
export const DIMEN_KINDS: readonly KindOption[] = [
  { key: 'wene', label: 'Wêne', postAs: 'image' },
  { key: 'mim', label: 'Mîm', postAs: 'meme' },
];

export const SECTIONS: ReadonlyArray<{ key: FeedSection; label: string; kinds: readonly KindOption[] }> = [
  { key: 'all', label: 'Everything', kinds: [] },
  { key: 'gotin', label: 'Gotin', kinds: GOTIN_KINDS },
  { key: 'dimen', label: 'Dîmen', kinds: DIMEN_KINDS },
];

/** Only a gotin may go without a title. */
export function titleRequired(postAs: string): boolean {
  return postAs !== 'gotin';
}

/** What a card's badge says, keyed by what the API sends back. */
export const CARD_LABEL: Record<string, string> = {
  gotin: 'Gotin',
  story: 'Çîrok',
  poem: 'Helbest',
  image: 'Wêne',
  meme: 'Mîm',
};

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
