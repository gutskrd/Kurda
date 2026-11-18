import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Pressable } from '../theme/Pressable';
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
import { UnitRailSheet, type RailSection } from '../coursemap/PathWorld';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { WordOfDayCard } from '../dictionary/WordOfDayCard';
import { DailyRewardCard } from '../rewards/DailyRewardCard';
import { QuestsCard } from '../quests/QuestsCard';
import { TreeCard } from '../tree/TreeCard';
import { BookCard } from './BookCard';
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
import { pressedDim } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';

/**
 * Learn's first half, top to bottom: the next step (one card, one button, with a part-finished review offered
 * under it), the practice tools with today's quests, the course as a lesson path, then the league and the day's
 * extras under "More for today". The path shows one course and one section at a time and draws only the units
 * near the screen; it scrolls to the current skill on first show. Learn's one-at-a-time moments (a kept streak,
 * the reminder banner) show here. Pull to refresh reloads the course and, via `onRefresh`, the bar's streak.
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
  // A review left part-way through, to pick up where it stopped rather than start another beside it.
  const [openReview, setOpenReview] = useState<string | null>(null);
  // The review count places review on the path, so the path waits for it (or for its failure) once.
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
        // Every course, in the server's order; one whose map failed to load stays listed, saying so.
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

  // The course on the path: the one chosen, else the one the learner is furthest into.
  const courseId = chosen && courses?.some((c) => c.course.id === chosen) ? chosen : courses ? firstCourse(courses) : null;
  const entry = courses?.find((c) => c.course.id === courseId) ?? null;
  // The learner's Kurdish, for whatever else speaks to them in it (learn/courseDialect.ts).
  const dialect = entry?.course.dialect;
  useEffect(() => rememberCourseDialect(dialect), [dialect]);
  // Exercise availability is asked once the course is known, in its Kurdish; with no course, in the Kurdish last learnt here.
  const remembered = useCourseDialect();
  const exercises = useLessonExercises(courses === null ? null : dialect ? (isSoraniDialect(dialect) ? 'ckb' : 'kmr') : remembered);

  /*
   * Scrolling to the current skill: the path reports its focus stop's position, the path's place on the page is
   * measured here, and the screen height and scroll are tracked. Together they centre the stop, once per course
   * and current skill, so returning from a lesson finds the next one and returning to the same place leaves the
   * scroll.
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
  // Where the course section sits in the scroll, and where the path sits in it.
  const [courseTop, setCourseTop] = useState<number | null>(null);
  const [pathInCourse, setPathInCourse] = useState<number | null>(null);
  const [focus, setFocus] = useState<PathFocus | null>(null);
  const [units, setUnits] = useState<UnitPlace[]>([]);
  const [viewport, setViewport] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const scrolledFor = useRef<string | null>(null);
  /*
   * Content above the path (the next-step card, a tile's review count) arrives with its own answer and would push
   * the path down after scrolling. For the few seconds those take, and until the person scrolls, the scroll
   * follows the stop. After that the page is theirs: a later card change never pulls it away.
   */
  const touched = useRef(false);
  const centredAt = useRef<{ target: number; since: number } | null>(null);
  const onFocus = useCallback((next: PathFocus | null) => {
    setFocus((was) => (was?.key === next?.key && was?.y === next?.y && was?.current === next?.current ? was : next));
  }, []);
  // A course whose map did not load has no path, and so nothing to scroll to.
  const focusY = entry?.map && focus && courseTop !== null && pathInCourse !== null ? courseTop + pathInCourse + focus.y : null;

  /*
   * The offset that centres the stop, unless that would leave its unit's banner half on screen; then a little
   * further, until the banner is under the pinned one.
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
      // The same stop, moved by content arriving above it (or banners just measured): restore it at once, without a glide.
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

  // Only once the path is on the screen: above it, the card at the top already offers the next lesson.
  const onPath = courseTop !== null && scrollY + viewport - tabBarInset > courseTop;
  const away = focusY === null || viewport === 0 || !onPath ? null : awayFrom(focusY, scrollY, viewport, tabBarInset);
  // Back to the skill to do now, or with none left open, to the furthest point reached.
  const jumpWord = focus?.current ? t('coursemap.path.jump') : t('coursemap.path.jumpEnd');
  const jump = () => {
    if (focusY !== null) scroller.current?.scrollTo({ y: settle(focusY), animated: !reduceMotion });
  };

  const step = courses ? nextStep(courses) : null;
  // The sheet's one button opens the lesson the card's does, so it waits for the card to know it.
  const kept = useKeptStreak(streak, step !== null);

  /*
   * The unit being scrolled through, once its banner has scrolled out of sight: pinned at the top so it is clear
   * whose stops these are. It stays from unit to unit, over the next banner as that comes up, and turns into the
   * next unit as that banner goes under (PinnedUnit), until the path ends.
   */
  /*
   * Which units are near the screen (drawn in full: one screen either way), visible (their stops rise the first
   * time) and centred (the one that moves). Each set changes only when a unit enters or leaves, so the path
   * redraws then and not on every scroll.
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
  // Every unit of the course in its section, as the path tells it, for the rail.
  const [railSections, setRailSections] = useState<RailSection[]>([]);
  // A unit picked on the rail: the path opens its section, then says where it is.
  const [reveal, setReveal] = useState<{ unitId: string; at: number } | null>(null);
  const toUnit = (unitId: string): void => {
    setRail(false);
    setReveal({ unitId, at: Date.now() });
  };
  const pathTopRef = useRef(pathTopOnPage);
  pathTopRef.current = pathTopOnPage;
  const onReveal = useCallback(
    (y: number) => {
      const top = pathTopRef.current;
      if (top === null) return;
      touched.current = true;
      scroller.current?.scrollTo({ y: Math.max(0, top + y - spacing.sm), animated: !reduceMotion });
    },
    [reduceMotion],
  );

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
            {/* Practice's hub, with what review has due on its face. */}
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
            {/* The letters and first words, one way in (WordsScreen): the letters are shown rather than drawn as an icon. */}
            <ToolTile
              letters={locale === 'ckb' ? SORANI_TEASER : LATIN_TEASER}
              title={t('words.title')}
              detail={t('words.toolHint')}
              onPress={() => navigation.navigate('Words')}
            />
            {/* The lesson exercises with their own screens, while available (practice/exercises.ts); the hub lists them too. */}
            {exercises.map((e) => (
              <ToolTile key={e.key} icon={e.icon} title={t(e.title)} detail={t(e.detail)} onPress={() => navigation.navigate(e.route)} />
            ))}
          </View>
          {/* Today's three quests, slim, under the tools: a chest waiting shows here. */}
          <QuestsCard />
          {/* The learner's tree, under the quests: water to pour shows here. */}
          <TreeCard />
          {/* And the road on paper, once a chapter is online. */}
          <BookCard />
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
                      // The current course is washed in violet with its name in violet, like the current tab.
                      style={({ pressed }) => [styles.chip, { backgroundColor: on ? `${colors.primary}${CHOSEN_WASH}` : colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
                    >
                      <Text style={[styles.chipText, dir.free, { color: on ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                        {c.map?.course.title ?? c.course.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {courses.length === 1 ? (
              <Text style={[styles.courseTitle, dir.free, { color: colors.textPrimary }]} accessibilityRole="header">
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
                  onCourse={setRailSections}
                  near={nearUnits}
                  seen={seenUnits}
                  inView={inView}
                  onOpenRail={openRail}
                  reveal={reveal}
                  onReveal={onReveal}
                />
              </View>
            ) : entry?.map ? (
              // The path waits for the review count, which places review on it.
              <LessonPathSkeleton />
            ) : entry && !entry.map ? (
              <View style={[styles.failed, { alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
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

        {/* After the path: the week's league and your place in it (or your own week), and the day's extras. */}
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
        // On the page's own colour, so nothing scrolling under it shows round its edges.
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
            style={({ pressed }) => [styles.jump, { flexDirection: dir.row, backgroundColor: colors.primary, opacity: pressed ? pressedDim : 1 }]}
          >
            <Icon name={away === 'up' ? 'move-up' : 'move-down'} size={18} color={colors.textOnPrimary} />
            <Text style={[styles.jumpText, { color: colors.textOnPrimary }]}>{jumpWord}</Text>
          </Pressable>
        </View>
      ) : null}

      <UnitRailSheet open={rail} sections={railSections} onClose={() => setRail(false)} onPick={toUnit} />

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

/** What the next step opens: its lesson, or with every open lesson done, practice, chosen on its hub. */
function openStep(navigation: RootNavigation, step: NextStep): void {
  if (step.kind === 'review') navigation.navigate('PracticeHub');
  else navigation.navigate('Lesson', { lessonId: step.lessonId, courseId: step.courseId });
}

/** The pinned unit gives way this far before the path ends, so it is gone before what follows the path. */
const PIN_CLEAR = 72;
/**
 * The pinned unit's height: it takes over once no more of the banner than this is on screen, covering the rest
 * rather than half a banner.
 */
const PIN_HEIGHT = 68;

/** How long after the path is first centred a card arriving above it may still move the scroll to follow. */
const FOLLOW_MS = 4000;

/** The next step: course and unit, the lesson's name, the course's progress, and one button. */
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
      {/* The course's own words in whatever language it was written in, aligned with the page and read in their own direction. */}
      <Text style={[styles.heroWhere, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
        {where}
      </Text>
      <Text style={[styles.heroTitle, step.kind === 'review' ? dir.text : dir.free, { color: colors.textPrimary }]} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
      <View
        style={[styles.bar, { backgroundColor: colors.controlTrack }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={progress}
        accessibilityValue={{ min: 0, max: step.total, now: step.done }}
      >
        {/* Course progress is a place on the road, not a reward: violet, like every progress bar. */}
        <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.primary }, dir.rtl && styles.barFillEnd]} />
      </View>
      <Text style={[styles.heroProgress, dir.text, { color: colors.textSecondary }]}>{progress}</Text>
      <ClayButton label={button} tone="primary" size="large" onPress={go} style={styles.heroButton} />
    </View>
  );
}

/**
 * A review left part-way (GET /practice/due's `open`), offered as on the web: Continue resumes that session with
 * its answers so far, rather than a new review that would leave it unfinished. Its button is the quieter outline,
 * since the card above has the screen's one solid button.
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

/** The card while the course loads, line for line at the card's own sizes, so the arriving card matches the placeholder. */
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

/** display(22) sets 1.12. */
const HERO_TITLE_LINE = Math.round(typography.sizes.lg * typography.displayLineHeight);
/** ClayButton's large size. */
const LARGE_BUTTON = 50;
/** Hex alpha suffix for the chosen course chip's violet wash, as the tab bar uses. */
const CHOSEN_WASH = '1F';

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
  /** Letters to show where the icon would be. */
  letters?: { text: string; rtl: boolean };
  title: string;
  detail: string;
  /** Something is waiting in it (words due), said in the app's violet as well as in words. */
  highlight?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      // A card: it gives under the finger, as the cards on every other screen do.
      style={[
        styles.tile,
        // A column starts on the reading side too.
        { backgroundColor: colors.surface, alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' },
      ]}
    >
      {letters ? (
        <Text
          style={[styles.tileLetters, { color: colors.primary, writingDirection: letters.rtl ? 'rtl' : 'ltr' }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maxFontSizeMultiplier={1.2}
        >
          {letters.text}
        </Text>
      ) : icon ? (
        <Icon name={icon} size={24} color={colors.textPrimary} />
      ) : null}
      {/*
        Half a row on a narrow phone fits "Letters and words" on one line in few languages, so the title may take
        a second line and the text under it a third before truncating.
      */}
      <Text style={[styles.tileTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
        {title}
      </Text>
      {detail ? (
        <Text style={[styles.tileDetail, dir.text, { color: highlight ? colors.primary : colors.textSecondary }]} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
    </PressableScale>
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

  // Two to a row: the path is what this screen is for, and the tools sit above it, small.
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
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  failed: { gap: spacing.sm, marginTop: spacing.xs },
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
