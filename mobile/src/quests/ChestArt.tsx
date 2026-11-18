import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CHEST_BOX,
  CHEST_FOOT,
  CHEST_HOP,
  CHEST_HOP_LID,
  CHEST_HOP_LIGHT,
  CHEST_HOP_SHADOW,
  CHEST_HOP_SPARKLE,
  CHEST_SMALL,
  chestDrawing,
  chestGlint,
  chestLayerSvg,
  type ChestBox,
  type ChestDrawing,
  type ChestHopCurve,
  type ChestLayer,
  type ChestTier,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * A quest's chest, drawn as on the web (shared `art/chest.ts`): amber wood in iron, in gold, or pomegranate
 * lacquer in gold, in three-quarter view, at any size. `size` is the shut chest's width; the height follows.
 *
 * Each layer is its own picture over the same frame, so parts move without redrawing. Opening is a hop
 * (`motion.hop`, 0 → 1 through the shared `CHEST_HOP`): everything but the shadow crouches, springs about the
 * chest's foot and lands while the shadow shrinks; the shut lid swings away about its hinge and the open lid
 * lands at the top of the hop, rocking as the chest lands, the inner light blooms and the stars burst on landing.
 * `lid`, `light` and `sparkle` can also be driven separately. The rays behind turn slowly (`rays: 'turning'`, a
 * native-driver loop that runs only while the screen is focused and motion is allowed), and `shine` passes a
 * glint over the lock plate now and then on an openable chest. `open` draws it standing open with the gold taken.
 * Decorative: its container says what it is.
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

/** How long the rays take to go once round. */
const RAYS_TURN_MS = 16000;
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
  /** The fan of rays behind it: turning, or standing still; left out, there are none. */
  rays?: 'turning' | 'still';
  /** How far the rays reach, as a multiple of the drawing's own. */
  reach?: number;
  /** A glint over the lock plate now and then, for a chest waiting to be opened. */
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
  const turning = rays === 'turning' && alive;

  // The rays' turn, once round and round again, only while somebody is looking.
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!turning) {
      turn.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: RAYS_TURN_MS, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [turning, turn]);

  // The shut lid: up and away about the hinge, gone by the time the open one has landed.
  const lidStyle: Animated.WithAnimatedObject<ViewStyle> | null = lid
    ? {
        opacity: lid.interpolate({ inputRange: [0, 0.35, 0.6, 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' }),
        transform: [
          { translateY: lid.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, -height * 0.22, -height * 0.22], extrapolate: 'clamp' }) },
          { rotate: lid.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['0deg', '-34deg', '-34deg'], extrapolate: 'clamp' }) },
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
  const hopStyle: Animated.WithAnimatedObject<ViewStyle> | null = hop
    ? {
        transformOrigin: `${(CHEST_FOOT[0] - drawing.box.x) * unit}px ${(CHEST_FOOT[1] - drawing.box.y) * unit}px`,
        transform: [
          { translateY: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => -f.rise * height), extrapolate: 'clamp' }) },
          { scaleX: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => f.wide), extrapolate: 'clamp' }) },
          { scaleY: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => f.tall), extrapolate: 'clamp' }) },
          { rotate: hop.interpolate({ inputRange: ats, outputRange: CHEST_HOP.map((f) => `${f.tilt}deg`), extrapolate: 'clamp' }) },
        ],
      }
    : null;
  const shadowStyle: Animated.WithAnimatedObject<ViewStyle> | null = hop ? { transform: [{ scale: along(hop, CHEST_HOP_SHADOW) }] } : null;
  const raysStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: light,
    transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: reach }],
  };
  const hingeOf = (layer: ChestLayer): string => `${(drawing.hinge[0] - layer.box.x) * unit}px ${(drawing.hinge[1] - layer.box.y) * unit}px`;

  return (
    <View style={[{ width: size, height }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Part drawing={drawing} layer={layers.shadow} unit={unit} style={shadowStyle} />
      <Animated.View style={[StyleSheet.absoluteFill, hopStyle]} pointerEvents="none" testID={testID && hop ? `${testID}-hop` : undefined}>
        {showOpen ? <Part drawing={drawing} layer={layers.lidOpen} unit={unit} style={[openStyle, { transformOrigin: hingeOf(layers.lidOpen) }]} testID={testID ? `${testID}-lid-open` : undefined} /> : null}
        {rays && showOpen ? <Part drawing={drawing} layer={layers.rays} unit={unit} style={raysStyle} testID={testID ? `${testID}-rays${turning ? '-turning' : ''}` : undefined} /> : null}
        <Part drawing={drawing} layer={layers.body} unit={unit} />
        {showOpen ? <Part drawing={drawing} layer={layers.light} unit={unit} style={{ opacity: light }} /> : null}
        <Part drawing={drawing} layer={layers.lock} unit={unit} />
        {shine && !showOpen ? <Glint drawing={drawing} unit={unit} /> : null}
        {!open ? <Part drawing={drawing} layer={layers.lid} unit={unit} style={[lidStyle, { transformOrigin: hingeOf(layers.lid) }]} testID={testID ? `${testID}-lid` : undefined} /> : null}
        {sparkleStyle ? <Part drawing={drawing} layer={layers.sparkle} unit={unit} style={sparkleStyle} /> : null}
      </Animated.View>
    </View>
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
