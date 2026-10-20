import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { LessonPath, type PathFocus } from '../coursemap/LessonPath';
import { awayFrom, centredOffset, firstCourse } from '../coursemap/path';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { WordOfDayCard } from '../dictionary/WordOfDayCard';
import { DailyRewardCard } from '../rewards/DailyRewardCard';
import { EventBanner } from '../events/EventBanner';
import { LeagueLine } from '../leagues/LeagueLine';
import type { CourseEntry } from '../coursemap/node';
import type { CourseMap, CourseSummary } from '../coursemap/types';
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
 * then the course as a lesson path for anyone who wants to choose for
 * themselves. Continuing a lesson is one tap from here — from the card, or
 * from the "Continue" over the current skill on the path.
 *
 * Today is said plainly — how much of the daily goal is done, how long the
 * streak is — and nothing here counts down, warns, or says what could be
 * lost. Some of the people reading it are children.
 *
 * The path is one course at a time, with a switch between courses when there
 * are several. When it first appears it scrolls to the current skill, and a
 * button brings that back once it has been scrolled away. A course whose map
 * could not be loaded stays in the switch, saying so, with a way to try again.
 */
export function LessonsView({ scrollRef }: { scrollRef?: Ref<ScrollView> }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduceMotion = useReducedMotion();
  const tabBarInset = useTabBarInset();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [due, setDue] = useState<number | null>(null);
  // the review count places review on the path, so the path waits for it (or for its failure) once
  const [dueSettled, setDueSettled] = useState(false);
  const [courses, setCourses] = useState<CourseEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);

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
        if (!active) return;
        if (res.ok) setDue(res.data.due);
        setDueSettled(true);
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
        // first; one whose map did not load stays listed, saying so
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

  // the course on the path: the one chosen, else the one the learner is furthest into
  const courseId = chosen && courses?.some((c) => c.course.id === chosen) ? chosen : courses ? firstCourse(courses) : null;
  const entry = courses?.find((c) => c.course.id === courseId) ?? null;

  /*
   * Scrolling to the current skill. The path says where its focus stop sits
   * within it; where the path sits on the page is measured here; the screen's
   * height and the scroll are tracked as they change. Together they place the
   * stop in the middle of what can be seen — once per course and current
   * skill, so coming back from a lesson that moved the learner on finds the
   * next one, and coming back to the same place leaves the scroll alone.
   */
  const scroller = useRef<ScrollView | null>(null);
  const setScroller = useCallback(
    (node: ScrollView | null) => {
      scroller.current = node;
      if (typeof scrollRef === 'function') scrollRef(node);
      else if (scrollRef) (scrollRef as { current: ScrollView | null }).current = node;
    },
    [scrollRef],
  );
  // where the course section sits in the scroll, and where the path sits in it
  const [courseTop, setCourseTop] = useState<number | null>(null);
  const [pathInCourse, setPathInCourse] = useState<number | null>(null);
  const [focus, setFocus] = useState<PathFocus | null>(null);
  const [viewport, setViewport] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const scrolledFor = useRef<string | null>(null);
  const onFocus = useCallback((next: PathFocus | null) => {
    setFocus((was) => (was?.key === next?.key && was?.y === next?.y && was?.current === next?.current ? was : next));
  }, []);
  // a course whose map did not load has no path, and so nothing to scroll to
  const focusY = entry?.map && focus && courseTop !== null && pathInCourse !== null ? courseTop + pathInCourse + focus.y : null;

  useEffect(() => {
    if (focusY === null || !focus || viewport === 0 || !courseId) return;
    const mark = `${courseId}:${focus.key}`;
    if (scrolledFor.current === mark) return;
    scrolledFor.current = mark;
    scroller.current?.scrollTo({ y: centredOffset(focusY, viewport, tabBarInset), animated: !reduceMotion });
  }, [focusY, focus, viewport, courseId, tabBarInset, reduceMotion]);

  // only once the path is on the screen: above it, the card at the top already offers the next lesson
  const onPath = courseTop !== null && scrollY + viewport - tabBarInset > courseTop;
  const away = focusY === null || viewport === 0 || !onPath ? null : awayFrom(focusY, scrollY, viewport, tabBarInset);
  // back to the skill to do now — or, with none left open, to the furthest point reached
  const jumpWord = focus?.current ? t('coursemap.path.jump') : t('coursemap.path.jumpEnd');
  const jump = () => {
    if (focusY !== null) scroller.current?.scrollTo({ y: centredOffset(focusY, viewport, tabBarInset), animated: !reduceMotion });
  };

  const step = courses ? nextStep(courses) : null;

  if (failed && !courses) {
    return <ErrorRetry onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={setScroller}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarInset + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        onLayout={(e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.height)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
      >
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
        </View>

        {courses && courses.length > 0 ? (
          <View style={styles.course} onLayout={(e: LayoutChangeEvent) => setCourseTop(e.nativeEvent.layout.y)}>
            <Text style={[styles.mapLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('learn.map.title')}
            </Text>
            {courses.length > 1 ? (
              <View style={[styles.switcher, { flexDirection: dir.row }]} accessibilityLabel={t('coursemap.path.courses')}>
                {courses.map((c) => {
                  const on = c.course.id === courseId;
                  return (
                    <Pressable
                      key={c.course.id}
                      onPress={() => setChosen(c.course.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [
                        styles.chip,
                        on ? styles.chipOn : null,
                        { backgroundColor: on ? 'transparent' : colors.controlTrack, borderColor: colors.textPrimary, opacity: pressed ? 0.75 : 1 },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: on ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
                        {c.map?.course.title ?? c.course.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {courses.length === 1 ? (
              <Text style={[styles.courseTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
                {entry?.map?.course.title ?? entry?.course.title}
              </Text>
            ) : null}
            {entry?.map && dueSettled ? (
              <View onLayout={(e: LayoutChangeEvent) => setPathInCourse(e.nativeEvent.layout.y)}>
                <LessonPath key={entry.course.id} map={entry.map} due={due ?? 0} onFocus={onFocus} />
              </View>
            ) : entry && !entry.map ? (
              <View style={styles.failed}>
                <Text style={[styles.failedText, dir.text, { color: colors.textSecondary }]}>{t('learn.mapFailed')}</Text>
                <ClayButton label={t('common.retry')} variant="outline" onPress={() => setReloadKey((k) => k + 1)} />
              </View>
            ) : null}
          </View>
        ) : loading ? null : (
          <EmptyState title={t('learn.noCourses')} />
        )}
      </ScrollView>

      {away ? (
        <View style={[styles.jumpWrap, { bottom: tabBarInset + spacing.sm }]} pointerEvents="box-none">
          <Pressable
            onPress={jump}
            accessibilityRole="button"
            accessibilityLabel={jumpWord}
            style={({ pressed }) => [styles.jump, { flexDirection: dir.row, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={away === 'up' ? 'move-up' : 'move-down'} size={18} color={colors.textOnPrimary} />
            <Text style={[styles.jumpText, { color: colors.textOnPrimary }]}>{jumpWord}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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

  course: { gap: spacing.sm + 4, marginTop: spacing.md },
  mapLabel: { ...sectionLabel },
  courseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginBottom: spacing.xs },
  switcher: { flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  chip: { minHeight: MIN_TOUCH_TARGET, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  // the course you are in, drawn round, so it does not compete with the card's one button
  chipOn: { borderWidth: 2 },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  failed: { gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.xs },
  failedText: { fontSize: typography.sizes.sm },

  jumpWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  jump: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radii.pill,
  },
  jumpText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
