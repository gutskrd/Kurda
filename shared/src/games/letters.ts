/**
 * Letters as the word games count them, per dialect: what a typed word is
 * once the keyboard's quirks are taken out, which letter it begins and ends
 * with, and whether one word may follow another in a chain (The Last Letter).
 *
 * Kurmancî is written in the Hawar alphabet: 31 Latin letters, where ç ê î ş
 * and û are letters of their own, not e or s with a mark — "sêv" ends in v and
 * begins with s, "şêr" begins with ş, and a word ending in ê is followed by one
 * beginning with ê. Nothing here folds them.
 *
 * Soranî is written in the Kurdish Arabic script, where a few things decide
 * what "the first letter" means:
 * - A word that begins with a vowel is written with ئ in front of it (ئاو,
 *   ئێمە, ئیش). The ئ carries the vowel and is not counted: ئاو begins with ا,
 *   so it may follow a word ending in ا.
 * - ڕ (the trilled r) and ڵ (the dark l) are letters of their own, but no word
 *   begins with ڵ and every word-initial r is trilled. So a word ending in ر or
 *   ڕ is followed by one beginning with ڕ (or ر), and one ending in ڵ by one
 *   beginning with ل.
 * - Final, medial and initial shapes are the same letter: only presentation
 *   forms differ, and those are folded by NFKC.
 * - Phones type the Arabic ك ي ى and ه where a Kurdish keyboard has ک ی and ھ,
 *   and the vowel ە as ه (at the end of a word, or followed by a zero-width
 *   non-joiner inside one). Those are read as the Kurdish letters, as grading
 *   does (`answerKey`): a bare ه at the end of a word is the vowel ە, anywhere
 *   else the consonant ھ.
 *
 * The dialect codes are the canonical ones for new code: 'kmr' and 'ckb'.
 * Older spellings ('kurmanji', 'kurmanci', 'sorani') are read by
 * `asLetterDialect`, and the dictionary's own spelling comes from
 * `dictionaryDialect`.
 */

export type LetterDialect = 'kmr' | 'ckb';

/** The Hawar alphabet, in its order. */
export const KMR_LETTERS = [
  'a', 'b', 'c', 'ç', 'd', 'e', 'ê', 'f', 'g', 'h', 'i', 'î', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 'ş', 't', 'u', 'û', 'v', 'w', 'x', 'y', 'z',
] as const;

/** The Kurdish Arabic-script alphabet as Soranî writes it, in its order. */
export const CKB_LETTERS = [
  'ئ', 'ا', 'ب', 'پ', 'ت', 'ج', 'چ', 'ح', 'خ', 'د', 'ر', 'ڕ', 'ز', 'ژ', 'س', 'ش', 'ع',
  'غ', 'ف', 'ڤ', 'ق', 'ک', 'گ', 'ل', 'ڵ', 'م', 'ن', 'ھ', 'ە', 'و', 'ۆ', 'ی', 'ێ',
] as const;

const KMR_SET: ReadonlySet<string> = new Set(KMR_LETTERS);
const CKB_SET: ReadonlySet<string> = new Set(CKB_LETTERS);

/** The vowels a Soranî word writes with ئ in front when it begins with one. */
const CKB_VOWELS: ReadonlySet<string> = new Set(['ا', 'ە', 'ێ', 'ۆ', 'و', 'ی']);

/** The fewest letters a word in a chain may have. */
export const MIN_WORD_LETTERS = 2;
/** The most: a typed line longer than this is not one word. */
export const MAX_WORD_LETTERS = 24;

/** Any spelling of a dialect, as the tables and the apps have used them, to the canonical code. */
export function asLetterDialect(value: unknown): LetterDialect | null {
  switch (value) {
    case 'kmr':
    case 'kurmanji':
    case 'kurmanci':
      return 'kmr';
    case 'ckb':
    case 'sorani':
      return 'ckb';
    default:
      return null;
  }
}

/** The dictionary's spelling of a dialect (`dict_entries.dialect`). */
export function dictionaryDialect(dialect: LetterDialect): 'kurmanji' | 'sorani' {
  return dialect === 'kmr' ? 'kurmanji' : 'sorani';
}

/** Which way a dialect's words are written. */
export function letterDirection(dialect: LetterDialect): 'ltr' | 'rtl' {
  return dialect === 'ckb' ? 'rtl' : 'ltr';
}

// zero-width space, non-joiner and joiner, bidi marks, embeddings and isolates,
// the Arabic letter mark, the byte-order mark and tatweel: they change how text
// is drawn, never what it says
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿ـ]/g;
// Arabic short-vowel marks and other combining marks over Arabic letters: Soranî writes every vowel as a letter
const ARABIC_MARKS = /[ً-ٰٟۖ-ۭ]/g;

const CKB_VARIANTS: Record<string, string> = {
  'ك': 'ک',
  'ي': 'ی',
  'ى': 'ی',
  'ۀ': 'ە',
  'ة': 'ە',
  'أ': 'ئ',
  'إ': 'ئ',
};

/**
 * A typed word as the games compare it, in the dialect's letters, or null when
 * it is not one word written in that dialect's alphabet (a space inside it, a
 * digit, a letter of the other script, punctuation in the middle).
 *
 * Kurmancî: NFC, lower case (a Turkish İ or ı read as i), nothing but Hawar
 * letters. Soranî: NFKC (presentation forms to letters), invisible marks and
 * short-vowel marks dropped, the Arabic keyboard's letters read as Kurdish ones
 * (see the module note), nothing but Soranî letters. Leading and trailing
 * spaces and punctuation are forgiven; anything inside the word is not.
 */
export function wordKey(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  return letters ? letters.join('') : null;
}

/** The letters of a typed word (see `wordKey`), or null when it is not one word of the dialect. */
export function wordLetters(dialect: LetterDialect, typed: string): string[] | null {
  if (typeof typed !== 'string') return null;
  // punctuation and spaces around the word: a full stop typed out of habit is not a second word
  const trimmed = typed.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
  if (!trimmed) return null;
  const letters = dialect === 'kmr' ? kmrLetters(trimmed) : ckbLetters(trimmed);
  if (!letters || letters.length < MIN_WORD_LETTERS || letters.length > MAX_WORD_LETTERS) return null;
  return letters;
}

function kmrLetters(text: string): string[] | null {
  const lowered = text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .toLowerCase()
    // 'İ'.toLowerCase() keeps the dot as a combining mark; a Turkish ı is a slip for i (Hawar has no ı)
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .normalize('NFC');
  const out = Array.from(lowered);
  return out.every((ch) => KMR_SET.has(ch)) ? out : null;
}

function ckbLetters(text: string): string[] | null {
  let s = text.normalize('NFKC');
  // a Persian keyboard writes the vowel ە inside a word as ه and a zero-width non-joiner
  s = s.replace(/ه‌/g, 'ە');
  s = s.replace(INVISIBLE, '').replace(ARABIC_MARKS, '');
  // آ is ئا as Soranî writes it
  s = s.replace(/آ/g, 'ئا');
  const out: string[] = [];
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i]!;
    ch = CKB_VARIANTS[ch] ?? ch;
    // a bare ه: the vowel at the end of a word, the consonant anywhere else
    if (ch === 'ه') ch = i === chars.length - 1 ? 'ە' : 'ھ';
    if (!CKB_SET.has(ch)) return null;
    out.push(ch);
  }
  return out;
}

/**
 * The letter a word begins with, as a chain reads it: in Soranî the vowel
 * after a word-initial ئ (ئاو begins with ا). Null for something that is not a
 * word of the dialect.
 */
export function firstLetter(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  if (!letters) return null;
  if (dialect === 'ckb' && letters[0] === 'ئ' && letters.length > 1 && CKB_VOWELS.has(letters[1]!)) return letters[1]!;
  return letters[0]!;
}

/** The letter a word ends with, or null for something that is not a word of the dialect. */
export function lastLetter(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  return letters ? letters[letters.length - 1]! : null;
}

/**
 * The letter a chain compares: the same for two letters a word may end and
 * the next begin with. Soranî: ڕ and ر are one (a word-initial r is always
 * trilled), ڵ and ل are one (no word begins with ڵ). Kurmancî letters are
 * each their own.
 */
export function chainLetter(dialect: LetterDialect, letter: string): string {
  if (dialect === 'ckb') {
    if (letter === 'ڕ') return 'ر';
    if (letter === 'ڵ') return 'ل';
  }
  return letter;
}

/** The letter the next word must begin with, after this one, as `chainLetter` names it. */
export function nextLetter(dialect: LetterDialect, word: string): string | null {
  const last = lastLetter(dialect, word);
  return last === null ? null : chainLetter(dialect, last);
}

/** Whether `next` begins with the letter `previous` ends with (see `chainLetter`). */
export function followsOn(dialect: LetterDialect, previous: string, next: string): boolean {
  const want = nextLetter(dialect, previous);
  const first = firstLetter(dialect, next);
  return want !== null && first !== null && chainLetter(dialect, first) === want;
}

/** Whether a word begins with a chain letter (as `nextLetter` gives it). */
export function beginsWith(dialect: LetterDialect, word: string, letter: string): boolean {
  const first = firstLetter(dialect, word);
  return first !== null && chainLetter(dialect, first) === chainLetter(dialect, letter);
}

/**
 * How a word that begins with this chain letter is written at its start, for
 * the "starts with" hint: in Soranî a vowel comes with its ئ (ا → ئا), a ی or
 * و may be the consonant or the vowel (ی, ئی), and r is ڕ or ر.
 */
export function startSpellings(dialect: LetterDialect, letter: string): string[] {
  if (dialect === 'kmr') return [letter];
  const l = chainLetter(dialect, letter);
  switch (l) {
    case 'ا':
    case 'ە':
    case 'ێ':
    case 'ۆ':
      return [`ئ${l}`];
    case 'و':
    case 'ی':
      return [l, `ئ${l}`];
    case 'ر':
      return ['ڕ', 'ر'];
    default:
      return [l];
  }
}

/** Kurdish letters a dictionary may have stored as their Arabic look-alikes, for `lookupSpellings`. */
const CKB_STORED_AS: Record<string, readonly string[]> = {
  'ھ': ['ه'],
  'ک': ['ك'],
  'ی': ['ي'],
};

/** At most this many spellings are tried for one Soranî word. */
const MAX_SPELLINGS = 32;

/**
 * The spellings a dictionary may hold a word under (its `headword_folded`
 * keys), for finding it: the word itself, and in Soranî the same word with the
 * Arabic look-alikes an older text uses for ھ, ک and ی, and with a final ە
 * written as ه. Each found entry is still compared by `wordKey`, so a look-alike
 * only ever finds the same word.
 */
export function lookupSpellings(dialect: LetterDialect, key: string): string[] {
  if (dialect === 'kmr') return [key];
  const chars = Array.from(key);
  let spellings: string[] = [''];
  chars.forEach((ch, i) => {
    const options = [ch, ...(i === chars.length - 1 && ch === 'ە' ? ['ه'] : []), ...(CKB_STORED_AS[ch] ?? [])];
    const next: string[] = [];
    for (const s of spellings) for (const o of options) if (next.length < MAX_SPELLINGS) next.push(s + o);
    spellings = next;
  });
  return spellings;
}

/** Whether `letter` is a letter of the dialect's alphabet. */
export function isLetterOf(dialect: LetterDialect, letter: string): boolean {
  return (dialect === 'kmr' ? KMR_SET : CKB_SET).has(letter);
}
