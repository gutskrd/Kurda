/**
 * A frame for sale, shown the way it will be worn: round the shopper's own
 * picture, on the same soft square an icon sits on. A ring with nothing in
 * it says little of how it will look, and the wardrobe already shows the
 * frames you own this way (profile/CosmeticPicker.tsx).
 *
 * Decorative: the row or the sheet it is in names the frame.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { PictureFramed, framedAvatarSize } from '../ranks/art';
import { radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function FrameArt({
  path,
  width,
  style,
}: {
  /** the site path the API sends (`/cosmetics/frames/…`) */
  path: string;
  /** the side of the square, in points */
  width: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { user } = useAuth();
  const ring = Math.round(width * 0.92);
  return (
    <View
      style={[{ width, height: width, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.controlTrack }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PictureFramed url={path} size={ring}>
        <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} photoUrl={user?.profilePhotoUrl} size={framedAvatarSize(ring)} />
      </PictureFramed>
    </View>
  );
}
