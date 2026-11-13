import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_SILL,
  LETTER_WINDOW_DEPTH,
  letterBirdSvg,
  letterWindowSvg,
  treeSkyAt,
  type LetterWindowPart,
  type PigeonPose,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { radii } from '../theme/tokens';

/**
 * Your window on the letters screen (shared/src/art/letters.ts), as the
 * website has it (web/src/letters/LetterWindow.tsx): seen from inside the
 * room, the hour's country through it and, on the sill, a pigeon.
 *
 * The window is laid in its layers, so it has depth: the country behind the
 * frame drifts a little of itself, the near meadow more than the far
 * mountains; the clouds go slowly over; the casements stir in the breeze;
 * the light on the sill brightens and dims.
 *
 * What the pigeon does is the screen's news, so it is acted rather than written:
 *   - `home`: your pigeon on the sill, blinking and bobbing its head, or
 *     asleep there at night;
 *   - `leaving`: it takes off with the letter in its beak and flies out
 *     through the window and away over the country, smaller and smaller;
 *   - `away`: the sill is empty, your pigeon is out;
 *   - `arriving`: a pigeon comes from far off with its letter, in through the
 *     window, lands, and waves a wing.
 * Only transform and opacity move, on the native driver, and the loops stop
 * while the screen is not in front. A reader who asked for less motion sees
 * the window still and each flight as it ends, at once. The picture is
 * decoration: the screen says in words what the pigeon is doing.
 */
export type WindowScene = { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number };

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
const native = { useNativeDriver: true } as const;

let drawings = 0;
function nextId(): string {
  drawings += 1;
  return `hvw${drawings.toString(36)}`;
}

/** Where a pigeon's own square stands on the sill, as shares of the window, and the middle of it, which it flies about. */
const BOX = {
  left: LETTER_SILL.x / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.x) / 120,
  top: LETTER_SILL.y / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.y) / 120,
  size: LETTER_SILL.birdShare,
};
const MIDDLE = `${(BOX.left + BOX.size / 2) * 100}% ${(BOX.top + BOX.size / 2) * 100}%`;

/** Shown up to `at` of a clock and not after (or, `after`, the other way about). */
const until = (clock: Animated.Value, at: number, after = false): Animated.AnimatedInterpolation<number> =>
  clock.interpolate({ inputRange: [0, at, Math.min(1, at + 0.001), 1], outputRange: after ? [0, 0, 1, 1] : [1, 1, 0, 0] });

/** A clock that goes from 0 to 1 and back for as long as the screen is in front, `ms` each way, starting `from` along. */
function useSwing(alive: boolean, ms: number, from = 0): Animated.Value {
  const value = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    if (!alive) return;
    const way = (to: number, part = 1) => Animated.timing(value, { toValue: to, duration: ms * part, easing: Easing.inOut(Easing.sin), ...native });
    const run = Animated.sequence([way(1, 1 - from), Animated.loop(Animated.sequence([way(0), way(1)]))]);
    run.start();
    return () => run.stop();
  }, [alive, ms, from, value]);
  return value;
}

/** One picture of a pigeon on its square, placed on the sill of a window `size` wide. */
function Pose({ bird, pose, letter = false, facingLeft = false, size, style }: { bird: number; pose: PigeonPose; letter?: boolean; facingLeft?: boolean; size: number; style?: Animated.WithAnimatedValue<ViewStyle> }): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterBirdSvg({ bird, pose, letter, facingLeft, size: 120, idPrefix: id }), [bird, pose, letter, facingLeft, id]);
  const box = size * BOX.size;
  return (
    <Animated.View style={[{ position: 'absolute', left: size * BOX.left, top: size * BOX.top, width: box, height: box }, style]}>
      <SvgXml xml={xml} width={box} height={box} />
    </Animated.View>
  );
}

/** A pigeon at rest on the sill: blinking and bobbing by day, asleep and breathing at night, or just landed and waving. */
function Resting({ bird, asleep, landed = false, facingLeft = false, size }: { bird: number; asleep: boolean; landed?: boolean; facingLeft?: boolean; size: number }): React.JSX.Element {
  const alive = useMotionAlive();
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) return;
    clock.setValue(0);
    // waving runs once; the rest goes round for as long as anybody is looking
    const run = landed
      ? Animated.timing(clock, { toValue: 1, duration: 1900, easing: Easing.linear, ...native })
      : Animated.loop(Animated.timing(clock, { toValue: 1, duration: asleep ? 3400 : 4600, easing: Easing.linear, ...native }));
    run.start();
    return () => run.stop();
  }, [alive, landed, asleep, clock]);
  const foot = `50% ${(BOX.top + BOX.size * 0.83) * 100}%`;
  if (asleep) {
    const breathe = { transformOrigin: foot, transform: [{ scaleX: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) }, { scaleY: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.035, 1] }) }] };
    return (
      <Animated.View style={[StyleSheet.absoluteFill, breathe]} testID="letter-pigeon-asleep">
        <Pose bird={bird} pose="sleep" facingLeft={facingLeft} size={size} />
      </Animated.View>
    );
  }
  if (landed) {
    // two waves of the wing: the wave picture and the standing one by turns
    const waving = clock.interpolate({ inputRange: [0, 0.21, 0.211, 0.41, 0.411, 0.53, 0.531, 0.75, 0.751, 1], outputRange: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0] });
    const standing = Animated.subtract(1, waving);
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="letter-pigeon-landed">
        <Pose bird={bird} pose="perched" facingLeft={facingLeft} size={size} style={{ opacity: standing }} />
        <Pose bird={bird} pose="wave" facingLeft={facingLeft} size={size} style={{ opacity: waving }} />
      </View>
    );
  }
  // a pigeon's bob of the head, twice, now and then; and a blink, at its own times
  const bob = { transformOrigin: foot, transform: [{ translateY: clock.interpolate({ inputRange: [0, 0.62, 0.66, 0.7, 0.74, 0.78, 1], outputRange: [0, 0, -size * 0.011, 0, -size * 0.011, 0, 0] }) }] };
  const blink = clock.interpolate({ inputRange: [0, 0.3, 0.301, 0.335, 0.336, 0.9, 0.901, 0.935, 0.936, 1], outputRange: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, bob]} pointerEvents="none" testID="letter-pigeon-home">
      <Pose bird={bird} pose="perched" facingLeft={facingLeft} size={size} />
      <Pose bird={bird} pose="blink" facingLeft={facingLeft} size={size} style={{ opacity: blink }} />
    </Animated.View>
  );
}

/**
 * A pigeon in flight, one copy of it: moved over the window's square on
 * `flight` (0 on the sill, 1 gone far off), seen while `seen` says so,
 * standing to take off (or as it lands) and beating its wings between.
 */
function Flying({ bird, facingLeft, size, flight, beat, seen }: { bird: number; facingLeft: boolean; size: number; flight: Animated.Value; beat: Animated.Value; seen: Animated.AnimatedInterpolation<number> }): React.JSX.Element {
  const keys = LETTER_FLIGHT.keys;
  const at = keys.map((k) => k.at);
  const moved = {
    transformOrigin: MIDDLE,
    opacity: Animated.multiply(seen, flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.seen) })),
    transform: [
      { translateX: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.x * size) }) },
      { translateY: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.y * size) }) },
      { scale: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.scale) }) },
    ],
  };
  // it stands for the first moment of a take-off, and the last of a landing (the flight clock runs backwards for one coming in)
  const standing = until(flight, 0.12);
  const winging = Animated.subtract(1, standing);
  const up = until(beat, 0.5);
  const down = Animated.subtract(1, up);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, moved]} pointerEvents="none">
      <Pose bird={bird} pose="perched" letter facingLeft={facingLeft} size={size} style={{ opacity: standing }} />
      <Pose bird={bird} pose="wings-up" letter facingLeft={facingLeft} size={size} style={{ opacity: Animated.multiply(winging, up) }} />
      <Pose bird={bird} pose="wings-down" letter facingLeft={facingLeft} size={size} style={{ opacity: Animated.multiply(winging, down) }} />
    </Animated.View>
  );
}

/** One layer of the window, drifting as far as its depth says. */
function Layer({ part, sky, size, id, style }: { part: LetterWindowPart; sky: ReturnType<typeof treeSkyAt>; size: number; id: string; style?: Animated.WithAnimatedValue<ViewStyle> }): React.JSX.Element {
  const xml = useMemo(() => letterWindowSvg({ sky, part, size, idPrefix: `${id}${part}` }), [sky, part, size, id]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

export function LetterWindow({ scene, size, onDone }: { scene: WindowScene; size: number; onDone?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const id = useRef(nextId()).current;
  const sky = treeSkyAt(new Date().getHours());
  // 0 on the sill, 1 gone far off over the country; a pigeon coming in runs it backwards
  const flight = useRef(new Animated.Value(scene.kind === 'arriving' ? 1 : 0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  const [landed, setLanded] = useState<'no' | 'waving' | 'settled'>('no');
  const done = useRef(onDone);
  done.current = onDone;

  // the country's drift, the clouds going over, the casements stirring and the light breathing
  const drift = useSwing(alive, 16000, 0.5);
  const clouds = useSwing(alive, 46000, 0.5);
  const stir = useSwing(alive, 7000);
  const glow = useSwing(alive, 9000, 0.4);

  const flying = scene.kind === 'leaving' || scene.kind === 'arriving';
  useEffect(() => {
    setLanded('no');
    if (!flying) return;
    const back = scene.kind === 'arriving';
    flight.setValue(back ? 1 : 0);
    const finish = (): void => {
      if (back) setLanded('waving');
      done.current?.();
    };
    if (reduce) {
      flight.setValue(back ? 0 : 1);
      finish();
      return;
    }
    const flap = Animated.loop(Animated.timing(beat, { toValue: 1, duration: LETTER_FLIGHT.beatMs, easing: Easing.linear, ...native }));
    const run = Animated.timing(flight, {
      toValue: back ? 0 : 1,
      duration: LETTER_FLIGHT.ms,
      easing: back ? Easing.bezier(0.25, 0.4, 0.5, 0.8) : Easing.bezier(0.5, 0.2, 0.75, 0.6),
      ...native,
    });
    flap.start();
    run.start(({ finished }) => {
      flap.stop();
      if (finished) finish();
    });
    return () => {
      run.stop();
      flap.stop();
    };
  }, [scene, flying, reduce, flight, beat]);

  useEffect(() => {
    if (landed !== 'waving') return;
    const timer = setTimeout(() => setLanded('settled'), 2000);
    return () => clearTimeout(timer);
  }, [landed]);

  const deep = (part: LetterWindowPart) => ({ transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-0.5 * LETTER_WINDOW_DEPTH[part] * size, 0.5 * LETTER_WINDOW_DEPTH[part] * size] }) }] });
  const drifting = { transform: [...deep('clouds').transform, { translateX: clouds.interpolate({ inputRange: [0, 1], outputRange: [-0.07 * size, 0.07 * size] }) }] };
  const casement = (left: boolean) => ({
    transformOrigin: left ? '20% 50%' : '80% 50%',
    transform: [{ scaleX: stir.interpolate({ inputRange: [0, 1], outputRange: left ? [1, 0.92] : [0.92, 1] }) }],
  });
  const light = { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) };

  // which copy of a flying pigeon is seen: the one in the room until it is through the window, the one outside from then on
  const back = scene.kind === 'arriving';
  const inRoom = until(flight, LETTER_FLIGHT.behindAt);
  const outside = Animated.subtract(1, inRoom);
  const flier = flying ? scene.bird : null;

  return (
    <View {...HIDDEN} style={[styles.window, { width: size, height: size }]} testID="letter-window">
      <Layer part="sky" sky={sky} size={size} id={id} style={deep('sky')} />
      <Layer part="clouds" sky={sky} size={size} id={id} style={drifting} />
      <Layer part="far" sky={sky} size={size} id={id} style={deep('far')} />
      <Layer part="near" sky={sky} size={size} id={id} style={deep('near')} />
      {flier !== null ? <Flying bird={flier} facingLeft={back} size={size} flight={flight} beat={beat} seen={outside} /> : null}
      <Layer part="room" sky={sky} size={size} id={id} />
      <Layer part="left" sky={sky} size={size} id={id} style={casement(true)} />
      <Layer part="right" sky={sky} size={size} id={id} style={casement(false)} />
      {scene.kind === 'home' ? <Resting bird={scene.bird} asleep={sky === 'night'} size={size} /> : null}
      {flier !== null && landed === 'no' ? <Flying bird={flier} facingLeft={back} size={size} flight={flight} beat={beat} seen={inRoom} /> : null}
      {scene.kind === 'arriving' && landed !== 'no' ? <Resting bird={scene.bird} asleep={false} landed={landed === 'waving'} facingLeft size={size} /> : null}
      <Layer part="light" sky={sky} size={size} id={id} style={light} />
    </View>
  );
}

const styles = StyleSheet.create({
  window: { alignSelf: 'center', overflow: 'hidden', borderRadius: radii.xl },
});
