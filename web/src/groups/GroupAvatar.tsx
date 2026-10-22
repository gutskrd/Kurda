import './groups.css';
import { colourFor, initialsOf } from '../lib/initials';

/** One or two letters for a group's name. */
export const groupInitials = initialsOf;
/** The group's own colour, the same on the phone. */
export const groupColour = colourFor;

/**
 * A group's picture: the one the owner or an admin put up, or the group's
 * initials on a colour of its own.
 *
 * Always a rounded square, never a circle. A person is a circle everywhere in
 * the app, so the shape alone says "a group" before the name is read — in the
 * list of conversations, in a thread's header, in discovery. The phone draws
 * the same shape (mobile/src/groups).
 *
 * The initials and their colours are the phone's own (lib/initials.ts): the
 * same group wears the same colour on both.
 */
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
