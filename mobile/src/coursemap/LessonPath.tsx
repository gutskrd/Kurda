import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  PATH_GEOMETRY,
  PATH_MOTION,
  PATH_RETURN,
  hostBox,
  lean,
  lessonPath,
  mascotSpot,
  pathChanges,
  pathLand,
  pathSnapshot,
  type PathChanges,
  type PathSnapshot,
  type PathStop,
  type PathUnit,
  type PlacedStop,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { timing, useEnter } from '../theme/animate';
import { display, sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { duration, pressedDim } from '../theme/motion';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { JumpSheet } from './JumpSheet';
import { REST, TONES, stopLabel, type ToneColors } from './path';
import { MASCOT_MIN_WIDTH, PathMascot } from './PathMascot';
import { LearnerToken, PathHostView, UnitLand } from './PathWorld';
import { SkillNodeView, type StopChange } from './SkillNodeView';
import { StopSheet } from './StopSheet';
import { UnitGuide } from './UnitGuide';
import type { CourseMap, SkillNode } from './types';

const { node: NODE, step: STEP } = PATH_GEOMETRY;
const BANNER_LIP = 5;
const PHONE_WIDTH = 390;

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;

/**
 * The path last drawn for each course, while the app runs: Learn reads the
 * course again each time it comes back into view, so coming back from a
 * lesson finds the path as it was before it, and can show what the lesson
 * changed (shared `pathChanges`) rather than only the new state.
 */
const LAST_DRAWN = new Map<string, PathSnapshot>();

/** The units whose stops have risen into place already, by course, while the app runs: each rises once. */
const RISEN = new Set<string>();

const NO_STOPS: ReadonlySet<string> = new Set();

/** What coming back changed, and where the learner was before it: the bubble and Hevalo move on from there. */
interface Return {
  changes: PathChanges;
  /** the skill that was current before the lesson */
  was: string | null;
}

/**
 * One course as a lesson path: each unit opens with a banner in its own colour
 * — its number and name, what it covers, how far through it you are, and its
 * guide when it has grammar notes — and its skills follow as round stops down
 * one gently winding line, with review beside the current skill when words
 * are due and a trophy closing every unit. The rules are @kurda/shared's
 * `lessonPath`, which the website draws from too.
 *
 * `onFocus` hears where, from the top of the path, the stop to open on sits
 * (the current skill, or the furthest point reached), once it has been laid
 * out, so the screen can scroll to it.
 *
 * A later unit whose first skill is still closed can be jumped to (shared
 * `PathUnit.jump`): its first stop offers it, "Jump here?", and opens a sheet
 * (JumpSheet) that starts the test (JumpTestScreen).
 *
 * Each unit's stops stand on a land of their own (shared `pathLand`): its
 * ground edge to edge, its stepping stones, its landmark beside the route, and
 * one of the course's people by its last stop (PathWorld). The learner's own
 * picture stands on the stop to do now, and Hevalo beside it (PathMascot).
 * A unit with grammar notes opens with its guide, an open book on the path;
 * every unit ends at its chest. The screen says which units are near the
 * screen (`near`: drawn in full), which can be seen (`seen`: their stops rise
 * into place the first time), and which is in view (`inView`: the one that
 * moves); without them the units round the stop to do now are drawn and
 * nothing waits.
 *
 * Coming back from a lesson, the path moves before it settles (shared
 * `PATH_RETURN`): the ring fills on, a finished skill pops, an opened one
 * trades its padlock for its number, a unit's chest earned wobbles and
 * bursts open, and then the bubble, the page, the learner (with a hop) and
 * Hevalo move on to the skill to do now — where he cheers. Until then the
 * focus stays where the learner was, so the page is still there when the
 * path starts to move. Under Reduce Motion none of it plays: the path is
 * drawn as it now is.
 */
export interface PathFocus {
  key: string;
  /** the stop's centre, from the top of the path */
  y: number;
  /** a skill to do now (rather than the end of everything open) */
  current: boolean;
}

/**
 * Where a unit sits on the path, from the path's top: what the screen needs
 * to keep the unit being scrolled through named at the top of the page.
 */
export interface UnitPlace {
  unitId: string;
  /** the unit's top, and where its banner ends and the unit itself ends */
  top: number;
  bannerBottom: number;
  bottom: number;
  number: number;
  title: string;
  tone: ToneColors;
  /** skills finished, of `total`, and whether the learner is in it now: what the rail of units shows */
  done: number;
  total: number;
  here: boolean;
  /** open the unit's guide; absent when it has none */
  openGuide?: () => void;
}

export const LessonPath = memo(function LessonPath({
  map,
  due,
  onFocus,
  onUnits,
  near,
  seen,
  inView,
  dialect = null,
  onOpenRail,
}: {
  map: CourseMap;
  due: number;
  onFocus: (focus: PathFocus | null) => void;
  /** where each unit lies, once laid out, for a pinned banner */
  onUnits?: (units: UnitPlace[]) => void;
  /** the units near the screen, drawn in full; without it, those round the stop to do now */
  near?: ReadonlySet<string>;
  /** the units that can be seen, whose stops rise into place the first time; null before the screen has measured them */
  seen?: ReadonlySet<string> | null;
  /** the unit in the middle of the screen: the one that moves */
  inView?: string | null;
  /** the course's Kurdish, for the words its people say */
  dialect?: string | null;
  /** open the rail of every unit, from a unit banner's map button */
  onOpenRail?: () => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const live = useMotionAlive();
  const path = useMemo(() => lessonPath(map, { due, offerJumps: true, guides: true }), [map, due]);
  const courseId = map.course.id;

  /*
   * What changed since this course's path was last drawn: worked out as the
   * new path is drawn, so its first frame is already the one the changes
   * start from, and kept until the next return — the path drawn again for
   * another reason (the review count arriving) changes nothing and must not
   * cut it short. The new path is remembered once drawn.
   */
  const fresh = useMemo<Return | null>(() => {
    const before = LAST_DRAWN.get(courseId) ?? null;
    const changes = reduce ? null : pathChanges(before, path);
    if (!changes) return null;
    const was = before ? (Object.keys(before).find((key) => before[key]!.state === 'current') ?? null) : null;
    return { changes, was };
  }, [path, courseId, reduce]);
  const [kept, setKept] = useState<Return | null>(fresh);
  if (fresh && fresh !== kept) setKept(fresh);
  // the system asked for less motion while it played: what is left of it is simply drawn
  const back = reduce ? null : kept;
  useEffect(() => {
    LAST_DRAWN.set(courseId, pathSnapshot(path));
  }, [path, courseId]);
  // the bubble, the page and Hevalo move on to the new current skill once the rest has moved
  const [moved, setMoved] = useState<Return | null>(null);
  useEffect(() => {
    if (!back) return;
    const id = setTimeout(() => setMoved(back), PATH_RETURN.bubbleAtMs);
    return () => clearTimeout(id);
  }, [back]);
  const waiting = back !== null && moved !== back && back.changes.current !== null && back.was !== null;
  const focusKey = waiting ? back.was : path.focus;
  // the screen's width less its gutters until the path has been measured, so it draws at once
  // (a phone's width where the window has none to give yet)
  const [width, setWidth] = useState(() => (Dimensions.get('window').width || PHONE_WIDTH) - 2 * layout.gutter);
  const [open, setOpen] = useState<{ stop: Stop; unit: Unit } | null>(null);
  const [guide, setGuide] = useState<{ title: string; skills: SkillNode[] } | null>(null);
  const [jumpTo, setJumpTo] = useState<Unit | null>(null);
  // where each unit, and the path under its banner, sit — to find the focus stop on the page
  const unitTop = useRef<Record<string, number>>({});
  const unitHeight = useRef<Record<string, number>>({});
  const pathTop = useRef<Record<string, number>>({});
  // the app mirrors its own screens for Soranî and Arabic (reports/direction): so does the path
  const sign = dir.row === 'row-reverse' ? -1 : 1;

  const report = useCallback(() => {
    if (!focusKey) return onFocus(null);
    for (const unit of path.units) {
      const placed = unit.stops.find((p) => p.stop.key === focusKey);
      if (!placed) continue;
      const u = unitTop.current[unit.unitId];
      const p = pathTop.current[unit.unitId];
      if (u !== undefined && p !== undefined) onFocus({ key: focusKey, y: u + p + placed.y, current: path.current !== null });
      return;
    }
  }, [path, focusKey, onFocus]);

  useEffect(() => {
    report();
  }, [report]);

  // every unit laid out: where each starts, where its banner ends and where it ends
  const placeUnits = useCallback(() => {
    if (!onUnits) return;
    const places: UnitPlace[] = [];
    for (const unit of path.units) {
      const top = unitTop.current[unit.unitId];
      const height = unitHeight.current[unit.unitId];
      if (top === undefined || height === undefined) return;
      places.push({
        unitId: unit.unitId,
        top,
        bannerBottom: top + (pathTop.current[unit.unitId] ?? height),
        bottom: top + height,
        number: unit.number,
        title: unit.title,
        tone: TONES[scheme][unit.tone],
        done: unit.done,
        total: unit.total,
        here: unit.stops.some((p) => p.stop.key === path.current),
        openGuide:
          unit.guide.length > 0 ? () => setGuide({ title: t('coursemap.path.guideFor', { unit: unit.title }), skills: unit.guide }) : undefined,
      });
    }
    onUnits(places);
  }, [onUnits, path, scheme, t]);

  const lesson = (lessonId: string) => {
    setOpen(null);
    navigation.navigate('Lesson', { lessonId, courseId: map.course.id });
  };
  const review = () => {
    setOpen(null);
    navigation.navigate('Practice');
  };

  // what each stop shows of the return: one object per stop for the whole return, so each plays it once
  const stopChanges = useMemo(() => (back ? changesByStop(back, path.units) : {}), [back, path.units]);
  // the line into the skill to do now has been walked only since the lesson: it fills in as the path moves on to it
  const freshTrail = useMemo(() => (back && back.was !== null && back.changes.current ? new Set([back.changes.current]) : NO_STOPS), [back]);
  // Hevalo by the current skill — by the one before it until the path has moved on — when the screen leaves him room
  const mascotAt = path.current && width >= MASCOT_MIN_WIDTH ? (waiting ? back.was : path.current) : null;
  const cheer = moved !== null && moved === back && (back.changes.finished.length > 0 || back.changes.opened.length > 0);
  // the learner stands where Hevalo does; once the path has moved on they hop there from the stop they finished
  const tokenAt = path.current ? (waiting ? back.was : path.current) : null;
  const hopFrom = moved !== null && moved === back && back.was !== null && back.changes.current !== null ? back.was : null;
  const unitOfCurrent = path.units.find((u) => u.stops.some((p) => p.stop.key === path.current))?.unitId ?? null;

  // the units drawn in full: those the screen says are near, or, before it says, those round the stop to do now
  const focusIndex = Math.max(
    0,
    path.units.findIndex((u) => u.stops.some((p) => p.stop.key === focusKey)),
  );
  const drawn = useMemo(
    () => near ?? new Set(path.units.filter((_, i) => i === 0 || Math.abs(i - focusIndex) <= 1).map((u) => u.unitId)),
    [near, path.units, focusIndex],
  );
  const moving = (unitId: string): boolean => live && (inView === undefined || inView === unitId);

  // the stop to do now bobs, and the learner on it, while its unit is in view
  const bob = useRef(new Animated.Value(0)).current;
  const bobbing = live && !waiting && unitOfCurrent !== null && (inView === undefined || inView === unitOfCurrent);
  useEffect(() => {
    if (!bobbing) {
      bob.setValue(0);
      return;
    }
    const half = PATH_MOTION.bobMs / 2;
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -PATH_MOTION.bob, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(bob, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    run.start();
    return () => {
      run.stop();
      bob.setValue(0);
    };
  }, [bobbing, bob]);

  // the first time a unit can be seen, its stops rise into place one after another; until then they wait under the ground
  const rises = useRef<Record<string, Animated.Value>>({}).current;
  const riseOf = (unit: Unit): Animated.Value | null => {
    if (reduce || seen === undefined) return null;
    return (rises[unit.unitId] ??= new Animated.Value(RISEN.has(`${courseId}:${unit.unitId}`) ? 1 : 0));
  };
  useEffect(() => {
    if (reduce || !seen) return;
    for (const unit of path.units) {
      const mark = `${courseId}:${unit.unitId}`;
      if (!seen.has(unit.unitId) || RISEN.has(mark)) continue;
      RISEN.add(mark);
      const value = (rises[unit.unitId] ??= new Animated.Value(0));
      Animated.timing(value, {
        toValue: 1,
        duration: PATH_MOTION.riseMs + PATH_MOTION.riseEach * unit.stops.length,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    }
  }, [seen, reduce, path.units, courseId, rises]);

  return (
    <View style={styles.units}>
      {path.units.map((unit, i) => {
        const tone = TONES[scheme][unit.tone];
        const land = pathLand(i);
        const full = drawn.has(unit.unitId);
        const rise = riseOf(unit);
        const riseTotal = PATH_MOTION.riseMs + PATH_MOTION.riseEach * unit.stops.length;
        const mascotHere = unit.stops.find((p) => p.stop.key === mascotAt);
        const host = full && width > 0 ? hostBox(unit.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y })), width, mascotHere ? { key: mascotHere.stop.key, x: mascotHere.x, y: mascotHere.y } : null) : null;
        const tokenHere = unit.stops.find((p) => p.stop.key === tokenAt) ?? null;
        const fromHere = hopFrom ? (unit.stops.find((p) => p.stop.key === hopFrom) ?? null) : null;
        const last = unit.stops[unit.stops.length - 1];
        const cx = (x: number): number => width / 2 + sign * x;
        return (
          <View
            key={unit.unitId}
            style={styles.unit}
            onLayout={(e: LayoutChangeEvent) => {
              unitTop.current[unit.unitId] = e.nativeEvent.layout.y;
              unitHeight.current[unit.unitId] = e.nativeEvent.layout.height;
              report();
              placeUnits();
            }}
          >
            {i > 0 ? <UnitDivider number={unit.number} total={path.units.length} /> : null}
            <Banner unit={unit} tone={tone} onRail={onOpenRail} />
            {unit.stops.length > 0 ? (
              <View
                style={[styles.path, { height: unit.height }]}
                testID="lp-land"
                onLayout={(e: LayoutChangeEvent) => {
                  pathTop.current[unit.unitId] = e.nativeEvent.layout.y;
                  setWidth(e.nativeEvent.layout.width);
                  report();
                  placeUnits();
                }}
              >
                {width > 0 ? (
                  <>
                    <UnitLand unit={unit} land={land} width={width} sign={sign} near={full} live={moving(unit.unitId)} fresh={freshTrail} />
                    {host && last ? (
                      <PathHostView
                        host={land.host}
                        box={host.box}
                        left={cx(host.box.x) - host.box.w / 2}
                        flip={cx(host.box.x) > cx(last.x)}
                        live={moving(unit.unitId)}
                        praise={unit.done > 0 || unit.unitId === unitOfCurrent}
                        dialect={dialect}
                      />
                    ) : null}
                    {unit.stops.map((placed, k) => {
                      const jumpHere = unit.jumpKey === placed.stop.key;
                      const from = (k * PATH_MOTION.riseEach) / riseTotal;
                      const to = Math.min(1, (k * PATH_MOTION.riseEach + PATH_MOTION.riseMs) / riseTotal);
                      return (
                        <PathStopView
                          key={placed.stop.key}
                          placed={placed}
                          unit={unit}
                          tone={tone}
                          left={cx(placed.x) - NODE / 2}
                          change={stopChanges[placed.stop.key] ?? null}
                          jump={jumpHere}
                          near={full}
                          bob={placed.stop.key === tokenAt && !waiting ? bob : null}
                          bobbing={bobbing && placed.stop.key === path.current}
                          rise={rise ? rise.interpolate({ inputRange: [0, from, to, 1], outputRange: [0, 0, 1, 1] }) : null}
                          onOpen={() => {
                            const stop = placed.stop;
                            if (stop.kind === 'guide') setGuide({ title: t('coursemap.path.guideFor', { unit: unit.title }), skills: stop.skills });
                            else if (jumpHere) setJumpTo(unit);
                            else setOpen({ stop, unit });
                          }}
                          onStart={lesson}
                        />
                      );
                    })}
                    {tokenHere ? (
                      <LearnerToken
                        // a new place is a new arrival: the hop plays from where they were
                        key={tokenHere.stop.key}
                        at={{ x: cx(tokenHere.x), y: tokenHere.y }}
                        from={hopFrom ? (fromHere ? { x: cx(fromHere.x), y: fromHere.y } : { x: cx(tokenHere.x), y: tokenHere.y - 2 * PATH_GEOMETRY.step }) : null}
                        tone={tone}
                        bob={waiting ? null : bob}
                      />
                    ) : null}
                    {unit.stops
                      .filter((placed) => placed.stop.key === mascotAt)
                      .map((placed) => {
                        const spot = mascotSpot(placed);
                        const x = cx(spot.x);
                        return (
                          // a new place is a new arrival: he arrives there, and cheers when there is something to cheer
                          <PathMascot
                            key={placed.stop.key}
                            x={x}
                            stopY={placed.y}
                            flip={x > cx(placed.x)}
                            cheer={cheer}
                            onPress={() => setOpen({ stop: placed.stop, unit })}
                          />
                        );
                      })}
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <StopSheet
        open={open}
        tone={open ? TONES[scheme][open.unit.tone] : null}
        onClose={() => setOpen(null)}
        onLesson={lesson}
        onReview={review}
        onTips={(skill) => {
          setOpen(null);
          setGuide({ title: t('coursemap.path.tipsFor', { skill: skill.title }), skills: [skill] });
        }}
      />
      <UnitGuide guide={guide} onClose={() => setGuide(null)} />
      <JumpSheet
        unit={jumpTo}
        tone={jumpTo ? TONES[scheme][jumpTo.tone] : null}
        onClose={() => setJumpTo(null)}
        onStart={() => {
          if (!jumpTo) return;
          setJumpTo(null);
          navigation.navigate('JumpTest', { courseId, unitId: jumpTo.unitId });
        }}
      />
    </View>
  );
});

/** Each stop's part in a return, by its key: only the stops it touches. */
function changesByStop({ changes, was }: Return, units: readonly Unit[]): Record<string, StopChange> {
  const out: Record<string, StopChange> = {};
  const at = (key: string): StopChange => (out[key] ??= {});
  for (const ring of changes.ring) at(ring.key).ringFrom = ring.from;
  for (const key of changes.finished) at(key).finishing = true;
  for (const key of changes.opened) at(key).opening = true;
  if (changes.current && was !== null) at(changes.current).arriving = true;
  // a unit whose last skills were just finished: the lesson earned its chest
  for (const unit of units) {
    const end = unit.stops[unit.stops.length - 1]?.stop;
    if (end?.kind === 'trophy' && end.earned && unit.stops.some((p) => changes.finished.includes(p.stop.key))) at(end.key).unlocking = true;
  }
  return out;
}

/**
 * A stop with its words: the full label for a screen reader, and "Start" over
 * the current skill — or, on the first stop of a unit that can be jumped to,
 * the offer to jump.
 */
function PathStopView({
  placed,
  unit,
  tone,
  left,
  change,
  jump,
  near,
  bob,
  bobbing,
  rise,
  onOpen,
  onStart,
}: {
  placed: PlacedStop<SkillNode>;
  unit: Unit;
  tone: ToneColors;
  left: number;
  change: StopChange | null;
  jump: boolean;
  near: boolean;
  bob: Animated.Value | null;
  bobbing: boolean;
  rise: Animated.AnimatedInterpolation<number> | null;
  onOpen: () => void;
  onStart: (lessonId: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { stop, y } = placed;
  const { words, state } = stopLabel(stop, unit);
  const label = jump
    ? t('coursemap.jump.label', { n: formatNumber(unit.number, locale) })
    : t(words.key, { ...words.params, ...(state ? { state: t(state) } : {}) });
  const current = stop.kind === 'skill' && stop.state === 'current' && stop.launch ? stop : null;
  const word = current ? (current.lessonsDone > 0 ? t('learn.continue.button') : t('coursemap.path.start')) : '';
  return (
    <SkillNodeView
      stop={stop}
      left={left}
      top={y - NODE / 2}
      tone={tone}
      unitTone={unit.tone}
      label={label}
      callout={current ? { text: word, label: `${word}: ${current.skill.title}` } : undefined}
      change={change}
      jump={jump ? { text: t('coursemap.jump.bubble') } : undefined}
      near={near}
      bob={bob}
      bobbing={bobbing}
      rise={rise}
      onPress={onOpen}
      onStart={current?.launch ? () => onStart(current.launch!) : undefined}
    />
  );
}

/**
 * Between one unit and the next, a quiet line across the page — "Unit 2 of 4"
 * between two hairlines in the grey of the line ahead — so a long path reads
 * in chapters, and where in the course this unit lies is said where it
 * begins. The first unit has the course's own heading above it instead.
 */
function UnitDivider({ number, total }: { number: number; total: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.divider, { flexDirection: dir.row }]} testID="lp-unit-divider">
      <View style={[styles.hairline, { backgroundColor: REST[scheme].line }]} />
      <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
        {t('coursemap.path.unitOf', { n: formatNumber(number, locale), total: formatNumber(total, locale) })}
      </Text>
      <View style={[styles.hairline, { backgroundColor: REST[scheme].line }]} />
    </View>
  );
}

/**
 * A unit's banner, in its colour, sitting on a darker lip of the same colour:
 * where one unit ends and the next begins, so the path needs no other line
 * between them. Its number and name are one heading, read as one ("Unit 2,
 * Family & Food"), as the pinned header reads it once the banner has gone up.
 */
function Banner({ unit, tone, onRail }: { unit: Unit; tone: ToneColors; onRail?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const { scheme } = useTheme();
  return (
    <View style={[styles.bannerLip, { backgroundColor: tone.lip, borderColor: OUTLINE[scheme] }]}>
      <View style={[styles.banner, { backgroundColor: tone.fill }]}>
        <View style={[styles.bannerHead, { flexDirection: dir.row }]}>
          <View style={styles.bannerWords} accessible accessibilityRole="header" accessibilityLabel={unitHeading(t('coursemap.path.unit', { n: unit.number }), unit.title)}>
            <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]}>{t('coursemap.path.unit', { n: unit.number })}</Text>
            <Text style={[styles.bannerTitle, dir.text, { color: tone.ink }]}>{unit.title}</Text>
          </View>
          {onRail ? (
            <Pressable
              onPress={onRail}
              accessibilityRole="button"
              accessibilityLabel={t('learn.map.title')}
              testID="lp-unit-rail"
              style={({ pressed }) => [styles.railButton, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? pressedDim : 1 }]}
            >
              <Icon name="flag" size={20} color={tone.ink} />
            </Pressable>
          ) : null}
        </View>
        {unit.topics.length > 0 ? <Text style={[styles.topics, dir.text, { color: tone.ink }]}>{unit.topics.join(' · ')}</Text> : null}
        <Text style={[styles.count, styles.countLine, dir.text, { color: tone.ink }]}>{t('coursemap.path.unitDone', { done: unit.done, total: unit.total })}</Text>
      </View>
    </View>
  );
}

/** The one ink the banners are outlined in, as the stops and the land are (shared art/path-land.ts). */
const OUTLINE = { light: '#4a2a1a', dark: '#3a2016' } as const;

/** "Unit 2, Family & Food": a unit's number and name, said as one heading. */
function unitHeading(number: string, title: string): string {
  return `${number}, ${title}`;
}

/**
 * The unit being scrolled through, pinned to the top of the page once its own
 * banner has gone up out of sight: its number over its name, in the unit's
 * colour, so it is always clear which unit these stops belong to — and its
 * guide still one tap away.
 *
 * It arrives as the banner goes up under it — a short fade, settling down a
 * few points — and, scrolled on into the next unit, it turns into that one:
 * the new colour and name cross-fade in over the old (`duration.base`,
 * opacity alone, on the native driver). Under Reduce Motion it simply
 * appears, and simply changes.
 */
export function PinnedUnit({ unit, onRail }: { unit: UnitPlace; onRail?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const arrive = useEnter(!reduce, 0, duration.base);
  const dropIn = { opacity: arrive, transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [-PIN_DROP, 0] }) }] };
  const fade = useRef(new Animated.Value(1)).current;
  // the unit it is turning from, drawn under the new one while that fades in
  const [from, setFrom] = useState<UnitPlace | null>(null);
  const last = useRef(unit);
  useEffect(() => {
    const before = last.current;
    last.current = unit;
    if (before.unitId === unit.unitId) return;
    if (reduce) {
      setFrom(null);
      fade.setValue(1);
      return;
    }
    setFrom(before);
    fade.setValue(0);
    const run = timing(fade, 1, duration.base);
    run.start(({ finished }) => {
      if (finished) setFrom(null);
    });
    return () => run.stop();
    // a new unit, not a new object for the same one, is what turns it
  }, [unit.unitId, reduce]);
  return (
    <Animated.View testID="lp-pinned-unit" style={dropIn}>
      {from ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <PinFace unit={from} />
        </View>
      ) : null}
      <Animated.View style={{ opacity: fade }}>
        <PinFace unit={unit} onRail={onRail} />
      </Animated.View>
    </Animated.View>
  );
}

/** How far the pinned unit settles down as it arrives. */
const PIN_DROP = 6;

function PinFace({ unit, onRail }: { unit: UnitPlace; onRail?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const { tone } = unit;
  const number = t('coursemap.path.unit', { n: unit.number });
  return (
    <View style={[styles.pinLip, { backgroundColor: tone.lip }]}>
      <View style={[styles.pin, { flexDirection: dir.row, backgroundColor: tone.fill }]}>
        <View style={styles.pinWords} accessible accessibilityRole="header" accessibilityLabel={unitHeading(number, unit.title)}>
          <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]} numberOfLines={1}>
            {number}
          </Text>
          <Text style={[styles.pinTitle, dir.text, { color: tone.ink }]} numberOfLines={1}>
            {unit.title}
          </Text>
        </View>
        {unit.openGuide ? (
          <Pressable
            onPress={unit.openGuide}
            accessibilityRole="button"
            accessibilityLabel={t('coursemap.path.guideFor', { unit: unit.title })}
            style={({ pressed }) => [styles.pinGuide, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? pressedDim : 1 }]}
          >
            <Icon name="book" size={18} color={tone.ink} />
          </Pressable>
        ) : null}
        {onRail ? (
          <Pressable
            onPress={onRail}
            accessibilityRole="button"
            accessibilityLabel={t('learn.map.title')}
            style={({ pressed }) => [styles.pinGuide, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? pressedDim : 1 }]}
          >
            <Icon name="flag" size={18} color={tone.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The path while the course loads: a unit's banner and its first stops, on
 * the same zigzag and at the same spacing as the real ones (the geometry is
 * shared), so the course drops into the shape that held its place.
 */
export function LessonPathSkeleton({ stops = 4 }: { stops?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const [width, setWidth] = useState(() => (Dimensions.get('window').width || PHONE_WIDTH) - 2 * layout.gutter);
  const sign = dir.row === 'row-reverse' ? -1 : 1;
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.units}>
      <View style={styles.unit}>
        <View style={[styles.bannerLip, { backgroundColor: colors.surface }]}>
          <View style={[styles.banner, { backgroundColor: colors.surface }]}>
            <SkeletonText size={typography.sizes.xs} width={56} style={start} />
            <SkeletonText size={typography.sizes.lg} lineHeight={BANNER_TITLE_LINE} width="42%" style={start} />
            <SkeletonText size={typography.sizes.sm} width="72%" style={[start, styles.topicsSkeleton]} />
            <View style={[styles.bannerFoot, { flexDirection: dir.row }]}>
              <SkeletonText size={typography.sizes.xs} width={72} />
              <Skeleton width={96} height={MIN_TOUCH_TARGET} radius={radii.pill} />
            </View>
          </View>
        </View>
        <View style={[styles.path, { height: PATH_GEOMETRY.pad + (stops - 1) * STEP + NODE }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {Array.from({ length: stops }, (_, i) => (
            <Skeleton
              key={i}
              width={NODE}
              height={NODE}
              radius={radii.pill}
              style={[styles.stopSkeleton, { left: width / 2 + sign * lean(i) * PATH_GEOMETRY.sway - NODE / 2, top: PATH_GEOMETRY.pad + i * STEP - NODE / 2 }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** display(22) sets 1.12 */
const BANNER_TITLE_LINE = Math.round(typography.sizes.lg * typography.displayLineHeight);

const styles = StyleSheet.create({
  stopSkeleton: { position: 'absolute' },
  topicsSkeleton: { marginTop: 2 },
  units: { gap: spacing.sm },
  unit: { gap: 0 },
  divider: { alignItems: 'center', gap: spacing.sm + 4, paddingHorizontal: spacing.xs, marginBottom: spacing.md },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { ...sectionLabel },
  // edge to edge: the land runs under the page's gutters to the screen's sides, and a little under the banner above it
  path: { position: 'relative', marginHorizontal: -layout.gutter, marginTop: -spacing.md },
  bannerLip: { borderRadius: radii.xl, paddingBottom: BANNER_LIP, borderWidth: 2, zIndex: 2 },
  banner: { borderRadius: radii.xl - 2, paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg, gap: 2 },
  bannerHead: { alignItems: 'flex-start', gap: spacing.sm },
  bannerWords: { flex: 1 },
  countLine: { marginTop: spacing.xs },
  railButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginEnd: -spacing.sm },
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.86 },
  bannerTitle: { ...display(typography.sizes.lg) },
  topics: { fontSize: typography.sizes.sm, opacity: 0.9, marginTop: 2 },
  bannerFoot: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  count: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  guide: { alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  guideText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  pinLip: { borderRadius: radii.lg, paddingBottom: 4 },
  pin: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingStart: spacing.md, paddingEnd: spacing.sm },
  pinWords: { flex: 1 },
  pinTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  pinGuide: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
