import type { StyleProp, ViewStyle } from 'react-native';
import { InitialsAvatar } from '../profile/InitialsAvatar';

/**
 * A group's picture, or its initials on its own colour — in a rounded square,
 * never a circle. People are circles everywhere in the app; a group drawn the
 * same way reads as a person with that name, so the shape alone says which.
 */
export function GroupAvatar({
  name,
  id,
  size,
  photoUrl,
  style,
}: {
  name: string;
  id: string;
  size: number;
  photoUrl?: string | null;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <InitialsAvatar name={name} id={id} size={size} photoUrl={photoUrl} style={[{ borderRadius: groupRadius(size) }, style]} />;
}

/** The corner of a group's square: about a fifth of its side, as an app icon's. */
export const groupRadius = (size: number): number => Math.round(size * 0.22);
