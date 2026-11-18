/**
 * Initials on a colour, for a person or group without a picture. Letters and colours match the phone's
 * (mobile/src/profile/initials.ts), and every colour keeps white letters at AA contrast.
 */
const COLOURS = ['#2D6A4F', '#1B6E8C', '#8E44AD', '#C0392B', '#8A5A0B', '#2C3E50', '#147D6F', '#A83279'] as const;

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

/** FNV-1a, as on the phone, so an id gets the same colour on both. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function colourFor(id: string): string {
  return COLOURS[hash(id) % COLOURS.length]!;
}
