/**
 * Initials / monogram avatar fallback (KUR-178). Pure + deterministic: derive a
 * 1–2 character monogram from a display name and a stable background color from
 * the user's id, so a user with no photo always gets the same avatar with no
 * network round-trip. Kurdish Latin diacritics (ê î û ç ş) are preserved.
 */
import { TONES } from '../coursemap/path';

const tone = TONES.light;

/**
 * The monogram's grounds: the course's own colours, as the lesson path paints
 * a unit by day, so a face with no photo is in a colour the app already has.
 *
 * They were eight hues picked for this file alone. One was the exact red the
 * app says "danger" in, so a person could look like an error, and one the
 * green of a look the app no longer has. Each slot now holds the course tone
 * nearest the hue it had, so nobody's avatar jumps to another family of
 * colour; the path has seven tones and there are eight slots, and the eighth
 * is the river's deeper edge, where a navy was.
 *
 * The deep, by-day fills in both schemes, because the monogram on them is
 * white in both. Every one meets WCAG AA (4.5:1) against it, asserted in
 * initials.test.ts. The order and the count are what map an id to a colour:
 * changing either gives everybody a different one.
 */
export const AVATAR_COLORS = [
  tone.meadow.fill,
  tone.river.fill,
  tone.dusk.fill,
  tone.clay.fill,
  tone.saffron.fill,
  tone.river.lip,
  tone.pine.fill,
  tone.rose.fill,
] as const;

export const AVATAR_TEXT_COLOR = '#FFFFFF';

/** A word's letter/number characters (drops @, punctuation, emoji); falls back
 *  to every character when a word has none, so an emoji-only name still yields
 *  something. Uses Array.from so surrogate pairs stay intact. */
function meaningfulChars(word: string): string[] {
  const all = Array.from(word);
  const letters = all.filter((c) => /[\p{L}\p{N}]/u.test(c));
  return letters.length > 0 ? letters : all;
}

/**
 * A 1–2 character monogram. Multi-word names take the first character of the
 * first and last words; a single word takes its first two characters. Blank
 * input falls back to '?'. Uppercased (Kurdish Latin: ş→Ş, î→Î, …).
 */
export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const raw =
    words.length === 1
      ? meaningfulChars(words[0]!).slice(0, 2).join('')
      : (meaningfulChars(words[0]!)[0] ?? '') + (meaningfulChars(words[words.length - 1]!)[0] ?? '');
  return raw.toUpperCase() || '?';
}

/** Deterministic 32-bit FNV-1a hash — stable across runs and platforms. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable palette colour for a seed (use the user id) — same seed → same colour. */
export function avatarColor(seed: string): string {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length]!;
}

export interface InitialsAvatarData {
  initials: string;
  backgroundColor: string;
  textColor: string;
}

/** Everything a monogram avatar needs, from a display name + a stable id. */
export function initialsAvatar(name: string, seed: string): InitialsAvatarData {
  return { initials: deriveInitials(name), backgroundColor: avatarColor(seed), textColor: AVATAR_TEXT_COLOR };
}
