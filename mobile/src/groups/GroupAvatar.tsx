import { InitialsAvatar } from '../profile/InitialsAvatar';

/**
 * A group's picture, or its initials on its own colour, in a rounded square: people are circles everywhere in the app,
 * so the shape alone says which.
 */
export function GroupAvatar({ name, id, size, photoUrl }: { name: string; id: string; size: number; photoUrl?: string | null }): React.JSX.Element {
  return <InitialsAvatar name={name} id={id} size={size} photoUrl={photoUrl} style={{ borderRadius: groupRadius(size) }} />;
}

/** The corner of a group's square: about a fifth of its side, as an app icon's. */
const groupRadius = (size: number): number => Math.round(size * 0.22);
