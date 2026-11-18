/**
 * Monograms, pure and deterministic: a 1–2 character monogram from a name and a stable background colour from an id, for
 * a group without a picture (groups/GroupAvatar.tsx) and the people in a lesson's conversation. People without a photo
 * wear the default avatar instead (profile/Avatar.tsx). Kurdish Latin diacritics (ê î û ç ş) are preserved.
 */
import { TONES } from '../coursemap/path';

const tone = TONES.light;

/**
 * The monogram's grounds: the course's own colours, as the lesson path paints a unit by day. Seven tones fill eight
 * slots; the eighth is the river's deeper edge. The deep by-day fills in both schemes, since the monogram is white in
 * both; saffron gives its deeper edge, since its gold fill cannot carry white. Each meets WCAG AA (4.5:1) against white
 * (initials.test.ts). The order and the count map an id to a colour: changing either changes everybody's.
 */
export const AVATAR_COLORS = [
  tone.meadow.fill,
  tone.river.fill,
  tone.dusk.fill,
  tone.clay.fill,
  tone.saffron.lip,
  tone.river.lip,
  tone.pine.fill,
  tone.rose.fill,
] as const;

export const AVATAR_TEXT_COLOR = '#FFFFFF';

/**
 * A word's letter and number characters (no @, punctuation or emoji), falling back to every character for a word with
 * none, so an emoji-only name still yields something. Array.from keeps surrogate pairs intact.
 */
function meaningfulChars(word: string): string[] {
  const all = Array.from(word);
  const letters = all.filter((c) => /[\p{L}\p{N}]/u.test(c));
  return letters.length > 0 ? letters : all;
}

/**
 * A 1–2 character monogram: the first characters of the first and last words, or a single word's first two. Blank input
 * gives '?'. Uppercased (ş→Ş, î→Î).
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

/** Deterministic 32-bit FNV-1a hash, stable across runs and platforms. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stable palette colour for a seed (use the user id). */
export function avatarColor(seed: string): string {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length]!;
}

export interface AvatarData {
  initials: string;
  backgroundColor: string;
  textColor: string;
}

/** Everything a monogram avatar needs, from a display name and a stable id. */
export function initialsAvatar(name: string, seed: string): AvatarData {
  return { initials: deriveInitials(name), backgroundColor: avatarColor(seed), textColor: AVATAR_TEXT_COLOR };
}
