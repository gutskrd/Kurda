import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, ErrorRetry } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Icon, type IconName } from '../theme/Icon';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { GoalPicker } from '../goals/GoalPicker';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { LessonPath, LessonPathSkeleton, type PathFocus } from '../coursemap/LessonPath';
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
  // whether today's two answers are in (either way), so the card's place is held until then and no longer
  const [goalSettled, setGoalSettled] = useState(false);
  const [streakSettled, setStreakSettled] = useState(false);
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
        if (!active) return;
        if (res.ok) setGoal(res.data);
        setGoalSettled(true);
      });
      void client.get<{ user: { streak?: Streak } }>('/me').then((res) => {
        if (!active) return;
        if (res.ok && res.data.user.streak) setStreak(res.data.user.streak);
        setStreakSettled(true);
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
  /*
   * The cards above the path — today's goal, the league, the day's Zêr, the
   * word of the day — each arrive when their own answer does, and one that
   * arrives after the path has been scrolled to pushes it down the screen.
   * For the few seconds those answers take, and until the person moves the
   * page themselves, the scroll follows the stop it was put on. After that
   * the page is theirs: a card changing later (the day's Zêr just claimed)
   * never pulls it away from what they are looking at.
   */
  const touched = useRef(false);
  const centredAt = useRef<{ y: number; since: number } | null>(null);
  const onFocus = useCallback((next: PathFocus | null) => {
    setFocus((was) => (was?.key === next?.key && was?.y === next?.y && was?.current === next?.current ? was : next));
  }, []);
  // a course whose map did not load has no path, and so nothing to scroll to
  const focusY = entry?.map && focus && courseTop !== null && pathInCourse !== null ? courseTop + pathInCourse + focus.y : null;

  useEffect(() => {
    if (focusY === null || !focus || viewport === 0 || !courseId) return;
    const mark = `${courseId}:${focus.key}`;
    if (scrolledFor.current === mark) {
      const was = centredAt.current;
      if (touched.current || !was || was.y === focusY || Date.now() - was.since > FOLLOW_MS) return;
      // the same stop, moved by something arriving above it: put it back at once, without a glide —
      // this only undoes a shift nobody asked for
      centredAt.current = { y: focusY, since: was.since };
      scroller.current?.scrollTo({ y: centredOffset(focusY, viewport, tabBarInset), animated: false });
      return;
    }
    scrolledFor.current = mark;
    centredAt.current = { y: focusY, since: Date.now() };
    touched.current = false;
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
        onScrollBeginDrag={() => {
          touched.current = true;
        }}
        scrollEventThrottle={64}
      >
        <View style={styles.header}>
          {loading && !courses ? <ContinueSkeleton /> : step ? <ContinueCard step={step} /> : null}
          {!goal && !streak && !(goalSettled && streakSettled) ? <TodaySkeleton /> : <TodayCard goal={goal} streak={streak} onChangeGoal={changeGoal} />}
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
            {/* the letters every course is written in: a row of their own on a phone, a third beside the two on a tablet */}
            <ToolTile
              letters={locale === 'ckb' ? SORANI_TEASER : LATIN_TEASER}
              title={t('nav.alphabet')}
              detail={t('learn.tools.alphabetHint')}
              onPress={() => navigation.navigate('Alphabet')}
            />
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
            ) : entry?.map ? (
              // the path waits for the review count, which places review on it
              <LessonPathSkeleton />
            ) : entry && !entry.map ? (
              <View style={styles.failed}>
                <Text style={[styles.failedText, dir.text, { color: colors.textSecondary }]}>{t('learn.mapFailed')}</Text>
                <ClayButton label={t('common.retry')} variant="outline" onPress={() => setReloadKey((k) => k + 1)} />
              </View>
            ) : null}
          </View>
        ) : loading ? (
          <CourseSkeleton />
        ) : (
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

/** How long after the path is first centred a card arriving above it may still move the scroll to follow. */
const FOLLOW_MS = 4000;

/** From this window width up, Learn's tools stand three to a row. */
const TOOLS_THREE_ACROSS = 600;

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

/**
 * The card while the course loads, line for line: where, the lesson's name,
 * the bar, how far, the button — each at the card's own sizes, so the card
 * that arrives is the one that was already there.
 */
function ContinueSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const start = useStartEdge();
  return (
    <View style={[styles.hero, { backgroundColor: colors.surface }]}>
      <SkeletonText size={typography.sizes.xs} width="52%" style={start} />
      <SkeletonText size={typography.sizes.lg} lineHeight={HERO_TITLE_LINE} width="38%" style={start} />
      <Skeleton height={6} radius={radii.pill} />
      <SkeletonText size={typography.sizes.xs} width={96} style={start} />
      <Skeleton height={LARGE_BUTTON} radius={radii.pill} style={styles.heroButton} />
    </View>
  );
}

/** Today's card while the goal and the streak are on their way: its heading and chip, the goal and its bar, the streak. */
function TodaySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const start = useStartEdge();
  return (
    <View style={[styles.today, { backgroundColor: colors.surface }]}>
      <View style={[styles.todayHead, { flexDirection: dir.row }]}>
        <SkeletonText size={typography.sizes.xs} width={56} />
        <Skeleton width={104} height={GOAL_CHIP} radius={radii.pill} />
      </View>
      <View style={styles.todayRow}>
        <View style={[styles.todayFacts, { flexDirection: dir.row }]}>
          <Skeleton width={20} height={20} radius={radii.pill} />
          <SkeletonText size={typography.sizes.md} width="46%" style={[styles.flex, start]} />
        </View>
        <Skeleton height={6} radius={radii.pill} />
      </View>
      <View style={[styles.todayFacts, { flexDirection: dir.row }]}>
        <Skeleton width={20} height={20} radius={radii.pill} />
        <SkeletonText size={typography.sizes.md} width="28%" style={[styles.flex, start]} />
      </View>
    </View>
  );
}

/** The course's heading, its name and the start of its path, while the course is on its way. */
function CourseSkeleton(): React.JSX.Element {
  const start = useStartEdge();
  return (
    <View style={styles.course}>
      <SkeletonText size={typography.sizes.xs} width={96} style={start} />
      <SkeletonText size={typography.sizes.lg} width="56%" style={[start, styles.courseTitleSkeleton]} />
      <LessonPathSkeleton />
    </View>
  );
}

/** Bars start on the reading edge — the right, in Soranî. */
function useStartEdge(): { alignItems: 'flex-start' | 'flex-end' } {
  return { alignItems: useDirection().row === 'row-reverse' ? 'flex-end' : 'flex-start' };
}

/** display(22) sets 1.12 */
const HERO_TITLE_LINE = Math.round(typography.sizes.lg * typography.displayLineHeight);
/** ClayButton's large size */
const LARGE_BUTTON = 50;
const GOAL_CHIP = 32;

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

/** A few letters of each alphabet, in place of an icon: the alphabet's tile shows what it holds. */
const LATIN_TEASER = { text: 'Aa Çç Êê', rtl: false } as const;
const SORANI_TEASER = { text: 'ئ ب پ چ', rtl: true } as const;

function ToolTile({
  icon,
  letters,
  title,
  detail,
  highlight = false,
  onPress,
}: {
  icon?: IconName;
  /** letters to show where the icon would be */
  letters?: { text: string; rtl: boolean };
  title: string;
  detail: string;
  /** something is waiting in it (words due), said in gold as well as in words */
  highlight?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  // two to a row on a phone, so the third has a row of its own; three to a row from a tablet's width
  const across = useWindowDimensions().width >= TOOLS_THREE_ACROSS ? 3 : 2;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      style={({ pressed }) => [
        styles.tile,
        { flexBasis: across === 3 ? '30%' : '40%' },
        // a column starts on the reading side too
        { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1, alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' },
      ]}
    >
      {letters ? (
        <Text
          style={[styles.tileLetters, { color: colors.goldText, writingDirection: letters.rtl ? 'rtl' : 'ltr' }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maxFontSizeMultiplier={1.2}
        >
          {letters.text}
        </Text>
      ) : icon ? (
        <Icon name={icon} size={24} color={colors.textPrimary} />
      ) : null}
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
    minHeight: GOAL_CHIP,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radii.pill,
  },
  goalChipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  todayRow: { gap: spacing.sm },
  todayFacts: { alignItems: 'center', gap: spacing.sm },
  todayText: { flex: 1, fontSize: typography.sizes.md },

  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.rowGap },
  tile: { flexGrow: 1, minHeight: MIN_TOUCH_TARGET * 2, borderRadius: radii.lg, padding: spacing.md, gap: 4 },
  tileLetters: { ...display(typography.sizes.lg), lineHeight: 24 },
  tileTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  tileDetail: { fontSize: typography.sizes.xs },

  course: { gap: spacing.sm + 4, marginTop: spacing.md },
  mapLabel: { ...sectionLabel },
  courseTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginBottom: spacing.xs },
  courseTitleSkeleton: { marginBottom: spacing.xs },
  flex: { flex: 1 },
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
