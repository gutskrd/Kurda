import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';

/**
 * An icon in a header: the "+" on Home, the bell, the new-message pencil, the
 * profile's menu.
 *
 * Every one of these was drawn on its own — a 44pt filled circle for posting,
 * a bare 22pt glyph with a hit slop for the menu, a 20pt icon in a pill for
 * the bell — so the corners of the five tabs disagreed about how big a
 * header control is. This is the one shape: a 44pt square target, a 24pt
 * glyph, no fill until it is pressed.
 *
 * `dot` marks something new without a number (the bell); `badge` is a count
 * where the number matters. The label says either in words, because the dot
 * alone is colour and a screen reader cannot see it.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  dot = false,
  badge,
  edge,
  testID,
}: {
  icon: IconName;
  /** What a screen reader says, including whatever the dot means. */
  label: string;
  onPress: () => void;
  dot?: boolean;
  badge?: string | null;
  /**
   * At the very start or end of a header, the button reaches past the gutter
   * by the room around its glyph, so the glyph itself lines up with the
   * page's edge — a 24pt icon in a 44pt target otherwise sits 10pt further in
   * than the title beside it.
   */
  edge?: 'start' | 'end';
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  // the end is the left in a right-to-left language, where the header is mirrored
  const mirrored = useDirection().row === 'row-reverse';
  const side = edge ? ((edge === 'end') !== mirrored ? styles.edgeRight : styles.edgeLeft) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        side,
        pressed && { backgroundColor: colors.controlTrack },
      ]}
    >
      <Icon name={icon} size={24} color={colors.textPrimary} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.goldText, borderColor: colors.background }]} pointerEvents="none">
          <Text style={[styles.badgeText, { color: colors.textOnPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {badge}
          </Text>
        </View>
      ) : dot ? (
        <View
          style={[styles.dot, { backgroundColor: colors.goldText, borderColor: colors.background }]}
          pointerEvents="none"
          testID={testID ? `${testID}-dot` : undefined}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeLeft: { marginLeft: -(MIN_TOUCH_TARGET - 24) / 2 },
  edgeRight: { marginRight: -(MIN_TOUCH_TARGET - 24) / 2 },
  // over the glyph's top-end corner, ringed in the page colour so it reads as
  // sitting on the icon rather than touching it
  dot: { position: 'absolute', top: 9, end: 9, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  badge: {
    position: 'absolute',
    top: 4,
    end: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold },
});
