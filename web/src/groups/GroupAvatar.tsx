import './groups.css';

/**
 * A group's picture: the one the owner or an admin put up, or the group's
 * initials on a colour of its own.
 *
 * Always a rounded square, never a circle. A person is a circle everywhere in
 * the app, so the shape alone says "a group" before the name is read — in the
 * list of conversations, in a thread's header, in discovery. The phone draws
 * the same shape (mobile/src/groups).
 *
 * The initials and their colours are the phone's own (mobile/src/profile/
 * initials.ts): the same group wears the same colour on both, and every
 * colour keeps white letters at AA contrast.
 */
const COLOURS = ['#2D6A4F', '#1B6E8C', '#8E44AD', '#C0392B', '#8A5A0B', '#2C3E50', '#147D6F', '#A83279'] as const;

/** A word's letters and numbers; every character when it has none, so an emoji-only name still shows something. */
function meaningful(word: string): string[] {
  const all = Array.from(word);
  const letters = all.filter((c) => /[\p{L}\p{N}]/u.test(c));
  return letters.length > 0 ? letters : all;
}

/** One or two letters: the first of the first and last words, or the first two of a single word. */
export function groupInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const raw =
    words.length === 1
      ? meaningful(words[0]!).slice(0, 2).join('')
      : (meaningful(words[0]!)[0] ?? '') + (meaningful(words[words.length - 1]!)[0] ?? '');
  return raw.toUpperCase() || '?';
}

/** FNV-1a, as the phone hashes: the same id lands on the same colour there and here. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function groupColour(id: string): string {
  return COLOURS[hash(id) % COLOURS.length]!;
}

export function GroupAvatar({
  id,
  name,
  photoUrl,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  /** pixels, square */
  size?: number;
  className?: string;
}): React.JSX.Element {
  const style = {
    width: size,
    height: size,
    // a fifth of the side and a bit: square enough to read as a group, soft enough to sit beside the round faces
    borderRadius: Math.round(size * 0.22),
    fontSize: Math.max(11, Math.round(size * 0.36)),
    ...(photoUrl ? {} : { background: groupColour(id) }),
  };
  // the group's name is always written beside its picture, so the picture says nothing more to a screen reader
  return (
    <span className={`group-pic${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" loading="lazy" decoding="async" /> : groupInitials(name)}
    </span>
  );
}
