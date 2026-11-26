import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, BackHandler, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Pressable } from '../theme/Pressable';
import {
  PATH_GEOMETRY,
  PATH_MOTION,
  PATH_RETURN,
  PATH_START_WORDS,
  isSoraniDialect,
  lessonPath,
  mascotSpot,
  openingStops,
  pathChanges,
  pathKilimSvg,
  pathLand,
  pathSnapshot,
  unitRounds,
  type LessonPath as Path,
  type PathChanges,
  type PathSection,
  type PathSnapshot,
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
import { layout, radii, spacing, typography, wash } from '../theme/tokens';
import { JumpSheet } from './JumpSheet';
import { REST, TONES, levelWords, stopLabel, type ToneColors } from './path';
import { MASCOT_MIN_WIDTH, PathMascot } from './PathMascot';
import { UnitLandmark, UnitScenery, UpcomingSign, type RailSection } from './PathWorld';
import { ChapterArt } from './PathScene';
import { SkillNodeView, type StopChange } from './SkillNodeView';
import { StopCard, type StopActions } from './StopCard';
import { UnitGuide } from './UnitGuide';
import type { CourseMap, SkillNode } from './types';
import { pageWidth } from '../theme/pageWidth';

const { node: NODE } = PATH_GEOMETRY;
const PHONE_WIDTH = 390;
/** How far under its stop's button a card begins: the stop's base and a little air, as on the website. */
const CARD_BELOW = 26;

type Unit = PathUnit<SkillNode>;
type Section = PathSection<SkillNode>;

/**
 * The path last drawn for each course, kept while the app runs, so a return from a lesson can animate what changed
 * (shared `pathChanges`) instead of only showing the new state.
 */
const LAST_DRAWN = new Map<string, PathSnapshot>();

/** Units whose stops have already risen into place, by course; each rises once per app run. */
const RISEN = new Set<string>();

/** What a return from a lesson changed, and where the learner was before it. */
interface Return {
  changes: PathChanges;
  /** The current skill before the lesson. */
  was: string | null;
}

/**
 * One course as a lesson path, one section open at a time. Units are grouped into sections by level (shared
 * `lessonPath`). Earlier sections collapse to a card that reopens them; later ones are shut cards that may offer a
 * jump test (JumpSheet). A course without levels is one section with no cards.
 *
 * In the open section each unit's stops follow one winding line beside its landmark (PathWorld). A tapped stop opens
 * its card under it (StopCard), and a tap anywhere else on the road closes it. The first unit sits
 * under a heading with its guide and the unit map; later units start at a divider. The pinned header (PinnedUnit)
 * repeats the heading once it scrolls away.
 *
 * Callbacks report layout back to the screen: `onFocus` the stop to scroll to (null while its section is shut),
 * `onUnits` the open section's units for the pinned header, and `onCourse` every unit for the unit map. `reveal`
 * opens a unit's section and reports its position through `onReveal`. `near`, `seen` and `inView` say which units
 * to draw in full, which rise into place, and which animates; without them, the units round the current stop are
 * drawn and nothing waits.
 *
 * Returning from a lesson, the path animates the changes before moving on (shared `PATH_RETURN`): rings fill,
 * topics turn gold and earn stars, padlocks open and prizes burst, then the bubble, page and Hevalo move to the
 * new current skill. Until then the focus stays where the learner was. Under Reduce Motion the path is drawn
 * as it now is.
 */
export interface PathFocus {
  key: string;
  /** The stop's centre, from the top of the path. */
  y: number;
  /** A skill to do now, rather than the end of everything open. */
  current: boolean;
}

/** Where a unit of the open section sits, from the path's top, so the screen can name it in the pinned header. */
export interface UnitPlace {
  unitId: string;
  /** The unit's top, the end of its heading (or divider), and its end. */
  top: number;
  bannerBottom: number;
  bottom: number;
  number: number;
  title: string;
  tone: ToneColors;
  /** Its section, from 1; null in a single-section course, where sections are not named. */
  section: number | null;
  /** Skills finished, of `total`, and whether the learner is in this unit now. */
  done: number;
  total: number;
  here: boolean;
  /** Opens the unit's guide; absent when it has none. */
  openGuide?: () => void;
}

export const LessonPath = memo(function LessonPath({
  map,
  dialect,
  due,
  openReview = null,
  onFocus,
  onUnits,
  onCourse,
  near,
  seen,
  inView,
  onOpenRail,
  reveal,
  onReveal,
  onCard,
}: {
  map: CourseMap;
  /** The course's dialect, whose own words the bubble over the stop to do now speaks. */
  dialect?: string;
  due: number;
  /** A review left part-way through, which the review stop picks up rather than starting another beside it. */
  openReview?: string | null;
  onFocus: (focus: PathFocus | null) => void;
  /** Where each unit of the open section lies, once laid out, for the pinned header. */
  onUnits?: (units: UnitPlace[]) => void;
  /** Every unit of the course by section, for the unit map. */
  onCourse?: (sections: RailSection[]) => void;
  /** Units near the screen, drawn in full; without it, those round the current stop. */
  near?: ReadonlySet<string>;
  /** Units on screen, whose stops rise into place the first time; null before the screen has measured them. */
  seen?: ReadonlySet<string> | null;
  /** The unit in the middle of the screen, the only one that animates. */
  inView?: string | null;
  /** Opens the unit map from a heading's map button. */
  onOpenRail?: () => void;
  /** A unit to bring into view; `at` tells one request from the next. */
  reveal?: { unitId: string; at: number } | null;
  /** Where the requested unit (or its shut section's card) sits, from the top of the path. */
  onReveal?: (y: number) => void;
  /** Where an open stop's card spans, from its stop's top to its own foot, from the top of the path, to scroll it into view. */
  onCard?: (top: number, bottom: number) => void;
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
   * Worked out while the new path is drawn, so its first frame is the one the changes start from. Kept until the
   * next return: a redraw for another reason (the review count arriving) must not cut it short.
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
   * The open section: the one picked from its card; else, on a return, the one the lesson was played in; else the
   * one holding the focus. A pick lasts until the learner moves into another section or returns from a lesson
   * played elsewhere.
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
  // Under Reduce Motion, even if switched on mid-return, the path is simply drawn as it is.
  const back = reduce ? null : kept;
  useEffect(() => {
    LAST_DRAWN.set(courseId, pathSnapshot(path));
  }, [path, courseId]);
  // The bubble, page and Hevalo move to the new current skill once the rest has moved.
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

  // The screen width less gutters until the path is measured, so it draws at once.
  const [width, setWidth] = useState(() => (pageWidth() || PHONE_WIDTH) - 2 * layout.gutter);
  // The stop whose card is open, by key, so the card follows the stop through a redraw.
  const [card, setCard] = useState<{ key: string; unitId: string } | null>(null);
  // A layout that moves while a card is open moves the card with it.
  const [, setCardMoved] = useState(0);
  const cardOpen = useRef(false);
  cardOpen.current = card !== null;
  const moveCard = useCallback(() => {
    if (cardOpen.current) setCardMoved((n) => n + 1);
  }, []);
  const [guide, setGuide] = useState<{ title: string; skills: SkillNode[] } | null>(null);
  const [jumpTo, setJumpTo] = useState<Unit | null>(null);
  // Where each unit, and the path under its heading, sit, to find the focus stop.
  const unitTop = useRef<Record<string, number>>({});
  const unitHeight = useRef<Record<string, number>>({});
  const pathTop = useRef<Record<string, number>>({});
  // Where each section's card, and the open section, sit.
  const sectionTop = useRef<Record<string, number>>({});
  // The path mirrors with the app for right-to-left languages (reports/direction).
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
    // The focus stop is in a shut section.
    onFocus(null);
  }, [path, focusKey, onFocus, openUnits, shown]);

  useEffect(() => {
    report();
  }, [report]);

  // A unit requested from the map: open its section, then report where it is once laid out.
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
    // Only a new request opens a section, not a new path.
  }, [reveal]);

  // Where each unit of the open section starts, where its heading ends, and where it ends.
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

  // Every unit by section, for the unit map.
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
    setCard(null);
    navigation.navigate('Lesson', { lessonId, courseId: map.course.id });
  };
  const review = () => {
    setCard(null);
    if (openReview) navigation.navigate('Practice', { sessionId: openReview });
    else navigation.navigate('Practice');
  };

  // One stable object per stop for the whole return, so each stop plays its change once.
  const stopChanges = useMemo(() => (back ? changesByStop(back, path.units) : {}), [back, path.units]);
  // Hevalo stands by the previous skill until the path moves on, and only when there is room for him.
  const mascotAt = path.current && width >= MASCOT_MIN_WIDTH ? (waiting ? back.was : path.current) : null;
  // Where Hevalo stands in a unit, so its playful touches keep off him.
  const mascotStop = (unit: Unit): { x: number; y: number } | null => {
    const here = unit.stops.find((p) => p.stop.key === mascotAt);
    return here ? mascotSpot(here) : null;
  };
  // The bubble over the stop to do now speaks the course's own dialect, whatever the reader's language.
  const startWords = PATH_START_WORDS[isSoraniDialect(dialect) ? 'sorani' : 'kurmanji'];
  const cheer = moved !== null && moved === back && (back.changes.finished.length > 0 || back.changes.opened.length > 0);
  // The stop that bobs: the one to do now, or the previous one until the path moves on.
  const bobAt = path.current ? (waiting ? back.was : path.current) : null;
  const unitOfCurrent = path.units.find((u) => u.stops.some((p) => p.stop.key === path.current))?.unitId ?? null;

  // Units drawn in full: those the screen reports as near, or before it does, those round the current stop.
  const focusIndex = Math.max(
    0,
    openUnits.findIndex((u) => u.stops.some((p) => p.stop.key === focusKey)),
  );
  const drawn = useMemo(
    () => near ?? new Set(openUnits.filter((_, i) => i === 0 || Math.abs(i - focusIndex) <= 1).map((u) => u.unitId)),
    [near, openUnits, focusIndex],
  );
  const moving = (unitId: string): boolean => live && (inView === undefined || inView === unitId);

  // The current stop bobs while its unit is in view.
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

  // The first time a unit is seen, its stops rise into place one after another.
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

  // The open card's stop, found afresh on every draw, and where its card goes.
  const opened = (() => {
    if (!card || !shown) return null;
    const unit = openUnits.find((u) => u.unitId === card.unitId);
    const placed = unit?.stops.find((p) => p.stop.key === card.key);
    if (!unit || !placed) return null;
    // A stop is laid out before it can be tapped; until then, the road's top.
    const stopTop = (sectionTop.current[shown.key] ?? 0) + (unitTop.current[card.unitId] ?? 0) + (pathTop.current[card.unitId] ?? 0) + placed.y - NODE / 2;
    return { unit, stop: placed.stop, stopTop, top: stopTop + NODE + CARD_BELOW, pointAt: width / 2 + sign * placed.x };
  })();
  const [cardHeight, setCardHeight] = useState(0);
  const [roadEnd, setRoadEnd] = useState(0);
  // Android's back button closes an open card before it leaves the screen.
  useEffect(() => {
    if (!card) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setCard(null);
      return true;
    });
    return () => sub.remove();
  }, [card]);
  const actions: StopActions = {
    onLesson: lesson,
    onReview: review,
    reviewOpen: Boolean(openReview),
    onPractise: (unitId) => {
      setCard(null);
      navigation.navigate('Practice', { mode: 'unit', unitId });
    },
    onTips: (skill) => {
      setCard(null);
      setGuide({ title: t('coursemap.path.tipsFor', { skill: skill.title }), skills: [skill] });
    },
    onStory: (slug) => {
      setCard(null);
      navigation.navigate('StoryReader', { slug });
    },
  };

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
              onOpen={() => {
                setCard(null);
                setPicked(s);
              }}
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
              moveCard();
            }}
          >
            {section.units.map((unit, i) => {
              const tone = TONES[scheme][unit.tone];
              const land = pathLand(unit.number - 1);
              const full = drawn.has(unit.unitId);
              const rise = riseOf(unit);
              const riseTotal = PATH_MOTION.riseMs + PATH_MOTION.riseEach * unit.stops.length;
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
                    moveCard();
                  }}
                >
                  {i === 0 ? (
                    <UnitFace
                      number={unit.number}
                      title={unit.title}
                      section={named ? unit.section : null}
                      tone={tone}
                      openGuide={guideOf(unit)}
                      onRail={onOpenRail}
                      testID="lp-unit-head"
                      live={moving(unit.unitId)}
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
                        moveCard();
                      }}
                    >
                      {width > 0 ? (
                        <>
                          <UnitLandmark land={land} width={width} sign={sign} near={full} live={moving(unit.unitId)} />
                          {unit.stops.map((placed, k) => {
                            const jumpHere = unit.jumpKey === placed.stop.key;
                            const from = (k * PATH_MOTION.riseEach) / riseTotal;
                            const to = Math.min(1, (k * PATH_MOTION.riseEach + PATH_MOTION.riseMs) / riseTotal);
                            return (
                              <PathStopView
                                key={placed.stop.key}
                                placed={placed}
                                unit={unit}
                                words={startWords}
                                tone={tone}
                                left={cx(placed.x) - NODE / 2}
                                change={stopChanges[placed.stop.key] ?? null}
                                jump={jumpHere}
                                near={full}
                                bob={placed.stop.key === bobAt && !waiting ? bob : null}
                                bobbing={bobbing && placed.stop.key === path.current}
                                rise={rise ? rise.interpolate({ inputRange: [0, from, to, 1], outputRange: [0, 0, 1, 1] }) : null}
                                onOpen={() => (jumpHere ? setJumpTo(unit) : setCard((was) => (was?.key === placed.stop.key ? null : { key: placed.stop.key, unitId: unit.unitId })))}
                                expanded={!jumpHere && card?.key === placed.stop.key}
                                onStart={lesson}
                              />
                            );
                          })}
                          {unit.stops
                            .filter((placed) => placed.stop.key === mascotAt)
                            .map((placed) => {
                              const spot = mascotSpot(placed);
                              const x = cx(spot.x);
                              return (
                                // A new place remounts him, so he arrives there.
                                <PathMascot
                                  key={placed.stop.key}
                                  x={x}
                                  stopY={placed.y}
                                  flip={x > cx(placed.x)}
                                  cheer={cheer}
                                  onPress={() => setCard({ key: placed.stop.key, unitId: unit.unitId })}
                                />
                              );
                            })}
                          <UnitScenery
                            unit={unit}
                            width={width}
                            sign={sign}
                            near={full && width >= MASCOT_MIN_WIDTH}
                            live={moving(unit.unitId)}
                            mascot={mascotStop(unit)}
                          />
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
      {opened ? (
        <>
          {/* A tap anywhere else on the road closes the card. */}
          <Pressable style={styles.cardShade} onPress={() => setCard(null)} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="lp-card-close" />
          <StopCard
            key={opened.stop.key}
            stop={opened.stop}
            unit={opened.unit}
            tone={TONES[scheme][opened.unit.tone]}
            top={opened.top}
            left={-layout.gutter}
            width={width}
            pointAt={opened.pointAt}
            onSize={(height) => {
              setCardHeight(height);
              onCard?.(opened.stopTop, opened.top + height);
            }}
            actions={actions}
          />
        </>
      ) : null}
      {/* Where the road ends, and room past it for a card under its last stop, laid over the road rather than in it. */}
      <View
        style={[styles.roadEnd, { height: opened ? Math.max(0, opened.top + cardHeight - roadEnd) : 0 }]}
        onLayout={(e: LayoutChangeEvent) => setRoadEnd(e.nativeEvent.layout.y)}
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
    // It turns gold from its previous look: the current stop, or an open one beside it.
    at(key).wasLook = key === was ? 'current' : 'available';
  }
  for (const key of changes.opened) at(key).opening = true;
  if (changes.current && was !== null) at(changes.current).arriving = true;
  // A unit whose last topics were just finished wins its prize: its story, or its chest.
  for (const unit of units) {
    const end = unit.stops[unit.stops.length - 1]?.stop;
    const won = end?.kind === 'story' ? end.open : end?.kind === 'trophy' ? end.earned : false;
    if (end && won && unit.stops.some((p) => changes.finished.includes(p.stop.key))) at(end.key).unlocking = true;
  }
  return out;
}

/** A stop with its screen-reader label, and "Start" over the current skill or "Jump here?" on a unit that can be jumped to. */
function PathStopView({
  placed,
  unit,
  words: startWords,
  tone,
  left,
  change,
  jump,
  near,
  bob,
  bobbing,
  rise,
  expanded,
  onOpen,
  onStart,
}: {
  placed: PlacedStop<SkillNode>;
  unit: Unit;
  /** The course's own words for the bubble over the stop to do now. */
  words: { start: string; going: string };
  tone: ToneColors;
  left: number;
  change: StopChange | null;
  jump: boolean;
  near: boolean;
  bob: Animated.Value | null;
  bobbing: boolean;
  rise: Animated.AnimatedInterpolation<number> | null;
  expanded: boolean;
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
  const word = current ? (current.lessonsDone > 0 ? startWords.going : startWords.start) : '';
  const said = current ? (current.lessonsDone > 0 ? t('learn.continue.button') : t('coursemap.path.start')) : '';
  return (
    <SkillNodeView
      stop={stop}
      left={left}
      top={y - NODE / 2}
      tone={tone}
      unitTone={unit.tone}
      label={label}
      callout={current ? { text: word, label: `${said}: ${current.skill.title}` } : undefined}
      change={change}
      jump={jump ? { text: t('coursemap.jump.bubble') } : undefined}
      milestone={stop.kind === 'story' || stop.kind === 'trophy' ? { number: formatNumber(unit.number, locale), rounds: unitRounds(unit.stops) } : null}
      near={near}
      bob={bob}
      bobbing={bobbing}
      rise={rise}
      expanded={jump ? undefined : expanded}
      onPress={onOpen}
      onStart={current?.launch ? () => onStart(current.launch!) : undefined}
    />
  );
}

/** The divider before each unit after a section's first: its number and name between two hairlines. The name wraps. */
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
        {/* Course text keeps its own direction on a right-to-left page. */}
        <Text style={[styles.dividerTitle, dir.free, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <View style={[styles.hairline, { backgroundColor: REST[scheme].line }]} />
    </View>
  );
}

/** A unit's place and name as one heading: "Section 1, Chapter 2, Family & Food". */
function unitHeading(number: string, title: string, section?: string | null): string {
  return section ? `${section}, ${number}, ${title}` : `${number}, ${title}`;
}

/**
 * A unit's heading on its own colour, standing on its darker lip: "Section 1 · Chapter 2" over its name (no section in
 * a single-section course), a kilim trim woven along its foot, and past a seam in the lip's colour at the far end the
 * guide's book and the unit map. PinnedUnit wears the same face.
 */
export function UnitFace({
  number,
  title,
  section,
  tone,
  openGuide,
  onRail,
  testID,
  live = true,
}: {
  number: number;
  title: string;
  section: number | null;
  /** The unit's own colours. */
  tone: ToneColors;
  openGuide?: () => void;
  onRail?: () => void;
  testID?: string;
  /** On screen, so its vignette may move; the pinned one always is. */
  live?: boolean;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [width, setWidth] = useState(0);
  const chapter = t('coursemap.path.unit', { n: formatNumber(number, locale) });
  const eyebrow = section !== null ? t('coursemap.path.sectionUnit', { section: formatNumber(section, locale), unit: formatNumber(number, locale) }) : chapter;
  const sectionWords = section !== null ? t('coursemap.path.section', { n: formatNumber(section, locale) }) : null;
  const buttons = Boolean(openGuide || onRail);
  // The app mirrors its own rows for a right-to-left language; the far end is then on the left.
  const mirrored = dir.row === 'row-reverse';
  const trim = useMemo(
    // A hidden screen can be laid out at no size at all; the trim waits for a real one.
    () => (width > 2 * TRIM.inset ? pathKilimSvg({ width: width - 2 * TRIM.inset, height: TRIM.height, ink: tone.ink, eye: tone.fill, idPrefix: `unitface${number}` }) : null),
    [width, tone.ink, tone.fill, number],
  );
  return (
    <View style={styles.bannerStand} testID={testID}>
      <View style={[styles.bannerLip, { backgroundColor: tone.lip }]} />
      <View
        style={[styles.banner, { flexDirection: dir.row, backgroundColor: tone.fill }]}
        onLayout={(e: LayoutChangeEvent) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setWidth((was) => (was === w ? was : w));
        }}
      >
        {trim ? (
          <View style={styles.trim} pointerEvents="none">
            <SvgXml xml={trim} width={width - 2 * TRIM.inset} height={TRIM.height} />
          </View>
        ) : null}
        <View style={styles.pin}>
          <View style={styles.pinWords} accessible accessibilityRole="header" accessibilityLabel={unitHeading(chapter, title, sectionWords)}>
            <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]}>{eyebrow}</Text>
            {/* Course text keeps its own direction on a right-to-left page, clear of the vignette. */}
            <Text style={[styles.pinTitle, dir.free, mirrored ? styles.pinTitleBesideLeft : styles.pinTitleBeside, { color: tone.ink }]}>{title}</Text>
          </View>
          {/* The chapter's own vignette, standing on the kilim beside its name, on the side the seam is. */}
          <View style={[styles.pinArt, mirrored ? styles.pinArtLeft : styles.pinArtEnd]} pointerEvents="none">
            <ChapterArt chapter={number - 1} ground={tone.lip} height={PIN_ART_H} live={live} />
          </View>
        </View>
        {buttons ? (
          <View style={[styles.pinActions, { borderColor: tone.lip }, dir.rtl ? styles.seamEnd : styles.seamStart]}>
            {openGuide ? (
              <Pressable
                onPress={openGuide}
                accessibilityRole="button"
                accessibilityLabel={t('coursemap.path.guideFor', { unit: title })}
                testID="lp-unit-guide"
                style={({ pressed }) => [styles.pinButton, { opacity: pressed ? pressedDim : 1 }]}
              >
                <Icon name="book" size={24} color={tone.ink} />
              </Pressable>
            ) : null}
            {onRail ? (
              <Pressable
                onPress={onRail}
                accessibilityRole="button"
                accessibilityLabel={t('learn.map.title')}
                testID="lp-unit-rail"
                style={({ pressed }) => [styles.pinButton, { opacity: pressed ? pressedDim : 1 }]}
              >
                <Icon name="flag" size={24} color={tone.ink} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The vignette's height in the banner, and the room the name leaves it. */
const PIN_ART_H = 76;
const PIN_ART_ROOM = 94;
/** The kilim trim along a banner's foot: its height, and how far in from the banner's sides it runs. */
const TRIM = { height: 12, inset: 14 } as const;
/** How far a banner stands above its lip. */
const BANNER_LIP = 6;

/**
 * A section that is not open, as a card: its number, level name and description, and progress, or for a shut
 * section how many chapters it holds. Done or begun sections open on tap; shut ones may offer a jump test.
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
      <View style={[styles.cardBadge, { backgroundColor: wash(colors.primary) }]}>
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
 * The unit being scrolled through, pinned to the top once its own heading has scrolled away, with the heading's
 * face. It drops in as the heading leaves, and as the next unit comes up its colour slides up over the last one's
 * (`duration.base`, transform only, native driver). Under Reduce Motion it appears and changes without moving.
 */
export function PinnedUnit({ unit, onRail }: { unit: UnitPlace; onRail?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const arrive = useEnter(!reduce, 0, duration.base);
  const dropIn = { opacity: arrive, transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [-PIN_DROP, 0] }) }] };
  const slide = useRef(new Animated.Value(1)).current;
  const [height, setHeight] = useState(0);
  // The previous unit, drawn under the new one while it slides in.
  const [from, setFrom] = useState<UnitPlace | null>(null);
  const last = useRef(unit);
  useEffect(() => {
    const before = last.current;
    last.current = unit;
    if (before.unitId === unit.unitId) return;
    if (reduce) {
      setFrom(null);
      slide.setValue(1);
      return;
    }
    setFrom(before);
    slide.setValue(0);
    const run = timing(slide, 1, duration.base);
    run.start(({ finished }) => {
      if (finished) setFrom(null);
    });
    return () => run.stop();
    // Only a new unit turns it, not a new object for the same one.
  }, [unit.unitId, reduce]);
  const face = (u: UnitPlace, rail?: () => void) => (
    <UnitFace number={u.number} title={u.title} section={u.section} tone={u.tone} openGuide={u.openGuide} onRail={rail} />
  );
  return (
    <Animated.View testID="lp-pinned-unit" style={dropIn}>
      <View style={styles.pinnedClip} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
        {from ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {face(from)}
          </View>
        ) : null}
        <Animated.View style={{ transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height || 120, 0] }) }] }}>{face(unit, onRail)}</Animated.View>
      </View>
    </Animated.View>
  );
}

/** How far the pinned unit settles down as it arrives. */
const PIN_DROP = 6;

/**
 * The path while the course loads, its stops where the shared layout puts a new learner's (`openingStops`), so the
 * course drops into place.
 */
export function LessonPathSkeleton({ stops = 4 }: { stops?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const [width, setWidth] = useState(() => (pageWidth() || PHONE_WIDTH) - 2 * layout.gutter);
  const sign = dir.row === 'row-reverse' ? -1 : 1;
  const opening = openingStops(stops);
  return (
    <View style={styles.units}>
      <View style={styles.unit}>
        <View style={[styles.pinLip, { backgroundColor: colors.surface }]}>
          <View style={[styles.pin, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
            <View style={styles.pinWords}>
              <SkeletonText size={typography.sizes.text} width={112} />
              <SkeletonText size={typography.sizes.text} width="48%" />
            </View>
            <Skeleton width={MIN_TOUCH_TARGET} height={MIN_TOUCH_TARGET} radius={radii.pill} />
          </View>
        </View>
        <View style={[styles.path, styles.pathUnderHead, { height: opening.height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {opening.stops.map(({ x, y }, i) => (
            <Skeleton
              key={i}
              width={NODE}
              height={NODE}
              radius={radii.pill}
              style={[styles.stopSkeleton, { left: width / 2 + sign * x - NODE / 2, top: y - NODE / 2 }]}
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
  // The words wrap within their share of the line rather than pushing the hairlines off it.
  dividerWords: { flexShrink: 1, maxWidth: '72%', alignItems: 'center', gap: 2 },
  dividerEyebrow: { ...sectionLabel, textAlign: 'center' },
  dividerTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  // The land runs under the page's gutters to the screen's edges.
  path: { position: 'relative', marginHorizontal: -layout.gutter },
  // And a little under the heading above.
  pathUnderHead: { marginTop: -spacing.md },
  eyebrow: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 1.2, textTransform: 'uppercase' },
  pinLip: { borderRadius: radii.lg, paddingBottom: 4, zIndex: 2 },
  // The banner stands on its lip: room under the face for it, and the lip the face's shape, set that far down.
  bannerStand: { paddingBottom: BANNER_LIP, zIndex: 2 },
  bannerLip: { position: 'absolute', left: 0, right: 0, top: BANNER_LIP, bottom: 0, borderRadius: radii.lg },
  banner: { borderRadius: radii.lg, overflow: 'hidden', minHeight: 116, alignItems: 'stretch' },
  trim: { position: 'absolute', left: TRIM.inset, bottom: 8, opacity: 0.32 },
  // The words at the top, the vignette standing below them at the far end.
  pin: { flex: 1, justifyContent: 'flex-start', paddingTop: spacing.sm + 4, paddingBottom: spacing.sm + 4 + 14, paddingHorizontal: spacing.md },
  // Standing on the kilim at the words' far end; the name keeps clear of it.
  pinArt: { position: 'absolute', bottom: 2 },
  pinArtEnd: { end: spacing.xs },
  pinArtLeft: { left: spacing.xs },
  pinTitleBeside: { paddingEnd: PIN_ART_ROOM },
  pinTitleBesideLeft: { paddingLeft: PIN_ART_ROOM },
  // The guide over the unit map, past the seam.
  pinActions: { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs, paddingBottom: 14 },
  seamStart: { borderLeftWidth: 2 },
  seamEnd: { borderRightWidth: 2 },
  pinnedClip: { overflow: 'hidden', borderRadius: radii.lg },
  // Over the whole road, gutters too, under the open card (StopCard's zIndex and elevation are one higher).
  // Takes back the gap before it, so the road ends where it did.
  roadEnd: { marginTop: -spacing.sm },
  cardShade: { position: 'absolute', top: 0, bottom: 0, left: -layout.gutter, right: -layout.gutter, zIndex: 10, elevation: 7 },
  pinWords: { flex: 1, gap: 2 },
  pinTitle: { ...display(typography.sizes.title) },
  pinButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm + 4 },
  cardRow: { alignItems: 'center', gap: spacing.sm + 4 },
  cardBadge: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  cardBadgeNumber: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  cardWords: { flex: 1, gap: 2 },
  cardEyebrow: { ...sectionLabel },
  cardTitle: { ...display(typography.sizes.text) },
  cardLine: { fontSize: typography.sizes.text },
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
  cardJumpText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
