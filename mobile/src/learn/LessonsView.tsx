import { useCallback, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, ErrorRetry } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton } from '../theme/Skeleton';
import { Icon, type IconName } from '../theme/Icon';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { GoalPicker } from '../goals/GoalPicker';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { SkillNodeView } from '../coursemap/SkillNodeView';
import { WordOfDayCard } from '../dictionary/WordOfDayCard';
import { DailyRewardCard } from '../rewards/DailyRewardCard';
import { EventBanner } from '../events/EventBanner';
import { LeagueLine } from '../leagues/LeagueLine';
import { courseRows, isLaunchable, stateHint, type CourseEntry, type MapRow } from '../coursemap/node';
import type { CourseMap, CourseSummary, SkillNode } from '../coursemap/types';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { EmptyState } from '../theme/EmptyState';
import { streakLabelKey, type Streak } from '../streak/format';
import { fraction, nextStep, type NextStep } from './next';

/**
 * Learn's first half: the next lesson, today, the tools, and the course.
 *
 * Top to bottom in the order of what somebody opening it wants: the one next
 * step (a card with one button), how today is going, the practice tools, and
 * then the whole course map for anyone who wants to choose for themselves.
 * Continuing a lesson is one tap from here.
 *
 * Today is said plainly — how much of the daily goal is done, how long the
 * streak is — and nothing here counts down, warns, or says what could be
 * lost. Some of the people reading it are children.
 */
export function LessonsView({ scrollRef }: { scrollRef?: Ref<FlatList<MapRow>> }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const tabBarInset = useTabBarInset();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const [courses, setCourses] = useState<CourseEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setFailed(false);
      void client.get<DailyGoalStatus>('/me/daily-goal').then((res) => {
        if (active && res.ok) setGoal(res.data);
      });
      void client.get<{ user: { streak?: Streak } }>('/me').then((res) => {
        if (active && res.ok && res.data.user.streak) setStreak(res.data.user.streak);
      });
      void client.get<{ due: number }>('/practice/due').then((res) => {
        if (active && res.ok) setDue(res.data.due);
      });
      void (async () => {
        const list = await client.get<{ courses: CourseSummary[] }>('/courses');
        if (!active) return;
        if (!list.ok) {
          setFailed(true);
          setLoading(false);
          return;
        }
        // every course, in the order the server lists them — not only the
        // first; one whose map did not load stays listed, saying so (`courseRows`)
        const loaded = await Promise.all(list.data.courses.map((c) => client.get<CourseMap>(`/courses/${c.id}/map`)));
        if (!active) return;
        setCourses(
          list.data.courses.map((c, i) => {
            const map = loaded[i]!;
            return { course: { id: c.id, title: c.title }, map: map.ok ? map.data : null };
          }),
        );
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

  const step = courses ? nextStep(courses) : null;
  const rows = courses ? courseRows(courses) : [];

  if (failed && rows.length === 0) {
    return <ErrorRetry onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const header = (
    <View style={styles.header}>
      {loading && !courses ? <ContinueSkeleton /> : step ? <ContinueCard step={step} /> : null}
      <TodayCard goal={goal} streak={streak} onChangeGoal={changeGoal} />
      <View style={styles.tools}>
        <ToolTile
          icon="review"
          title={t('learn.tools.review')}
          detail={
            due === null
              ? ''
              : due === 1
                ? t('learn.tools.dueOne')
                : due > 1
                  ? t('learn.tools.due', { count: formatNumber(due, locale) })
                  : t('learn.tools.dueNone')
          }
          highlight={(due ?? 0) > 0}
          onPress={() => navigation.navigate('Practice')}
        />
        <ToolTile icon="text" title={t('nav.dictionary')} detail={t('learn.tools.dictionaryHint')} onPress={() => navigation.navigate('Dictionary')} />
      </View>
      {/* the week: the league and your place in it (or your own week), and the weekly goal */}
      <LeagueLine />
      <EventBanner />
      <DailyRewardCard />
      <WordOfDayCard />
      {rows.length > 0 ? (
        <Text style={[styles.mapLabel, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('learn.map.title')}
        </Text>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: MapRow }) =>
    item.kind === 'course' ? (
      <Text accessibilityRole="header" style={[styles.courseTitle, { color: colors.textPrimary }]}>
        {item.title}
      </Text>
    ) : item.kind === 'failed' ? (
      <View style={styles.failed}>
        <Text style={[styles.failedText, { color: colors.textSecondary }]}>{t('learn.mapFailed')}</Text>
        <ClayButton label={t('common.retry')} variant="outline" onPress={() => setReloadKey((k) => k + 1)} />
      </View>
    ) : item.kind === 'header' ? (
      <Text style={[styles.unitHeader, { color: colors.textSecondary }]}>{item.title}</Text>
    ) : (
      <SkillNodeView node={item.node} onPress={() => onNode(item.node)} />
    );

  return (
    <FlatList
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      ListEmptyComponent={loading ? null : <EmptyState title={t('learn.noCourses')} />}
      showsVerticalScrollIndicator={false}
      // virtualization tuning for large courses (100+ nodes)
      initialNumToRender={12}
      windowSize={11}
      removeClippedSubviews
    />
  );
}

/**
 * The one next step: which course and unit, the lesson's name, how far the
 * course has come, and one button.
 */
function ContinueCard({ step }: { step: NextStep }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const share = fraction(step.done, step.total);
  const where = step.kind === 'review' ? step.courseTitle : `${step.courseTitle} · ${step.unitTitle}`;
  const title = step.kind === 'review' ? t('learn.continue.allDone') : step.skill.title;
  const button =
    step.kind === 'start' ? t('learn.continue.start') : step.kind === 'review' ? t('learn.tools.review') : t('learn.continue.button');
  const go = () => (step.kind === 'review' ? navigation.navigate('Practice') : navigation.navigate('Lesson', { lessonId: step.lessonId }));
  const progress = t('learn.continue.progress', { done: formatNumber(step.done, locale), total: formatNumber(step.total, locale) });

  return (
    <View style={[styles.hero, { backgroundColor: colors.surface }]} testID="learn-continue">
      <Text style={[styles.heroWhere, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
        {where}
      </Text>
      <Text style={[styles.heroTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
      <View
        style={[styles.bar, { backgroundColor: colors.controlTrack }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={progress}
        accessibilityValue={{ min: 0, max: step.total, now: step.done }}
      >
        <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.gold }, dir.rtl && styles.barFillEnd]} />
      </View>
      <Text style={[styles.heroProgress, dir.text, { color: colors.textSecondary }]}>{progress}</Text>
      <ClayButton label={button} tone="primary" size="large" onPress={go} style={styles.heroButton} />
    </View>
  );
}

function ContinueSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: colors.surface }]}>
      <Skeleton width="45%" height={13} />
      <Skeleton width="70%" height={22} />
      <Skeleton height={6} radius={radii.pill} />
      <Skeleton height={50} radius={radii.pill} style={styles.heroButton} />
    </View>
  );
}

/**
 * How today is going, in two plain facts: the daily goal so far, and the
 * streak. The goal can be changed from here, behind a small control, because
 * it is set once and rarely touched.
 */
function TodayCard({
  goal,
  streak,
  onChangeGoal,
}: {
  goal: DailyGoalStatus | null;
  streak: Streak | null;
  onChangeGoal: (next: GoalOption) => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [picking, setPicking] = useState(false);
  if (!goal && !streak) return null;

  const goalLine = goal
    ? goal.completed
      ? t('learn.today.goalMet')
      : t('learn.today.goal', { xp: formatNumber(goal.earnedXp, locale), goal: formatNumber(goal.effectiveGoal, locale) })
    : '';
  const days = streak?.current ?? 0;
  const streakLine = days > 0 ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');

  return (
    <View style={[styles.today, { backgroundColor: colors.surface }]}>
      <View style={[styles.todayHead, { flexDirection: dir.row }]}>
        <Text style={[styles.todayLabel, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('learn.today.title')}
        </Text>
        {goal ? (
          <Pressable
            onPress={() => setPicking((p) => !p)}
            accessibilityRole="button"
            accessibilityState={{ expanded: picking }}
            accessibilityLabel={t('learn.today.goalSetting', { xp: goal.goal })}
            hitSlop={8}
            style={({ pressed }) => [styles.goalChip, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.goalChipText, { color: colors.textPrimary }]}>{t('learn.today.goalSetting', { xp: goal.goal })}</Text>
            <Icon name="chevron-down" size={12} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {goal ? (
        <View style={styles.todayRow}>
          <View style={[styles.todayFacts, { flexDirection: dir.row }]}>
            <Icon name={goal.completed ? 'check' : 'bolt'} size={20} color={goal.completed ? colors.success : colors.textPrimary} />
            <Text style={[styles.todayText, dir.text, { color: colors.textPrimary }]}>{goalLine}</Text>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.controlTrack }]}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(Math.max(0, Math.min(1, goal.progress)) * 100)}%`, backgroundColor: goal.completed ? colors.success : colors.gold },
                dir.rtl && styles.barFillEnd,
              ]}
            />
          </View>
        </View>
      ) : null}

      {streak ? (
        <View style={[styles.todayFacts, { flexDirection: dir.row }]}>
          <Icon name="flame" size={20} color={days > 0 ? colors.goldText : colors.textSecondary} />
          <Text style={[styles.todayText, dir.text, { color: days > 0 ? colors.textPrimary : colors.textSecondary }]}>{streakLine}</Text>
        </View>
      ) : null}

      {goal && picking ? (
        <GoalPicker
          value={goal.goal}
          onChange={(next) => {
            onChangeGoal(next);
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}

function ToolTile({
  icon,
  title,
  detail,
  highlight = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  /** something is waiting in it (words due), said in gold as well as in words */
  highlight?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      style={({ pressed }) => [
        styles.tile,
        // a column starts on the reading side too
        { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1, alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' },
      ]}
    >
      <Icon name={icon} size={24} color={colors.textPrimary} />
      <Text style={[styles.tileTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {detail ? (
        <Text style={[styles.tileDetail, dir.text, { color: highlight ? colors.goldText : colors.textSecondary }]} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.xs },
  header: { gap: layout.rowGap, marginBottom: spacing.sm },

  hero: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.sm },
  heroWhere: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  heroTitle: { ...display(typography.sizes.lg) },
  heroProgress: { fontSize: typography.sizes.xs },
  heroButton: { marginTop: spacing.xs },
  bar: { height: 6, borderRadius: radii.pill, overflow: 'hidden', alignSelf: 'stretch' },
  barFill: { height: 6, borderRadius: radii.pill },
  barFillEnd: { alignSelf: 'flex-end' },

  today: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  todayHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  todayLabel: { ...sectionLabel },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radii.pill,
  },
  goalChipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  todayRow: { gap: spacing.sm },
  todayFacts: { alignItems: 'center', gap: spacing.sm },
  todayText: { flex: 1, fontSize: typography.sizes.md },

  tools: { flexDirection: 'row', gap: layout.rowGap },
  tile: { flex: 1, minHeight: MIN_TOUCH_TARGET * 2, borderRadius: radii.lg, padding: spacing.md, gap: 4 },
  tileTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  tileDetail: { fontSize: typography.sizes.xs },

  mapLabel: { ...sectionLabel, marginTop: spacing.md },
  courseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginTop: spacing.xs },
  failed: { gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xs },
  failedText: { fontSize: typography.sizes.sm },
  unitHeader: {
    ...sectionLabel,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});
