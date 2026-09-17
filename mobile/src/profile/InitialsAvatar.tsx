import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { typography } from '../theme/tokens';
import { AAA_NORMAL } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import { scaledFontSize } from '../a11y/dynamicType';
import { useFontScale } from '../a11y/useFontScale';
import { initialsAvatar } from './initials';
import { useI18n } from '../i18n/I18nContext';
import { assetUrl } from '../api/env';

/**
 * Monogram avatar shown when a user has no profile photo (KUR-178). Deterministic
 * colour per `id`, 1–2 char initials from `name`. Pure presentation — the logic
 * (and its a11y contrast) is unit-tested in initials.ts.
 */
export function InitialsAvatar({
  name,
  id,
  size = 44,
  style,
  textStyle,
  photoUrl,
}: {
  name: string;
  /** Stable id (e.g. user id) → the same colour every render. */
  id: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** When set, the user's profile photo is shown instead of the monogram (KUR-179). */
  photoUrl?: string | null;
}) {
  const { t } = useI18n();
  // a photo that will not load falls back to the monogram rather than to a
  // hole: the server hands out site-relative paths for the stock avatars, and
  // an empty circle reads as a bug to everyone who sees it
  const [broken, setBroken] = useState(false);
  const { initials, backgroundColor: baseColor, textColor } = initialsAvatar(name, id);
  // honour Dynamic Type, but tightly so the monogram stays inside the circle.
  // Above the early return, because a photo that fails swaps the branch mid-life
  // and a hook that only runs on one side would change the hook count.
  const fontScale = useFontScale({ max: 1.15 });

  const resolved = assetUrl(photoUrl);
  if (resolved && !broken) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setBroken(true)}
        accessibilityRole="image"
        accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.photoLabel')}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style as StyleProp<ImageStyle>]}
      />
    );
  }
  // the palette is already AA against white; nudge it to AAA (7:1) so monograms
  // stay crisp for low-vision users (deterministic — same id → same colour)
  const backgroundColor = ensureContrast(baseColor, textColor, AAA_NORMAL);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.avatar')}
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor }, style]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.text, { color: textColor, fontSize: scaledFontSize(Math.round(size * 0.4), fontScale) }, textStyle]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: typography.fontFamily, fontWeight: typography.weights.bold, includeFontPadding: false },
});
