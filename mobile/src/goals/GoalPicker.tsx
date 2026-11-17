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

/** How much of the violet the chosen goal is, as the last two digits of its colour: the tab bar's own wash. */
const CHOSEN_WASH = '1F';

/**
 * The day's goal, one of four: 10, 20, 30 or 50 XP.
 *
 * Drawn as the app draws a choice of one among a few: four places on a quiet
 * track, the one chosen a wash of the violet with its number in the violet,
 * as the tab you are on is, and the others in the page's grey. It was the one
 * chosen ringed in the page's ink and the rest ringed in the glass's white,
 * which on a white sheet is no ring at all: three numbers floating on
 * nothing beside one in a box. The numbers are the reader's own digits, and
 * the places run from the reading side.
 *
 * A screen reader hears it as what it is, one choice of four: each place a
 * radio named for what it means ("20 XP a day", where a bare "20" said
 * nothing), and the goal set is the one checked.
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
              // a tick for a new goal, nothing for the one already set
              if (!selected) haptic('select');
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            accessibilityLabel={t('learn.today.goalOption', { xp: formatNumber(option, locale) })}
            style={[styles.segment, selected && { backgroundColor: `${colors.primary}${CHOSEN_WASH}` }]}
          >
            <Text
              style={[styles.label, selected && styles.chosen, { color: selected ? colors.primary : colors.textSecondary }]}
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
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, fontVariant: ['tabular-nums'] },
  chosen: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.5 },
});
