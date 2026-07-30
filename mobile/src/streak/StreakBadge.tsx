import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { useEventTheme } from '../theme/EventThemeContext';
import { flameSkin, themeAccent } from '../theme/eventThemes';
import { isFlameLit, streakLabel, type Streak } from './format';

/**
 * Flame + day count (KUR-031). Lit while the run is alive; dimmed when the
 * streak has lapsed to 0. Shows a snowflake when a freeze is banked. While an
 * event theme is active (KUR-092) the lit flame gets the event skin + accent.
 */
export function StreakBadge({ streak }: { streak: Streak }) {
  const lit = isFlameLit(streak.current);
  const { pack } = useEventTheme();
  return (
    <View
      style={[styles.badge, lit ? styles.badgeLit : styles.badgeCold, lit && pack ? { backgroundColor: themeAccent(pack, colors.accent) } : null]}
    >
      <Text style={styles.flame}>{lit ? flameSkin(pack) : '🕯️'}</Text>
      <Text style={[styles.count, lit ? styles.countLit : styles.countCold]}>
        {streakLabel(streak.current)}
      </Text>
      {streak.freezes > 0 ? <Text style={styles.freeze}>❄️</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  badgeLit: { backgroundColor: colors.accent },
  badgeCold: { backgroundColor: colors.surface },
  flame: { fontSize: typography.sizes.lg },
  count: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  countLit: { color: colors.textOnPrimary },
  countCold: { color: colors.textSecondary },
  freeze: { fontSize: typography.sizes.sm },
});
