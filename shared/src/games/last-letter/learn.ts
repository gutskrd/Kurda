/**
 * The Last Letter as the Learn Games list shows it: one entry in the shape the
 * games registry gives every game (id, how it is played, how many play, what
 * content it needs and how much before it is offered, the XP it can pay), and
 * the availability rule the list asks before showing it.
 *
 * A word chain needs a dictionary that knows most of the words people will
 * think of, or every other move is a strike for a real word. So the game is
 * offered in a dialect only once that dialect's dictionary is big enough to
 * check players' words, and the game against Hevalo only once admins have
 * curated enough of its words for Hevalo to play (`in_games`: Hevalo never
 * plays a word nobody reviewed). A fresh database offers neither, and nothing
 * says "coming soon".
 */
import type { LetterDialect } from '../letters.js';
import { LAST_LETTER_MAX_PLAYERS, LAST_LETTER_MIN_PLAYERS } from './rules.js';

/** Dictionary entries of a dialect before its players' words can be checked fairly. */
export const LAST_LETTER_MIN_DICTIONARY_WORDS = 1500;
/** Curated (`in_games`) words of a dialect before Hevalo can hold up a game. */
export const LAST_LETTER_MIN_HEVALO_WORDS = 150;

/** The XP source the game pays from: placement in a game with people. A game against Hevalo pays nothing. */
export const LAST_LETTER_XP_SOURCES = ['game_last_letter'] as const;

export interface LastLetterAvailability {
  dialect: LetterDialect;
  /** with friends: the dictionary can check their words */
  group: boolean;
  /** against Hevalo: and Hevalo has enough curated words */
  solo: boolean;
}

/** `GET /mp/last-letter/availability`: one entry per dialect. */
export interface LastLetterAvailabilityAnswer {
  dialects: LastLetterAvailability[];
}

/** The rule, from the two counts (each counted only up to its minimum). */
export function lastLetterAvailability(dialect: LetterDialect, dictionaryWords: number, hevaloWords: number): LastLetterAvailability {
  const group = dictionaryWords >= LAST_LETTER_MIN_DICTIONARY_WORDS;
  return { dialect, group, solo: group && hevaloWords >= LAST_LETTER_MIN_HEVALO_WORDS };
}

/**
 * The Learn Games entry. `mode: 'both'` — with friends and against Hevalo;
 * `freeText: false` — players type words, but only dictionary words are ever
 * shown to anyone else, so the free-text gate is not needed (the profanity
 * filter still is). The availability path answers per dialect.
 */
export const LAST_LETTER_LEARN_ENTRY = {
  id: 'last-letter',
  mode: 'both',
  minPlayers: 1,
  maxPlayers: LAST_LETTER_MAX_PLAYERS,
  minGroupPlayers: LAST_LETTER_MIN_PLAYERS,
  freeText: false,
  contentKinds: ['dictionary'],
  minContent: { dictionaryWords: LAST_LETTER_MIN_DICTIONARY_WORDS, hevaloWords: LAST_LETTER_MIN_HEVALO_WORDS },
  xpSources: LAST_LETTER_XP_SOURCES,
  icon: 'last-letter',
  colour: 'primary',
  /** the game's page in both apps' address space */
  path: '/app/games/last-letter',
  availabilityPath: '/mp/last-letter/availability',
} as const;
