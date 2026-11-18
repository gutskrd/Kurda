import type { MessageKey } from '../i18n/en';

/**
 * The wall's two sections, writing and pictures, and their kinds as readers see them. The database's own names
 * (`story`, `poem`, `image`, `meme`) are mapped here so neither leaks into the other.
 */

export type FeedSection = 'all' | 'gotin' | 'dimen';

interface KindOption {
  /** What the API is asked for. */
  key: string;
  /** Looked up at render time, so it follows the chosen language. */
  labelKey: MessageKey;
}

/** Written posts. */
const GOTIN_KINDS: readonly KindOption[] = [
  { key: 'gotin', labelKey: 'civak.kind.saying' },
  { key: 'cirok', labelKey: 'civak.kind.story' },
  { key: 'helbest', labelKey: 'civak.kind.poem' },
];

/** Pictures. */
const DIMEN_KINDS: readonly KindOption[] = [
  { key: 'wene', labelKey: 'civak.kind.photo' },
  { key: 'mim', labelKey: 'civak.kind.meme' },
];

/** The two sections plus everything. Their names come from the catalogues, so Kurmancî readers get "Gotin" and "Dîmen". */
export const SECTIONS: ReadonlyArray<{
  key: FeedSection;
  labelKey: MessageKey;
  kinds: readonly KindOption[];
}> = [
  { key: 'all', labelKey: 'civak.filter.everything', kinds: [] },
  { key: 'gotin', labelKey: 'civak.section.writing', kinds: GOTIN_KINDS },
  { key: 'dimen', labelKey: 'civak.section.pictures', kinds: DIMEN_KINDS },
];


/**
 * A card's kind label, keyed by what the API sends. Deliberately open: a kind newer than this build has no entry, and
 * the card prints the raw kind instead.
 */
export const CARD_LABEL_KEY: Record<string, MessageKey> = {
  gotin: 'civak.kind.saying',
  story: 'civak.kind.story',
  poem: 'civak.kind.poem',
  image: 'civak.kind.photo',
  meme: 'civak.kind.meme',
};

/**
 * Which kind label a wall card shows. The API's `kind` is the database row's, where a written post with pictures is
 * still a `gotin`, so a post marked as a meme is a Meme, a saying that is only pictures is a Photo, and anything else
 * keeps its kind.
 */
export function cardKind(item: { kind: string; meme?: boolean; excerpt: string | null; images?: readonly unknown[] }): string {
  if (item.meme) return 'meme';
  if (item.kind === 'gotin' && !item.excerpt && (item.images?.length ?? 0) > 0) return 'image';
  return item.kind;
}

export function asSection(value: string | null): FeedSection {
  return SECTIONS.some((s) => s.key === value) ? (value as FeedSection) : 'all';
}

/** A kind is valid only inside its own section, so it is dropped when the section changes. */
export function kindWithin(section: FeedSection, kind: string | null): string | null {
  if (!kind || kind === 'all') return null;
  const allowed = SECTIONS.find((s) => s.key === section)?.kinds ?? [];
  return allowed.some((k) => k.key === kind) ? kind : null;
}
