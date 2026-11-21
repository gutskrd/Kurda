/**
 * Initials for a person or group without a picture, drawn in ink on the page's grey (groups.css, ranks.css). The
 * letters match the phone's (mobile/src/profile/initials.ts).
 */

/** A word's letters and digits, or every character when it has none, so an emoji-only name still shows something. */
function meaningful(word: string): string[] {
  const all = Array.from(word);
  const letters = all.filter((c) => /[\p{L}\p{N}]/u.test(c));
  return letters.length > 0 ? letters : all;
}

/** One or two letters: the first of the first and last words, or the first two of a single word. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const raw =
    words.length === 1
      ? meaningful(words[0]!).slice(0, 2).join('')
      : (meaningful(words[0]!)[0] ?? '') + (meaningful(words[words.length - 1]!)[0] ?? '');
  return raw.toUpperCase() || '?';
}
