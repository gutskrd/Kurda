/**
 * The two Kurdish alphabets: which letters exist, and what order they go in.
 *
 * ── what was wrong ───────────────────────────────────────────────────────
 *
 * Words were filed under `dictionaryKey`, which **folds** the diacritics — ş to
 * s, ç to c, ê to e, î to i, û to u. That key exists so somebody searching
 * "sev" finds "sêv", which is right for a search box and wrong for an index:
 * Ş is a letter of the Kurdish alphabet, not a decoration on S. So the A–Z
 * showed 27 letters where the corpus has 37, five of Kurmancî's own were
 * missing entirely, and `şev` sorted in among the s-words.
 *
 * The Arabic side had the same problem from the other direction: `ك` (U+0643,
 * Arabic kaf) and `ک` (U+06A9, keheh) are one letter in Kurdish and appeared as
 * two, as did `ي`/`ی` and `ه`/`ھ`. The corpus settles it — `هات` and `ھاتن`
 * are the same word, `كابانی` and `کا` the same letter — so the key folds the
 * variants together and the index shows one of each.
 *
 * ── the orders ───────────────────────────────────────────────────────────
 *
 * Both are the standard ones rather than Unicode order or anything `localeCompare`
 * would produce. The five Kurmancî letters with diacritics sit in their own
 * places (Ç after C, Ş after S) rather than being pushed to the end.
 */

import { foldLetter } from '@kurda/shared';

/**
 * Hawar, the Latin alphabet Celadet Alî Bedirxan set out in 1932: 26 basic
 * letters plus Ç Ê Î Ş Û, 31 in all, each in its own position.
 */
export const HAWAR = [...'abcçdeêfghiîjklmnopqrsştuûvwxyz'];

/**
 * Soranî, the Arabic-script alphabet, in its standard order.
 *
 * 33 single letters. The alphabet is usually counted as 34 because `وو` holds a
 * position of its own, but it is a digraph: a word beginning with it begins
 * with `و`, so it needs no entry here.
 */
export const SORANI = [
  'ا', 'ئ', 'ب', 'پ', 'ت', 'ج', 'چ', 'ح', 'خ', 'د', 'ر', 'ڕ', 'ز', 'ژ', 'س', 'ش', 'ع',
  'غ', 'ف', 'ڤ', 'ق', 'ک', 'گ', 'ل', 'ڵ', 'م', 'ن', 'ھ', 'ە', 'و', 'ۆ', 'ی', 'ێ',
];

/*
 * Arabic letters that are one letter in Kurdish written two ways (`ك`/`ک`,
 * `ي`/`ی`, `ه`/`ھ`, …) are folded by `foldLetter`, which lives in @kurda/shared
 * now: answer grading needs the same table, and two copies of it would be two
 * chances to disagree about what counts as the same letter. Left unfolded they
 * split a letter in two down the whole index.
 */

/**
 * Where a letter sorts.
 *
 * Anything in neither alphabet — the Latin `ḧ` and `ẍ` some orthographies use,
 * the Arabic `ط ص ظ` of unassimilated loanwords, a stray Cyrillic — sorts after
 * every real letter, in code-point order among themselves. They are shown, not
 * hidden: 250 words begin with `ḧ` and a reader looking for one needs to find
 * it.
 */
const RANK = new Map([...HAWAR, ...SORANI].map((c, i) => [c, i]));
const AFTER_EVERYTHING = HAWAR.length + SORANI.length;

function rank(ch: string): number {
  return RANK.get(ch) ?? AFTER_EVERYTHING + (ch.codePointAt(0) ?? 0);
}

/**
 * Two filing keys, in Kurdish alphabetical order.
 *
 * Code point by code point against the orders above, so `ş` lands after `s` and
 * before `t` instead of wherever `localeCompare` would put it. Used for the
 * words, for the pages they are grouped into, and for the letters themselves,
 * so all three agree.
 */
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

/**
 * Which alphabet a letter belongs to.
 *
 * Membership of the two lists, not Unicode script. `ḧ` is Latin and is not one
 * of Hawar's 31; `ط` is Arabic and is not one of Soranî's. Calling them what
 * they are costs nothing and saying otherwise would be wrong in a dictionary.
 */
export function alphabetOf(letter: string): Alphabet {
  const c = foldLetter(letter);
  if (HAWAR.includes(c)) return 'hawar';
  if (SORANI.includes(c)) return 'sorani';
  return 'other';
}
