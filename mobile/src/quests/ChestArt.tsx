import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CHEST_BOX,
  CHEST_FOOT,
  CHEST_HOP,
  CHEST_HOP_BLOOM,
  CHEST_HOP_BLOOM_SIZE,
  CHEST_HOP_LAND,
  CHEST_HOP_LID,
  CHEST_HOP_LIGHT,
  CHEST_HOP_MS,
  CHEST_HOP_RAYS,
  CHEST_HOP_RAYS_REACH,
  CHEST_HOP_SEAM,
  CHEST_HOP_SHADOW,
  CHEST_HOP_SPARKLE,
  CHEST_KNOCK,
  CHEST_KNOCK_LIFT,
  CHEST_KNOCK_MS,
  CHEST_LID_AJAR,
  CHEST_LID_AWAY,
  CHEST_MOTES,
  CHEST_MOTE_MS,
  CHEST_SMALL,
  CHEST_TWINKLES,
  CHEST_TWINKLE_MS,
  chestDrawing,
  chestGlint,
  chestLayerSvg,
  chestMote,
  chestTwinkle,
  type ChestBox,
  type ChestDrawing,
  type ChestHopCurve,
  type ChestKnockFrame,
  type ChestLayer,
  type ChestTier,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * A quest's chest, drawn as on the web (shared `art/chest.ts`): a sandûq of plain oak in iron, amber wood in brass
 * with a kilim strap, or pomegranate lacquer in gold with a garnet, in three-quarter view, at any size. `size` is
 * the shut chest's width; the height follows.
 *
 * Each layer is its own picture over the same frame, so parts move without redrawing. Opening is a hop
 * (`motion.hop`, 0 → 1 through the shared `CHEST_HOP`): everything but the shadow crouches with light building at
 * the seam and springs about the chest's foot; the shut lid lifts ajar on its hinge with light pouring out of the
 * gap, then gives way to the open lid at the top of the hop with a flash of bloom as the shafts shoot up, rocking as
 * the chest lands and the gold is thrown. `lid`, `light` and `sparkle` can also be driven separately. With
 * `rays: 'swaying'` the shafts then sway, the bloom breathes, and stars twinkle and motes rise round it; and `shine`
 * makes a chest waiting to be opened knock now and then (shared
 * `CHEST_KNOCK`: the lid jumps on its hinge, the seam's light flares, the box squats as it lands) with a glint over
 * its lock; both are native-driver loops that run only while the screen is focused and motion is allowed, and
 * under Reduce Motion a waiting chest just glows softly at its seam. `open` draws it standing open. Decorative: its
 * container says what it is.
 */

/** How the chest's moving parts stand, each 0 → 1; an omitted part stands as drawn, or follows the hop when there is one. */
export interface ChestMotion {
  /** 0 → 1 through the opening hop (shared `CHEST_HOP`); the lid, light and stars follow it unless given. */
  hop?: AnimatedNumber;
  /** 0 shut → 1 open. */
  lid?: AnimatedNumber;
  /** 0 → 1: the light inside, and the rays with it. */
  light?: AnimatedNumber;
  /** 0 → 1: the stars round it bursting out and fading. */
  sparkle?: AnimatedNumber;
}

type AnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number>;

/** Read a shared hop curve at a value: linear between its points, flat beyond them, as `chestHopAt` does. */
const along = (value: AnimatedNumber, curve: ChestHopCurve): Animated.AnimatedInterpolation<number> =>
  value.interpolate({ inputRange: curve.map(([at]) => at), outputRange: curve.map(([v]) => v).map((_, i) => curve[i]?.[1] ?? 0), extrapolate: 'clamp' });

/** The chest's height against its width. */
export const CHEST_RATIO = CHEST_BOX.h / CHEST_BOX.w;

/** How long the shafts take to lean one way and back, and how far they lean; and how long the bloom takes to breathe out and in. */
const RAYS_SWAY_MS = 10400;
const RAYS_SWAY_DEG = 2.5;
const BLOOM_BREATH_MS = 5600;
/** How bright the bloom stands once open, and how far it dims as it breathes. */
const BLOOM_OPEN = 0.78;
const BLOOM_LOW = 0.6;
/** Where the glint is drawn on its way over the plate; stepping through them is the pass. */
const GLINT_PHASES = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9] as const;
const GLINT_STEP_MS = 80;
/** How often a waiting chest glints: now and then, not a strobe. */
const GLINT_REST_MS = 3200;

export function ChestArt({
  tier,
  size,
  open = false,
  motion,
  rays,
  reach = 1,
  shine = false,
  style,
  testID,
}: {
  tier: ChestTier;
  /** How wide the shut chest is drawn; the height follows. */
  size: number;
  /** Drawn standing open, with the gold out of it. */
  open?: boolean;
  /** The parts moving, for a chest being opened. */
  motion?: ChestMotion;
  /** The beams out of it: swaying, or standing still; left out, there are none. */
  rays?: 'swaying' | 'still';
  /** How far the rays reach, as a multiple of the drawing's own. */
  reach?: number;
  /** A chest waiting to be opened: it knocks now and then, with light at its seam and a glint over its lock. */
  shine?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  // A screen still being laid out may report no width: draw at the small size and take no room until there is some.
  const drawing = useMemo(() => chestDrawing(tier, { size: size > 0 ? size : CHEST_SMALL }), [tier, size]);
  const unit = size / drawing.box.w;
  const height = drawing.box.h * unit;
  const { layers } = drawing;
  const alive = useMotionAlive();
  const hop = motion?.hop;
  // The lid, the light and the stars take their cue from the hop unless they are driven on their own.
  const lid = motion?.lid ?? (hop ? along(hop, CHEST_HOP_LID) : undefined);
  const sparkle = motion?.sparkle ?? (hop ? along(hop, CHEST_HOP_SPARKLE) : undefined);
  const opening = lid !== undefined;
  const showOpen = open || opening;
  const light = motion?.light ?? (hop ? along(hop, CHEST_HOP_LIGHT) : open ? 1 : 0);
  const swaying = rays === 'swaying' && alive;
  const waiting = shine && !showOpen;
  const knocking = waiting && alive;

  // The shafts lean a little one way and back, as light does through moving air, and the bloom breathes, only while
  // somebody is looking.
  const sway = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!swaying) {
      sway.setValue(0);
      breath.setValue(0);
      return;
    }
    const swing = (value: Animated.Value, ms: number): Animated.CompositeAnimation => {
      const go = (to: number): Animated.CompositeAnimation =>
        Animated.timing(value, { toValue: to, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
      return Animated.loop(Animated.sequence([go(1), go(0)]));
    };
    const loops = [swing(sway, RAYS_SWAY_MS), swing(breath, BLOOM_BREATH_MS)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [swaying, sway, breath]);

  // The knock: one value through the shared loop, which the lid, the seam's light and the box all read.
  const knock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!knocking) {
      knock.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(knock, { toValue: 1, duration: CHEST_KNOCK_MS, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => {
      loop.stop();
      knock.setValue(0);
    };
  }, [knocking, knock]);
  const knockAts = CHEST_KNOCK.map((f) => f.at);
  const knocked = <T extends number | string>(pick: (f: ChestKnockFrame) => T): Animated.AnimatedInterpolation<T> =>
    knock.interpolate({ inputRange: knockAts, outputRange: CHEST_KNOCK.map(pick) as number[] | string[], extrapolate: 'clamp' }) as Animated.AnimatedInterpolation<T>;

  // The shut lid: lifted ajar about the hinge, then swung on and gone as the open one lands; or jumping as it knocks.
  const knockLid: Animated.WithAnimatedObject<ViewStyle> | null = knocking
    ? {
        transform: [
          { translateY: knocked((f) => -f.lid * CHEST_KNOCK_LIFT.rise * unit) },
          { rotate: knocked((f) => `${f.lid * CHEST_KNOCK_LIFT.deg}deg`) },
        ],
      }
    : null;
  const lidStyle: Animated.WithAnimatedObject<ViewStyle> | null = lid
    ? {
        opacity: lid.interpolate({ inputRange: [0, 0.35, CHEST_LID_AWAY.at, 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' }),
        transform: [
          {
            translateY: lid.interpolate({
              inputRange: [0, CHEST_LID_AJAR.at, CHEST_LID_AWAY.at],
              outputRange: [0, -CHEST_LID_AJAR.rise * unit, -CHEST_LID_AWAY.rise * unit],
              extrapolate: 'clamp',
            }),
          },
          {
            rotate: lid.interpolate({
              inputRange: [0, CHEST_LID_AJAR.at, CHEST_LID_AWAY.at],
              outputRange: ['0deg', `${CHEST_LID_AJAR.deg}deg`, `${CHEST_LID_AWAY.deg}deg`],
              extrapolate: 'clamp',
            }),
          },
        ],
      }
    : null;
  // The open lid comes in from the hinge on the same value, which overshoots 1 and returns, so it rocks as it lands.
  const openStyle: Animated.WithAnimatedObject<ViewStyle> | null = lid
    ? {
        opacity: lid.interpolate({ inputRange: [0, 0.4, 0.65, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }),
        transform: [
          { rotate: lid.interpolate({ inputRange: [0.4, 1], outputRange: ['26deg', '0deg'] }) },
          { scale: lid.interpolate({ inputRange: [0.4, 1], outputRange: [0.55, 1] }) },
        ],
      }
    : null;
  const sparkleStyle: Animated.WithAnimatedObject<ViewStyle> | null = sparkle
    ? {
        opacity: sparkle.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
        transform: [{ scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2], extrapolate: 'clamp' }) }],
      }
    : null;
  // The hop: the body crouches, springs and lands about its foot; the shadow stays on the ground and shrinks under it.
  const ats = CHEST_HOP.map((f) => f.at);
  const foot = `${(CHEST_FOOT[0] - drawing.box.x) * unit}px ${(CHEST_FOOT[1] - drawing.box.y) * unit}px`;
  const hopStyle: Animated.WithAnimatedObject<ViewStyle> | null = knocking
    ? { transformOrigin: foot, transform: [{ scaleX: knocked((f) => f.wide) }, { scaleY: knocked((f) => f.tall) }] }
    : hop
    ? {
        transformOrigin: foot,
        transform: [
          { translateY: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => -f.rise * height), extrapolate: 'clamp' }) },
          { scaleX: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => f.wide), extrapolate: 'clamp' }) },
          { scaleY: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => f.tall), extrapolate: 'clamp' }) },
          { rotate: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => `${f.tilt}deg`), extrapolate: 'clamp' }) },
        ],
      }
    : null;
  const shadowStyle: Animated.WithAnimatedObject<ViewStyle> | null = hop ? { transform: [{ scale: along(hop, CHEST_HOP_SHADOW) }] } : null;
  // The shafts leak out of the gap and shoot up as the lid opens; the bloom flashes and settles, then breathes.
  const raysStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: hop ? along(hop, CHEST_HOP_RAYS) : light,
    transform: [
      { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: [`${-RAYS_SWAY_DEG}deg`, `${RAYS_SWAY_DEG}deg`] }) },
      { scale: hop ? along(hop, CHEST_HOP_RAYS_REACH.map(([at, v]) => [at, v * reach] as const)) : reach },
    ],
  };
  const breathing = breath.interpolate({ inputRange: [0, 1], outputRange: [1, BLOOM_LOW / BLOOM_OPEN] });
  const bloomStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: Animated.multiply(hop ? along(hop, CHEST_HOP_BLOOM) : Animated.multiply(light, BLOOM_OPEN), breathing),
    transform: [{ scale: hop ? along(hop, CHEST_HOP_BLOOM_SIZE) : 1 }],
  };
  // The light at the seam: flaring with the knock, building through the hop's crouch, or a still glow under Reduce Motion.
  const seam: Animated.WithAnimatedObject<ViewStyle> | null = knocking
    ? { opacity: knocked((f) => f.seam) }
    : hop
      ? { opacity: along(hop, CHEST_HOP_SEAM) }
      : waiting
        ? { opacity: 0.5 }
        : null;
  const hingeOf = (layer: ChestLayer): string => `${(drawing.hinge[0] - layer.box.x) * unit}px ${(drawing.hinge[1] - layer.box.y) * unit}px`;

  return (
    <View style={[{ width: size, height }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Part drawing={drawing} layer={layers.shadow} unit={unit} style={shadowStyle} />
      <Animated.View style={[StyleSheet.absoluteFill, hopStyle]} pointerEvents="none" testID={testID && hop ? `${testID}-hop` : testID && knocking ? `${testID}-knocking` : undefined}>
        {rays && showOpen ? <Part drawing={drawing} layer={layers.bloom} unit={unit} style={bloomStyle} /> : null}
        {showOpen ? <Part drawing={drawing} layer={layers.lidOpen} unit={unit} style={[openStyle, { transformOrigin: hingeOf(layers.lidOpen) }]} testID={testID ? `${testID}-lid-open` : undefined} /> : null}
        {rays && showOpen ? <Part drawing={drawing} layer={layers.rays} unit={unit} style={raysStyle} testID={testID ? `${testID}-rays${swaying ? '-swaying' : ''}` : undefined} /> : null}
        <Part drawing={drawing} layer={layers.body} unit={unit} />
        {showOpen ? <Part drawing={drawing} layer={layers.light} unit={unit} style={{ opacity: light }} /> : null}
        <Part drawing={drawing} layer={layers.lock} unit={unit} />
        {shine && !showOpen ? <Glint drawing={drawing} unit={unit} /> : null}
        {!open ? <Part drawing={drawing} layer={layers.lid} unit={unit} style={[lidStyle ?? knockLid, { transformOrigin: hingeOf(layers.lid) }]} testID={testID ? `${testID}-lid` : undefined} /> : null}
        {seam ? <Part drawing={drawing} layer={layers.seam} unit={unit} style={seam} /> : null}
        {sparkleStyle ? <Part drawing={drawing} layer={layers.sparkle} unit={unit} style={sparkleStyle} /> : null}
      </Animated.View>
      {swaying && showOpen ? <Lights drawing={drawing} unit={unit} startMs={hop ? CHEST_HOP_MS * CHEST_HOP_LAND : 0} /> : null}
    </View>
  );
}

/**
 * The stars and motes round an open chest (shared `CHEST_TWINKLES` and `CHEST_MOTES`), from `startMs` on: each star
 * flares and fades in turn and each mote drifts up the shafts, every one its own picture on a native-driver loop, as
 * the web plays them.
 */
function Lights({ drawing, unit, startMs }: { drawing: ChestDrawing; unit: number; startMs: number }): React.JSX.Element {
  const twinkles = useMemo(() => CHEST_TWINKLES.map((_, i) => chestTwinkle(i)), []);
  const motes = useMemo(() => CHEST_MOTES.map((_, i) => chestMote(i)), []);
  const values = useRef([...CHEST_TWINKLES, ...CHEST_MOTES].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const runs = values.map((value, i) => {
      const star = CHEST_TWINKLES[i];
      const mote = CHEST_MOTES[i - CHEST_TWINKLES.length];
      const ms = star ? CHEST_TWINKLE_MS : CHEST_MOTE_MS;
      const delay = (star?.delay ?? mote?.delay ?? 0) * ms;
      const once = Animated.timing(value, { toValue: 1, duration: ms, easing: star ? Easing.out(Easing.quad) : Easing.linear, useNativeDriver: true, isInteraction: false });
      return Animated.sequence([Animated.delay(startMs + delay), Animated.loop(once)]);
    });
    runs.forEach((run) => run.start());
    return () => {
      runs.forEach((run) => run.stop());
      values.forEach((value) => value.setValue(0));
    };
  }, [values, startMs]);
  return (
    <>
      {twinkles.map((layer, i) => {
        const v = values[i]!;
        const style: Animated.WithAnimatedObject<ViewStyle> = {
          opacity: v.interpolate({ inputRange: [0, 0.12, 0.3, 0.52, 1], outputRange: [0, 1, 0.9, 0, 0] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 0.12, 0.3, 0.52, 1], outputRange: [0.2, 1.1, 0.85, 0.25, 0.25] }) },
            { rotate: v.interpolate({ inputRange: [0, 0.12, 0.3, 0.52, 1], outputRange: ['0deg', '20deg', '34deg', '45deg', '45deg'] }) },
          ],
        };
        return <Part key={`t${i}`} drawing={drawing} layer={layer} unit={unit} style={style} />;
      })}
      {motes.map((layer, i) => {
        const v = values[CHEST_TWINKLES.length + i]!;
        const style: Animated.WithAnimatedObject<ViewStyle> = {
          opacity: v.interpolate({ inputRange: [0, 0.18, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -CHEST_MOTES[i]!.rise * unit] }) }],
        };
        return <Part key={`m${i}`} drawing={drawing} layer={layer} unit={unit} style={style} />;
      })}
    </>
  );
}

/** Where a layer's box lies in the frame, in points. */
function place(box: ChestBox, frame: ChestBox, unit: number): ViewStyle {
  return { position: 'absolute', left: (box.x - frame.x) * unit, top: (box.y - frame.y) * unit, width: box.w * unit, height: box.h * unit };
}

/** One layer of the drawing, in its own box over the frame, moved as a whole. */
function Part({
  drawing,
  layer,
  unit,
  style,
  testID,
}: {
  drawing: ChestDrawing;
  layer: ChestLayer;
  unit: number;
  style?: StyleProp<Animated.WithAnimatedObject<ViewStyle>>;
  testID?: string;
}): React.JSX.Element {
  const xml = useMemo(() => chestLayerSvg(layer), [layer]);
  return (
    <Animated.View style={[place(layer.box, drawing.box, unit), style]} pointerEvents="none" testID={testID}>
      <SvgXml xml={xml} width={layer.box.w * unit} height={layer.box.h * unit} />
    </Animated.View>
  );
}

/**
 * The lock-plate glint: six still frames of the light band across it, each faded in and out in turn on the native
 * driver, so it reads as a pass with nothing redrawn. It rests between passes, and entirely while the screen is
 * not focused or motion is reduced.
 */
function Glint({ drawing, unit }: { drawing: ChestDrawing; unit: number }): React.JSX.Element | null {
  const alive = useMotionAlive();
  const frames = useMemo(() => GLINT_PHASES.map((phase) => chestGlint(phase)), []);
  const values = useRef(GLINT_PHASES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!alive) return;
    const pass = Animated.stagger(
      GLINT_STEP_MS,
      values.map((v) =>
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: GLINT_STEP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
          Animated.timing(v, { toValue: 0, duration: GLINT_STEP_MS * 2, easing: Easing.in(Easing.quad), useNativeDriver: true, isInteraction: false }),
        ]),
      ),
    );
    const loop = Animated.loop(Animated.sequence([Animated.delay(1200), pass, Animated.delay(GLINT_REST_MS)]));
    loop.start();
    return () => {
      loop.stop();
      values.forEach((v) => v.setValue(0));
    };
  }, [alive, values]);
  if (!alive) return null;
  return (
    <>
      {frames.map((frame, i) => (
        <Part key={i} drawing={drawing} layer={frame} unit={unit} style={{ opacity: values[i] }} />
      ))}
    </>
  );
}
