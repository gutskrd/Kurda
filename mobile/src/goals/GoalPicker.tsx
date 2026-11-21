import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { GOAL_OPTIONS, type GoalOption } from './format';
import { haptic } from '../feedback/haptics';

interface Props {
  value: GoalOption;
  onChange: (goal: GoalOption) => void;
  disabled?: boolean;
}

/**
 * The daily goal, one of 10, 20, 30 or 50 XP, drawn as a segmented track with the chosen place in solid violet.
 * Screen readers hear a radio group whose options are named in full ("20 XP a day"), not as bare numbers.
 */
export function GoalPicker({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <View
      style={[styles.track, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
      accessibilityRole="radiogroup"
      testID="goal-picker"
    >
      {GOAL_OPTIONS.map((option) => {
        const selected = option === value;
        return (
          <PressableScale
            key={option}
            disabled={disabled}
            onPress={() => {
              // A tick for a new goal, nothing for the one already set.
              if (!selected) haptic('select');
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            accessibilityLabel={t('learn.today.goalOption', { xp: formatNumber(option, locale) })}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[styles.label, selected && styles.chosen, { color: selected ? colors.textOnPrimary : colors.textSecondary }]}
              maxFontSizeMultiplier={fontScaleCap.fixedBox}
            >
              {formatNumber(option, locale)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', gap: 2, padding: 3, borderRadius: radii.pill },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  chosen: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.5 },
});
