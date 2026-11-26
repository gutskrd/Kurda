import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  PATH_LANDMARK_LOOP,
  PATH_MOTION,
  PATH_STOP_ART,
  landmarkBox,
  letterBirdSvg,
  pathChestSvg,
  pathLandmarkSvg,
  pathPeeker,
  pathLoopSvg,
  pathSignpostSvg,
  pathStopSvg,
  unitScenery,
  type PathBox,
  type PathGround,
  type PathLand,
  type PathLandmark,
  type PathStopLook,
  type PathUnit,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from '../theme/animate';
import Svg, { Path, SvgXml } from 'react-native-svg';
import type { TranslationKey } from '../i18n/translations';
import type { ToneColors } from './path';
import type { UpcomingUnit } from './types';
import type { SkillNode } from './types';

/**
 * What stands beside the lesson path, drawn from @kurda/shared (path-world.ts for placement, art/path-landmark.ts for
 * drawings): each unit's landmark and course character, the upcoming unit's sign, and the unit map. The path itself
 * stands on the page.
 *
 * Kept cheap: a unit far from the screen (`near` false) draws nothing, and only the unit in view (`live`) animates. All motion is transform or opacity on the native driver, and none runs under Reduce Motion.
 */

type Unit = PathUnit<SkillNode>;

/** A unit's landmark beside its stops, the path itself standing on the page. */
export const UnitLandmark = memo(function UnitLandmark({
  land,
  width,
  sign,
  near,
  live,
}: {
  land: PathLand;
  width: number;
  sign: number;
  /** Drawn in full; otherwise nothing. */
  near: boolean;
  /** In view, so its landmark animates. */
  live: boolean;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const box = landmarkBox(width);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
      {near && width > 0 ? <Landmark landmark={land.landmark} ground={land.ground} box={box} left={width / 2 + sign * box.x - box.w / 2} dark={scheme === 'dark'} live={live} /> : null}
    </View>
  );
});

/**
 * A unit's playful touches beside its road (shared `unitScenery`): someone peeking up over a mound at the stops, a
 * different one each unit (shared `pathPeeker`), and the unit's painted sandûq, shut until the unit is done and then open
 * on its gold. Decorative, so screen readers skip them; a tap makes the peeker pop up and the chest hop, for the fun of
 * it. They lean in and shiver now and then while their unit is in view (`live`), never under Reduce Motion.
 */
export const UnitScenery = memo(function UnitScenery({
  unit,
  width,
  sign,
  near,
  live,
  mascot,
}: {
  unit: Unit;
  width: number;
  sign: number;
  near: boolean;
  live: boolean;
  /** Where Hevalo stands in this unit, if he is here, so nothing stands on him. */
  mascot: { x: number; y: number } | null;
}): React.JSX.Element | null {
  const { scheme } = useTheme();
  const spots = useMemo(() => unitScenery(unit.stops, mascot), [unit.stops, mascot]);
  if (!near || width <= 0) return null;
  const dark = scheme === 'dark';
  const won = unit.total > 0 && unit.done === unit.total;
  return (
    <>
      {spots.peek ? (
        <Peeker
          who={pathPeeker(unit.number - 1)}
          left={width / 2 + sign * spots.peek.x - PEEK.width / 2}
          top={spots.peek.y - PEEK.height + PEEK.below}
          facingStart={sign * spots.peek.x > 0}
          live={live}
        />
      ) : null}
      {spots.chest ? <Chest open={won} left={width / 2 + sign * spots.chest.x - CHEST / 2} top={spots.chest.y - CHEST / 2 - 4} dark={dark} live={live} /> : null}
    </>
  );
});

/** A peeker's box, the mound's height, and how far below a stop's middle the mound's foot stands. */
const PEEK = { width: 104, height: 96, mound: 26, below: 38, size: 92, half: 128 } as const;
/** The sandûq's size beside the road: a stop's. */
const CHEST = 96;

/** Leans in for a look now and then, and pops up when tapped. */
function Peeker({ who, left, top, facingStart, live }: { who: ReturnType<typeof pathPeeker>; left: number; top: number; facingStart: boolean; live: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const lean = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !live) {
      lean.setValue(0);
      return;
    }
    const run = Animated.loop(
      Animated.sequence([Animated.delay(3200), timing(lean, 1, 420), Animated.delay(900), timing(lean, 0, 420), Animated.delay(260)]),
    );
    run.start();
    return () => run.stop();
  }, [reduce, live, lean]);
  const bird = useMemo(() => (who === 'pigeon' ? letterBirdSvg({ bird: 0, pose: 'hello', facingLeft: facingStart, size: PEEK.size }) : null), [who, facingStart]);
  const tilt = facingStart ? '-7deg' : '7deg';
  const rise = Animated.add(lean.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }), pop.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }));
  const press = (): void => {
    if (reduce) return;
    pop.stopAnimation();
    Animated.sequence([timing(pop, 1, 180), springTo(pop, 0, 'bouncy')]).start();
  };
  return (
    <Pressable
      onPress={press}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.peek, { left, top }]}
      testID={`lp-peek-${who}`}
    >
      <Animated.View style={[styles.peekWho, bird ? styles.peekBird : null, { transform: [{ translateY: rise }, { rotate: tilt }] }]}>
        {bird ? (
          <SvgXml xml={bird} width={PEEK.size} height={PEEK.size} />
        ) : (
          <SpeakingCharacter speaker={who === 'pigeon' ? 'hevalo' : who} player={null} playing={false} crop="half" height={PEEK.half} flip={facingStart} />
        )}
      </Animated.View>
      <Svg width={PEEK.width} height={PEEK.mound} style={styles.mound}>
        <Path d={`M0 ${PEEK.mound}Q${PEEK.width / 2} ${-PEEK.mound * 0.9} ${PEEK.width} ${PEEK.mound}Z`} fill={colors.locked} />
      </Svg>
    </Pressable>
  );
}

/** The unit's sandûq: a little shiver now and then, a hop when tapped. */
function Chest({ open, left, top, dark, live }: { open: boolean; left: number; top: number; dark: boolean; live: boolean }): React.JSX.Element {
  const reduce = useReducedMotion();
  const shiver = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !live) {
      shiver.setValue(0);
      return;
    }
    const run = Animated.loop(
      Animated.sequence([Animated.delay(4000), timing(shiver, 1, 90), timing(shiver, -1, 140), timing(shiver, 0.5, 120), timing(shiver, 0, 100)]),
    );
    run.start();
    return () => run.stop();
  }, [reduce, live, shiver]);
  const xml = useMemo(() => pathChestSvg({ open, dark, size: CHEST }), [open, dark]);
  const press = (): void => {
    if (reduce) return;
    hop.stopAnimation();
    Animated.sequence([timing(hop, 1, 200), springTo(hop, 0, 'bouncy')]).start();
  };
  return (
    <Pressable onPress={press} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chest, { left, top }]} testID="lp-chest">
      <Animated.View
        style={[
          styles.chestArt,
          {
            transform: [
              { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              { rotate: shiver.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] }) },
            ],
          },
        ]}
      >
        <SvgXml xml={xml} width={CHEST} height={CHEST} />
      </Animated.View>
    </Pressable>
  );
}

/** A unit's landmark, with its looping part on top: a flag, steam or smoke, water, fire, a bee or a sign. */
function Landmark({
  landmark,
  ground,
  box,
  left,
  dark,
  live,
}: {
  landmark: PathLandmark;
  ground: PathGround;
  box: PathBox;
  left: number;
  dark: boolean;
  live: boolean;
}): React.JSX.Element {
  const xml = useMemo(() => pathLandmarkSvg({ landmark, ground, dark, size: box.w }), [landmark, ground, dark, box.w]);
  const loop = PATH_LANDMARK_LOOP[landmark];
  const s = box.w / 120;
  const sprite = useMemo(() => pathLoopSvg({ kind: loop.kind, dark, size: loop.w * s }), [loop, dark, s]);
  return (
    <View style={[styles.landmark, { left, top: box.y, width: box.w, height: box.h }]} testID={`lp-landmark-${landmark}`}>
      <SvgXml xml={xml} width={box.w} height={box.h} />
      <Loop kind={loop.kind} xml={sprite} left={loop.x * s} top={loop.y * s} width={loop.w * s} height={loop.h * s} live={live} />
    </View>
  );
}

/** A landmark's loop, repeating while its unit is in view. */
function Loop({ kind, xml, left, top, width, height, live }: { kind: string; xml: string; left: number; top: number; width: number; height: number; live: boolean }): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) {
      t.setValue(0);
      return;
    }
    const run = Animated.loop(Animated.timing(t, { toValue: 1, duration: PATH_MOTION.loopMs, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    run.start();
    return () => run.stop();
  }, [live, t]);
  const wave = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] });
  const style = ((): object => {
    switch (kind) {
      case 'colours':
        return { transformOrigin: '0% 0%', transform: [{ rotate: wave.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] }) }, { scaleX: wave.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.9, 1, 0.94] }) }] };
      case 'steam':
      case 'smoke':
        return { opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, -10] }) }] };
      case 'water':
        return { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) }] };
      case 'flame':
        return { transformOrigin: '50% 100%', transform: [{ scaleY: wave.interpolate({ inputRange: [-1, 1], outputRange: [0.9, 1.1] }) }, { scaleX: wave.interpolate({ inputRange: [-1, 1], outputRange: [1.05, 0.95] }) }] };
      case 'bee':
        return { transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] };
      default:
        return { transformOrigin: '50% 0%', transform: [{ rotate: wave.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] }) }] };
    }
  })();
  return (
    <Animated.View style={[styles.loop, { left, top, width, height }, style]}>
      <SvgXml xml={xml} width={width} height={height} />
    </Animated.View>
  );
}

/** A stop's base or face from the shared drawing; far from the screen, only the face colour. */
export const StopArt = memo(function StopArt({ look, tone, part, near }: { look: PathStopLook; tone: Unit['tone']; part: 'base' | 'face'; near: boolean }): React.JSX.Element | null {
  const { scheme } = useTheme();
  const xml = useMemo(() => (near ? pathStopSvg({ look, tone, part, dark: scheme === 'dark' }) : null), [near, look, tone, part, scheme]);
  const { box, cx, cy } = PATH_STOP_ART;
  if (!xml) return null;
  return (
    <View style={[styles.art, { left: STOP_FACE.x - cx, top: STOP_FACE.y - cy, width: box, height: box }]} pointerEvents="none">
      <SvgXml xml={xml} width={box} height={box} />
    </View>
  );
});

/** The stop face's position in its 72-point button: a little above centre, so the base shows under it. */
export const STOP_FACE = { x: 36, y: 30 } as const;

/**
 * The end of the path for now: a signpost with the next unit's number and name. On a course still being recorded,
 * its narrator stands by the sign beside a pulsing red light (still under Reduce Motion). Read as one element.
 *
 * The description runs under both picture and title, the card's full width, since beside the picture it broke into
 * many short lines on a narrow phone. The dashed outline uses the locked grey so it shows in both themes.
 */
export function UpcomingSign({ upcoming, live }: { upcoming: UpcomingUnit; live: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const dark = scheme === 'dark';
  const sign = useMemo(() => pathSignpostSvg({ dark, size: SIGN, idPrefix: 'lp-next' }), [dark]);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live || !upcoming.recordedBy) {
      pulse.setValue(1);
      return;
    }
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [live, upcoming.recordedBy, pulse]);
  const number = t('coursemap.path.unit', { n: formatNumber(upcoming.number, locale) });
  const line = t(upcoming.recordedBy ? 'coursemap.path.upcomingRecording' : 'coursemap.path.upcomingSoon');
  return (
    <View
      style={[styles.next, { borderColor: colors.lockedMark, backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={`${number}, ${upcoming.title}. ${line}`}
      testID="lp-upcoming"
    >
      <View style={[styles.nextTop, { flexDirection: dir.row }]}>
        <View style={[styles.nextArt, { flexDirection: dir.row }]}>
          {/* The sign points toward the end of the line, which is leftward on a right-to-left screen. */}
          <SvgXml xml={sign} width={SIGN} height={SIGN} style={dir.rtl ? styles.mirrored : undefined} />
          {upcoming.recordedBy ? (
            // Against the sign, on whichever side he stands.
            <View style={dir.row === 'row-reverse' ? styles.nextHostMirrored : styles.nextHost}>
              <SpeakingCharacter speaker={upcoming.recordedBy} player={null} playing={false} crop="full" height={NEXT_HOST} />
            </View>
          ) : null}
        </View>
        <View style={styles.nextText}>
          <Text style={[styles.nextEyebrow, dir.text, { color: colors.textSecondary }]}>{number}</Text>
          {/* Course text keeps its own direction. */}
          <Text style={[styles.nextTitle, dir.free, { color: colors.textPrimary }]}>{upcoming.title}</Text>
        </View>
      </View>
      <View style={[styles.nextLine, { flexDirection: dir.row }]}>
        {upcoming.recordedBy ? <Animated.View style={[styles.rec, { opacity: pulse }]} /> : null}
        <Text style={[styles.nextLineText, dir.text, { color: colors.textSecondary }]}>{line}</Text>
      </View>
    </View>
  );
}

/** The signpost size and Hamo's height beside it, a little smaller than beside a unit since he is further up the road. */
const SIGN = 96;
const NEXT_HOST = 104;
/** The recording light, and the line height of the text beside it. */
const REC = 10;
const REC_LINE = 20;

/** A unit as the rail lists it. */
interface RailUnit {
  unitId: string;
  number: number;
  title: string;
  tone: ToneColors;
  done: number;
  total: number;
  /** The unit the learner is in. */
  here: boolean;
}

/** A section as the unit map lists it: its number (null in a single-section course), its level name key, and its units. */
export interface RailSection {
  number: number | null;
  level: TranslationKey | null;
  units: RailUnit[];
}

/**
 * Every unit of the course on one rail, opened from a unit heading's map button and grouped by section where there
 * are several. Each milestone is filled once done and ringed where the learner is; a tap goes there.
 */
export function UnitRailSheet({ sections, open, onClose, onPick }: { sections: RailSection[]; open: boolean; onClose: () => void; onPick: (unitId: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <BottomSheet visible={open} onClose={onClose} title={t('learn.map.title')} icon="flag" detents={['medium', 'large']} testID="lp-rail">
      <SheetScrollView contentContainerStyle={styles.rail}>
        {sections.map((section, s) => (
          <View key={section.number ?? s} style={styles.railSection}>
            {section.number !== null ? (
              <Text style={[styles.railSectionName, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {section.level
                  ? `${t('coursemap.path.section', { n: formatNumber(section.number, locale) })} · ${t(section.level)}`
                  : t('coursemap.path.section', { n: formatNumber(section.number, locale) })}
              </Text>
            ) : null}
            {section.units.map((u, i) => {
              const finished = u.total > 0 && u.done === u.total;
              const number = t('coursemap.path.unit', { n: formatNumber(u.number, locale) });
              return (
                <Pressable
                  key={u.unitId}
                  onPress={() => onPick(u.unitId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${number}, ${u.title}`}
                  accessibilityState={{ selected: u.here }}
                  // Pressed, the row fills like a list row, in its own rounded shape because it has its own inset.
                  style={({ pressed }) => [styles.railRow, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack, borderRadius: radii.sm }]}
                >
                  <View style={styles.railMark}>
                    {i > 0 ? <View style={[styles.railLine, styles.railLineUp, { backgroundColor: colors.separator }]} /> : null}
                    {i < section.units.length - 1 ? <View style={[styles.railLine, styles.railLineDown, { backgroundColor: colors.separator }]} /> : null}
                    <View
                      style={[
                        styles.railDot,
                        u.here ? styles.railDotHere : null,
                        { backgroundColor: finished || u.here ? u.tone.fill : colors.surface, borderColor: u.tone.lip },
                      ]}
                    >
                      {finished ? <Icon name="check" size={14} color={u.tone.ink} /> : null}
                    </View>
                  </View>
                  <View style={styles.railWords}>
                    <Text style={[styles.railNumber, dir.text, { color: u.here ? u.tone.text : colors.textSecondary }]}>{number}</Text>
                    <Text style={[styles.railTitle, dir.free, { color: colors.textPrimary }]} numberOfLines={2}>
                      {u.title}
                    </Text>
                  </View>
                  <Text style={[styles.railCount, { color: colors.textSecondary }]}>
                    {t('coursemap.path.unitDone', { done: formatNumber(u.done, locale), total: formatNumber(u.total, locale) })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // The mound hides the peeker's foot, so only head and shoulders show over it.
  peek: { position: 'absolute', width: PEEK.width, height: PEEK.height, overflow: 'hidden', borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  peekWho: { position: 'absolute', left: 0, right: 0, top: 6, alignItems: 'center', transformOrigin: '50% 100%' },
  // The pigeon is small enough to stand on the mound rather than hide behind it.
  peekBird: { top: undefined, bottom: PEEK.mound - 12 },
  mound: { position: 'absolute', left: 0, bottom: 0 },
  chest: { position: 'absolute', width: CHEST, height: CHEST },
  chestArt: { transformOrigin: '50% 90%' },
  next: {
    gap: spacing.sm + 4,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radii.xl,
  },
  nextTop: { alignItems: 'flex-end', gap: spacing.md },
  nextArt: { alignItems: 'flex-end' },
  // He overlaps the sign a little from his side.
  nextHost: { marginStart: -24 },
  nextHostMirrored: { marginEnd: -24 },
  mirrored: { transform: [{ scaleX: -1 }] },
  nextText: { flex: 1, gap: 2, paddingBottom: spacing.xs },
  nextEyebrow: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, letterSpacing: 0.8, textTransform: 'uppercase' },
  nextTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  nextLine: { alignItems: 'flex-start', gap: spacing.sm },
  nextLineText: { flex: 1, fontSize: typography.sizes.text, lineHeight: REC_LINE },
  // Level with the first line of text, however many lines it wraps to.
  rec: { width: REC, height: REC, borderRadius: radii.pill, backgroundColor: '#d6493a', marginTop: (REC_LINE - REC) / 2 },
  landmark: { position: 'absolute' },
  loop: { position: 'absolute' },
  art: { position: 'absolute' },
  rail: { paddingBottom: spacing.lg, gap: spacing.md },
  railSection: { gap: 0 },
  railSectionName: { ...sectionLabel, paddingHorizontal: spacing.xs, marginBottom: spacing.xs },
  railRow: { alignItems: 'center', gap: spacing.sm + 4, minHeight: MIN_TOUCH_TARGET + 12, paddingHorizontal: spacing.xs },
  railMark: { width: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 3, left: 12.5 },
  railLineUp: { top: 0, bottom: '50%' },
  railLineDown: { top: '50%', bottom: 0 },
  railDot: { width: 20, height: 20, borderRadius: radii.pill, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  railDotHere: { width: 28, height: 28 },
  railWords: { flex: 1, paddingVertical: spacing.xs },
  railNumber: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  railTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  railCount: { fontSize: typography.sizes.text, fontVariant: ['tabular-nums'] },
});
