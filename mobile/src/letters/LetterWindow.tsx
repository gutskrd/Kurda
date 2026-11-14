import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_PLAY,
  LETTER_SILL,
  LETTER_WINDOW_DEPTH,
  letterBirdSvg,
  letterEnvelopeSvg,
  letterFlightShadow,
  letterPlayShadow,
  letterPlayShows,
  letterShadowSvg,
  letterWindowSvg,
  treeSkyAt,
  type LetterPlay,
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
 * What the pigeon does is the screen's news, so it is acted rather than
 * written, in the plays of the shared LETTER_PLAY, as on the website:
 *   - `home`: your pigeon on the sill, bobbing its head, blinking, pecking at
 *     the seeds, looking up at the sky, chirping and hopping round; or
 *     asleep there at night;
 *   - `leaving`: your letter drops onto the sill; the pigeon hops for joy,
 *     picks it up and beats its wings, then flies out through the window and
 *     away over the country, smaller and smaller;
 *   - `away`: the sill is empty, your pigeon is out;
 *   - `arriving`: a pigeon comes from far off with its letter, in through the
 *     window and lands; it shakes its feathers, lays the letter on the sill,
 *     chirps, hops round to look about, waves, and stays at home there.
 * The pigeon's shadow, and the shadow of the letter in its beak or lying on
 * the sill, are laid on the sill by themselves: they stay there under the
 * pigeon when it hops, fade as it rises and come back as it lands.
 *
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

/** The moment a pigeon taking off leaves the sill (and, landing backwards, comes down on it): it stands until then. */
const LIFT = LETTER_FLIGHT.keys[1]!.at;

/** Shown up to `at` of a clock and not after. */
const until = (clock: Animated.Value, at: number): Animated.AnimatedInterpolation<number> =>
  clock.interpolate({ inputRange: [0, at, Math.min(1, at + 0.001), 1], outputRange: [1, 1, 0, 0] });

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

/** One picture of a pigeon on its square, placed on the sill of a window `size` wide; its shadow is laid on the sill by itself (`Shade`). */
function Pose({ bird, pose, letter = false, facingLeft = false, size, style }: { bird: number; pose: PigeonPose; letter?: boolean; facingLeft?: boolean; size: number; style?: Animated.WithAnimatedValue<ViewStyle> }): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterBirdSvg({ bird, pose, letter, facingLeft, shadow: false, size: 120, idPrefix: id }), [bird, pose, letter, facingLeft, id]);
  const box = size * BOX.size;
  return (
    <Animated.View style={[{ position: 'absolute', left: size * BOX.left, top: size * BOX.top, width: box, height: box }, style]}>
      <SvgXml xml={xml} width={box} height={box} />
    </Animated.View>
  );
}

/** The shadow a pigeon casts on the sill of a window `size` wide, on its square placed there, with the shadow of a letter in its beak (`letter`). */
function Shade({ pose = 'perched', letter = false, facingLeft = false, size, style }: { pose?: PigeonPose; letter?: boolean; facingLeft?: boolean; size: number; style?: Animated.WithAnimatedValue<ViewStyle> }): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterShadowSvg({ pose, letter, facingLeft, size: 120, idPrefix: id }), [pose, letter, facingLeft, id]);
  const box = size * BOX.size;
  return (
    <Animated.View style={[{ position: 'absolute', left: size * BOX.left, top: size * BOX.top, width: box, height: box }, style]}>
      <SvgXml xml={xml} width={box} height={box} />
    </Animated.View>
  );
}

/** Where a pigeon's feet are on its own square, as shares of it: what it leans and turns about. */
const FEET = { x: LETTER_BIRD_FEET.x / 120, y: LETTER_BIRD_FEET.y / 120 } as const;
/** The feet on the window's square: what a pigeon on the sill, and its shadow, turn and grow about. */
const FEET_ORIGIN = `${(BOX.left + BOX.size * FEET.x) * 100}% ${(BOX.top + BOX.size * FEET.y) * 100}%`;

/** A pigeon asleep on the sill at night, breathing over its shadow. */
function Asleep({ bird, size }: { bird: number; size: number }): React.JSX.Element {
  const alive = useMotionAlive();
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) return;
    clock.setValue(0);
    const run = Animated.loop(Animated.timing(clock, { toValue: 1, duration: 3400, easing: Easing.linear, ...native }));
    run.start();
    return () => run.stop();
  }, [alive, clock]);
  const foot = `50% ${(BOX.top + BOX.size * FEET.y) * 100}%`;
  const breathe = { transformOrigin: foot, transform: [{ scaleX: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) }, { scaleY: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.035, 1] }) }] };
  return (
    <>
      <Shade pose="sleep" size={size} />
      <Animated.View style={[StyleSheet.absoluteFill, breathe]} testID="letter-pigeon-asleep">
        <Pose bird={bird} pose="sleep" size={size} />
      </Animated.View>
    </>
  );
}

/** Where a letter lies on the sill: its own square, as a share of a pigeon's, and how far down that square the bottom of the envelope is. */
const SILL_LETTER = { share: 0.24, foot: 92 / 120 } as const;

/**
 * A letter in its envelope lying on the sill over its shadow, `at` (shares of
 * the pigeon's square) in front of the feet of a pigeon facing the way `dir`
 * says, in a window `size` wide. The letter coming down (`style`) and its
 * shadow growing under it (`shadeStyle`) are moved by the play.
 */
function SillLetter({
  at,
  dir,
  size,
  style,
  shadeStyle,
}: {
  at: number;
  dir: number;
  size: number;
  style?: Animated.WithAnimatedValue<ViewStyle>;
  shadeStyle?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterEnvelopeSvg({ size: 120, idPrefix: id }), [id]);
  const shadow = useMemo(() => letterEnvelopeSvg({ shadow: true, size: 120, idPrefix: `${id}s` }), [id]);
  const box = size * BOX.size;
  const side = box * SILL_LETTER.share;
  const left = size * BOX.left + box * (FEET.x + at * dir) - side / 2;
  const top = size * BOX.top + box * FEET.y - side * SILL_LETTER.foot;
  // lying down, it is seen a little from above
  const lying = { transformOrigin: `50% ${SILL_LETTER.foot * 100}%`, transform: [{ scaleY: 0.62 }, { rotate: '-4deg' }] };
  return (
    <View style={[{ position: 'absolute', left, top, width: side, height: side }, lying]} pointerEvents="none" testID="letter-on-sill">
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 62%' }, shadeStyle]}>
        <SvgXml xml={shadow} width={side} height={side} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <SvgXml xml={xml} width={side} height={side} />
      </Animated.View>
    </View>
  );
}

/**
 * A pigeon playing on the sill (LETTER_PLAY), as the website plays it: every
 * picture its play shows laid one on another and switched on the play's own
 * clock, the pigeon moved about its feet over its shadow on the sill
 * (letterPlayShadow), and a letter on the sill when the play has one. It plays once and says so (`onEnd`), or, an idle play, round
 * and round while the screen is in front. A reader who asked for less motion
 * sees how it ends.
 */
function Playing({ bird, play, facingLeft = false, size, onEnd }: { bird: number; play: LetterPlay; facingLeft?: boolean; size: number; onEnd?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const clock = useRef(new Animated.Value(0)).current;
  const shows = useMemo(() => letterPlayShows(play), [play]);
  const shadow = useMemo(() => letterPlayShadow(play), [play]);
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const dir = facingLeft ? -1 : 1;

  useEffect(() => {
    // a play that tells something runs whatever else is going on; one that only goes round waits for somebody to be looking
    if (reduce || (play.loop && !alive)) {
      clock.setValue(play.loop ? 0 : 1);
      if (!play.loop) ended.current?.();
      return;
    }
    clock.setValue(0);
    const once = Animated.timing(clock, { toValue: 1, duration: play.ms, easing: Easing.linear, ...native });
    const run = play.loop ? Animated.loop(once) : once;
    run.start(({ finished }) => {
      if (finished && !play.loop) ended.current?.();
    });
    return () => run.stop();
  }, [play, reduce, alive, clock]);

  const box = size * BOX.size;
  const at = play.moves.map((m) => m.at);
  const ease = { easing: Easing.inOut(Easing.quad) };
  const moved = {
    transformOrigin: FEET_ORIGIN,
    transform: [
      { translateX: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.x * dir * box), ...ease }) },
      { translateY: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.y * box), ...ease }) },
      { rotate: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => `${m.tilt * dir}deg`), ...ease }) },
      { scaleX: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.sx), ...ease }) },
      { scaleY: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.sy), ...ease }) },
    ],
  };
  // the shadow keeps to the sill: it goes along under the pigeon but never up with it
  const shadeAt = shadow.moves.map((k) => k.at);
  const shaded = {
    transformOrigin: FEET_ORIGIN,
    opacity: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.seen), ...ease }),
    transform: [
      { translateX: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.x * dir * box), ...ease }) },
      { scaleX: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.sx), ...ease }) },
      { scaleY: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.sy), ...ease }) },
    ],
  };
  // the shadow with a letter's in it is laid only for a play in which the pigeon holds one, and switched with the plain one
  const holds = shadow.holding.some(([, seen]) => seen === 1);
  const held = holds ? clock.interpolate({ inputRange: shadow.holding.map(([t]) => t), outputRange: shadow.holding.map(([, seen]) => seen) }) : null;
  const letterAt = play.letter.map((k) => k.at);
  const letterMoves = play.letter.length
    ? {
        opacity: clock.interpolate({ inputRange: letterAt, outputRange: play.letter.map((k) => k.seen) }),
        transform: [{ translateY: clock.interpolate({ inputRange: letterAt, outputRange: play.letter.map((k) => k.y * box), ...ease }) }],
      }
    : null;
  const letterShade = shadow.letter.length
    ? {
        opacity: clock.interpolate({ inputRange: letterAt, outputRange: shadow.letter.map((k) => k.seen) }),
        transform: [{ scale: clock.interpolate({ inputRange: letterAt, outputRange: shadow.letter.map((k) => k.size), ...ease }) }],
      }
    : undefined;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={`letter-pigeon-${play === LETTER_PLAY.idle ? 'home' : 'playing'}`}>
      <Animated.View style={[StyleSheet.absoluteFill, shaded]}>
        <Shade facingLeft={facingLeft} size={size} style={held ? { opacity: Animated.subtract(1, held) } : undefined} />
        {held ? <Shade letter facingLeft={facingLeft} size={size} style={{ opacity: held }} /> : null}
      </Animated.View>
      {letterMoves ? <SillLetter at={play.letterAt} dir={dir} size={size} style={letterMoves} shadeStyle={letterShade} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, moved]}>
        {shows.map((show) => (
          <Pose
            key={`${show.pose}${show.letter}`}
            bird={bird}
            pose={show.pose}
            letter={show.letter}
            facingLeft={facingLeft}
            size={size}
            style={{ opacity: clock.interpolate({ inputRange: show.steps.map(([t]) => t), outputRange: show.steps.map(([, seen]) => seen) }) }}
          />
        ))}
      </Animated.View>
    </View>
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
  const standing = until(flight, LIFT);
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

/**
 * The shadow of a flight on the sill (letterFlightShadow), on the same
 * `flight` clock as the pigeon: under it as it goes, gone as it rises, and
 * back under it as one coming in comes down.
 */
function FlightShade({ facingLeft, size, flight }: { facingLeft: boolean; size: number; flight: Animated.Value }): React.JSX.Element {
  const keys = useMemo(() => letterFlightShadow(), []);
  const at = keys.map((k) => k.at);
  const box = size * BOX.size;
  const shaded = {
    transformOrigin: FEET_ORIGIN,
    opacity: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.seen) }),
    transform: [
      { translateX: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.x * box) }) },
      { scaleX: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.sx) }) },
      { scaleY: flight.interpolate({ inputRange: at, outputRange: keys.map((k) => k.sy) }) },
    ],
  };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, shaded]} pointerEvents="none">
      <Shade letter facingLeft={facingLeft} size={size} />
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

/** Where a flight or a play has got to: playing before it goes, flying, playing after it comes, or at home again after a letter. */
type Phase = 'rest' | 'before' | 'flight' | 'after' | 'settled';

export function LetterWindow({ scene, size, onDone }: { scene: WindowScene; size: number; onDone?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const id = useRef(nextId()).current;
  const sky = treeSkyAt(new Date().getHours());
  // 0 on the sill, 1 gone far off over the country; a pigeon coming in runs it backwards
  const flight = useRef(new Animated.Value(scene.kind === 'arriving' ? 1 : 0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<Phase>('rest');
  const done = useRef(onDone);
  done.current = onDone;

  // the country's drift, the clouds going over, the casements stirring and the light breathing
  const drift = useSwing(alive, 16000, 0.5);
  const clouds = useSwing(alive, 46000, 0.5);
  const stir = useSwing(alive, 7000);
  const glow = useSwing(alive, 9000, 0.4);

  // a pigeon leaving plays first and then flies; one coming flies first and then plays
  useEffect(() => {
    setPhase(scene.kind === 'leaving' ? 'before' : scene.kind === 'arriving' ? 'flight' : 'rest');
  }, [scene]);

  const back = scene.kind === 'arriving';
  useEffect(() => {
    if (phase !== 'flight') return;
    flight.setValue(back ? 1 : 0);
    const finish = (): void => {
      if (back) setPhase('after');
      else done.current?.();
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
  }, [phase, back, reduce, flight, beat]);

  const deep = (part: LetterWindowPart) => ({ transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-0.5 * LETTER_WINDOW_DEPTH[part] * size, 0.5 * LETTER_WINDOW_DEPTH[part] * size] }) }] });
  const drifting = { transform: [...deep('clouds').transform, { translateX: clouds.interpolate({ inputRange: [0, 1], outputRange: [-0.07 * size, 0.07 * size] }) }] };
  const casement = (left: boolean) => ({
    transformOrigin: left ? '20% 50%' : '80% 50%',
    transform: [{ scaleX: stir.interpolate({ inputRange: [0, 1], outputRange: left ? [1, 0.92] : [0.92, 1] }) }],
  });
  const light = { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) };

  // which copy of a flying pigeon is seen: the one in the room until it is through the window, the one outside from then on
  const inRoom = until(flight, LETTER_FLIGHT.behindAt);
  const outside = Animated.subtract(1, inRoom);
  const flier = (scene.kind === 'leaving' || scene.kind === 'arriving') && phase === 'flight' ? scene.bird : null;

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
      {/* the light lies on the sill, so a pigeon standing there is over it, never under it */}
      <Layer part="light" sky={sky} size={size} id={id} style={light} />
      {flier !== null ? <FlightShade facingLeft={back} size={size} flight={flight} /> : null}
      {scene.kind === 'home' ? (sky === 'night' ? <Asleep bird={scene.bird} size={size} /> : <Playing key="idle" bird={scene.bird} play={LETTER_PLAY.idle} size={size} />) : null}
      {scene.kind === 'leaving' && phase === 'before' ? <Playing key="before" bird={scene.bird} play={LETTER_PLAY.before} size={size} onEnd={() => setPhase('flight')} /> : null}
      {flier !== null ? <Flying bird={flier} facingLeft={back} size={size} flight={flight} beat={beat} seen={inRoom} /> : null}
      {scene.kind === 'arriving' && phase === 'after' ? <Playing key="after" bird={scene.bird} play={LETTER_PLAY.after} facingLeft size={size} onEnd={() => setPhase('settled')} /> : null}
      {scene.kind === 'arriving' && phase === 'settled' ? (
        <>
          <SillLetter at={LETTER_PLAY.after.letterAt} dir={-1} size={size} />
          <Playing key="settled" bird={scene.bird} play={LETTER_PLAY.idle} facingLeft size={size} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { alignSelf: 'center', overflow: 'hidden', borderRadius: radii.xl },
});
