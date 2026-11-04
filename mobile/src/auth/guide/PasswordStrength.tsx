import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { STRENGTH_KEY, STRENGTH_LEVELS, passwordStrength } from './password';

/**
 * How strong the password being typed is: four short bars that light up one
 * by one as it grows, red for one, gold for two, green from three, with the
 * word for it beside them. Each bar fades in on the native driver; under
 * Reduce Motion it is simply lit. Nothing shows for an empty field. The word
 * is what a screen reader hears, as the meter changes.
 */
export function PasswordStrengthMeter({ password }: { password: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const strength = passwordStrength(password);
  const lit = useRef(Array.from({ length: STRENGTH_LEVELS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const runs = lit.map((bar, i) => {
      const to = i < strength ? 1 : 0;
      if (reduce) {
        bar.setValue(to);
        return null;
      }
      const run = timing(bar, to, duration.quick + 40, { delay: to ? i * 30 : 0 });
      run.start();
      return run;
    });
    return () => runs.forEach((run) => run?.stop());
  }, [strength, reduce, lit]);

  const colour = strength <= 1 ? colors.danger : strength === 2 ? colors.gold : colors.success;
  const word = strength === 0 ? '' : t(STRENGTH_KEY[strength]);
  return (
    <View
      style={[styles.row, { flexDirection: dir.row }]}
      accessibilityRole="text"
      accessibilityLabel={word ? t('guide.password.strength', { level: word }) : undefined}
      accessibilityLiveRegion="polite"
      testID="password-strength"
    >
      <View style={[styles.bars, { flexDirection: dir.row }]}>
        {lit.map((bar, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: colors.controlTrack }]}>
            <Animated.View style={[styles.fill, { backgroundColor: colour, opacity: bar }]} />
          </View>
        ))}
      </View>
      <Text style={[styles.word, { color: strength === 0 ? colors.textSecondary : colour }]} numberOfLines={1}>
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, minHeight: 20 },
  bars: { flex: 1, gap: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { flex: 1 },
  word: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium, minWidth: 48, textAlign: 'right' },
});
