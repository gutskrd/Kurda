import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { PressableScale } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { MONTH_KEYS } from '../birthMonth';

/**
 * The twelve months as chips, three to a row, for the month somebody was
 * born in: one tap, with none chosen to start with, so nothing on the screen
 * suggests an answer. The chosen one is the solid chip in the brand's colour,
 * and says so to a screen reader, which hears the twelve as one group of
 * choices. Month names come from the catalogue, not from the phone's locale
 * data, which may have no Kurdish.
 */
export function MonthChips({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (month: number) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const months = useMemo(() => MONTH_KEYS.map((key, i) => ({ month: i + 1, label: t(key) })), [t]);
  return (
    <View style={[styles.grid, { flexDirection: dir.row }]} accessibilityRole="radiogroup" testID="month-chips">
      {months.map(({ month, label }) => {
        const chosen = month === value;
        return (
          <PressableScale
            key={month}
            disabled={disabled}
            onPress={() => {
              if (!chosen) haptic('select');
              onChange(month);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen, disabled }}
            accessibilityLabel={label}
            style={[styles.chip, { backgroundColor: chosen ? colors.primary : colors.controlTrack }, disabled && styles.dim]}
          >
            <Text style={[styles.label, { color: chosen ? colors.textOnPrimary : colors.textPrimary }, chosen && styles.labelChosen]} numberOfLines={1}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: spacing.sm },
  // three to a row, with two gaps between them
  chip: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  labelChosen: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.5 },
});
