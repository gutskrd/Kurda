import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { typography } from '../theme/tokens';
import { AAA_NORMAL } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import { scaledFontSize } from '../a11y/dynamicType';
import { useFontScale } from '../a11y/useFontScale';
import { initialsAvatar } from './initials';

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
}: {
  name: string;
  /** Stable id (e.g. user id) → the same colour every render. */
  id: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { initials, backgroundColor: baseColor, textColor } = initialsAvatar(name, id);
  // the palette is already AA against white; nudge it to AAA (7:1) so monograms
  // stay crisp for low-vision users (deterministic — same id → same colour)
  const backgroundColor = ensureContrast(baseColor, textColor, AAA_NORMAL);
  // honour Dynamic Type, but tightly so the monogram stays inside the circle
  const fontScale = useFontScale({ max: 1.15 });
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar` : 'avatar'}
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
