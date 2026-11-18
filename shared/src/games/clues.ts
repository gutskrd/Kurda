/**
 * What a typed clue or guess is in Impostor: short enough, in the game's script, and not saying a banned word. The
 * free-text gate (api/src/mp/free-text.ts) decides whether a text may be shown at all; these rules decide whether it is a
 * move, so the server judges by them and an app can warn before sending.
 *
 * A word is said as a listener hears it: folded leniently (`foldForDialect`), with Kurdish endings (pisîk → pisîka), inside
 * a longer word, or missing its last letter or two; a card's own `forms` are banned as written, and short words match more
 * strictly. Spaces or punctuation inside a word, lookalike letters and compatibility forms do not disguise it, and letters
 * in neither script are a slip of their own (`textSlip`).
 */
import { fitsDialect, foldForDialect, gameWords, hasForeignLetter, type GameDialect } from './dialect.js';

/** How long one move's text may be, in characters and words. */
export interface TextLimits {
  maxChars: number;
  maxWords: number;
}

/** What is wrong with a text before the game judges what it says. */
export type TextSlip = 'empty' | 'script' | 'too-long' | 'too-many-words';

/** The longest ending a banned word may carry and still be heard as itself. */
const LONG_ENDING = 4;
/** A banned word this long is also heard inside a longer word (compounds, Soranî's verb prefixes). */
const INSIDE_FROM = 5;
/** A banned word this short matches only itself or itself with one more letter. */
const SHORT_UP_TO = 2;
/** A clue word this long that a banned word starts with is that word's base. */
const BASE_FROM = 4;
/** Words in a row read as one when looking for a word split by spaces. */
const RUN_WORDS = 6;

/**
 * Letters that pass for the varieties' own: Latin-looking Cyrillic, Greek and IPA letters, and other languages'
 * Arabic-script letters a reader takes for Soranî's. Applied after NFKC (which folds fullwidth and mathematical letters,
 * ligatures and Arabic presentation forms) and lower case, so only lower-case forms are listed.
 */
const LOOK_ALIKES: Readonly<Record<string, string>> = {
  // Cyrillic.
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ү: 'y', һ: 'h', ӏ: 'l', ҫ: 'ç', ꙇ: 'i',
  // Greek.
  α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ϲ: 'c', ϳ: 'j', ς: 'c',
  // IPA and small capitals.
  ɑ: 'a', ɡ: 'g', ɪ: 'i', ʏ: 'y', ᴄ: 'c', ᴏ: 'o', ᴜ: 'u', ʀ: 'r', ᴋ: 'k', ᴍ: 'm', ɴ: 'n', ᴛ: 't', ᴡ: 'w', ᴢ: 'z',
  // Arabic script: Urdu's and Sindhi's forms of letters Soranî writes otherwise.
  ڪ: 'ک', ة: 'ە', ہ: 'ھ', ۃ: 'ە', ٱ: 'ا',
};

/** A text with lookalike letters read as the letters they pass for, NFKC first. */
export function foldLookAlikes(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/./gu, (ch) => LOOK_ALIKES[ch] ?? ch);
}

/** Whether a text can be a move at all: written, in the variety's script only (a Latin word in a Soranî game is no Kurdish clue), and within the limits. */
export function textSlip(text: string, dialect: GameDialect, limits: TextLimits): TextSlip | null {
  const clean = text.normalize('NFC').trim();
  if (clean === '' || gameWords(clean).length === 0) return 'empty';
  if ([...clean].length > limits.maxChars) return 'too-long';
  if (gameWords(clean).length > limits.maxWords) return 'too-many-words';
  if (hasForeignLetter(clean) || !fitsDialect(clean, dialect)) return 'script';
  return null;
}

/** One word as these games compare it: lookalikes read through, lenient, in the variety's letters, without spaces or punctuation. */
function key(word: string, dialect: GameDialect): string {
  return foldForDialect(foldLookAlikes(word), dialect, true).replace(/\s+/g, '');
}

/** A text's words, each keyed, plus every run of up to RUN_WORDS in a row read as one word: "pi sîk" is heard as pisîk. */
function heard(text: string, dialect: GameDialect): { words: string[]; runs: string[] } {
  const words = gameWords(foldLookAlikes(text))
    .map((w) => key(w, dialect))
    .filter((w) => w !== '');
  const runs: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let run = words[i]!;
    for (let j = i + 1; j < words.length && j < i + RUN_WORDS; j++) {
      run += words[j]!;
      runs.push(run);
    }
  }
  return { words, runs };
}

/** Whether one written word is heard as a banned single word. */
function wordSays(word: string, banned: string): boolean {
  if (word === '' || banned === '') return false;
  if (word === banned) return true;
  const extra = word.length - banned.length;
  if (banned.length <= SHORT_UP_TO) return extra === 1 && word.startsWith(banned);
  if (extra > 0 && extra <= LONG_ENDING && word.startsWith(banned)) return true;
  if (banned.length >= INSIDE_FROM && word.includes(banned)) return true;
  // The base of a banned word that carries an ending on the card ("kitêban" banned, "kitêb" said).
  return word.length >= BASE_FROM && extra < 0 && extra >= -2 && banned.startsWith(word);
}

/**
 * Whether words in a row read as one (`heard`) say a banned word. Two real words can meet in a short one's letters ("ma
 * li" holds mal), so a short banned word counts across a space only when the run is exactly it.
 */
function runSays(run: string, banned: string): boolean {
  if (run === banned) return true;
  return banned.length >= INSIDE_FROM && wordSays(run, banned);
}

/** The banned word a text says, as the card writes it, or null; a banned phrase is said when its words appear in a row. */
export function saysBanned(text: string, dialect: GameDialect, banned: readonly string[]): string | null {
  const { words, runs } = heard(text, dialect);
  if (words.length === 0) return null;
  const joined = ` ${words.join(' ')} `;
  for (const term of banned) {
    const parts = gameWords(term).map((w) => key(w, dialect)).filter((w) => w !== '');
    if (parts.length === 0) continue;
    if (parts.length > 1) {
      // The phrase with its words in a row, written as one word, or split anywhere else.
      const whole = parts.join('');
      if (joined.includes(` ${parts.join(' ')} `) || words.includes(whole) || runs.includes(whole)) return term;
      continue;
    }
    const b = parts[0]!;
    if (words.some((w) => wordSays(w, b)) || runs.some((r) => runSays(r, b))) return term;
  }
  return null;
}

/** Whether two clues are the same clue as the variety's letters fold. */
export function sameClue(a: string, b: string, dialect: GameDialect): boolean {
  const ka = foldForDialect(a, dialect, true);
  return ka !== '' && ka === foldForDialect(b, dialect, true);
}
