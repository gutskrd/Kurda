import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { SkeletonList } from '../theme/Skeleton';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { BackButton } from '../navigation/BackButton';
import { GoalPicker } from '../goals/GoalPicker';
import { ProgressRing } from '../goals/ProgressRing';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { SkillNodeView } from '../coursemap/SkillNodeView';
import { WordOfDayCard } from '../dictionary/WordOfDayCard';
import { DailyRewardCard } from '../rewards/DailyRewardCard';
import { EventBanner } from '../events/EventBanner';
import { flattenMaps, isLaunchable, stateHint, type MapRow } from '../coursemap/node';
import type { CourseMap, CourseSummary, SkillNode } from '../coursemap/types';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';

/**
 * Learn tab (KUR-040): the daily-goal ring + a scrollable skill-tree map of
 * every course, virtualized for large courses. Tapping an unlocked skill opens
 * its next lesson; a locked skill explains its unlock condition.
 */
/** `onBack` is how you leave: this is a pushed screen, not a tab, since #809. */
export function LearnScreen({ onBack }: { onBack: () => void }) {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [maps, setMaps] = useState<CourseMap[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setFailed(false);
      setLoading(true);
      void client.get<DailyGoalStatus>('/me/daily-goal').then((res) => {
        if (active && res.ok) setGoal(res.data);
      });
      void (async () => {
        const list = await client.get<{ courses: CourseSummary[] }>('/courses');
        if (!active) return;
        if (!list.ok) {
          setFailed(true);
          setLoading(false);
          return;
        }
        // every course, in the order the server lists them — not only the first
        const loaded = await Promise.all(list.data.courses.map((c) => client.get<CourseMap>(`/courses/${c.id}/map`)));
        if (!active) return;
        if (loaded.some((m) => !m.ok)) setFailed(true);
        setMaps(loaded.flatMap((m) => (m.ok ? [m.data] : [])));
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [client, reloadKey]),
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
        const hint = stateHint(node.state);
        Alert.alert(node.title, hint ? t(hint) : t('learn.notAvailableYet'));
      }
    },
    [navigation, t],
  );

  const header = (
    <View style={styles.header}>
      <LargeTitle left={<BackButton onPress={onBack} />} title={t('nav.learn')} />
      {goal ? (
        <View style={styles.goalCard}>
          <ProgressRing progress={goal.progress} completed={goal.completed} caption={`${goal.earnedXp} / ${goal.effectiveGoal} XP`} />
          <GoalPicker value={goal.goal} onChange={changeGoal} />
        </View>
      ) : null}
      <ClayButton label={t('practice.title')} icon="bolt" tone="primary" onPress={() => navigation.navigate('Practice')} style={styles.practice} />
      <EventBanner />
      <DailyRewardCard />
      <WordOfDayCard />
    </View>
  );

  const renderRow = ({ item }: { item: MapRow }) =>
    item.kind === 'course' ? (
      <Text accessibilityRole="header" style={[styles.courseTitle, { color: colors.textPrimary }]}>{item.title}</Text>
    ) : item.kind === 'header' ? (
      <Text style={[styles.unitHeader, { color: colors.textSecondary }]}>{item.title}</Text>
    ) : (
      <SkillNodeView node={item.node} onPress={() => onNode(item.node)} />
    );

  const rows = maps ? flattenMaps(maps) : [];

  if (failed && rows.length === 0) {
    return (
      <GradientBackground>
        <ErrorRetry onRetry={() => setReloadKey((k) => k + 1)} />
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <FlatList
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <SkeletonList style={{ marginTop: spacing.md }} />
          ) : (
            <EmptyState title={t('learn.noCourses')} />
          )
        }
        // virtualization tuning for large courses (100+ nodes)
        initialNumToRender={12}
        windowSize={11}
        removeClippedSubviews
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.xs },
  header: { gap: spacing.md, marginBottom: spacing.md },

  goalCard: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  practice: { alignSelf: 'stretch' },
  courseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  unitHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});
