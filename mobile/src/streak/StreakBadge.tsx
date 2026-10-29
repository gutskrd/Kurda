import { StyleSheet, Text, View } from 'react-native';
import { fireLevel } from '@kurda/shared';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Fire } from '../theme/Fire';
import { Icon } from '../theme/Icon';
import { useEventTheme } from '../theme/EventThemeContext';
import { isFlameLit, streakLabelKey, type Streak } from './format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/**
 * The streak's fire + day count (KUR-031). Burning while the run is alive, as
 * big as the streak has grown it; cold logs when the streak has lapsed to 0.
 * Shows a snowflake when a freeze is banked. While an event theme is active
 * (KUR-092) the lit fire burns in the event's accent.
 *
 * A quiet pill with the fire the streak is drawn with everywhere else
 * (Learn's "Today"). It was a dark pill with a red flame and a snowflake in
 * the page's own ink: the snowflake vanished into the pill in both schemes,
 * and red is the colour of a wrong answer, not of a kept day.
 */
export function StreakBadge({ streak }: { streak: Streak }) {
  const lit = isFlameLit(streak.current);
  const { t } = useI18n();
  const { pack } = useEventTheme();
  const { colors } = useTheme();
  const dir = useDirection();
  const days = t(streakLabelKey(streak.current), { count: streak.current });
  // the snowflake is said in words too: a picture alone tells a screen reader nothing
  const label = streak.freezes > 0 ? `${days}, ${t('profile.stat.freezes')}: ${streak.freezes}` : days;
  return (
    <View
      style={[styles.badge, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
      accessible
      accessibilityLabel={label}
    >
      <Fire size={20} level={fireLevel(streak.current)} accent={pack?.accent} />
      <Text style={[styles.count, { color: lit ? colors.textPrimary : colors.textSecondary }]}>{days}</Text>
      {streak.freezes > 0 ? <Icon name="ice" size={14} color={colors.textSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  count: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
