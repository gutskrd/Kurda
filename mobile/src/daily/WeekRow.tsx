import { StyleSheet, Text, View } from 'react-native';
import { hueSteps, recentDays, streakWeek, weekdayName, type TodayDay, type WeekDay } from '@kurda/shared';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** This week's seven days from the view's fourteen, laid out as the streak's week (shared `streakWeek`). */
export function thisWeek(days: readonly TodayDay[], today: string, startsOn: number): WeekDay[] {
  return streakWeek({ today, recent: recentDays(days), startsOn });
}

const DOT = 36;
const MINI = 9;

/**
 * The week in reading order, as on the website: each day's initial over a circle, filled with a check once learned,
 * with a snowflake when a freeze kept it, today ringed, the rest empty. Read out as one line: the days learned and
 * kept. `mini` is the home card's: the circles alone, the card saying the rest.
 */
export function WeekRow({ week, mini = false }: { week: readonly WeekDay[]; mini?: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ice = hueSteps(scheme, 'blue');
  const size = mini ? MINI : DOT;
  const dot = (day: WeekDay) => [
    { width: size, height: size, borderRadius: radii.pill },
    day.state === 'learned'
      ? { backgroundColor: colors.gold }
      : day.state === 'frozen'
        ? { backgroundColor: ice.wash }
        : day.state === 'missed'
          ? { backgroundColor: colors.controlTrack }
          : { borderWidth: day.state === 'today' ? (mini ? 2 : 2.5) : 1.5, borderColor: day.state === 'today' ? colors.gold : colors.lockedMark },
  ];
  if (mini) {
    return (
      <View style={[styles.mini, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {week.map((day) => (
          <View key={day.date} style={dot(day)} testID={`mini-${day.state}`} />
        ))}
      </View>
    );
  }
  const learned = week.filter((d) => d.state === 'learned').length;
  const frozen = week.filter((d) => d.state === 'frozen').length;
  const label = [
    t('lesson.streak.weekLearned', { count: formatNumber(learned, locale) }),
    frozen > 0 ? t('lesson.streak.weekFrozen', { count: formatNumber(frozen, locale) }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={[styles.row, { flexDirection: dir.row }]} accessible accessibilityLabel={label} testID="daily-week">
      {week.map((day) => (
        <View key={day.date} style={styles.day} testID={`day-${day.state}`}>
          <Text style={[styles.name, { color: day.isToday ? colors.textPrimary : colors.textSecondary }, day.isToday && styles.today]} maxFontSizeMultiplier={1.3}>
            {weekdayName(day.weekday, locale, 'narrow')}
          </Text>
          <View style={[styles.dot, ...dot(day)]}>
            {day.state === 'learned' ? (
              <Icon name="check" size={18} color={colors.textOnGold} />
            ) : day.state === 'frozen' ? (
              <Icon name="ice" size={18} color={ice.deep} />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: spacing.xs + 2 },
  name: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  today: { fontWeight: typography.weights.bold },
  dot: { alignItems: 'center', justifyContent: 'center' },
  mini: { gap: 4, alignItems: 'center' },
});
