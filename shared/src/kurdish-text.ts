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
