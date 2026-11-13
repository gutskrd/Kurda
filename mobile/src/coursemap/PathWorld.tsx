import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  PATH_LANDMARK_LOOP,
  PATH_MOTION,
  PATH_RETURN,
  PATH_STOP_ART,
  hopAt,
  landmarkBox,
  pathGroundColour,
  pathLandSvg,
  pathLandmarkSvg,
  pathLoopSvg,
  pathStonesSvg,
  pathStopSvg,
  praiseWords,
  trailStones,
  type PathBox,
  type PathHost,
  type PathLand,
  type PathLandmark,
  type PathStopLook,
  type PathUnit,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { useEnter } from '../theme/animate';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { ToneColors } from './path';
import type { SkillNode } from './types';

/**
 * The world the phone's lesson path walks through, drawn from @kurda/shared
 * (path-world.ts for where things stand, art/path-land.ts for the drawings):
 * each unit's land edge to edge under its stops, the stepping stones between
 * them, the unit's landmark with its one small moving part, the person of the
 * course who waits by the unit, the learner's own picture standing on the
 * stop to do now, and the rail of units that the unit banner's map button
 * opens.
 *
 * Cheap on purpose: a unit far from the screen (`near` false) is only its
 * ground's colour, so a course of twelve units draws two or three lands at a
 * time; and only the unit in view (`live`) moves — its landmark's loop, its
 * person's words. Everything that moves is a transform or an opacity on the
 * native driver, and nothing moves at all under Reduce Motion.
 */

type Unit = PathUnit<SkillNode>;

/** One unit's land, its trail and its landmark, behind its stops. */
export const UnitLand = memo(function UnitLand({
  unit,
  land,
  width,
  sign,
  near,
  live,
  fresh,
}: {
  unit: Unit;
  land: PathLand;
  width: number;
  sign: number;
  /** drawn in full; otherwise only its ground's colour */
  near: boolean;
  /** in view, so its landmark moves */
  live: boolean;
  /** the stops whose stretch of trail was walked only since the last lesson: their stones fill in as the path moves on */
  fresh: ReadonlySet<string>;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const rtl = sign < 0;
  const stones = useMemo(() => trailStones(unit.stops), [unit.stops]);
  const ground = useMemo(() => {
    if (!near || width <= 0) return null;
    const stops = unit.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    return pathLandSvg({ ground: land.ground, width, height: unit.height, stops, stones, dark, rtl, seed: unit.unitId });
  }, [near, width, unit, land.ground, stones, dark, rtl]);
  const trail = useMemo(() => {
    if (!near || width <= 0) return null;
    const draw = (list: typeof stones, walked: boolean): string | null =>
      list.length > 0 ? pathStonesSvg({ width, height: unit.height, stones: list, walked, dark, rtl }) : null;
    const isFresh = (s: (typeof stones)[number]): boolean => s.walked && fresh.has(s.to);
    return {
      ahead: draw(
        stones.filter((s) => !s.walked || isFresh(s)),
        false,
      ),
      walked: draw(
        stones.filter((s) => s.walked && !isFresh(s)),
        true,
      ),
      fresh: draw(stones.filter(isFresh), true),
    };
  }, [near, width, unit.height, stones, fresh, dark, rtl]);
  const box = landmarkBox(width);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
      {ground ? <SvgXml xml={ground} width={width} height={unit.height} /> : <View style={[styles.flat, { backgroundColor: pathGroundColour(land.ground, dark) }]} />}
      {trail?.ahead ? <SvgXml xml={trail.ahead} width={width} height={unit.height} style={StyleSheet.absoluteFill} /> : null}
      {trail?.walked ? <SvgXml xml={trail.walked} width={width} height={unit.height} style={StyleSheet.absoluteFill} /> : null}
      {trail?.fresh ? <FreshStones xml={trail.fresh} width={width} height={unit.height} /> : null}
      {near && width > 0 ? <Landmark landmark={land.landmark} box={box} left={width / 2 + sign * box.x - box.w / 2} dark={dark} live={live} /> : null}
    </View>
  );
});

/** The stretch walked since the lesson, fading in over the grey as the opened stop takes its number. */
function FreshStones({ xml, width, height }: { xml: string; width: number; height: number }): React.JSX.Element {
  const p = useEnter(true, PATH_RETURN.finishAtMs + PATH_RETURN.popMs / 2, PATH_RETURN.bubbleAtMs - PATH_RETURN.finishAtMs - PATH_RETURN.popMs / 2);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: p }]}>
      <SvgXml xml={xml} width={width} height={height} />
    </Animated.View>
  );
}

/** A unit's landmark, and over it its loop: a kilim or a flag stirring, steam or smoke rising, water rippling, the fire, a bee, a sign. */
function Landmark({ landmark, box, left, dark, live }: { landmark: PathLandmark; box: PathBox; left: number; dark: boolean; live: boolean }): React.JSX.Element {
  const xml = useMemo(() => pathLandmarkSvg({ landmark, dark, size: box.w }), [landmark, dark, box.w]);
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

/** One turn of a landmark's loop, over and over while its unit is in view; still otherwise. */
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
      case 'kilim':
      case 'flag':
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

/** A stop's base or face, from the shared drawing; a unit far from the screen gets the face's colour alone. */
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

/** Where a stop's face sits in its 72-point button: across the middle, a little above its centre, so its side shows under it. */
export const STOP_FACE = { x: 36, y: 30 } as const;

/** The learner's token: their picture in a ring, on a short stem, its foot on the face of the stop they stand on. */
const TOKEN = { size: 44, ring: 3, stem: 12 } as const;
export const TOKEN_HEIGHT = TOKEN.size + 2 * TOKEN.ring + TOKEN.stem;

/**
 * The learner, standing on the stop to do now (`at`, its centre on the
 * unit's path). Coming back from a lesson that moved them on, they hop there
 * from the stop they finished (`from`, on the same unit's path, or above the
 * unit when they come from the one before) — drawn there as the bubble
 * arrives (`PATH_MOTION.hopAtMs`), the hop starting `delayMs` later; and they
 * bob with the stop (`bob`).
 */
export function LearnerToken({
  at,
  from,
  tone,
  bob,
  delayMs = 0,
}: {
  at: { x: number; y: number };
  from: { x: number; y: number } | null;
  tone: ToneColors;
  bob: Animated.Value | null;
  /** how long after it is drawn the hop starts */
  delayMs?: number;
}): React.JSX.Element {
  const { user } = useAuth();
  const { colors } = useTheme();
  const p = useRef(new Animated.Value(from ? 0 : 1)).current;
  useEffect(() => {
    if (!from) {
      p.setValue(1);
      return;
    }
    p.setValue(0);
    const run = Animated.timing(p, { toValue: 1, duration: PATH_MOTION.hopMs, delay: delayMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [from, p, delayMs]);
  // the hop: across in a straight line, up and down on its arc, sampled for the native driver
  const samples = [0, 0.25, 0.5, 0.75, 1];
  const path = from ? samples.map((s) => hopAt(from, at, s)) : null;
  const translateX = path ? p.interpolate({ inputRange: samples, outputRange: path.map((q) => q.x - at.x) }) : 0;
  const translateY = path ? p.interpolate({ inputRange: samples, outputRange: path.map((q) => q.y - at.y) }) : 0;
  const width = TOKEN.size + 2 * TOKEN.ring;
  return (
    <Animated.View
      style={[styles.token, { left: at.x - width / 2, top: at.y - 6 - TOKEN_HEIGHT, width }, { transform: [{ translateX }, { translateY }, ...(bob ? [{ translateY: bob }] : [])] }]}
      pointerEvents="none"
      aria-hidden
      testID="lp-learner"
    >
      <View style={[styles.tokenRing, { borderColor: tone.fill, backgroundColor: colors.surfaceRaised }]}>
        <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? 'me'} size={TOKEN.size - 2} photoUrl={user?.profilePhotoUrl ?? null} />
      </View>
      <View style={[styles.stem, { backgroundColor: tone.fill }]} />
    </Animated.View>
  );
}

/**
 * Hamo or Xezal beside the unit's last stop, whole, as Hevalo stands by the
 * current one. While their unit is in view and the learner has been through
 * some of it, now and then they say a word of praise from the course's own
 * list (shared `praiseWords`), in the course's Kurdish, in a bubble over them.
 * They are a picture: the stops say everything, so a screen reader passes
 * them by.
 */
export function PathHostView({
  host,
  box,
  left,
  flip,
  live,
  praise,
  dialect,
}: {
  host: PathHost;
  box: PathBox;
  left: number;
  flip: boolean;
  live: boolean;
  /** what they may say: they have something to praise */
  praise: boolean;
  dialect: string | null | undefined;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const words = praiseWords(dialect);
  const [said, setSaid] = useState<string | null>(null);
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live || !praise) {
      setSaid(null);
      return;
    }
    let turn = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const say = (): void => {
      setSaid(words[turn % words.length]!);
      turn += 1;
      Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timers.push(
        setTimeout(() => {
          Animated.timing(shown, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setSaid(null));
        }, PATH_MOTION.sayForMs),
      );
    };
    const first = setTimeout(say, 1600);
    const every = setInterval(say, PATH_MOTION.sayEveryMs);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, [live, praise, words, shown]);
  const tall = box.h - BUBBLE_ROOM;
  return (
    <View
      style={[styles.host, { left, top: box.y, width: box.w, height: box.h }]}
      pointerEvents="box-none"
      aria-hidden
      testID={`lp-host-${host}`}
    >
      {said ? (
        <Animated.View style={[styles.bubble, { opacity: shown, backgroundColor: colors.surfaceRaised, borderColor: scheme === 'dark' ? '#000000' : '#4a2a1a' }]}>
          <Text style={[styles.bubbleText, { color: colors.textPrimary }]} numberOfLines={1}>
            {said}
          </Text>
        </Animated.View>
      ) : null}
      <View style={[styles.hostFigure, { top: BUBBLE_ROOM }]}>
        <SpeakingCharacter speaker={host} player={null} playing={false} crop="full" height={tall} flip={flip} />
      </View>
    </View>
  );
}

/** The room over a person for their bubble (shared `PATH_SCENERY.bubble`). */
const BUBBLE_ROOM = 44;

/** A unit as the rail lists it. */
export interface RailUnit {
  unitId: string;
  number: number;
  title: string;
  tone: ToneColors;
  done: number;
  total: number;
  /** the unit the learner is in */
  here: boolean;
}

/**
 * Every unit of the course on one rail, top to bottom, from the unit banner's
 * map button: a milestone each — filled once the unit is done, ringed where
 * the learner is — with its number and its name, and a tap goes there.
 */
export function UnitRailSheet({ units, open, onClose, onPick }: { units: RailUnit[]; open: boolean; onClose: () => void; onPick: (unitId: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <BottomSheet visible={open} onClose={onClose} title={t('learn.map.title')} icon="flag" detents={['medium', 'large']} testID="lp-rail">
      <SheetScrollView contentContainerStyle={styles.rail}>
        {units.map((u, i) => {
          const finished = u.total > 0 && u.done === u.total;
          const number = t('coursemap.path.unit', { n: formatNumber(u.number, locale) });
          return (
            <Pressable
              key={u.unitId}
              onPress={() => onPick(u.unitId)}
              accessibilityRole="button"
              accessibilityLabel={`${number}, ${u.title}`}
              accessibilityState={{ selected: u.here }}
              // held, the row fills as a list row does (it has its own inset, so the fill is its own shape)
              style={({ pressed }) => [styles.railRow, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack, borderRadius: radii.sm }]}
            >
              <View style={styles.railMark}>
                {i > 0 ? <View style={[styles.railLine, styles.railLineUp, { backgroundColor: colors.separator }]} /> : null}
                {i < units.length - 1 ? <View style={[styles.railLine, styles.railLineDown, { backgroundColor: colors.separator }]} /> : null}
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
                <Text style={[styles.railTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
                  {u.title}
                </Text>
              </View>
              <Text style={[styles.railCount, { color: colors.textSecondary }]}>{t('coursemap.path.unitDone', { done: u.done, total: u.total })}</Text>
            </Pressable>
          );
        })}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flat: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  landmark: { position: 'absolute' },
  loop: { position: 'absolute' },
  art: { position: 'absolute' },
  token: { position: 'absolute', alignItems: 'center' },
  tokenRing: { borderRadius: radii.pill, borderWidth: TOKEN.ring, padding: 1, overflow: 'hidden' },
  stem: { width: 4, height: TOKEN.stem, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  host: { position: 'absolute', alignItems: 'center' },
  hostFigure: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bubble: {
    position: 'absolute',
    top: 0,
    minHeight: 32,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 2,
    justifyContent: 'center',
  },
  bubbleText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  rail: { paddingBottom: spacing.lg },
  railRow: { alignItems: 'center', gap: spacing.sm + 4, minHeight: MIN_TOUCH_TARGET + 12, paddingHorizontal: spacing.xs },
  railMark: { width: 28, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 3, left: 12.5 },
  railLineUp: { top: 0, bottom: '50%' },
  railLineDown: { top: '50%', bottom: 0 },
  railDot: { width: 20, height: 20, borderRadius: radii.pill, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  railDotHere: { width: 28, height: 28 },
  railWords: { flex: 1, paddingVertical: spacing.xs },
  railNumber: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  railTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  railCount: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
});
