import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import {
  PATH_LANDMARK_LOOP,
  PATH_MILESTONE_ART,
  PATH_MOTION,
  PATH_SCENE_BOX,
  PATH_STOP_ART,
  landmarkBox,
  pathLandmarkSvg,
  pathLoopSvg,
  pathMilestoneSvg,
  pathScene,
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
import { SvgXml } from 'react-native-svg';
import { PathChest, PathScene } from './PathScene';
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
 * A unit's playful touches beside its road (shared `unitScenery`): its little scene, chosen from the chapter (shared
 * `pathScene`, PathScene.tsx), leaning in from the screen's edge on its side, and the unit's painted sandûq, shut until
 * the unit is done and then open on its gold. Decorative, so screen readers skip them; a tap plays a moment of their
 * own. They move only while their unit is in view (`live`), never under Reduce Motion.
 */
export const UnitScenery = memo(function UnitScenery({
  unit,
  width,
  sign,
  near,
  live,
  here,
}: {
  unit: Unit;
  /** The road's width: the screen's, edge to edge. */
  width: number;
  sign: number;
  near: boolean;
  live: boolean;
  /** The stop to do now, if it is in this unit: Hevalo stands beside it, under its bubble. */
  here: { x: number; y: number } | null;
}): React.JSX.Element | null {
  const { scheme } = useTheme();
  const scene = pathScene(unit.number - 1);
  const spots = useMemo(() => unitScenery(unit.stops, here, scene, width > 0 ? width : null), [unit.stops, here, scene, width]);
  if (!near || width <= 0) return null;
  const dark = scheme === 'dark';
  const won = unit.total > 0 && unit.done === unit.total;
  // The side of the screen it leans in from: the line's start or end, mirrored with the path.
  const right = spots.scene ? sign * spots.scene.side > 0 : false;
  return (
    <>
      {spots.scene ? (
        <PathScene
          scene={scene}
          // Drawn for the left edge; at the right one it is mirrored, so it always leans in toward the road.
          flip={right}
          dark={dark}
          live={live}
          left={right ? width - PATH_SCENE_BOX.w : 0}
          top={spots.scene.y - PATH_SCENE_BOX.h / 2}
        />
      ) : null}
      {spots.chest ? <PathChest open={won} dark={dark} size={CHEST} live={live} left={width / 2 + sign * spots.chest.x - CHEST / 2} top={spots.chest.y - CHEST / 2 - 4} /> : null}
    </>
  );
});

/** The sandûq's size beside the road: a stop's. */
const CHEST = 96;

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

/** A unit's milestone, its last stop, from the shared drawing: the seal, or the drum it stands on. */
export const MilestoneArt = memo(function MilestoneArt({ won, part, near }: { won: boolean; part: 'base' | 'face'; near: boolean }): React.JSX.Element | null {
  const { scheme } = useTheme();
  const xml = useMemo(() => (near ? pathMilestoneSvg({ won, part, dark: scheme === 'dark' }) : null), [near, won, part, scheme]);
  if (!xml) return null;
  const { x, y, w, h } = PATH_MILESTONE_ART;
  return (
    <View style={[styles.art, { left: x, top: y, width: w, height: h }]} pointerEvents="none">
      <SvgXml xml={xml} width={w} height={h} />
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
