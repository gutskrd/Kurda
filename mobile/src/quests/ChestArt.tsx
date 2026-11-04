import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { CHEST_BOX, CHEST_SMALL, chestDrawing, chestGlint, chestLayerSvg, type ChestBox, type ChestDrawing, type ChestLayer, type ChestTier } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * A quest's chest, the drawing the website shows too (shared `art/chest.ts`):
 * amber wood in iron, in gold, or pomegranate lacquer in gold, seen from three
 * quarters, at every size from the end of a quest's bar to the chest's own
 * screen. `size` is how wide the shut chest is drawn; the height follows.
 *
 * Each of the drawing's layers is its own small picture laid over the same
 * frame, so the parts can move without anything being drawn again: the shut
 * lid swings up and away about its hinge and the open one lands in its place
 * (`motion.lid`, 0 → 1, a spring that may pass 1), the light inside blooms
 * (`motion.light`), the stars burst (`motion.sparkle`), the fan of rays
 * behind it turns slowly (`rays: 'turning'`, a loop on the native driver that
 * runs only while the screen is in view and the phone has not asked for less
 * motion), and a glint passes over the lock plate now and then (`shine`, for
 * a chest that can be opened: six still frames faded in and out in turn, as
 * the badges' glint is). `open` draws it standing open, with the gold out of
 * it, for a chest whose Zêr has been taken. Decorative: whatever holds it
 * says what it is.
 */

/** How the chest's moving parts stand, each 0 → 1; a part left out stands as drawn. */
export interface ChestMotion {
  /** 0 shut → 1 open */
  lid?: AnimatedNumber;
  /** 0 → 1: the light inside, and the rays with it */
  light?: AnimatedNumber;
  /** 0 → 1: the stars round it bursting out and fading */
  sparkle?: AnimatedNumber;
}

type AnimatedNumber = Animated.Value | Animated.AnimatedInterpolation<number>;

/** The chest's height against its width. */
export const CHEST_RATIO = CHEST_BOX.h / CHEST_BOX.w;

/** How long the rays take to go once round. */
const RAYS_TURN_MS = 16000;
/** Where the glint is drawn on its way over the plate; stepping through them is the pass. */
const GLINT_PHASES = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9] as const;
const GLINT_STEP_MS = 80;
/** A chest waiting glints this often: a gleam now and then, not a strobe. */
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
  /** how wide the shut chest is drawn; the height follows */
  size: number;
  /** drawn standing open, with the gold out of it */
  open?: boolean;
  /** the parts moving, for a chest being opened */
  motion?: ChestMotion;
  /** the fan of rays behind it: turning, or standing still; left out, there are none */
  rays?: 'turning' | 'still';
  /** how far the rays reach, as a multiple of the drawing's own */
  reach?: number;
  /** a glint over the lock plate now and then: a chest waiting to be opened */
  shine?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  // a screen still being laid out can ask for nothing wide: the drawing is made at its small size and takes no room until there is some
  const drawing = useMemo(() => chestDrawing(tier, { size: size > 0 ? size : CHEST_SMALL }), [tier, size]);
  const unit = size / drawing.box.w;
  const height = drawing.box.h * unit;
  const { layers } = drawing;
  const alive = useMotionAlive();
  const opening = motion?.lid !== undefined;
  const showOpen = open || opening;
  const light = motion?.light ?? (open ? 1 : 0);
  const turning = rays === 'turning' && alive;

  // the rays' turn, once round and round again, only while somebody is looking
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

  // the shut lid: up and away about the hinge, gone by the time the open one has landed
  const lidStyle: Animated.WithAnimatedObject<ViewStyle> | null = motion?.lid
    ? {
        opacity: motion.lid.interpolate({ inputRange: [0, 0.35, 0.6, 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' }),
        transform: [
          { translateY: motion.lid.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, -height * 0.22, -height * 0.22], extrapolate: 'clamp' }) },
          { rotate: motion.lid.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['0deg', '-34deg', '-34deg'], extrapolate: 'clamp' }) },
        ],
      }
    : null;
  // the open lid: in from the hinge on the same spring, so it bounces as it lands
  const openStyle: Animated.WithAnimatedObject<ViewStyle> | null = motion?.lid
    ? {
        opacity: motion.lid.interpolate({ inputRange: [0, 0.4, 0.65, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }),
        transform: [
          { rotate: motion.lid.interpolate({ inputRange: [0.4, 1], outputRange: ['26deg', '0deg'] }) },
          { scale: motion.lid.interpolate({ inputRange: [0.4, 1], outputRange: [0.55, 1] }) },
        ],
      }
    : null;
  const sparkleStyle: Animated.WithAnimatedObject<ViewStyle> | null = motion?.sparkle
    ? {
        opacity: motion.sparkle.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
        transform: [{ scale: motion.sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2], extrapolate: 'clamp' }) }],
      }
    : null;
  const raysStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: light,
    transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: reach }],
  };
  const hingeOf = (layer: ChestLayer): string => `${(drawing.hinge[0] - layer.box.x) * unit}px ${(drawing.hinge[1] - layer.box.y) * unit}px`;

  return (
    <View style={[{ width: size, height }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Part drawing={drawing} layer={layers.shadow} unit={unit} />
      {showOpen ? <Part drawing={drawing} layer={layers.lidOpen} unit={unit} style={[openStyle, { transformOrigin: hingeOf(layers.lidOpen) }]} testID={testID ? `${testID}-lid-open` : undefined} /> : null}
      {rays && showOpen ? <Part drawing={drawing} layer={layers.rays} unit={unit} style={raysStyle} testID={testID ? `${testID}-rays${turning ? '-turning' : ''}` : undefined} /> : null}
      <Part drawing={drawing} layer={layers.body} unit={unit} />
      {showOpen ? <Part drawing={drawing} layer={layers.light} unit={unit} style={{ opacity: light }} /> : null}
      <Part drawing={drawing} layer={layers.lock} unit={unit} />
      {shine && !showOpen ? <Glint drawing={drawing} unit={unit} /> : null}
      {!open ? <Part drawing={drawing} layer={layers.lid} unit={unit} style={[lidStyle, { transformOrigin: hingeOf(layers.lid) }]} testID={testID ? `${testID}-lid` : undefined} /> : null}
      {sparkleStyle ? <Part drawing={drawing} layer={layers.sparkle} unit={unit} style={sparkleStyle} /> : null}
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
 * The glint over the lock plate: six still frames of the band of light at
 * points across it, each faded in and out in turn on the native driver, so
 * the eye reads a pass and nothing is drawn while it plays. It rests between
 * passes, and altogether while the screen is not in view or the phone has
 * asked for less motion.
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
