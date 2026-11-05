/**
 * What a typed clue or guess is, in the party games where players write their
 * own Kurdish (Kurdish Impostor, Don't Say the Word!): whether it is short
 * enough, in the game's own script, and whether it says a word it may not.
 *
 * The free-text gate (api/src/mp/free-text.ts) decides whether a text may be
 * shown to anyone at all; these rules decide whether it is a move in the
 * game. They are pure and shared, so the server judges by them and an app can
 * say the same thing about a slip before it is sent.
 *
 * "Says a word" is judged the way a listener would hear it, in the variety's
 * own letters folded leniently (`foldForDialect`: Kurmancî's ê î û ç ş typed
 * without their marks, Soranî's ێ ۆ ڵ ڕ without theirs), and with the endings
 * Kurdish adds to a word: a clue word that is the banned word with a short
 * ending (Kurmancî pisîk → pisîka, pisîkên; Soranî پشیلە → پشیلەکە), or
 * a long banned word inside a longer one, says it. A clue word that is a
 * banned word missing its last letter or two (the base of a plural on the
 * card) says it too. Anything a card lists in its own `forms` is banned as
 * written. A short word is matched more strictly, so a two-letter word does
 * not refuse every word that begins with its letters.
 */
import { fitsDialect, foldForDialect, gameWords, type GameDialect } from './dialect.js';

/** How long one move's text may be: characters, and words. */
export interface TextLimits {
  maxChars: number;
  maxWords: number;
}

/** What is wrong with a text before the game judges what it says. */
export type TextSlip = 'empty' | 'script' | 'too-long' | 'too-many-words';

/** The longest ending a banned word may carry and still be heard as itself. */
const LONG_ENDING = 4;
/** A banned word this long is heard inside a longer word too (compounds, Soranî's verb prefixes). */
const INSIDE_FROM = 5;
/** A banned word this short is matched only as itself or with one letter more. */
const SHORT_UP_TO = 2;
/** A clue word this long that a banned word begins with is that word's base. */
const BASE_FROM = 4;

/**
 * Whether a text can be a move at all: something written, in the variety's
 * script only (a Latin word in a Soranî game, or the reader's own language,
 * is not a Kurdish clue), and within the limits.
 */
export function textSlip(text: string, dialect: GameDialect, limits: TextLimits): TextSlip | null {
  const clean = text.normalize('NFC').trim();
  if (clean === '' || gameWords(clean).length === 0) return 'empty';
  if ([...clean].length > limits.maxChars) return 'too-long';
  if (gameWords(clean).length > limits.maxWords) return 'too-many-words';
  if (!fitsDialect(clean, dialect)) return 'script';
  return null;
}

/** One word as these games compare it: lenient, in the variety's letters, without spaces. */
function key(word: string, dialect: GameDialect): string {
  return foldForDialect(word, dialect, true).replace(/\s+/g, '');
}

/** Whether one written word is heard as a banned single word. */
function wordSays(word: string, banned: string): boolean {
  if (word === '' || banned === '') return false;
  if (word === banned) return true;
  const extra = word.length - banned.length;
  if (banned.length <= SHORT_UP_TO) return extra === 1 && word.startsWith(banned);
  if (extra > 0 && extra <= LONG_ENDING && word.startsWith(banned)) return true;
  if (banned.length >= INSIDE_FROM && word.includes(banned)) return true;
  // the base of a banned word that carries an ending on the card ("kitêban" banned, "kitêb" said)
  return word.length >= BASE_FROM && extra < 0 && extra >= -2 && banned.startsWith(word);
}

/**
 * The banned word a text says, as the card writes it, or null when it says
 * none. A banned phrase of several words is said when its words appear in the
 * text in a row.
 */
export function saysBanned(text: string, dialect: GameDialect, banned: readonly string[]): string | null {
  const words = gameWords(text).map((w) => key(w, dialect));
  if (words.length === 0) return null;
  const joined = ` ${foldForDialect(text, dialect, true)} `;
  for (const term of banned) {
    const parts = gameWords(term).map((w) => key(w, dialect));
    if (parts.length === 0) continue;
    if (parts.length > 1) {
      if (joined.includes(` ${parts.join(' ')} `)) return term;
      continue;
    }
    if (words.some((w) => wordSays(w, parts[0]!))) return term;
  }
  return null;
}

/**
 * Whether a typed guess names the word: one of its words is the word (folded
 * leniently, as a guess typed in a hurry is), or the word with a short ending
 * (an article, a plural, the ezafe). A word of several words is guessed when
 * the guess holds them in a row.
 */
export function guessNames(guess: string, word: string, dialect: GameDialect): boolean {
  const target = gameWords(word).map((w) => key(w, dialect));
  if (target.length === 0) return false;
  if (target.length > 1) return ` ${foldForDialect(guess, dialect, true)} `.includes(` ${target.join(' ')} `);
  const t = target[0]!;
  return gameWords(guess).some((g) => {
    const w = key(g, dialect);
    if (w === t) return true;
    const extra = w.length - t.length;
    return t.length > SHORT_UP_TO && extra > 0 && extra <= 3 && w.startsWith(t);
  });
}

/** Whether two clues are the same clue, as the variety's letters fold. */
export function sameClue(a: string, b: string, dialect: GameDialect): boolean {
  const ka = foldForDialect(a, dialect, true);
  return ka !== '' && ka === foldForDialect(b, dialect, true);
}
