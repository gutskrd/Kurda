import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { GoalPicker } from '../goals/GoalPicker';
import { ProgressRing } from '../goals/ProgressRing';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { SkillNodeView } from '../coursemap/SkillNodeView';
import { flattenMap, isLaunchable, stateHint, type MapRow } from '../coursemap/node';
import type { CourseMap, CourseSummary, SkillNode } from '../coursemap/types';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Learn tab (KUR-040): the daily-goal ring + a scrollable skill-tree map of
 * the course, virtualized for large courses. Tapping an unlocked skill opens
 * its next lesson; a locked skill explains its unlock condition.
 */
export function LearnScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [map, setMap] = useState<CourseMap | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client.get<DailyGoalStatus>('/me/daily-goal').then((res) => {
        if (active && res.ok) setGoal(res.data);
      });
      void (async () => {
        const list = await client.get<{ courses: CourseSummary[] }>('/courses');
        if (!active) return;
        const first = list.ok ? list.data.courses[0] : undefined;
        if (first) {
          const m = await client.get<CourseMap>(`/courses/${first.id}/map`);
          if (active && m.ok) setMap(m.data);
        }
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [client]),
  );

  const changeGoal = useCallback(
    async (next: GoalOption) => {
      setGoal((g) => (g ? { ...g, goal: next } : g));
      const res = await client.put<DailyGoalStatus>('/me/daily-goal', { goal: next });
      if (res.ok) setGoal(res.data);
    },
    [client],
  );

  const onNode = useCallback(
    (node: SkillNode) => {
      if (isLaunchable(node) && node.firstLessonId) {
        navigation.navigate('Lesson', { lessonId: node.firstLessonId });
      } else {
        Alert.alert(node.title, stateHint(node.state) ?? 'Not available yet.');
      }
    },
    [navigation],
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Learn</Text>
      {goal ? (
        <View style={styles.goalCard}>
          <ProgressRing progress={goal.progress} completed={goal.completed} caption={`${goal.earnedXp} / ${goal.effectiveGoal} XP`} />
          <GoalPicker value={goal.goal} onChange={changeGoal} />
        </View>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Practice')} style={styles.practice}>
        <Text style={styles.practiceText}>⚡ Practice</Text>
      </Pressable>
      {map ? <Text style={styles.courseTitle}>{map.course.title}</Text> : null}
    </View>
  );

  const renderRow = ({ item }: { item: MapRow }) =>
    item.kind === 'header' ? (
      <Text style={styles.unitHeader}>{item.title}</Text>
    ) : (
      <SkillNodeView node={item.node} onPress={() => onNode(item.node)} />
    );

  const rows = map ? flattenMap(map) : [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <Text style={styles.empty}>No course content yet.</Text>
        )
      }
      // virtualization tuning for large courses (100+ nodes)
      initialNumToRender={12}
      windowSize={11}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xs },
  header: { gap: spacing.md, marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.primary },
  goalCard: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  practice: { alignSelf: 'stretch', backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  practiceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textOnPrimary },
  courseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary, marginTop: spacing.sm },
  unitHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
});
