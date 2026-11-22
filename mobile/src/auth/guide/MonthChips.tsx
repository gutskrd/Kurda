import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useFontScale } from '../../a11y/useFontScale';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { PressableScale } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { MONTH_KEYS } from '../birthMonth';

/**
 * The twelve months as chips for a birth month: one tap, none chosen at first so nothing suggests an answer, announced
 * as one group of choices. Names come from the catalogue, since the phone's locale data may have no Kurdish.
 *
 * Three to a row where every month's longest word fits its chip, two where one does not. A two-word name takes a second
 * line, since cut to one several months would read alike (Soranî's January and December both "کانوونی …").
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
  const fontScale = useFontScale();
  const [width, setWidth] = useState(0);
  const months = useMemo(() => MONTH_KEYS.map((key, i) => ({ month: i + 1, label: t(key) })), [t]);
  const columns = monthColumns(width, fontScale, months.map((m) => m.label));
  return (
    <View
      style={[styles.grid, { flexDirection: dir.row }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="radiogroup"
      testID="month-chips"
    >
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
            style={[
              styles.chip,
              columns === 3 ? styles.third : styles.half,
              { backgroundColor: chosen ? colors.primary : colors.controlTrack },
              disabled && styles.dim,
            ]}
          >
            <Text style={[styles.label, { color: chosen ? colors.textOnPrimary : colors.textPrimary }, chosen && styles.labelChosen]} numberOfLines={2}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A letter at the chips' size, taken a little wide, so the estimate errs on the side of the word. */
const LETTER = 0.6;
const GAP = spacing.sm;
const PAD = spacing.sm;

/**
 * Three chips to a row, or two: three where every month's longest single word fits a third of the grid (words cannot be
 * broken; two words can wrap). `width` is the grid's own, 0 before layout, when three is assumed; `fontScale` the
 * reader's text size.
 */
export function monthColumns(width: number, fontScale: number, labels: readonly string[]): 2 | 3 {
  if (width <= 0) return 3;
  const room = (width - GAP * 2) / 3 - PAD * 2;
  const longest = Math.max(0, ...labels.flatMap((label) => label.split(/\s+/).map((word) => [...word].length)));
  return longest * typography.sizes.text * LETTER * fontScale <= room ? 3 : 2;
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: GAP },
  chip: {
    flexGrow: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.sm,
    paddingHorizontal: PAD,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Three to a row, or two, with the gaps between them.
  third: { flexBasis: '31%' },
  half: { flexBasis: '46%' },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, textAlign: 'center' },
  labelChosen: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.5 },
});
