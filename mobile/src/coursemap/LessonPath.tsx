import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Dimensions, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  PATH_GEOMETRY,
  PATH_MOTION,
  PATH_RETURN,
  lean,
  lessonPath,
  mascotSpot,
  pathChanges,
  pathLand,
  pathSnapshot,
  type LessonPath as Path,
  type PathChanges,
  type PathSection,
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
import { REST, TONES, levelWords, stopLabel, type ToneColors } from './path';
import { MASCOT_MIN_WIDTH, PathMascot } from './PathMascot';
import { LearnerToken, UnitLand, UpcomingSign, type RailSection } from './PathWorld';
import { SkillNodeView, type StopChange } from './SkillNodeView';
import { StopSheet } from './StopSheet';
import { UnitGuide } from './UnitGuide';
import type { CourseMap, SkillNode } from './types';

const { node: NODE, step: STEP } = PATH_GEOMETRY;
const PHONE_WIDTH = 390;

type Stop = PathStop<SkillNode>;
type Unit = PathUnit<SkillNode>;
type Section = PathSection<SkillNode>;

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
 * One course as a lesson path, a section at a time. The course's units are
 * grouped into sections by their level in the course plan (shared
 * `lessonPath`'s `sections`: A1, A2, B1 on the road), and one section is open:
 * the one the learner is in. A section before it is one compact card, which
 * opens it again when tapped; a later one is a card that says what it is —
 * its number, its level, how many chapters — shut, with the offer to test out
 * to it where the course allows (JumpSheet). A course without levels is one
 * section, and shows no cards.
 *
 * In the open section each unit's stops follow one gently winding line: its
 * four topics, review beside the current one when words are due, and as its
 * last stop the story that closes the chapter (its prize; a unit without one
 * ends at its chest). The first unit opens under a heading in its colour —
 * "Section 1 · Chapter 1" over its name, with its guide (the grammar notes) in
 * the book button on the far side and the map of every unit beside it — the
 * same face the pinned header wears once it has gone up out of sight
 * (PinnedUnit); each unit after it begins at a quiet divider with its name.
 *
 * `onFocus` hears where, from the top of the path, the stop to open on sits
 * (the current skill, or the furthest point reached), once it has been laid
 * out, so the screen can scroll to it; null while that stop is in a section
 * that is shut. `onUnits` hears where each unit of the open section lies, for
 * the pinned header, and `onCourse` every unit in its section, for the map of
 * them all. `reveal` asks for a unit to be brought into view (from that map):
 * its section opens, and `onReveal` hears where the unit — or, in a section
 * still shut, the section's card — sits.
 *
 * A later unit whose first skill is still closed can be jumped to (shared
 * `PathUnit.jump`): its first stop offers it, "Jump here?", and opens a sheet
 * (JumpSheet) that starts the test (JumpTestScreen).
 *
 * Each unit's stops stand on a land of their own (shared `pathLand`): its
 * ground edge to edge, its stepping stones, its landmark beside the route, and
 * one of the course's people by its last stop (PathWorld). The learner's own
 * picture stands on the stop to do now, and Hevalo beside it (PathMascot).
 * The screen says which units are near the screen (`near`: drawn in full),
 * which can be seen (`seen`: their stops rise into place the first time), and
 * which is in view (`inView`: the one that moves); without them the units
 * round the stop to do now are drawn and nothing waits.
 *
 * Coming back from a lesson, the path moves before it settles (shared
 * `PATH_RETURN`): a topic's ring fills its piece, a finished topic pops as it
 * turns gold and its star drops in, a round made whole on a gold topic earns
 * its next star, an opened one trades its padlock for its number, a chapter's
 * prize wobbles and bursts open, and then the bubble, the page, the learner
 * (with a hop) and Hevalo move on to the skill to do now — where he cheers,
 * and into the next section when the lesson finished one. Until then the
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
 * Where a unit of the open section sits on the path, from the path's top:
 * what the screen needs to keep the unit being scrolled through named at the
 * top of the page.
 */
export interface UnitPlace {
  unitId: string;
  /** the unit's top, and where its heading (or divider) ends and the unit itself ends */
  top: number;
  bannerBottom: number;
  bottom: number;
  number: number;
  title: string;
  tone: ToneColors;
  /** the section it is in, from 1; null in a course of one section, which is not named */
  section: number | null;
  /** skills finished, of `total`, and whether the learner is in it now */
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
  onCourse,
  near,
  seen,
  inView,
  onOpenRail,
  reveal,
  onReveal,
}: {
  map: CourseMap;
  due: number;
  onFocus: (focus: PathFocus | null) => void;
  /** where each unit of the open section lies, once laid out, for a pinned header */
  onUnits?: (units: UnitPlace[]) => void;
  /** every unit of the course in its section, for the map of them all */
  onCourse?: (sections: RailSection[]) => void;
  /** the units near the screen, drawn in full; without it, those round the stop to do now */
  near?: ReadonlySet<string>;
  /** the units that can be seen, whose stops rise into place the first time; null before the screen has measured them */
  seen?: ReadonlySet<string> | null;
  /** the unit in the middle of the screen: the one that moves */
  inView?: string | null;
  /** open the map of every unit, from a unit heading's map button */
  onOpenRail?: () => void;
  /** a unit to bring into view (`at` tells one ask from the next) */
  reveal?: { unitId: string; at: number } | null;
  /** where, from the top of the path, the unit asked for (or its section's card) sits */
  onReveal?: (y: number) => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const live = useMotionAlive();
  const path = useMemo(() => lessonPath(map, { due, offerJumps: true }), [map, due]);
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
  /*
   * The section open: the one picked from its card, else, coming back from a
   * lesson, the one it was played in (a lesson played again in a section
   * finished long ago is seen filling its ring there), and once the path has
   * moved on, or with nothing to show, the one the focus is in — the
   * learner's, or during a return the one they were in until the path moves
   * on, so a lesson that finishes a section is seen finishing it. A pick
   * lasts until the learner moves into another section, or comes back from a
   * lesson played in another.
   */
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedFor, setPickedFor] = useState(path.section);
  if (pickedFor !== path.section) {
    setPickedFor(path.section);
    setPicked(null);
  }
  if (fresh && fresh !== kept) {
    setKept(fresh);
    const playedIn = playedSection(path, fresh);
    if (picked !== null && playedIn !== null && playedIn !== picked) setPicked(null);
  }
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
  const movedOn = back !== null && back.changes.current !== null && moved === back;
  const playedIn = back && !movedOn ? playedSection(path, back) : null;
  const focusSection = sectionOf(path, focusKey) ?? path.section;
  const open = Math.min(path.sections.length - 1, picked ?? playedIn ?? focusSection);
  const shown = path.sections[open] ?? null;
  const named = path.sections.length > 1;

  // the screen's width less its gutters until the path has been measured, so it draws at once
  // (a phone's width where the window has none to give yet)
  const [width, setWidth] = useState(() => (Dimensions.get('window').width || PHONE_WIDTH) - 2 * layout.gutter);
  const [sheet, setSheet] = useState<{ stop: Stop; unit: Unit } | null>(null);
  const [guide, setGuide] = useState<{ title: string; skills: SkillNode[] } | null>(null);
  const [jumpTo, setJumpTo] = useState<Unit | null>(null);
  // where each unit, and the path under its heading, sit — to find the focus stop on the page
  const unitTop = useRef<Record<string, number>>({});
  const unitHeight = useRef<Record<string, number>>({});
  const pathTop = useRef<Record<string, number>>({});
  // where each section's card, and the open section, sit
  const sectionTop = useRef<Record<string, number>>({});
  // the app mirrors its own screens for Soranî and Arabic (reports/direction): so does the path
  const sign = dir.row === 'row-reverse' ? -1 : 1;
  const openUnits = useMemo(() => shown?.units ?? [], [shown]);

  const report = useCallback(() => {
    if (!focusKey || !shown) return onFocus(null);
    for (const unit of openUnits) {
      const placed = unit.stops.find((p) => p.stop.key === focusKey);
      if (!placed) continue;
      const s = sectionTop.current[shown.key];
      const u = unitTop.current[unit.unitId];
      const p = pathTop.current[unit.unitId];
      if (s !== undefined && u !== undefined && p !== undefined) onFocus({ key: focusKey, y: s + u + p + placed.y, current: path.current !== null });
      return;
    }
    // the stop to open on is in a section that is shut
    onFocus(null);
  }, [path, focusKey, onFocus, openUnits, shown]);

  useEffect(() => {
    report();
  }, [report]);

  // a unit asked for from the map: its section opens, and once it is laid out the screen hears where it is
  const asked = useRef<{ unitId: string; at: number } | null>(null);
  const answer = useCallback(() => {
    const want = asked.current;
    if (!want || !onReveal) return;
    const at = path.sections.findIndex((s) => s.units.some((u) => u.unitId === want.unitId));
    const section = path.sections[at];
    if (!section) return;
    if (at !== open) {
      const card = sectionTop.current[section.key];
      if (section.state === 'locked' && card !== undefined) {
        asked.current = null;
        onReveal(card);
      }
      return;
    }
    const s = sectionTop.current[section.key];
    const u = unitTop.current[want.unitId];
    if (s === undefined || u === undefined) return;
    asked.current = null;
    onReveal(s + u);
  }, [onReveal, path.sections, open]);
  useEffect(() => {
    if (!reveal) return;
    asked.current = reveal;
    const at = path.sections.findIndex((s) => s.units.some((u) => u.unitId === reveal.unitId));
    if (at >= 0 && path.sections[at]!.state !== 'locked' && at !== open) setPicked(at);
    answer();
    // a new ask, not a new path, is what opens a section
  }, [reveal]);

  // every unit of the open section laid out: where each starts, where its heading ends and where it ends
  const placeUnits = useCallback(() => {
    answer();
    if (!onUnits || !shown) return;
    const s = sectionTop.current[shown.key];
    if (s === undefined) return;
    const places: UnitPlace[] = [];
    for (const unit of openUnits) {
      const top = unitTop.current[unit.unitId];
      const height = unitHeight.current[unit.unitId];
      if (top === undefined || height === undefined) return;
      places.push({
        unitId: unit.unitId,
        top: s + top,
        bannerBottom: s + top + (pathTop.current[unit.unitId] ?? height),
        bottom: s + top + height,
        number: unit.number,
        title: unit.title,
        tone: TONES[scheme][unit.tone],
        section: named ? unit.section : null,
        done: unit.done,
        total: unit.total,
        here: unit.stops.some((p) => p.stop.key === path.current),
        openGuide: unit.guide.length > 0 ? () => setGuide({ title: t('coursemap.path.guideFor', { unit: unit.title }), skills: unit.guide }) : undefined,
      });
    }
    onUnits(places);
  }, [onUnits, openUnits, shown, path.current, scheme, named, t, answer]);

  // the map of every unit, in its section
  useEffect(() => {
    onCourse?.(
      path.sections.map((section) => ({
        number: named ? section.number : null,
        level: levelWords(section.level)?.name ?? null,
        units: section.units.map((u) => ({
          unitId: u.unitId,
          number: u.number,
          title: u.title,
          tone: TONES[scheme][u.tone],
          done: u.done,
          total: u.total,
          here: u.stops.some((p) => p.stop.key === path.current),
        })),
      })),
    );
  }, [onCourse, path, scheme, named]);

  const lesson = (lessonId: string) => {
    setSheet(null);
    navigation.navigate('Lesson', { lessonId, courseId: map.course.id });
  };
  const review = () => {
    setSheet(null);
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
    openUnits.findIndex((u) => u.stops.some((p) => p.stop.key === focusKey)),
  );
  const drawn = useMemo(
    () => near ?? new Set(openUnits.filter((_, i) => i === 0 || Math.abs(i - focusIndex) <= 1).map((u) => u.unitId)),
    [near, openUnits, focusIndex],
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
    for (const unit of openUnits) {
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
  }, [seen, reduce, openUnits, courseId, rises]);

  const guideOf = (unit: Unit) => (unit.guide.length > 0 ? () => setGuide({ title: t('coursemap.path.guideFor', { unit: unit.title }), skills: unit.guide }) : undefined);

  return (
    <View style={styles.units}>
      {path.sections.map((section, s) =>
        s !== open ? (
          <View
            key={section.key}
            onLayout={(e: LayoutChangeEvent) => {
              sectionTop.current[section.key] = e.nativeEvent.layout.y;
              answer();
            }}
          >
            <SectionCard
              section={section}
              here={s === path.section}
              onOpen={() => setPicked(s)}
              onJump={section.jumpTo ? () => setJumpTo(section.jumpTo) : undefined}
            />
          </View>
        ) : (
          <View
            key={section.key}
            testID="lp-section-open"
            onLayout={(e: LayoutChangeEvent) => {
              sectionTop.current[section.key] = e.nativeEvent.layout.y;
              report();
              placeUnits();
            }}
          >
            {section.units.map((unit, i) => {
              const tone = TONES[scheme][unit.tone];
              const land = pathLand(unit.number - 1);
              const full = drawn.has(unit.unitId);
              const rise = riseOf(unit);
              const riseTotal = PATH_MOTION.riseMs + PATH_MOTION.riseEach * unit.stops.length;
              const tokenHere = unit.stops.find((p) => p.stop.key === tokenAt) ?? null;
              const fromHere = hopFrom ? (unit.stops.find((p) => p.stop.key === hopFrom) ?? null) : null;
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
                  {i === 0 ? (
                    <UnitFace
                      number={unit.number}
                      title={unit.title}
                      tone={tone}
                      section={named ? unit.section : null}
                      openGuide={guideOf(unit)}
                      onRail={onOpenRail}
                      testID="lp-unit-head"
                    />
                  ) : (
                    <UnitDivider number={unit.number} title={unit.title} />
                  )}
                  {unit.stops.length > 0 ? (
                    <View
                      style={[styles.path, i === 0 ? styles.pathUnderHead : null, { height: unit.height }]}
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
                                onOpen={() => (jumpHere ? setJumpTo(unit) : setSheet({ stop: placed.stop, unit }))}
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
                                  onPress={() => setSheet({ stop: placed.stop, unit })}
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
          </View>
        ),
      )}
      {map.upcoming ? <UpcomingSign upcoming={map.upcoming} live={live} /> : null}
      <StopSheet
        open={sheet}
        tone={sheet ? TONES[scheme][sheet.unit.tone] : null}
        onClose={() => setSheet(null)}
        onLesson={lesson}
        onReview={review}
        onPractise={(unitId) => {
          setSheet(null);
          navigation.navigate('Practice', { mode: 'unit', unitId });
        }}
        onTips={(skill) => {
          setSheet(null);
          setGuide({ title: t('coursemap.path.tipsFor', { skill: skill.title }), skills: [skill] });
        }}
        onStory={(slug) => {
          setSheet(null);
          navigation.navigate('StoryReader', { slug });
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

/** The section a stop is in, from 0; null for no stop. */
function sectionOf(path: Path<SkillNode>, key: string | null): number | null {
  if (!key) return null;
  const at = path.sections.findIndex((s) => s.units.some((u) => u.stops.some((p) => p.stop.key === key)));
  return at >= 0 ? at : null;
}

/** The section a return's lesson was played in: where its first ring moved, or its first skill was finished. */
function playedSection(path: Path<SkillNode>, { changes }: Return): number | null {
  return sectionOf(path, changes.ring[0]?.key ?? changes.finished[0] ?? null);
}

/** Each stop's part in a return, by its key: only the stops it touches. */
function changesByStop({ changes, was }: Return, units: readonly Unit[]): Record<string, StopChange> {
  const out: Record<string, StopChange> = {};
  const at = (key: string): StopChange => (out[key] ??= {});
  for (const ring of changes.ring) at(ring.key).ring = ring;
  for (const key of changes.finished) {
    at(key).finishing = true;
    // it turns gold from how it looked: the stop to do now, or an open one beside it
    at(key).wasLook = key === was ? 'current' : 'available';
  }
  for (const key of changes.opened) at(key).opening = true;
  if (changes.current && was !== null) at(changes.current).arriving = true;
  // a unit whose last topics were just finished: the lesson won its prize, its story (or its chest)
  for (const unit of units) {
    const end = unit.stops[unit.stops.length - 1]?.stop;
    const won = end?.kind === 'story' ? end.open : end?.kind === 'trophy' ? end.earned : false;
    if (end && won && unit.stops.some((p) => changes.finished.includes(p.stop.key))) at(end.key).unlocking = true;
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
 * Between one unit and the next, a quiet line across the page with the next
 * unit's number and name between two hairlines in the grey of the line ahead,
 * so a long path reads in chapters and each says where it begins. The name
 * wraps rather than being cut. The first unit of a section has its heading
 * instead.
 */
function UnitDivider({ number, title }: { number: number; title: string }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const chapter = t('coursemap.path.unit', { n: formatNumber(number, locale) });
  return (
    <View style={[styles.divider, { flexDirection: dir.row }]} testID="lp-unit-divider" accessible accessibilityRole="header" accessibilityLabel={unitHeading(chapter, title)}>
      <View style={[styles.hairline, { backgroundColor: REST[scheme].line }]} />
      <View style={styles.dividerWords}>
        <Text style={[styles.dividerEyebrow, { color: colors.textSecondary }]}>{chapter}</Text>
        {/* the course's own words: on a right-to-left page they line up with it and still read their own way */}
        <Text style={[styles.dividerTitle, dir.free, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <View style={[styles.hairline, { backgroundColor: REST[scheme].line }]} />
    </View>
  );
}

/** "Chapter 2, Family & Food", or "Section 1, Chapter 2, Family & Food": a unit's place and name, said as one heading. */
function unitHeading(number: string, title: string, section?: string | null): string {
  return section ? `${section}, ${number}, ${title}` : `${number}, ${title}`;
}

/**
 * A unit's heading, in its colour on a darker lip of the same colour:
 * "Section 1 · Chapter 2" over its name (the section left out in a course of
 * one), the guide to its grammar on the far side as a book — where the unit
 * has notes — and the map of every unit beside it. The first unit of the open
 * section opens under it, and the same face is pinned to the top of the page
 * as the units are scrolled through (PinnedUnit), so the one always takes the
 * other's place. Number and name are one heading, read as one.
 */
function UnitFace({
  number,
  title,
  tone,
  section,
  openGuide,
  onRail,
  testID,
}: {
  number: number;
  title: string;
  tone: ToneColors;
  section: number | null;
  openGuide?: () => void;
  onRail?: () => void;
  testID?: string;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const chapter = t('coursemap.path.unit', { n: formatNumber(number, locale) });
  const eyebrow = section !== null ? t('coursemap.path.sectionUnit', { section: formatNumber(section, locale), unit: formatNumber(number, locale) }) : chapter;
  const sectionWords = section !== null ? t('coursemap.path.section', { n: formatNumber(section, locale) }) : null;
  return (
    <View style={[styles.pinLip, { backgroundColor: tone.lip }]} testID={testID}>
      <View style={[styles.pin, { flexDirection: dir.row, backgroundColor: tone.fill }]}>
        <View style={styles.pinWords} accessible accessibilityRole="header" accessibilityLabel={unitHeading(chapter, title, sectionWords)}>
          {/* both wrap rather than being cut: "Abschnitt 1 · Kapitel 2" is long beside two buttons on a narrow phone */}
          <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]}>{eyebrow}</Text>
          <Text style={[styles.pinTitle, dir.free, { color: tone.ink }]}>{title}</Text>
        </View>
        {openGuide ? (
          <Pressable
            onPress={openGuide}
            accessibilityRole="button"
            accessibilityLabel={t('coursemap.path.guideFor', { unit: title })}
            testID="lp-unit-guide"
            style={({ pressed }) => [styles.pinButton, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? pressedDim : 1 }]}
          >
            <Icon name="book" size={20} color={tone.ink} />
          </Pressable>
        ) : null}
        {onRail ? (
          <Pressable
            onPress={onRail}
            accessibilityRole="button"
            accessibilityLabel={t('learn.map.title')}
            testID="lp-unit-rail"
            style={({ pressed }) => [styles.pinButton, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? pressedDim : 1 }]}
          >
            <Icon name="flag" size={20} color={tone.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A section of the course that is not open, as one card: its number
 * ("Section 2"), its level by the app's own plain name for it ("Beginner")
 * with a line saying what that is like, and where it stands — done, how far
 * the learner is through it, or, shut, how many chapters wait in it and what
 * opens it. A section done or begun opens when tapped; a shut one stays shut,
 * and offers the test to jump to it where the course allows ("Jump here?",
 * JumpSheet).
 */
function SectionCard({ section, here, onOpen, onJump }: { section: Section; here: boolean; onOpen: () => void; onJump?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const n = (v: number): string => formatNumber(v, locale);
  const number = t('coursemap.path.section', { n: n(section.number) });
  const level = levelWords(section.level);
  const eyebrow = number;
  const name = level ? t(level.name) : null;
  const title = name ?? number;
  const count = section.units.length === 1 ? t('coursemap.path.sectionUnitsOne') : t('coursemap.path.sectionUnits', { count: n(section.units.length) });
  const status =
    section.state === 'done'
      ? t('coursemap.path.sectionDone')
      : section.state === 'locked'
        ? count
        : t('coursemap.path.sectionProgress', { done: n(section.unitsDone), total: n(section.units.length) });
  const after = section.state === 'locked' && section.number > 1 ? t('coursemap.path.sectionOpensAfter', { n: n(section.number - 1) }) : null;
  const label = [eyebrow, name, level ? t(level.hint) : null, here ? t('coursemap.path.sectionHere') : null, status, section.state === 'done' ? count : null, after]
    .filter(Boolean)
    .join(', ');
  const badge =
    section.state === 'done' ? (
      <View style={[styles.cardBadge, { backgroundColor: colors.gold }]}>
        <Icon name="check" size={22} color={colors.textOnGold} />
      </View>
    ) : section.state === 'locked' ? (
      <View style={[styles.cardBadge, { backgroundColor: colors.controlTrack }]}>
        <Icon name="lock" size={20} color={colors.textSecondary} />
      </View>
    ) : (
      <View style={[styles.cardBadge, { backgroundColor: `${colors.primary}1F` }]}>
        <Text style={[styles.cardBadgeNumber, { color: colors.primary }]}>{n(section.number)}</Text>
      </View>
    );
  const words = (
    <View style={styles.cardWords}>
      <Text style={[styles.cardEyebrow, dir.text, { color: colors.textSecondary }]}>{eyebrow}</Text>
      {name ? <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]}>{title}</Text> : null}
      {level ? <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]}>{t(level.hint)}</Text> : null}
      <Text style={[styles.cardLine, dir.text, { color: here ? colors.primary : colors.textSecondary }]}>
        {here ? `${t('coursemap.path.sectionHere')} · ${status}` : status}
      </Text>
      {section.state === 'done' ? <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]}>{count}</Text> : null}
      {after ? <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]}>{after}</Text> : null}
    </View>
  );
  if (section.state === 'locked') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]} testID={`lp-section-${section.number}`}>
        <View style={[styles.cardRow, { flexDirection: dir.row }]} accessible accessibilityLabel={label}>
          {badge}
          {words}
        </View>
        {onJump ? (
          <Pressable
            onPress={onJump}
            accessibilityRole="button"
            accessibilityLabel={t('coursemap.jump.label', { n: n(section.jumpTo?.number ?? section.units[0]!.number) })}
            testID="lp-section-jump"
            style={({ pressed }) => [styles.cardJump, { flexDirection: dir.row, borderColor: colors.primary, opacity: pressed ? pressedDim : 1 }, dir.rtl ? styles.cardJumpEnd : null]}
          >
            <Icon name="skip-forward" size={18} color={colors.primary} style={dir.flip} />
            <Text style={[styles.cardJumpText, { color: colors.primary }]}>{t('coursemap.jump.bubble')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`lp-section-${section.number}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
    >
      <View style={[styles.cardRow, { flexDirection: dir.row }]}>
        {badge}
        {words}
        <Icon name={dir.rtl ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

/**
 * The unit being scrolled through, pinned to the top of the page once its own
 * heading has gone up out of sight: "Section 1 · Chapter 2" over its name, in
 * the unit's colour, with its guide and the map of every unit one tap away —
 * the same face the heading has, so the one takes the other's place.
 *
 * It arrives as the heading goes up under it — a short fade, settling down a
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
  const face = (u: UnitPlace, rail?: () => void) => (
    <UnitFace number={u.number} title={u.title} tone={u.tone} section={u.section} openGuide={u.openGuide} onRail={rail} />
  );
  return (
    <Animated.View testID="lp-pinned-unit" style={dropIn}>
      {from ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {face(from)}
        </View>
      ) : null}
      <Animated.View style={{ opacity: fade }}>{face(unit, onRail)}</Animated.View>
    </Animated.View>
  );
}

/** How far the pinned unit settles down as it arrives. */
const PIN_DROP = 6;

/**
 * The path while the course loads: a unit's heading and its first stops, on
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
        <View style={[styles.pinLip, { backgroundColor: colors.surface }]}>
          <View style={[styles.pin, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
            <View style={styles.pinWords}>
              <SkeletonText size={typography.sizes.xs} width={112} style={start} />
              <SkeletonText size={typography.sizes.md} width="48%" style={start} />
            </View>
            <Skeleton width={MIN_TOUCH_TARGET} height={MIN_TOUCH_TARGET} radius={radii.pill} />
          </View>
        </View>
        <View style={[styles.path, styles.pathUnderHead, { height: PATH_GEOMETRY.pad + (stops - 1) * STEP + NODE }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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

const styles = StyleSheet.create({
  stopSkeleton: { position: 'absolute' },
  units: { gap: spacing.sm },
  unit: { gap: 0 },
  divider: { alignItems: 'center', gap: spacing.sm + 4, paddingHorizontal: spacing.xs, paddingVertical: spacing.md },
  hairline: { flex: 1, height: StyleSheet.hairlineWidth },
  // the words between the hairlines wrap in their own share of the line rather than pushing them off it
  dividerWords: { flexShrink: 1, maxWidth: '72%', alignItems: 'center', gap: 2 },
  dividerEyebrow: { ...sectionLabel, textAlign: 'center' },
  dividerTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  // edge to edge: the land runs under the page's gutters to the screen's sides
  path: { position: 'relative', marginHorizontal: -layout.gutter },
  // and a little under the heading above it
  pathUnderHead: { marginTop: -spacing.md },
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1.2, textTransform: 'uppercase' },
  pinLip: { borderRadius: radii.lg, paddingBottom: 4, zIndex: 2 },
  pin: { alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingStart: spacing.md, paddingEnd: spacing.xs },
  pinWords: { flex: 1, gap: 2 },
  pinTitle: { ...display(typography.sizes.md + 2) },
  pinButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm + 4 },
  cardRow: { alignItems: 'center', gap: spacing.sm + 4 },
  cardBadge: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  cardBadgeNumber: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  cardWords: { flex: 1, gap: 2 },
  cardEyebrow: { ...sectionLabel },
  cardTitle: { ...display(typography.sizes.lg) },
  cardLine: { fontSize: typography.sizes.sm },
  cardJump: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 2,
  },
  cardJumpEnd: { alignSelf: 'flex-end' },
  cardJumpText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
});
