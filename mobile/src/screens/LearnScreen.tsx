import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { GoalPicker } from '../goals/GoalPicker';
import { ProgressRing } from '../goals/ProgressRing';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Learn tab. Shows the daily-goal ring (KUR-032). The lesson map / skill
 * tree is a later issue (KUR-040); until it lands this screen also lets you
 * open a published lesson by id.
 */
export function LearnScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [lessonId, setLessonId] = useState('');
  const trimmed = lessonId.trim();

  // refetch whenever the tab regains focus (e.g. returning from a lesson)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client.get<DailyGoalStatus>('/me/daily-goal').then((res) => {
        if (active && res.ok) setGoal(res.data);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

  const changeGoal = useCallback(
    async (next: GoalOption) => {
      setGoal((g) => (g ? { ...g, goal: next } : g)); // optimistic
      const res = await client.put<DailyGoalStatus>('/me/daily-goal', { goal: next });
      if (res.ok) setGoal(res.data);
    },
    [client],
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Learn</Text>

      {goal ? (
        <View style={styles.goalCard}>
          <ProgressRing
            progress={goal.progress}
            completed={goal.completed}
            caption={`${goal.earnedXp} / ${goal.effectiveGoal} XP`}
          />
          <Text style={styles.goalHint}>
            {goal.completed ? 'Daily goal reached — nice work!' : 'Daily goal'}
          </Text>
          <GoalPicker value={goal.goal} onChange={changeGoal} />
        </View>
      ) : null}

      <Pressable onPress={() => navigation.navigate('Practice')} style={styles.practice}>
        <Text style={styles.practiceText}>⚡ Practice</Text>
      </Pressable>

      <View style={styles.launcher}>
        <Text style={styles.launcherHint}>Open a lesson by id (lesson map coming soon).</Text>
        <TextInput
          value={lessonId}
          onChangeText={setLessonId}
          placeholder="Lesson id"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Lesson id"
        />
        <Pressable
          disabled={trimmed.length === 0}
          onPress={() => navigation.navigate('Lesson', { lessonId: trimmed })}
          style={[styles.start, trimmed.length === 0 && styles.disabled]}
        >
          <Text style={styles.startText}>Start lesson</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.primary },
  goalCard: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  goalHint: { fontSize: typography.sizes.md, color: colors.textSecondary },
  practice: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  practiceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textOnPrimary },
  launcher: { alignSelf: 'stretch', gap: spacing.sm },
  launcherHint: { fontSize: typography.sizes.sm, color: colors.textSecondary, textAlign: 'center' },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  start: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  startText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
