/**
 * The two Kurdish varieties the learning games teach, in one spelling, and the script rules every game reads Kurdish by.
 * Tables spell the varieties three ways ('kurmanji'/'sorani' in courses and the dictionary, 'kurmanci'/'sorani' in stories
 * and the rhyme games, 'kmr'/'ckb' elsewhere); game code speaks only 'kmr' | 'ckb' and converts anything else with
 * `toDialect`, so a Soranî course can never be read as Kurmancî. Dialects never mix in a round: `fitsDialect` admits a
 * text to a pool, and `foldForDialect` is the one key guesses and stored words are compared by.
 */
import { answerKey, foldDiacritics } from '../kurdish-text.js';
import { isSoraniDialect } from '../lesson-answers.js';

/** The varieties, as every game table stores them. */
export const GAME_DIALECTS = ['kmr', 'ckb'] as const;
export type GameDialect = (typeof GAME_DIALECTS)[number];

export function isGameDialect(v: unknown): v is GameDialect {
  return v === 'kmr' || v === 'ckb';
}

/** Every older spelling of Kurmancî the tables and apps use. */
const KURMANJI_SPELLINGS = new Set(['kmr', 'kurmanji', 'kurmanci', 'kurmancî', 'northern kurdish', 'ku']);

/**
 * The variety a stored or sent value names: 'kurmanji', 'kurmanci' and 'kmr' are Kurmancî; 'sorani', 'soranî', 'ckb' and
 * 'central kurdish' are Soranî. Anything else is null, never a guess, so it is refused rather than misfiled.
 */
export function toDialect(value: string | null | undefined): GameDialect | null {
  const v = (value ?? '').normalize('NFC').trim().toLowerCase();
  if (v === '') return null;
  if (isSoraniDialect(v)) return 'ckb';
  if (KURMANJI_SPELLINGS.has(v)) return 'kmr';
  return null;
}

/** As courses and the dictionary spell it ('kurmanji' / 'sorani'). */
export function courseSpelling(dialect: GameDialect): 'kurmanji' | 'sorani' {
  return dialect === 'ckb' ? 'sorani' : 'kurmanji';
}

/** As stories and the rhyme games spell it ('kurmanci' / 'sorani'). */
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

/** The script a text's letters are in: 'arabic' or 'latin' when all are in one, null for both or none; digits, punctuation and spaces do not count. */
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
 * Whether a text has a letter in neither script (Cyrillic, Greek, fullwidth or mathematical Latin, IPA). `textScript`
 * skips such letters, rightly, but a clue holding one is Kurdish in neither script, and a lookalike is how a banned word
 * is disguised.
 */
export function hasForeignLetter(text: string): boolean {
  for (const ch of text.normalize('NFC')) {
    if (/\p{L}/u.test(ch) && !ARABIC_LETTER.test(ch) && !LATIN_LETTER.test(ch)) return true;
  }
  return false;
}

/** Whether a text belongs in a round of this variety: it has letters, all in the variety's script, so mixed texts are kept out of both. */
export function fitsDialect(text: string, dialect: GameDialect): boolean {
  return textScript(text) === dialectScript(dialect);
}

/** Arabic short-vowel marks and the like, unused in Kurdish spelling but carried by pasted text. */
const ARABIC_MARKS = /[ً-ْٰ]/gu;

/**
 * Soranî letters that are a mark on another: written without it they are a keyboard slip, like Kurmancî's ê typed as e.
 * Folded only for a lenient key, never a strict one: ێ and ی are different letters and words.
 */
const SORANI_LENIENT: Readonly<Record<string, string>> = {
  'ێ': 'ی', // ê → i/y
  'ۆ': 'و', // o → w/u
  'ڵ': 'ل', // heavy l → l
  'ڕ': 'ر', // trilled r → r
};

/**
 * One word or short text as a game compares it in its variety. Both start from `answerKey` (NFC, lower case, invisible
 * formatting dropped, Arabic keyboard letters read as Kurdish, a final ھ or ه as ە) and keep only letters, digits and
 * single spaces. `lenient` also folds what keyboards most often lose: Kurmancî's marks on ê î û ç ş, Soranî's on ێ ۆ ڵ ڕ
 * and Arabic vowel marks. A strict key decides whether two words are the same; a lenient one matches a hurried guess.
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
 * A text's words as a game lays them out as tiles: split at spaces, each trimmed of surrounding Latin or Arabic punctuation
 * (، ؛ ؟ « »), empty pieces dropped. Inside a word nothing changes: apostrophes and joined clitics belong to it.
 */
export function gameWords(text: string): string[] {
  return text
    .normalize('NFC')
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w !== '');
}
