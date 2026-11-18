/**
 * The two Kurdish alphabets: which letters exist and their standard order (not Unicode or `localeCompare` order), with
 * Kurmancî's marked letters in their own places (Ç after C, Ş after S). Words are filed by letter, not by the folded
 * search key, and Arabic letters written two ways (`ك`/`ک`, `ي`/`ی`, `ه`/`ھ`) count as one.
 */

import { foldLetter } from '@kurda/shared';

/** Hawar, the Latin alphabet Celadet Alî Bedirxan set out in 1932: 26 basic letters plus Ç Ê Î Ş Û, 31 in all. */
export const HAWAR = [...'abcçdeêfghiîjklmnopqrsştuûvwxyz'];

/** Soranî's Arabic-script alphabet in standard order: 33 single letters, since `وو` is a digraph filed under `و`. */
export const SORANI = [
  'ا', 'ئ', 'ب', 'پ', 'ت', 'ج', 'چ', 'ح', 'خ', 'د', 'ر', 'ڕ', 'ز', 'ژ', 'س', 'ش', 'ع',
  'غ', 'ف', 'ڤ', 'ق', 'ک', 'گ', 'ل', 'ڵ', 'م', 'ن', 'ھ', 'ە', 'و', 'ۆ', 'ی', 'ێ',
];

/* Letters written two ways are folded by @kurda/shared `foldLetter`, shared with answer grading so both agree. */

/**
 * Where a letter sorts. Letters in neither alphabet (`ḧ`, `ẍ`, loanword `ط ص ظ`, stray Cyrillic) sort after every real
 * letter in code-point order; they are shown, since 250 words begin with `ḧ`.
 */
const RANK = new Map([...HAWAR, ...SORANI].map((c, i) => [c, i]));
const AFTER_EVERYTHING = HAWAR.length + SORANI.length;

function rank(ch: string): number {
  return RANK.get(ch) ?? AFTER_EVERYTHING + (ch.codePointAt(0) ?? 0);
}

/** Compares two filing keys in Kurdish alphabetical order, code point by code point, for words, pages and letters alike. */
export function compareKeys(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = rank(x[i]!) - rank(y[i]!);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

export type Alphabet = 'hawar' | 'sorani' | 'other';

/** Which alphabet a letter belongs to, by membership of the two lists rather than Unicode script (`ḧ` is Latin but not Hawar). */
export function alphabetOf(letter: string): Alphabet {
  const c = foldLetter(letter);
  if (HAWAR.includes(c)) return 'hawar';
  if (SORANI.includes(c)) return 'sorani';
  return 'other';
}
