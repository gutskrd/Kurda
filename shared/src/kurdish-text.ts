/** Text keys for comparing and searching Kurdish: usernames, answer checking and dictionary search. */

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

/** The stored and compared form: NFC, trimmed, inner whitespace collapsed. Diacritics stay, so "sê" and "se" differ. */
export function normalizeKurdish(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Folds Kurdish diacritics to their base letters (after NFC), for matching that forgives them: "se" finds "sê". */
export function foldDiacritics(input: string): string {
  return normalizeKurdish(input).replace(/[êîûçşÊÎÛÇŞ]/g, (ch) => DIACRITIC_FOLD[ch] ?? ch);
}

/**
 * Letters in a word as a game counts them: code points, letters only, after NFC, so apostrophes, hyphens and spaces fill no
 * Peyvok square and a decomposed ê counts once. The admin and the word picker both band words by this, so they must agree.
 */
export function letterCount(word: string): number {
  return Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
}

/**
 * A word reduced to its letters: lowercase and NFC. Guesses are compared and rhymes keyed on it, so diacritics stay: ê and e
 * are different vowels and rhyme differently.
 */
export function letterKey(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

/**
 * A word as a lookup key: letters only, diacritics folded, so a search for "sev" finds sêv and an importer sees "zabît" and
 * "zabit" as one headword. A separate key from `letterKey` because a Peyvok guess must not fold. Idempotent.
 */
export function dictionaryKey(word: string): string {
  return letterKey(foldDiacritics(word));
}

/**
 * Arabic-script letters that Kurdish writes two ways, each pair attested in the dictionary corpus. Arabic and Persian keyboards
 * type `ك` and `ي` where a Kurdish one types `ک` and `ی`, and the learner's word is still right. `ه` folds to the consonant
 * `ھ`, not the vowel `ە`, which never begins a word; `answerKey` handles a word-final `ه`.
 */
const LETTER_VARIANTS: Record<string, string> = {
  'ك': 'ک', // U+0643 arabic kaf  → U+06A9 keheh
  'ي': 'ی', // U+064A arabic yeh  → U+06CC farsi yeh
  'ى': 'ی', // U+0649 alef maksura → farsi yeh
  'ه': 'ھ', // U+0647 heh         → U+06BE heh doachashmee
  'ۀ': 'ە', // U+06C0 heh with yeh above → U+06D5 ae
  /*
   * The Turkish dotless i: Hawar has no ı, so in Kurmancî it is always a Turkish keyboard's slip. Unfolded it would also
   * upper-case to an I that looks exactly like Hawar's own.
   */
  'ı': 'i',
};

/** Which letter a character is filed as, once the variants are folded. */
export function foldLetter(ch: string): string {
  return LETTER_VARIANTS[ch] ?? ch;
}

/**
 * Characters that change how text is drawn and nothing it says: zero-width space, non-joiner and joiner, bidi marks,
 * embeddings and isolates, the Arabic letter mark, the byte-order mark and tatweel.
 */
export const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿ـ]/g;

/**
 * A typed answer as grading compares it, the same whichever keyboard typed it: lowercase, NFC, whitespace collapsed,
 * invisible marks removed, the variants above folded and Persian or Arabic-Indic digits read as digits.
 *
 * A Persian keyboard has no `ە`: it types `ه` plus a zero-width non-joiner inside a word, read here as `ە`, and a bare `ه`
 * at the end of a word, where many texts also write the consonant h. So after a letter at the end of a word, `ه`, `ھ` and
 * `ە` are one letter. A lone `ھ` or `ە` is not folded: an item asking for one of them must still catch the confusion.
 *
 * Kurmancî diacritics stay; whether a missing one is forgiven is the grader's choice, made with `foldDiacritics` on top.
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
    .replace(/(?<=\p{L}\p{M}*)ھ(?=$|[^\p{L}\p{M}])/gu, 'ە')
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const code = d.charCodeAt(0);
      return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
    });
}
