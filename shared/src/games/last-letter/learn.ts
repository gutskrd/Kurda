/**
 * The Last Letter's Learn entry in the registry's shape, and the availability rule the list checks first. A word chain
 * needs a dictionary that knows most words people think of, or real words get struck, so the game is offered in a dialect
 * only once its dictionary is big enough, and against Hevalo only once admins curated enough of its words (`in_games`;
 * Hevalo never plays an unreviewed word). A fresh database offers neither, and nothing says "coming soon".
 */
import type { LetterDialect } from '../letters.js';
import { LAST_LETTER_MAX_PLAYERS, LAST_LETTER_MIN_PLAYERS } from './rules.js';

/** Dictionary entries of a dialect before its players' words can be checked fairly. */
export const LAST_LETTER_MIN_DICTIONARY_WORDS = 1500;
/** Curated (`in_games`) words of a dialect before Hevalo can hold up a game. */
export const LAST_LETTER_MIN_HEVALO_WORDS = 150;

/** The XP source the game pays from: placement in a game with people; a game against Hevalo pays nothing. */
export const LAST_LETTER_XP_SOURCES = ['game_last_letter'] as const;

export interface LastLetterAvailability {
  dialect: LetterDialect;
  /** with friends: the dictionary can check their words */
  group: boolean;
  /** against Hevalo: also needs enough curated words */
  solo: boolean;
}

/** `GET /mp/last-letter/availability`: one entry per dialect. */
export interface LastLetterAvailabilityAnswer {
  dialects: LastLetterAvailability[];
}

/** The rule, from the two counts, each counted only up to its minimum. */
export function lastLetterAvailability(dialect: LetterDialect, dictionaryWords: number, hevaloWords: number): LastLetterAvailability {
  const group = dictionaryWords >= LAST_LETTER_MIN_DICTIONARY_WORDS;
  return { dialect, group, solo: group && hevaloWords >= LAST_LETTER_MIN_HEVALO_WORDS };
}

/**
 * The Learn Games entry. `mode: 'both'` (with friends and against Hevalo); `freeText: false` because only dictionary words
 * are ever shown to others, so the free-text gate is not needed (the profanity filter still is).
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
