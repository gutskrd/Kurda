/**
 * Cards made from approved words, in the admin panel: Who Am I?'s
 * identities are a word someone already approved — a word a
 * published lesson teaches (with the meaning the lesson gives it), or a
 * dictionary entry an admin curated for the games (with its senses and an
 * example) — picked, never typed. The API copies the Kurdish across; the
 * editor adds only what is not Kurdish (an identity's facts, a level).
 *
 * A word is named by where it was found (`ref`): `vocab:<key>` for a lesson's
 * or a story's word, `dict:<entryId>` for a dictionary entry. The ref is kept
 * as the row's origin, so a word becomes at most one card of each kind per
 * variety.
 */
import type { Meanings } from './content.js';
import type { GameDialect } from './dialect.js';

/** Where a word can be picked from. */
export const GAME_WORD_SOURCES = ['vocabulary', 'dictionary'] as const;
export type GameWordSource = (typeof GAME_WORD_SOURCES)[number];

/** The kinds of row made by picking a word. */
export const WORD_CARD_KINDS = ['identity'] as const;
export type WordCardKind = (typeof WORD_CARD_KINDS)[number];

/** A word that can be made into a card, as the picker lists it. */
export interface GameWordCandidate {
  ref: string;
  source: GameWordSource;
  dialect: GameDialect;
  word: string;
  /** its approved meanings, by interface language (a dictionary's Kurdish definition under the variety's own code) */
  meanings: Partial<Meanings>;
  /** a sentence using it, from the same approved source, when there is one */
  example: { ku: string; meanings: Partial<Meanings> } | null;
  /** the rows already made of it, by kind */
  made: Partial<Record<WordCardKind, string>>;
}

/** `POST /admin/game-content/from-word`. */
export interface WordCardRequest {
  kind: WordCardKind;
  dialect: GameDialect;
  ref: string;
  level: number;
  /** an identity's category and yes/no facts */
  category?: string;
  facts?: Record<string, boolean>;
}

/** Whether a ref names a place a word can come from. */
export function isWordRef(v: unknown): v is string {
  return typeof v === 'string' && /^(vocab:[a-z]+:[kmrcb]{3}:[0-9a-f]{24}|dict:[0-9a-f-]{36})$/.test(v);
}
