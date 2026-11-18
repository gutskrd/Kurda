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
import { useArtOverrides } from '../art/overrides';
import { profilePictureUrl } from './cosmetics';
import { Icon } from '../theme/Icon';

/**
 * Monogram avatar for a user without a profile photo: a stable colour per `id` and 1–2 initials from `name`, or a
 * person glyph when there is no name. The logic and its contrast are tested in initials.ts.
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
  /** When set, the user's profile photo is shown instead of the monogram. */
  photoUrl?: string | null;
}) {
  const { t } = useI18n();
  // A photo that will not load falls back to the monogram rather than an empty circle (the server sends site-relative
  // paths for stock avatars). A default avatar replaced in the admin falls back to the shipped one first.
  const [broken, setBroken] = useState<readonly string[]>([]);
  const { initials, backgroundColor: baseColor, textColor } = initialsAvatar(name, id);
  // Honours Dynamic Type, but tightly, so the monogram stays inside the circle. Above the early return, since a failing
  // photo swaps the branch and the hook count must not change.
  const fontScale = useFontScale({ max: 1.15 });
  const overrides = useArtOverrides();

  const resolved = [profilePictureUrl(photoUrl, overrides), assetUrl(photoUrl)].find((url): url is string => !!url && !broken.includes(url));
  if (resolved) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setBroken((b) => [...b, resolved])}
        accessibilityRole="image"
        accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.photoLabel')}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style as StyleProp<ImageStyle>]}
      />
    );
  }
  // The palette is already AA against white; this nudges it to AAA (7:1) for low-vision users, deterministically.
  const backgroundColor = ensureContrast(baseColor, textColor, AAA_NORMAL);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.avatar')}
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor }, style]}
    >
      {name.trim() ? (
        <Text
          allowFontScaling={false}
          style={[styles.text, { color: textColor, fontSize: scaledFontSize(Math.round(size * 0.4), fontScale) }, textStyle]}
        >
          {initials}
        </Text>
      ) : (
        <Icon name="person" size={Math.round(size * 0.5)} color={textColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: typography.fontFamily, fontWeight: typography.weights.bold, includeFontPadding: false },
});
