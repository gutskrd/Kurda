/**
 * Text utilities for Kurmanji (Kurdish Latin alphabet).
 *
 * Used anywhere user text must be compared or searched: username
 * uniqueness (KUR-004), answer checking (KUR-027), dictionary
 * search (KUR-044).
 */

const DIACRITIC_FOLD: Record<string, string> = {
  ê: 'e',
  î: 'i',
  û: 'u',
  ç: 'c',
  ş: 's',
  Ê: 'E',
  Î: 'I',
  Û: 'U',
  Ç: 'C',
  Ş: 'S',
};

/**
 * Canonical form for storage and comparison: Unicode NFC, trimmed,
 * inner whitespace collapsed. Preserves diacritics — "sê" and "se"
 * remain distinct words.
 */
export function normalizeKurdish(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Folds Kurdish diacritics to their base Latin letters, for
 * diacritic-tolerant matching ("se" should find "sê", "ser", "şev").
 * Applies NFC normalization first so decomposed sequences fold too.
 */
export function foldDiacritics(input: string): string {
  return normalizeKurdish(input).replace(/[êîûçşÊÎÛÇŞ]/g, (ch) => DIACRITIC_FOLD[ch] ?? ch);
}

/**
 * How many letters a word has, as a game counts them.
 *
 * Code points, not UTF-16 units, and letters only: apostrophes, hyphens and
 * spaces do not fill a Wordle square, and `'`.length` would say otherwise. NFC
 * first so a decomposed ê counts once rather than twice.
 *
 * This decides which Wordle band a word belongs to, so the admin screen that
 * offers a word and the engine that picks one have to agree exactly. They each
 * had their own copy of it, each commented as matching the other; this is the
 * one both now use.
 */
export function letterCount(word: string): number {
  return Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
}

/**
 * A word reduced to its letters: lowercase, NFC, nothing else.
 *
 * What a game compares a typed guess against, and what the rhyme engine keys
 * its rimes and its curator rulings on. Diacritics are **kept** — ê and e are
 * different vowels and rhyme differently, so folding them here would silently
 * rewrite what rhymes with what.
 */
export function letterKey(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

/**
 * The same word as something to look an entry up by: letters only, and Kurdish
 * diacritics folded to their base letters.
 *
 * Finding is not comparing. Somebody searching for "sev" means sêv, and an
 * importer meeting "zabît" after "zabit" is meeting the same headword twice —
 * neither of those is true of a Wordle guess, which is why this is a second key
 * rather than a change to the first.
 *
 * Idempotent: folding an already-folded key leaves it alone, so it is safe to
 * apply to a value that has been through `letterKey` already.
 */
export function dictionaryKey(word: string): string {
  return letterKey(foldDiacritics(word));
}

/**
 * Arabic-script letters that are one letter in Kurdish written two ways.
 *
 * Moved here from the dictionary build (web/scripts/ferheng-alphabet.ts), where
 * every one was evidenced by the corpus rather than assumed: it holds `هات`
 * beside `ھاتن` (the same verb), `كابانی` beside `کا`, `ياقووت` beside `یا`.
 * Grading needs the same table for the same reason. An Arabic or Persian
 * keyboard types `ك` and `ي` where a Kurdish one types `ک` and `ی`, and a
 * learner who wrote the right word on the keyboard they own has written the
 * right word.
 *
 * `ه` folds to `ھ` and not to `ە`: at the start of a word it is the consonant
 * h, and `ە` is the vowel, which does not begin words. (`answerKey` below deals
 * with the places a keyboard uses `ه` for the vowel.)
 */
const LETTER_VARIANTS: Record<string, string> = {
  'ك': 'ک', // U+0643 arabic kaf  → U+06A9 keheh
  'ي': 'ی', // U+064A arabic yeh  → U+06CC farsi yeh
  'ى': 'ی', // U+0649 alef maksura → farsi yeh
  'ه': 'ھ', // U+0647 heh         → U+06BE heh doachashmee
  'ۀ': 'ە', // U+06C0 heh with yeh above → U+06D5 ae
  /*
   * The Turkish dotless i. Hawar has i and î and no ı, so in Kurmancî it is
   * always a slip of a Turkish keyboard — three words in 377,942.
   *
   * Folding it also removes something a reader would have had no way to make
   * sense of: `ı`.toUpperCase() is `I`, so the leftover block was showing a
   * letter indistinguishable from Hawar's own I.
   */
  'ı': 'i',
};

/** Which letter a character is filed as, once the variants are folded. */
export function foldLetter(ch: string): string {
  return LETTER_VARIANTS[ch] ?? ch;
}

/**
 * Characters that change how text is drawn and nothing about what it says:
 * zero-width space, non-joiner and joiner, the bidi marks, embeddings and
 * isolates a phone inserts around right-to-left text, the Arabic letter mark,
 * the byte-order mark, and tatweel (the typographic stretch `ـ`).
 */
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿ـ]/g;

/**
 * A typed answer as grading compares it: the same Kurdish text whichever
 * keyboard typed it.
 *
 * Lower-cased, NFC, whitespace collapsed, invisible formatting removed, the
 * Arabic-script variants above folded, and Persian or Arabic-Indic digits read
 * as the digits they are. Two more things only a keyboard explains:
 *
 * - A Persian keyboard has no `ە`. Inside a word it is typed as `ه` followed
 *   by a zero-width non-joiner (which stops the `ه` joining the next letter and
 *   makes it look like `ە`), so that pair is read as `ە`.
 * - At the end of a word nothing follows to join, so the same keyboards type
 *   the vowel as a bare `ه`, and the same code point is how many Kurdish texts
 *   write the consonant h. A grader cannot tell those apart, so at the end of a
 *   word it does not try: `ه`, `ھ` and `ە` there are one letter.
 *
 * Kurmancî diacritics are **kept**. ê and e are different letters, and whether
 * a missing one is forgiven is the grader's decision (lenient or strict), made
 * with `foldDiacritics` on top of this key, never here.
 */
export function answerKey(input: string): string {
  const visible = input
    .normalize('NFC')
    .replace(/ه‌/g, 'ە')
    .replace(INVISIBLE, '');
  return normalizeKurdish(visible)
    .toLowerCase()
    .replace(/i̇/g, 'i') // 'İ'.toLowerCase() keeps the dot as a combining mark
    .replace(/./gu, (ch) => foldLetter(ch))
    .replace(/ھ(?=$|[^\p{L}\p{M}])/gu, 'ە')
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const code = d.charCodeAt(0);
      return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
    });
}
