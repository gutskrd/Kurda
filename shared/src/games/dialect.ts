/**
 * The two Kurdish varieties the learning games teach, in one spelling, and the
 * script rules every game reads Kurdish by.
 *
 * Tables spell the varieties three ways: courses and the dictionary say
 * 'kurmanji' / 'sorani', stories and the rhyme games 'kurmanci' / 'sorani',
 * word sets, race texts and the new game tables 'kmr' / 'ckb' (ISO 639-3). New
 * game code speaks only 'kmr' | 'ckb' and goes through `toDialect` whenever a
 * value comes from anywhere else, so a Soranî course can never be read as
 * Kurmancî because it was spelled 'soranî' somewhere.
 *
 * Dialects never mix in a round: Kurmancî is written in Latin letters (Hawar),
 * Soranî in Arabic script. `fitsDialect` is the check a reader runs on every
 * text before it lets a row into a pool, and `foldForDialect` the one key a
 * typed guess and a stored word are compared by, with each script's own
 * lenient letters: Kurmancî's ê î û ç ş, Soranî's ێ ۆ ڵ ڕ and the final ە.
 */
import { answerKey, foldDiacritics } from '../kurdish-text.js';
import { isSoraniDialect } from '../lesson-answers.js';

/** The varieties, as every game table stores them. */
export const GAME_DIALECTS = ['kmr', 'ckb'] as const;
export type GameDialect = (typeof GAME_DIALECTS)[number];

export function isGameDialect(v: unknown): v is GameDialect {
  return v === 'kmr' || v === 'ckb';
}

/** Every older spelling of Kurmancî the tables and the apps use. */
const KURMANJI_SPELLINGS = new Set(['kmr', 'kurmanji', 'kurmanci', 'kurmancî', 'northern kurdish', 'ku']);

/**
 * The variety a stored or sent value names, in the one spelling: 'kurmanji',
 * 'kurmanci' and 'kmr' are Kurmancî; 'sorani', 'soranî', 'ckb' and 'central
 * kurdish' are Soranî. Anything else is null — never a guess — so a value that
 * names neither is refused rather than filed under the wrong variety.
 */
export function toDialect(value: string | null | undefined): GameDialect | null {
  const v = (value ?? '').normalize('NFC').trim().toLowerCase();
  if (v === '') return null;
  if (isSoraniDialect(v)) return 'ckb';
  if (KURMANJI_SPELLINGS.has(v)) return 'kmr';
  return null;
}

/** As the courses and the dictionary spell it ('kurmanji' / 'sorani'). */
export function courseSpelling(dialect: GameDialect): 'kurmanji' | 'sorani' {
  return dialect === 'ckb' ? 'sorani' : 'kurmanji';
}

/** As the stories and the rhyme games spell it ('kurmanci' / 'sorani'). */
export function storySpelling(dialect: GameDialect): 'kurmanci' | 'sorani' {
  return dialect === 'ckb' ? 'sorani' : 'kurmanci';
}

/** Which script a variety is written in. */
export type GameScript = 'latin' | 'arabic';

export function dialectScript(dialect: GameDialect): GameScript {
  return dialect === 'ckb' ? 'arabic' : 'latin';
}

/** The `lang` and `dir` a variety's text is marked up with, inside any interface language. */
export function dialectDirection(dialect: GameDialect): { lang: 'ku' | 'ckb'; dir: 'ltr' | 'rtl' } {
  return dialect === 'ckb' ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}

const ARABIC_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/u;
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ɏ]/u;

/**
 * The script a text's letters are in: 'arabic' or 'latin' when all of them
 * are in one, null when it has letters of both, or none at all. Digits,
 * punctuation and spaces say nothing either way.
 */
export function textScript(text: string): GameScript | null {
  let arabic = false;
  let latin = false;
  for (const ch of text.normalize('NFC')) {
    if (ARABIC_LETTER.test(ch) && /\p{L}/u.test(ch)) arabic = true;
    else if (LATIN_LETTER.test(ch)) latin = true;
    if (arabic && latin) return null;
  }
  return arabic ? 'arabic' : latin ? 'latin' : null;
}

/**
 * Whether a text has a letter in neither script: Cyrillic, Greek, a fullwidth
 * or mathematical Latin letter, an IPA sign. `textScript` passes over such
 * letters, which is right for telling the two scripts apart, but a typed clue
 * that holds one is not Kurdish in either (and is how a banned word is
 * disguised: a Cyrillic а in the middle of a Latin word looks the same).
 */
export function hasForeignLetter(text: string): boolean {
  for (const ch of text.normalize('NFC')) {
    if (/\p{L}/u.test(ch) && !ARABIC_LETTER.test(ch) && !LATIN_LETTER.test(ch)) return true;
  }
  return false;
}

/**
 * Whether a text belongs in a round of this variety: it has letters, and every
 * one of them is in the variety's script. A Kurmancî sentence with a Soranî
 * word in it, or a Soranî one carrying a Latin name, is kept out of both.
 */
export function fitsDialect(text: string, dialect: GameDialect): boolean {
  return textScript(text) === dialectScript(dialect);
}

/** Arabic short-vowel marks and the like, which Kurdish spelling does not use: a pasted text may carry them. */
const ARABIC_MARKS = /[ً-ْٰ]/gu;

/**
 * The Soranî letters that are a mark on another one: written without the
 * mark, they are a slip a learner makes on a keyboard that lacks them, the way
 * Kurmancî's ê is typed as e. Folded only for a lenient key, never for a
 * strict one: ێ and ی are different letters and different words.
 */
const SORANI_LENIENT: Readonly<Record<string, string>> = {
  'ێ': 'ی', // ê → i/y
  'ۆ': 'و', // o → w/u
  'ڵ': 'ل', // heavy l → l
  'ڕ': 'ر', // trilled r → r
};

/**
 * One word or a short text as a game compares it, in its variety's own way.
 *
 * Both varieties start from `answerKey` (NFC, lower case, invisible formatting
 * dropped, the Arabic keyboard's ك ي ه read as Kurdish ک ی ھ, the final ھ or ه
 * read as the vowel ە), then keep letters, digits and single spaces only.
 *
 * `lenient` folds what a learner's keyboard most often loses: in Kurmancî the
 * marks of ê î û ç ş; in Soranî the marks of ێ ۆ ڵ ڕ and any Arabic vowel
 * marks. A strict key keeps every letter as written, which is what decides
 * whether two words are the same word; a lenient one is what a guess typed in
 * a hurry is matched by.
 */
export function foldForDialect(text: string, dialect: GameDialect, lenient = false): string {
  let key = answerKey(text).replace(ARABIC_MARKS, '');
  if (lenient) {
    key = dialect === 'ckb' ? key.replace(/[ێۆڵڕ]/gu, (ch) => SORANI_LENIENT[ch] ?? ch) : foldDiacritics(key);
  }
  return key
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether two texts are the same Kurdish in this variety, by `foldForDialect`. */
export function sameInDialect(a: string, b: string, dialect: GameDialect, lenient = false): boolean {
  const ka = foldForDialect(a, dialect, lenient);
  return ka !== '' && ka === foldForDialect(b, dialect, lenient);
}

/**
 * A text's words, as a game lays them out as tiles: split at spaces, each word
 * trimmed of the punctuation around it (Latin and Arabic: ، ؛ ؟ « »), empty
 * pieces dropped. Inside a word nothing is touched — Kurmancî's apostrophes and
 * Soranî's joined clitics are part of the word.
 */
export function gameWords(text: string): string[] {
  return text
    .normalize('NFC')
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w !== '');
}
