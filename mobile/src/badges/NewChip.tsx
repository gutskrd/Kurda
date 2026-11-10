import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii, typography } from '../theme/tokens';

/**
 * "New", on a badge earned since the app was last opened (the keys
 * `useFreshBadges` in BadgeCelebrationHost gives): a small gold pill at the
 * corner of the badge's tile, on the Badges page and in a profile's showcase.
 * It pops in on the bouncy spring a beat after its tile, and is simply there
 * under Reduce Motion. A screen reader reads the word; the pop is decoration.
 */
export function NewChip({ delayMs = 0, style }: { delayMs?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      scale.setValue(1);
      return;
    }
    const run = springTo(scale, 1, 'bouncy', delayMs);
    run.start();
    return () => run.stop();
  }, [reduce, scale, delayMs]);
  return (
    <Animated.View style={[styles.chip, { backgroundColor: colors.gold, transform: [{ scale }] }, style]} accessibilityRole="text" testID="badge-new">
      <Text style={[styles.text, { color: colors.textOnGold }]}>{t('badges.new')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: { position: 'absolute', top: 0, right: 0, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
});
