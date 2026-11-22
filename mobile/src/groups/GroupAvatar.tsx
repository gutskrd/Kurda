import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../api/env';
import { scaledFontSize } from '../a11y/dynamicType';
import { useFontScale } from '../a11y/useFontScale';
import { useI18n } from '../i18n/I18nContext';
import { deriveInitials } from '../profile/initials';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

/**
 * A group's picture, or its initials in ink on grey, in a rounded square, as on the website: people are circles
 * everywhere in the app, so the shape alone says which. A picture that will not load falls back to the initials.
 */
export function GroupAvatar({ name, size, photoUrl }: { name: string; size: number; photoUrl?: string | null }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  // Honours Dynamic Type, but tightly, so the letters stay inside the square. Above the early return, since a failing
  // picture swaps the branch and the hook count must not change.
  const fontScale = useFontScale({ max: 1.15 });
  const box = { width: size, height: size, borderRadius: groupRadius(size) };
  const uri = assetUrl(photoUrl);
  if (uri && !broken) {
    return <Image source={{ uri }} onError={() => setBroken(true)} accessibilityRole="image" accessibilityLabel={t('profile.avatarOf', { name })} style={box} />;
  }
  const initials = deriveInitials(name);
  const letters = size >= 56 ? typography.sizes.title : typography.sizes.text;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('profile.avatarOf', { name })}
      style={[styles.box, box, { backgroundColor: colors.controlTrack }]}
    >
      <Text allowFontScaling={false} style={[styles.text, { color: colors.textPrimary, fontSize: scaledFontSize(letters, fontScale) }]}>
        {initials}
      </Text>
    </View>
  );
}

/** The corner of a group's square: about a fifth of its side, as an app icon's. */
const groupRadius = (size: number): number => Math.round(size * 0.22);

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: typography.fontFamily, fontWeight: typography.weights.bold, includeFontPadding: false },
});
