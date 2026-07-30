import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
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
  const pct = Math.round(results.accuracy * 100);
  const promptFor = (id: string) => exercises.find((e) => e.id === id)?.prompt ?? id;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.emoji}>{failed ? '💔' : '🎉'}</Text>
      <Text style={styles.title}>{failed ? 'Out of hearts' : 'Lesson complete!'}</Text>

      <View style={styles.stats}>
        <Stat label="XP" value={`+${results.xpAwarded}`} tone="accent" />
        <Stat label="Accuracy" value={`${pct}%`} tone="primary" />
        <Stat label="Correct" value={`${results.correct}/${results.total}`} tone="primary" />
      </View>

      <StreakBadge streak={results.streak} />

      {results.mistakes.length > 0 ? (
        <View style={styles.mistakes}>
          <Text style={styles.mistakesTitle}>Review</Text>
          {results.mistakes.map((m) => (
            <View key={m.exerciseId} style={styles.mistakeRow}>
              <Text style={styles.mistakePrompt}>{promptFor(m.exerciseId)}</Text>
              <Text style={styles.mistakeVerdict}>{m.verdict}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable onPress={onDone} style={styles.done}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'primary' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === 'accent' ? styles.accent : styles.primary]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    backgroundColor: colors.background,
  },
  emoji: { fontSize: 56 },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  stats: { flexDirection: 'row', gap: spacing.lg },
  stat: { alignItems: 'center', minWidth: 72 },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  accent: { color: colors.accent },
  primary: { color: colors.primary },
  statLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  mistakes: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  mistakesTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  mistakeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  mistakePrompt: { flex: 1, fontSize: typography.sizes.md, color: colors.textPrimary },
  mistakeVerdict: { fontSize: typography.sizes.sm, color: colors.danger, textTransform: 'uppercase' },
  done: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
