import { StyleSheet, Text, View } from 'react-native';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { learningStats, streakLabelKey, type Streak } from './format';

/**
 * The streak's whole story, in a sheet: how long it is, and beside it the
 * three numbers a missed day never takes away — the longest run, the days
 * learned in all, and the freezes learning has earned, with what one costs.
 *
 * The streak is the number most likely to make somebody stop just after a
 * lapse, so it never stands here alone. Opened from the fire in Learn's
 * corner and from the streak on your profile; `streak` null keeps it closed.
 */
export function StreakSheet({ streak, onClose }: { streak: Streak | null; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <BottomSheet visible={streak !== null} onClose={onClose} title={t('profile.stat.streak')}>
      {streak ? <StreakDetail streak={streak} /> : null}
    </BottomSheet>
  );
}

function StreakDetail({ streak }: { streak: Streak }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const days = streak.current;
  const lit = days > 0;
  const words = lit ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');
  const stats = learningStats(streak);
  const cells = [
    { label: t('profile.stat.longestStreak'), value: stats.longest },
    { label: t('profile.stat.daysLearned'), value: stats.daysLearned },
    { label: t('profile.stat.freezes'), value: stats.freezes },
  ];
  return (
    <View style={styles.body}>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <Fire size={48} lit={lit} />
        <Text style={[styles.words, dir.text, { color: colors.textPrimary }]}>{words}</Text>
      </View>
      <View style={[styles.cells, { flexDirection: dir.row }]}>
        {cells.map((cell) => (
          <View key={cell.label} style={[styles.cell, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${cell.value} ${cell.label}`}>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatNumber(cell.value, locale)}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('profile.freezeHint', { count: stats.sessionsPerFreeze })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  head: { alignItems: 'center', gap: spacing.sm },
  words: { flex: 1, ...display(typography.sizes.xl) },
  cells: { gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.md },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, textAlign: 'center' },
  hint: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
