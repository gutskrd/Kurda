/**
 * Letters as the word games count them, per dialect: what a typed word is with the keyboard's quirks removed, which letter
 * it begins and ends with, and whether one word may follow another in a chain (The Last Letter).
 *
 * Kurmancî uses the 31-letter Hawar alphabet, where ç ê î ş û are letters of their own: "sêv" ends in v, "şêr" begins
 * with ş, and a word ending in ê is followed by one beginning with ê. Nothing here folds them.
 *
 * Soranî, in the Kurdish Arabic script:
 * - A word beginning with a vowel is written with ئ in front (ئاو, ئێمە, ئیش), which is not counted: ئاو begins with ا.
 * - ڕ and ڵ are letters of their own, but no word begins with ڵ and every initial r is trilled, so a word ending in ر or ڕ
 *   is followed by one beginning with ڕ (or ر), and one ending in ڵ by one beginning with ل.
 * - Positional shapes are the same letter; only presentation forms differ, folded by NFKC.
 * - Phones type the Arabic ك ي ى and ه for the Kurdish ک ی and ھ, and the vowel ە as ه (word-finally, or with a zero-width
 *   non-joiner inside a word); these read as the Kurdish letters, as in grading (`answerKey`): a bare final ه is ە,
 *   elsewhere ھ.
 *
 * Dialect codes are 'kmr' and 'ckb'; `dictionaryDialect` gives the dictionary's own spelling.
 */
import { INVISIBLE } from '../kurdish-text.js';

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
/** The most; a typed line longer than this is not one word. */
export const MAX_WORD_LETTERS = 24;

/** The dictionary's spelling of a dialect (`dict_entries.dialect`). */
export function dictionaryDialect(dialect: LetterDialect): 'kurmanji' | 'sorani' {
  return dialect === 'kmr' ? 'kurmanji' : 'sorani';
}

/** Which way a dialect's words are written. */
export function letterDirection(dialect: LetterDialect): 'ltr' | 'rtl' {
  return dialect === 'ckb' ? 'rtl' : 'ltr';
}

// Arabic short-vowel and other combining marks over Arabic letters, since Soranî writes every vowel as a letter.
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
 * A typed word as the games compare it in the dialect's letters, or null when it is not one word in that alphabet (a
 * space, a digit, another script's letter, inner punctuation). Kurmancî: NFC, lower case (Turkish İ and ı as i), Hawar
 * letters only. Soranî: NFKC, invisible and short-vowel marks dropped, Arabic keyboard letters read as Kurdish ones,
 * Soranî letters only. Surrounding spaces and punctuation are forgiven; anything inside is not.
 */
export function wordKey(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  return letters ? letters.join('') : null;
}

/** The letters of a typed word (see `wordKey`), or null when it is not one word of the dialect. */
export function wordLetters(dialect: LetterDialect, typed: string): string[] | null {
  if (typeof typed !== 'string') return null;
  // Punctuation and spaces round the word: a full stop typed from habit is not a second word.
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
    // 'İ'.toLowerCase() keeps the dot as a combining mark; a Turkish ı is a slip for i, since Hawar has no ı.
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .normalize('NFC');
  const out = Array.from(lowered);
  return out.every((ch) => KMR_SET.has(ch)) ? out : null;
}

function ckbLetters(text: string): string[] | null {
  let s = text.normalize('NFKC');
  // A Persian keyboard writes the vowel ە inside a word as ه plus a zero-width non-joiner.
  s = s.replace(/ه‌/g, 'ە');
  s = s.replace(INVISIBLE, '').replace(ARABIC_MARKS, '');
  // آ is ئا as Soranî writes it.
  s = s.replace(/آ/g, 'ئا');
  const out: string[] = [];
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i]!;
    ch = CKB_VARIANTS[ch] ?? ch;
    // A bare ه is the vowel at the end of a word and the consonant anywhere else.
    if (ch === 'ه') ch = i === chars.length - 1 ? 'ە' : 'ھ';
    if (!CKB_SET.has(ch)) return null;
    out.push(ch);
  }
  return out;
}

/** The letter a word begins with as a chain reads it (in Soranî the vowel after an initial ئ: ئاو begins with ا); null for a non-word. */
export function firstLetter(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  if (!letters) return null;
  if (dialect === 'ckb' && letters[0] === 'ئ' && letters.length > 1 && CKB_VOWELS.has(letters[1]!)) return letters[1]!;
  return letters[0]!;
}

/** The letter a word ends with, or null for something not a word of the dialect. */
export function lastLetter(dialect: LetterDialect, typed: string): string | null {
  const letters = wordLetters(dialect, typed);
  return letters ? letters[letters.length - 1]! : null;
}

/**
 * The letter a chain compares, the same for letters a word may end and the next begin with. Soranî: ڕ and ر are one (an
 * initial r is always trilled), ڵ and ل are one (no word begins with ڵ). Kurmancî letters are each their own.
 */
export function chainLetter(dialect: LetterDialect, letter: string): string {
  if (dialect === 'ckb') {
    if (letter === 'ڕ') return 'ر';
    if (letter === 'ڵ') return 'ل';
  }
  return letter;
}

/** The letter the next word must begin with after this one, as `chainLetter` names it. */
export function nextLetter(dialect: LetterDialect, word: string): string | null {
  const last = lastLetter(dialect, word);
  return last === null ? null : chainLetter(dialect, last);
}

/** Whether a word begins with a chain letter, as `nextLetter` gives it. */
export function beginsWith(dialect: LetterDialect, word: string, letter: string): boolean {
  const first = firstLetter(dialect, word);
  return first !== null && chainLetter(dialect, first) === chainLetter(dialect, letter);
}

/**
 * How a word beginning with this chain letter is written at its start, for the "starts with" hint: in Soranî a vowel comes
 * with its ئ (ا → ئا), ی or و may be consonant or vowel, and r is ڕ or ر.
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

/** Kurdish letters a dictionary may store as their Arabic lookalikes, for `lookupSpellings`. */
const CKB_STORED_AS: Record<string, readonly string[]> = {
  'ھ': ['ه'],
  'ک': ['ك'],
  'ی': ['ي'],
};

/** At most this many spellings are tried for one Soranî word. */
const MAX_SPELLINGS = 32;

/**
 * The spellings a dictionary may hold a word under (its `headword_folded` keys): the word itself, and in Soranî also with
 * the Arabic lookalikes older texts use for ھ, ک and ی and with a final ە written as ه. Each entry found is still compared
 * by `wordKey`, so a lookalike only ever finds the same word.
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
