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
