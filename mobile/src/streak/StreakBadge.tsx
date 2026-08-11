import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { useEventTheme } from '../theme/EventThemeContext';
import { themeAccent } from '../theme/eventThemes';
import { isFlameLit, streakLabel, type Streak } from './format';

/**
 * Flame + day count (KUR-031). Lit while the run is alive; dimmed when the
 * streak has lapsed to 0. Shows a snowflake when a freeze is banked. While an
 * event theme is active (KUR-092) the lit flame gets the event skin + accent.
 */
export function StreakBadge({ streak }: { streak: Streak }) {
  const lit = isFlameLit(streak.current);
  const { pack } = useEventTheme();
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: lit ? (pack ? themeAccent(pack, colors.accent) : colors.accent) : colors.controlTrack },
      ]}
    >
      <Icon name="flame" size={18} color={lit ? colors.danger : colors.textSecondary} />
      <Text style={[styles.count, { color: lit ? colors.textOnPrimary : colors.textSecondary }]}>
        {streakLabel(streak.current)}
      </Text>
      {streak.freezes > 0 ? <Icon name="ice" size={14} color={colors.primary} /> : null}
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
  count: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
