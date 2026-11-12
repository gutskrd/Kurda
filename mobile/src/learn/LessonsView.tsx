import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { isSoraniDialect } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { refreshFelt } from '../feedback/haptics';
import { ClayButton, ErrorRetry } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Icon, type IconName } from '../theme/Icon';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { LessonPath, LessonPathSkeleton, PinnedUnit, type PathFocus, type UnitPlace } from '../coursemap/LessonPath';
import { awayFrom, centredOffset, firstCourse } from '../coursemap/path';
import { UnitRailSheet } from '../coursemap/PathWorld';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { WordOfDayCard } from '../dictionary/WordOfDayCard';
import { DailyRewardCard } from '../rewards/DailyRewardCard';
import { QuestsCard } from '../quests/QuestsCard';
import { EventBanner } from '../events/EventBanner';
import { LeagueLine } from '../leagues/LeagueLine';
import type { CourseEntry } from '../coursemap/node';
import type { CourseMap, CourseSummary } from '../coursemap/types';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { EmptyState } from '../theme/EmptyState';
import type { Streak } from '../streak/format';
import { KeptStreakSheet, useKeptStreak } from '../streak/KeptStreak';
import { ReminderNudge } from '../push/ReminderNudge';
import { fraction, nextStep, type NextStep } from './next';
import { rememberCourseDialect, useCourseDialect } from './courseDialect';
import { useLessonExercises } from '../practice/useLessonExercises';

/**
 * Learn's first half: the next lesson, the tools, the course, and the rest of
 * today.
 *
 * Top to bottom in the order of what somebody opening it wants: the one next
 * step (a card with one button), the practice tools two by two with today's
 * quests slim under them (a chest waiting shows there), and then the
 * course as a lesson path — on the first screen, not under a stack of cards —
 * for anyone who wants to choose for themselves. The week's league and the
 * day's extras come after the path, under "More for today". A review left
 * part-way through is offered under the card, to be picked up where it
 * stopped (`ContinueReview`). Continuing a
 * lesson is one tap from here — from the card, or from the "Continue" over
 * the current skill on the path. How today is going sits in the bar above
 * (LearnBar), where it stays in sight while the path scrolls.
 *
 * The path is one course at a time, with a switch between courses when there
 * are several. It is told which of its units are near the screen, which can
 * be seen and which is in the middle of it, so it draws and moves only those;
 * and a unit banner's map button opens the rail of every unit, a tap on one
 * scrolling there. When it first appears it scrolls to the current skill, and a
 * button brings that back once it has been scrolled away. A course whose map
 * could not be loaded stays in the switch, saying so, with a way to try again.
 *
 * Learn's moments show here, one at a time: a freeze that kept the streak is
 * said once (`useKeptStreak`, from the `streak` the bar read), and while
 * reminders are off a slim banner offers them (ReminderNudge) — on a visit
 * that has no other moment.
 *
 * Pulled down, it reads the course again, and `onRefresh` has the bar read
 * the streak again with it.
 */
export function LessonsView({
  scrollRef,
  streak = null,
  onRefresh,
}: {
  scrollRef?: Ref<ScrollView>;
  streak?: Streak | null;
  onRefresh?: () => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduceMotion = useReducedMotion();
  const tabBarInset = useTabBarInset();
  const [due, setDue] = useState<number | null>(null);
  // a review left part-way through, to pick up where it stopped rather than start another beside it
  const [openReview, setOpenReview] = useState<string | null>(null);
  // the review count places review on the path, so the path waits for it (or for its failure) once
  const [dueSettled, setDueSettled] = useState(false);
  const [courses, setCourses] = useState<CourseEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setFailed(false);
      void client.get<{ due: number; open?: string | null }>('/practice/due').then((res) => {
        if (!active) return;
        if (res.ok) {
          setDue(res.data.due);
          setOpenReview(res.data.open ?? null);
        }
        setDueSettled(true);
      });
      void (async () => {
        const list = await client.get<{ courses: CourseSummary[] }>('/courses');
        if (!active) return;
        if (!list.ok) {
          setFailed(true);
          setLoading(false);
          setRefreshing(false);
          return;
        }
        // every course, in the order the server lists them — not only the
        // first; one whose map did not load stays listed, saying so
        const loaded = await Promise.all(list.data.courses.map((c) => client.get<CourseMap>(`/courses/${c.id}/map`)));
        if (!active) return;
        setCourses(
          list.data.courses.map((c, i) => {
            const map = loaded[i]!;
            return { course: { id: c.id, title: c.title, dialect: c.dialect }, map: map.ok ? map.data : null };
          }),
        );
        setLoading(false);
        setRefreshing(false);
      })();
      return () => {
        active = false;
      };
    }, [client, reloadKey]),
  );

  // the course on the path: the one chosen, else the one the learner is furthest into
  const courseId = chosen && courses?.some((c) => c.course.id === chosen) ? chosen : courses ? firstCourse(courses) : null;
  const entry = courses?.find((c) => c.course.id === courseId) ?? null;
  // the learner's Kurdish, for whatever else speaks to them in it (learn/courseDialect.ts)
  const dialect = entry?.course.dialect;
  useEffect(() => rememberCourseDialect(dialect), [dialect]);
  // the exercises are asked about once the course is known, in its Kurdish; with no course, in the Kurdish last learnt here
  const remembered = useCourseDialect();
  const exercises = useLessonExercises(courses === null ? null : dialect ? (isSoraniDialect(dialect) ? 'ckb' : 'kmr') : remembered);

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
  const [units, setUnits] = useState<UnitPlace[]>([]);
  const [viewport, setViewport] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const scrolledFor = useRef<string | null>(null);
  /*
   * What sits above the path — the next-step card, the review count on its
   * tile — arrives when its own answer does, and something that arrives after
   * the path has been scrolled to pushes it down the screen.
   * For the few seconds those answers take, and until the person moves the
   * page themselves, the scroll follows the stop it was put on. After that
   * the page is theirs: a card changing later (the day's Zêr just claimed)
   * never pulls it away from what they are looking at.
   */
  const touched = useRef(false);
  const centredAt = useRef<{ target: number; since: number } | null>(null);
  const onFocus = useCallback((next: PathFocus | null) => {
    setFocus((was) => (was?.key === next?.key && was?.y === next?.y && was?.current === next?.current ? was : next));
  }, []);
  // a course whose map did not load has no path, and so nothing to scroll to
  const focusY = entry?.map && focus && courseTop !== null && pathInCourse !== null ? courseTop + pathInCourse + focus.y : null;

  /*
   * The offset that puts the stop in the middle — unless that would leave its
   * unit's banner half on the screen, cut through the middle. Then a little
   * further, until the banner has gone up under the pinned one, which takes
   * its place whole.
   */
  const pathTopOnPage = courseTop !== null && pathInCourse !== null ? courseTop + pathInCourse : null;
  const settle = useCallback(
    (fy: number): number => {
      const y = centredOffset(fy, viewport, tabBarInset);
      if (pathTopOnPage === null) return y;
      const unit = units.find((u) => fy >= pathTopOnPage + u.top && fy <= pathTopOnPage + u.bottom);
      if (!unit) return y;
      const top = pathTopOnPage + unit.top;
      const clear = pathTopOnPage + unit.bannerBottom - PIN_HEIGHT + 1;
      return y > top && y < clear ? clear : y;
    },
    [viewport, tabBarInset, pathTopOnPage, units],
  );

  useEffect(() => {
    if (focusY === null || !focus || viewport === 0 || !courseId) return;
    const mark = `${courseId}:${focus.key}`;
    if (scrolledFor.current === mark) {
      const was = centredAt.current;
      const target = settle(focusY);
      if (touched.current || !was || was.target === target || Date.now() - was.since > FOLLOW_MS) return;
      // the same stop, moved by something arriving above it (or the banners just measured): put it
      // back at once, without a glide — this only undoes a shift nobody asked for
      centredAt.current = { target, since: was.since };
      scroller.current?.scrollTo({ y: target, animated: false });
      return;
    }
    scrolledFor.current = mark;
    const target = settle(focusY);
    centredAt.current = { target, since: Date.now() };
    touched.current = false;
    scroller.current?.scrollTo({ y: target, animated: !reduceMotion });
  }, [focusY, focus, viewport, courseId, settle, reduceMotion]);

  // only once the path is on the screen: above it, the card at the top already offers the next lesson
  const onPath = courseTop !== null && scrollY + viewport - tabBarInset > courseTop;
  const away = focusY === null || viewport === 0 || !onPath ? null : awayFrom(focusY, scrollY, viewport, tabBarInset);
  // back to the skill to do now — or, with none left open, to the furthest point reached
  const jumpWord = focus?.current ? t('coursemap.path.jump') : t('coursemap.path.jumpEnd');
  const jump = () => {
    if (focusY !== null) scroller.current?.scrollTo({ y: settle(focusY), animated: !reduceMotion });
  };

  const step = courses ? nextStep(courses) : null;
  // the sheet's one button opens the lesson the card's does, so it waits for the card to know it
  const kept = useKeptStreak(streak, step !== null);

  /*
   * The unit being scrolled through, once its banner has gone up out of
   * sight: pinned at the top, so it is always clear whose stops these are.
   * It stays from one unit to the next — over the top of the next banner as
   * that comes up under it — and turns into the next unit as that banner goes
   * under (PinnedUnit), until the path ends.
   */
  /*
   * Which units are near the screen (drawn in full: one screen either way),
   * which can be seen (their stops rise the first time), and which is in the
   * middle (the one that moves). Each is a set that changes only when a unit
   * comes or goes, so the path is drawn again then and not on every scroll.
   */
  const placed = pathTopOnPage !== null && units.length > 0 && viewport > 0;
  const top = placed ? scrollY - pathTopOnPage : 0;
  const within = (from: number, to: number): string =>
    units
      .filter((u) => u.top < to && u.bottom > from)
      .map((u) => u.unitId)
      .join(',');
  const nearKey = placed ? within(top - viewport, top + 2 * viewport) : null;
  const seenKey = placed ? within(top, top + viewport - tabBarInset) : null;
  const middle = top + (viewport - tabBarInset) / 2;
  const inView = placed ? (units.find((u) => u.top <= middle && u.bottom > middle)?.unitId ?? null) : undefined;
  const nearUnits = useMemo(() => (nearKey === null ? undefined : new Set(nearKey.split(','))), [nearKey]);
  const seenUnits = useMemo(() => (seenKey === null ? null : new Set(seenKey.split(','))), [seenKey]);
  const [rail, setRail] = useState(false);
  const openRail = useCallback(() => setRail(true), []);
  const toUnit = (unitId: string): void => {
    setRail(false);
    const unit = units.find((u) => u.unitId === unitId);
    if (unit && pathTopOnPage !== null) {
      touched.current = true;
      scroller.current?.scrollTo({ y: Math.max(0, pathTopOnPage + unit.top - spacing.sm), animated: !reduceMotion });
    }
  };

  const lastUnit = units[units.length - 1];
  const pinned =
    pathTopOnPage === null || !lastUnit || scrollY >= pathTopOnPage + lastUnit.bottom - PIN_CLEAR
      ? null
      : ([...units].reverse().find((u) => scrollY > pathTopOnPage + u.bannerBottom - PIN_HEIGHT) ?? null);

  const refresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    onRefresh?.();
  };

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
      >
        <View style={styles.header}>
          <ReminderNudge hold={kept.pending} />
          {loading && !courses ? <ContinueSkeleton /> : step ? <ContinueCard step={step} /> : null}
          {openReview ? <ContinueReview onPress={() => navigation.navigate('Practice', { sessionId: openReview })} /> : null}
          <View style={styles.tools} testID="learn-tools">
            {/* practice's hub, with what review has due on its face */}
            <ToolTile
              icon="review"
              title={t('practice.title')}
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
              onPress={() => navigation.navigate('PracticeHub')}
            />
            <ToolTile icon="text" title={t('nav.dictionary')} detail={t('learn.tools.dictionaryHint')} onPress={() => navigation.navigate('Dictionary')} />
            {/* the letters and the first words after them, one way in (WordsScreen): the letters shown rather than drawn as an icon */}
            <ToolTile
              letters={locale === 'ckb' ? SORANI_TEASER : LATIN_TEASER}
              title={t('words.title')}
              detail={t('words.toolHint')}
              onPress={() => navigation.navigate('Words')}
            />
            {/* the lessons' exercises with a screen of their own, while they can be done (practice/exercises.ts); the hub lists them too */}
            {exercises.map((e) => (
              <ToolTile key={e.key} icon={e.icon} title={t(e.title)} titleLines={2} detail={t(e.detail)} onPress={() => navigation.navigate(e.route)} />
            ))}
          </View>
          {/* today's three quests, slim, under the tools: a chest waiting shows here */}
          <QuestsCard />
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
                <LessonPath
                  key={entry.course.id}
                  map={entry.map}
                  due={due ?? 0}
                  onFocus={onFocus}
                  onUnits={setUnits}
                  near={nearUnits}
                  seen={seenUnits}
                  inView={inView}
                  dialect={dialect}
                  onOpenRail={openRail}
                />
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

        {/* after the path: the week's league and your place in it (or your own week), and the day's extras */}
        <View style={styles.more}>
          <Text style={[styles.mapLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('learn.more.title')}
          </Text>
          <LeagueLine />
          <EventBanner />
          <DailyRewardCard />
          <WordOfDayCard />
        </View>
      </ScrollView>

      {pinned ? (
        // on the page's own colour, so nothing scrolling under it shows round its edges
        <View style={[styles.pinned, { backgroundColor: colors.background }]} pointerEvents="box-none">
          <PinnedUnit unit={pinned} onRail={openRail} />
        </View>
      ) : null}

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

      <UnitRailSheet
        open={rail}
        units={units.map((u) => ({ unitId: u.unitId, number: u.number, title: u.title, tone: u.tone, done: u.done, total: u.total, here: u.here }))}
        onClose={() => setRail(false)}
        onPick={toUnit}
      />

      <KeptStreakSheet
        streak={kept.shown}
        onClose={kept.close}
        onStart={() => {
          kept.close();
          if (step) openStep(navigation, step);
        }}
      />
    </View>
  );
}

/** What the one next step opens: its lesson, or, with every open lesson done, practice, chosen on its hub. */
function openStep(navigation: RootNavigation, step: NextStep): void {
  if (step.kind === 'review') navigation.navigate('PracticeHub');
  else navigation.navigate('Lesson', { lessonId: step.lessonId, courseId: step.courseId });
}

/** The pinned unit gives way this far before the path ends, so it is gone before what comes after the path. */
const PIN_CLEAR = 72;
/**
 * The pinned unit's height: it takes over as soon as no more of the banner
 * than that is left on the screen, so it covers the rest rather than sitting
 * on top of half a banner.
 */
const PIN_HEIGHT = 68;

/** How long after the path is first centred a card arriving above it may still move the scroll to follow. */
const FOLLOW_MS = 4000;

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
    step.kind === 'start' ? t('learn.continue.start') : step.kind === 'review' ? t('practice.title') : t('learn.continue.button');
  const go = () => openStep(navigation, step);
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
 * A review left part-way through (GET /practice/due's `open`), offered as the
 * website's Learn page offers it: Continue opens that session where it
 * stopped, with the answers given so far, instead of a new review that would
 * leave the first unfinished. Its button is the quieter outline: the card
 * above already has the screen's one solid button.
 */
function ContinueReview({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.reviewOpen, { backgroundColor: colors.surface }]} testID="learn-review-open">
      <View style={[styles.reviewOpenRow, { flexDirection: dir.row }]}>
        <Icon name="review" size={24} color={colors.textPrimary} />
        <Text style={[styles.reviewOpenText, dir.text, { color: colors.textPrimary }]}>{t('practice.open.body')}</Text>
      </View>
      <ClayButton label={t('practice.open.continue')} tone="primary" variant="outline" onPress={onPress} />
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

/** A few letters of each alphabet, in place of an icon: the alphabet's tile shows what it holds. */
const LATIN_TEASER = { text: 'Aa Çç Êê', rtl: false } as const;
const SORANI_TEASER = { text: 'ئ ب پ چ', rtl: true } as const;

function ToolTile({
  icon,
  letters,
  title,
  titleLines = 1,
  detail,
  highlight = false,
  onPress,
}: {
  icon?: IconName;
  /** letters to show where the icon would be */
  letters?: { text: string; rtl: boolean };
  title: string;
  /** how many lines the title may take: an exercise's name is a phrase, which half a row cannot hold on one */
  titleLines?: number;
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
      <Text style={[styles.tileTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={titleLines}>
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

  reviewOpen: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  reviewOpenRow: { alignItems: 'center', gap: spacing.sm + 4 },
  reviewOpenText: { flex: 1, fontSize: typography.sizes.sm, lineHeight: 20 },

  // two to a row: the path is what this screen is for, and the tools sit above it, small
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '40%', minHeight: 76, borderRadius: radii.lg, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.sm + 4, gap: 2 },
  tileLetters: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, lineHeight: 22 },
  tileTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  tileDetail: { fontSize: typography.sizes.xs },

  course: { gap: spacing.sm + 4, marginTop: spacing.md },
  more: { gap: layout.rowGap, marginTop: spacing.xl },
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

  pinned: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: spacing.xs, paddingHorizontal: layout.gutter },
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
