import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useNavigation } from '@react-navigation/native';
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
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { refreshFelt } from '../feedback/haptics';
import { ClayButton, ErrorRetry } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { useTabBarScroll } from '../navigation/tabBarScroll';
import { useTabFocusLoad } from '../navigation/tabFocusLoad';
import { LessonPath, LessonPathSkeleton, PinnedUnit, type PathFocus, type UnitPlace } from '../coursemap/LessonPath';
import { awayFrom, centredOffset, firstCourse } from '../coursemap/path';
import { courseName } from '../coursemap/courseName';
import { UnitRailSheet, type RailSection } from '../coursemap/PathWorld';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { CourseEntry } from '../coursemap/node';
import type { CourseMap, CourseSummary } from '../coursemap/types';
import type { RootNavigation } from '../navigation/rootStack';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { EmptyState } from '../theme/EmptyState';
import type { Streak } from '../streak/format';
import { KeptStreakSheet, useKeptStreak } from '../streak/KeptStreak';
import { ReminderNudge } from '../push/ReminderNudge';
import { nextStep, type NextStep } from './next';
import { rememberCourseDialect } from './courseDialect';
import { ActionPill, HeaderButton } from '../navigation/HeaderButton';
import { pressedDim } from '../theme/motion';

/**
 * Learn's lessons: the course as a lesson road, and nothing else. Above it stand the course's name and, under the bell,
 * a pill of two buttons for the letters and first words and for the dictionary. The road shows one course and one
 * section at a time and draws only the units near the screen; it scrolls to the current skill on first show, and its
 * review stop picks up a review left part-way. Learn's one-at-a-time moments (a kept streak, the reminder banner) show
 * here. Pull to refresh reloads the course and, via `onRefresh`, the bar.
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
  const { t } = useI18n();
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

  // Asked again on return from a lesson or any other page, and kept over a quick tab switch (navigation/tabFocusLoad).
  const load = useCallback(
    async (live: () => boolean) => {
      setFailed(false);
      const review = client.get<{ due: number; open?: string | null }>('/practice/due').then((res) => {
        if (!live()) return false;
        if (res.ok) {
          setDue(res.data.due);
          setOpenReview(res.data.open ?? null);
        }
        setDueSettled(true);
        return res.ok;
      });
      const course = (async () => {
        const list = await client.get<{ courses: CourseSummary[] }>('/courses');
        if (!live()) return false;
        if (!list.ok) {
          setFailed(true);
          setLoading(false);
          setRefreshing(false);
          return false;
        }
        // Every course, in the server's order; one whose map failed to load stays listed, saying so.
        const loaded = await Promise.all(list.data.courses.map((c) => client.get<CourseMap>(`/courses/${c.id}/map`)));
        if (!live()) return false;
        setCourses(
          list.data.courses.map((c, i) => {
            const map = loaded[i]!;
            return { course: { id: c.id, title: c.title, dialect: c.dialect }, map: map.ok ? map.data : null };
          }),
        );
        setLoading(false);
        setRefreshing(false);
        return loaded.every((map) => map.ok);
      })();
      const [reviewed, mapped] = await Promise.all([review, course]);
      return reviewed && mapped;
    },
    [client, reloadKey],
  );
  useTabFocusLoad(load);

  // The course on the path: the one chosen, else the one the learner is furthest into.
  const courseId = chosen && courses?.some((c) => c.course.id === chosen) ? chosen : courses ? firstCourse(courses) : null;
  const entry = courses?.find((c) => c.course.id === courseId) ?? null;
  // The learner's Kurdish, for whatever else speaks to them in it (learn/courseDialect.ts).
  const dialect = entry?.course.dialect;
  useEffect(() => rememberCourseDialect(dialect), [dialect]);

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
  // The page's own reading of its scroll, and the tab bar's (tabBarScroll.ts).
  const tabScroll = useTabBarScroll(useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollY(e.nativeEvent.contentOffset.y), []));
  const scrolledFor = useRef<string | null>(null);
  /*
   * Content above the path (the reminder banner, the course's name) arrives with its own answer and would push the
   * path down after scrolling. For the few seconds those take, and until the person scrolls, the scroll
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

  // Only once the path is on the screen.
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

  // A stop's card opening low on the screen, or under the pinned unit, scrolls until it and its stop are both in view.
  const scrollAt = useRef(0);
  scrollAt.current = scrollY;
  const onCard = useCallback(
    (from: number, to: number) => {
      const top = pathTopRef.current;
      if (top === null || viewport === 0) return;
      const now = scrollAt.current;
      const fits = top + to + spacing.md - (viewport - tabBarInset);
      const keepsStop = top + from - PIN_HEIGHT - spacing.sm;
      // The stop wins where both cannot be in view.
      const next = Math.min(Math.max(now, fits), keepsStop);
      if (Math.abs(next - now) < 1) return;
      touched.current = true;
      scroller.current?.scrollTo({ y: Math.max(0, next), animated: !reduceMotion });
    },
    [viewport, tabBarInset, reduceMotion],
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
        onScroll={tabScroll}
        onScrollBeginDrag={() => {
          touched.current = true;
        }}
        scrollEventThrottle={64}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
      >
        <View style={styles.header}>
          <ReminderNudge hold={kept.pending} />
          <View style={[styles.top, { flexDirection: dir.row }]}>
            {courses?.length === 1 && entry ? (
              <Text style={[styles.courseTitle, dir.free, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
                {courseName(t, { slug: entry.course.slug, title: entry.map?.course.title ?? entry.course.title })}
              </Text>
            ) : (
              <View style={styles.flex} />
            )}
            <LearnTools />
          </View>
        </View>

        {courses && courses.length > 0 ? (
          <View style={styles.course} onLayout={(e: LayoutChangeEvent) => setCourseTop(e.nativeEvent.layout.y)}>
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
                      // The current course in solid ink, as every chosen chip is.
                      style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.pickedFill : colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
                    >
                      <Text style={[styles.chipText, dir.free, { color: on ? colors.pickedInk : colors.textSecondary }]} numberOfLines={1}>
                        {courseName(t, { slug: c.course.slug, title: c.map?.course.title ?? c.course.title })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {entry?.map && dueSettled ? (
              <View onLayout={(e: LayoutChangeEvent) => setPathInCourse(e.nativeEvent.layout.y)}>
                <LessonPath
                  key={entry.course.id}
                  map={entry.map}
                  dialect={entry.course.dialect}
                  due={due ?? 0}
                  openReview={openReview}
                  onFocus={onFocus}
                  onUnits={setUnits}
                  onCourse={setRailSections}
                  near={nearUnits}
                  seen={seenUnits}
                  inView={inView}
                  onOpenRail={openRail}
                  reveal={reveal}
                  onReveal={onReveal}
                  onCard={onCard}
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
 * The pinned unit's height, its colour on its lip: it takes over once no more of the banner than this is on screen,
 * covering the rest rather than half a banner, and the next unit's divider turns it as it goes under its foot.
 */
const PIN_HEIGHT = 126;

/** How long after the path is first centred a card arriving above it may still move the scroll to follow. */
const FOLLOW_MS = 4000;

/** The start of the road, while the course is on its way. */
function CourseSkeleton(): React.JSX.Element {
  return (
    <View style={styles.course}>
      <LessonPathSkeleton />
    </View>
  );
}

/** The letters and first words, and the dictionary: two buttons in one pill under the bell, drawn as that pill is. */
function LearnTools(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  return (
    <ActionPill>
      <HeaderButton icon="text" label={t('words.title')} onPress={() => navigation.navigate('Words')} testID="learn-words" />
      <HeaderButton icon="dictionary" label={t('nav.dictionary')} onPress={() => navigation.navigate('Dictionary')} testID="learn-dictionary" />
    </ActionPill>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.xs },
  header: { gap: layout.rowGap, marginBottom: spacing.sm },
  // The course's name at the reading edge and the pill at the far end, under the bell's.
  top: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },

  course: { gap: spacing.sm + 4, marginTop: spacing.xs },
  courseTitle: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  flex: { flex: 1 },
  switcher: { flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  chip: { minHeight: MIN_TOUCH_TARGET, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  failed: { gap: spacing.sm, marginTop: spacing.xs },
  failedText: { fontSize: typography.sizes.text },

  pinned: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: spacing.xs, paddingHorizontal: layout.gutter },
  jumpWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  jump: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radii.pill,
  },
  jumpText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
