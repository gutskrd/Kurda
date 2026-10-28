import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  PATH_GEOMETRY,
  PATH_RETURN,
  lean,
  lessonPath,
  mascotSpot,
  pathChanges,
  pathSnapshot,
  type PathChanges,
  type PathSnapshot,
  type PathStop,
  type PathUnit,
  type PlacedStop,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { JumpSheet } from './JumpSheet';
import { REST, TONES, stopLabel, type ToneColors } from './path';
import { MASCOT_MIN_WIDTH, PathMascot } from './PathMascot';
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
 * Hevalo stands beside the current skill (PathMascot). Coming back from a
 * lesson, the path moves before it settles (shared `PATH_RETURN`): the ring
 * fills on, a finished skill pops, an opened one trades its padlock for its
 * number, and then the bubble, the page and Hevalo move on to the skill to do
 * now — where he cheers. Until then the focus stays where the learner was, so
 * the page is still there when the path starts to move. Under Reduce Motion
 * none of it plays: the path is drawn as it now is.
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
  /** open the unit's guide; absent when it has none */
  openGuide?: () => void;
}

export function LessonPath({
  map,
  due,
  onFocus,
  onUnits,
}: {
  map: CourseMap;
  due: number;
  onFocus: (focus: PathFocus | null) => void;
  /** where each unit lies, once laid out, for a pinned banner */
  onUnits?: (units: UnitPlace[]) => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const path = useMemo(() => lessonPath(map, { due }), [map, due]);
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
  const stopChanges = useMemo(() => (back ? changesByStop(back) : {}), [back]);
  // Hevalo by the current skill — by the one before it until the path has moved on — when the screen leaves him room
  const mascotAt = path.current && width + 2 * layout.gutter >= MASCOT_MIN_WIDTH ? (waiting ? back.was : path.current) : null;
  const cheer = moved !== null && moved === back && (back.changes.finished.length > 0 || back.changes.opened.length > 0);

  return (
    <View style={styles.units}>
      {path.units.map((unit) => {
        const tone = TONES[scheme][unit.tone];
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
            <Banner unit={unit} tone={tone} onGuide={() => setGuide({ title: t('coursemap.path.guideFor', { unit: unit.title }), skills: unit.guide })} />
            {unit.stops.length > 0 ? (
              <View
                style={[styles.path, { height: unit.height }]}
                onLayout={(e: LayoutChangeEvent) => {
                  pathTop.current[unit.unitId] = e.nativeEvent.layout.y;
                  setWidth(e.nativeEvent.layout.width);
                  report();
                  placeUnits();
                }}
              >
                {width > 0 ? (
                  <>
                    <Trail unit={unit} width={width} sign={sign} walked={tone.fill} ahead={REST[scheme].line} />
                    {unit.stops.map((placed, i) => (
                      <PathStopView
                        key={placed.stop.key}
                        placed={placed}
                        unit={unit}
                        tone={tone}
                        left={width / 2 + sign * placed.x - NODE / 2}
                        change={stopChanges[placed.stop.key] ?? null}
                        jump={unit.jump && i === 0}
                        onOpen={() => (unit.jump && i === 0 ? setJumpTo(unit) : setOpen({ stop: placed.stop, unit }))}
                        onStart={lesson}
                      />
                    ))}
                    {unit.stops
                      .filter((placed) => placed.stop.key === mascotAt)
                      .map((placed) => {
                        const spot = mascotSpot(placed);
                        const x = width / 2 + sign * spot.x;
                        return (
                          // a new place is a new arrival: he arrives there, and cheers when there is something to cheer
                          <PathMascot
                            key={placed.stop.key}
                            x={x}
                            stopY={placed.y}
                            flip={x > width / 2 + sign * placed.x}
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
}

/** Each stop's part in a return, by its key: only the stops it touches. */
function changesByStop({ changes, was }: Return): Record<string, StopChange> {
  const out: Record<string, StopChange> = {};
  const at = (key: string): StopChange => (out[key] ??= {});
  for (const ring of changes.ring) at(ring.key).ringFrom = ring.from;
  for (const key of changes.finished) at(key).finishing = true;
  for (const key of changes.opened) at(key).opening = true;
  if (changes.current && was !== null) at(changes.current).arriving = true;
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
  onOpen,
  onStart,
}: {
  placed: PlacedStop<SkillNode>;
  unit: Unit;
  tone: ToneColors;
  left: number;
  change: StopChange | null;
  jump: boolean;
  onOpen: () => void;
  onStart: (lessonId: string) => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const { stop, y } = placed;
  const { words, state } = stopLabel(stop, unit.number);
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
      label={label}
      callout={current ? { text: word, label: `${word}: ${current.skill.title}` } : undefined}
      change={change}
      jump={jump ? { text: t('coursemap.jump.bubble') } : undefined}
      onPress={onOpen}
      onStart={current?.launch ? () => onStart(current.launch!) : undefined}
    />
  );
}

/**
 * A unit's banner, in its colour, sitting on a darker lip of the same colour:
 * where one unit ends and the next begins, so the path needs no other line
 * between them. Its number and name are one heading, read as one ("Unit 2,
 * Family & Food"), as the pinned header reads it once the banner has gone up.
 */
function Banner({ unit, tone, onGuide }: { unit: Unit; tone: ToneColors; onGuide: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={[styles.bannerLip, { backgroundColor: tone.lip }]}>
      <View style={[styles.banner, { backgroundColor: tone.fill }]}>
        <View accessible accessibilityRole="header" accessibilityLabel={unitHeading(t('coursemap.path.unit', { n: unit.number }), unit.title)}>
          <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]}>{t('coursemap.path.unit', { n: unit.number })}</Text>
          <Text style={[styles.bannerTitle, dir.text, { color: tone.ink }]}>{unit.title}</Text>
        </View>
        {unit.topics.length > 0 ? <Text style={[styles.topics, dir.text, { color: tone.ink }]}>{unit.topics.join(' · ')}</Text> : null}
        <View style={[styles.bannerFoot, { flexDirection: dir.row }]}>
          <Text style={[styles.count, { color: tone.ink }]}>{t('coursemap.path.unitDone', { done: unit.done, total: unit.total })}</Text>
          {unit.guide.length > 0 ? (
            <Pressable
              onPress={onGuide}
              accessibilityRole="button"
              accessibilityLabel={t('coursemap.path.guideFor', { unit: unit.title })}
              testID="lp-unit-guide"
              style={({ pressed }) => [styles.guide, { flexDirection: dir.row, backgroundColor: `${tone.ink}1F`, opacity: pressed ? 0.75 : 1 }]}
            >
              <Icon name="book" size={18} color={tone.ink} />
              <Text style={[styles.guideText, { color: tone.ink }]}>{t('coursemap.path.guide')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

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
 * Scrolled on into the next unit, it turns into that one: the new colour and
 * name cross-fade in over the old (`duration.base`, opacity alone, on the
 * native driver). Under Reduce Motion it simply changes.
 */
export function PinnedUnit({ unit }: { unit: UnitPlace }): React.JSX.Element {
  const reduce = useReducedMotion();
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
    <View testID="lp-pinned-unit">
      {from ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <PinFace unit={from} />
        </View>
      ) : null}
      <Animated.View style={{ opacity: fade }}>
        <PinFace unit={unit} />
      </Animated.View>
    </View>
  );
}

function PinFace({ unit }: { unit: UnitPlace }): React.JSX.Element {
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
            style={({ pressed }) => [styles.pinGuide, { backgroundColor: `${tone.ink}1F`, opacity: pressed ? 0.75 : 1 }]}
          >
            <Icon name="book" size={18} color={tone.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The line between stops: a gentle S from one centre to the next, drawn as
 * round dots — the stretch already walked in the unit's colour, the rest grey.
 */
function Trail({ unit, width, sign, walked, ahead }: { unit: Unit; width: number; sign: number; walked: string; ahead: string }): React.JSX.Element {
  const lines: Record<'walked' | 'ahead', string[]> = { walked: [], ahead: [] };
  const cx = (x: number) => width / 2 + sign * x;
  unit.stops.forEach((p, i) => {
    const before = unit.stops[i - 1];
    if (!before || !p.trail) return;
    const bend = STEP / 2;
    lines[p.trail].push(`M ${cx(before.x)} ${before.y} C ${cx(before.x)} ${before.y + bend}, ${cx(p.x)} ${p.y - bend}, ${cx(p.x)} ${p.y}`);
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={unit.height}>
        <Path d={lines.ahead.join(' ')} stroke={ahead} strokeWidth={7} strokeLinecap="round" strokeDasharray={[0.01, 15]} fill="none" />
        <Path d={lines.walked.join(' ')} stroke={walked} strokeWidth={7} strokeLinecap="round" strokeDasharray={[0.01, 15]} fill="none" />
      </Svg>
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
  units: { gap: spacing.lg },
  unit: { gap: 0 },
  path: { position: 'relative' },
  bannerLip: { borderRadius: radii.xl, paddingBottom: BANNER_LIP },
  banner: { borderRadius: radii.xl, paddingVertical: spacing.md + 4, paddingHorizontal: spacing.lg, gap: 2 },
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
