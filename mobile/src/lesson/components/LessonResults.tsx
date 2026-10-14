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
  /** exercises put off ("can't listen now") and never answered this time */
  skipped?: number;
  onDone: () => void;
}

/**
 * End-of-lesson summary: XP, accuracy, streak, and every mistake with the
 * question and its right answer — a list of misses without their answers
 * told the learner what they got wrong and not what was right.
 *
 * An exercise put off is neither a mistake nor a right answer: the server
 * leaves it out of the score, so "3/3" with one put off is a perfect score of
 * the three answered. The note says how many were put off, as the web's does.
 */
export function LessonResults({ results, exercises, skipped = 0, onDone }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const pct = Math.round(results.accuracy * 100);
  const mistakes = results.mistakes ?? [];
  const promptFor = (id: string, prompt?: string) => prompt ?? exercises.find((e) => e.id === id)?.prompt ?? '';

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Icon name="trophy" size={64} color={colors.gold} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('lesson.complete')}</Text>

      <View style={styles.stats}>
        <Stat label="XP" value={`+${results.xpAwarded}`} tone="accent" />
        <Stat label={t('lesson.accuracy')} value={`${pct}%`} tone="primary" />
        <Stat label={t('lesson.correct')} value={`${results.correct}/${results.total}`} tone="primary" />
      </View>

      <StreakBadge streak={results.streak} />

      {skipped > 0 ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>{t('lesson.skipped', { count: skipped })}</Text>
      ) : null}

      {mistakes.length > 0 ? (
        <View style={[styles.mistakes, { backgroundColor: colors.controlTrack }]}>
          <Text style={[styles.mistakesTitle, { color: colors.textPrimary }]}>{t('lesson.review')}</Text>
          {mistakes.map((m) => (
            <View key={m.exerciseId} style={styles.mistakeRow}>
              {promptFor(m.exerciseId, m.prompt) ? (
                <Text style={[styles.mistakePrompt, { color: colors.textSecondary }]}>{promptFor(m.exerciseId, m.prompt)}</Text>
              ) : null}
              {m.correction ? (
                <Text style={[styles.mistakeAnswer, { color: colors.textPrimary }]}>
                  {t('lesson.answer')} <Text style={styles.mistakeAnswerValue}>{m.correction}</Text>
                </Text>
              ) : null}
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
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.lg },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.sm },
  mistakes: {
    alignSelf: 'stretch',
    gap: spacing.md,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  mistakesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  mistakeRow: { gap: spacing.xs },
  mistakePrompt: { fontSize: typography.sizes.sm },
  mistakeAnswer: { fontSize: typography.sizes.md },
  mistakeAnswerValue: { fontWeight: typography.weights.bold },
});
