import './groups.css';
import { initialsOf } from '../lib/initials';

/**
 * A group's picture: the uploaded one, or its initials in ink on grey (lib/initials.ts, as on the phone). Always a
 * rounded square, since people are circles, so the shape alone says "a group".
 */
export function GroupAvatar({
  name,
  photoUrl,
  size = 40,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  /** The side length in pixels. */
  size?: number;
  className?: string;
}): React.JSX.Element {
  const style = {
    width: size,
    height: size,
    // Square enough to read as a group, soft enough to sit beside the round faces.
    borderRadius: Math.round(size * 0.22),
    fontSize: size >= 56 ? 'var(--text-title)' : 'var(--text)',
  };
  // The group's name is always written beside its picture, so the picture is hidden from screen readers.
  return (
    <span className={`group-pic${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" loading="lazy" decoding="async" /> : initialsOf(name)}
    </span>
  );
}
