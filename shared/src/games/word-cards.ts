/**
 * Cards made from approved words in the admin: a Who Am I? identity is a word someone already approved (a lesson word
 * with its meaning, or a dictionary entry curated for the games with its senses and example), picked, never typed. The API
 * copies the Kurdish; the editor adds only what is not Kurdish (facts, a level). `ref` names where a word was found
 * (`vocab:<key>` or `dict:<entryId>`) and is kept as the row's origin, so a word makes at most one card per kind and
 * variety.
 */
import type { Meanings } from './content.js';
import type { GameDialect } from './dialect.js';
import type { WhoAmIFactValue } from './who-am-i/game.js';

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
  /** its approved meanings by interface language (a dictionary's Kurdish definition under the variety's own code) */
  meanings: Partial<Meanings>;
  /** a sentence using it from the same approved source, when there is one */
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
  /** an identity's category and facts: yes, no, or "sometimes" where either is honest */
  category?: string;
  facts?: Record<string, WhoAmIFactValue>;
}

/** Whether a ref names a place a word can come from. */
export function isWordRef(v: unknown): v is string {
  return typeof v === 'string' && /^(vocab:[a-z]+:[kmrcb]{3}:[0-9a-f]{24}|dict:[0-9a-f-]{36})$/.test(v);
}
