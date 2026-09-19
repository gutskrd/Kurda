import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { display } from '../../theme/fonts';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { ClayButton } from '../../theme/glass';
import { useI18n } from '../../i18n/I18nContext';
import { StreakBadge } from '../../streak/StreakBadge';
import type { Exercise, SessionResults } from '../types';

interface Props {
  results: SessionResults;
  exercises: Exercise[];
  failed: boolean;
  onDone: () => void;
}

/** End-of-lesson summary: XP, accuracy, streak, and a mistakes review. */
export function LessonResults({ results, exercises, failed, onDone }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const pct = Math.round(results.accuracy * 100);
  const promptFor = (id: string) => exercises.find((e) => e.id === id)?.prompt ?? id;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Icon name={failed ? 'heart' : 'trophy'} size={64} color={failed ? colors.danger : colors.gold} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{failed ? t('lesson.outOfHearts') : t('lesson.complete')}</Text>

      <View style={styles.stats}>
        <Stat label="XP" value={`+${results.xpAwarded}`} tone="accent" />
        <Stat label={t('lesson.accuracy')} value={`${pct}%`} tone="primary" />
        <Stat label={t('lesson.correct')} value={`${results.correct}/${results.total}`} tone="primary" />
      </View>

      <StreakBadge streak={results.streak} />

      {results.mistakes.length > 0 ? (
        <View style={[styles.mistakes, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
          <Text style={[styles.mistakesTitle, { color: colors.textPrimary }]}>{t('lesson.review')}</Text>
          {results.mistakes.map((m) => (
            <View key={m.exerciseId} style={styles.mistakeRow}>
              <Text style={[styles.mistakePrompt, { color: colors.textPrimary }]}>{promptFor(m.exerciseId)}</Text>
              <Text style={[styles.mistakeVerdict, { color: colors.danger }]}>{m.verdict}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onDone} />
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'primary' }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tone === 'accent' ? colors.accent : colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: { ...display(typography.sizes.xxl) },
  stats: { flexDirection: 'row', gap: spacing.lg },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.sm },
  mistakes: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  mistakesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  mistakeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  mistakePrompt: { flex: 1, fontSize: typography.sizes.md },
  mistakeVerdict: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
});
