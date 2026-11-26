import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  LETTER_BIRD_FEET,
  LETTER_FLIGHT,
  LETTER_NOTES,
  LETTER_PLANT_SWAY,
  LETTER_PLAY,
  LETTER_PLAY_BESIDE,
  LETTER_SILL,
  LETTER_SILL_SPOTS,
  LETTER_SKY,
  LETTER_WINDOW_DEPTH,
  letterBirdSvg,
  letterDrifts,
  letterEnvelopeSvg,
  letterFlightFrom,
  letterPlayShadow,
  letterPlayShows,
  letterShadowSvg,
  letterSillBox,
  letterSillShift,
  letterSpriteSvg,
  letterWindowSvg,
  treeSeasonAt,
  treeSkyAt,
  type LetterDrift,
  type LetterPlay,
  type LetterSkyBird,
  type LetterSpot,
  type LetterWindowPart,
  type LetterWindowScene,
  type PigeonPose,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { radii } from '../theme/tokens';
import { HIDDEN } from './PaperSheet';

/**
 * Your window on the letters screen (shared art/letters.ts and letter-sky.ts), matching
 * web/src/letters/LetterWindow.tsx: the room's window with the hour's landscape behind it, birds circling outside
 * (`sky`), your own bird on the sill, and a visitor when one is called. Layers drift at different depths, and the
 * birds act out the screen's news in the shared LETTER_PLAY plays; what to act (`scene`) comes from
 * shared/src/letter-window.ts. Your bird can also be `here`: back on the sill with its letter, without a flight.
 *
 * Only transform and opacity animate, on the native driver, and loops stop while the screen is not in front. Under
 * Reduce Motion the window is still and each play shows its end at once. The picture is decorative; the screen says
 * in words what is happening.
 */
export type WindowScene = LetterWindowScene;

const native = { useNativeDriver: true } as const;

let drawings = 0;
function nextId(): string {
  drawings += 1;
  return `hvw${drawings.toString(36)}`;
}

/** A spot's square on the sill of a window `size` points wide: left, top and side. */
function boxOn(spot: LetterSpot, size: number): { left: number; top: number; side: number } {
  const box = letterSillBox(spot);
  return { left: box.left * size, top: box.top * size, side: box.size * size };
}

/** A pigeon's feet on its own square, as fractions of it; it leans and turns about them. */
const FEET = { x: LETTER_BIRD_FEET.x / 120, y: LETTER_BIRD_FEET.y / 120 } as const;

/** The feet of a pigeon at a spot, on the window's square; the pigeon and its shadow transform about them. */
function feetOf(spot: LetterSpot): string {
  const box = letterSillBox(spot);
  return `${(box.left + box.size * FEET.x) * 100}% ${(box.top + box.size * FEET.y) * 100}%`;
}

/** The centre of a spot's square, on the window's square; a flight from it turns about this. */
function middleOf(spot: LetterSpot): string {
  const box = letterSillBox(spot);
  return `${(box.left + box.size / 2) * 100}% ${(box.top + box.size / 2) * 100}%`;
}

/** When a departing pigeon leaves the sill (and a landing one touches it, run backwards); it stands until then. */
const LIFT = LETTER_FLIGHT.keys[1]!.at;
/**
 * Flight easing, as on the website: a departure accelerates, a landing decelerates. The flight clock itself is
 * eased, so everything keyed to it happens at the same point in either direction.
 */
const FLIGHT_EASING = { out: Easing.bezier(0.5, 0, 0.75, 0.6), in: Easing.bezier(0.2, 0.6, 0.35, 1) } as const;

/** Visible up to `at` on a clock, and hidden after. */
const until = (clock: Animated.Value, at: number): Animated.AnimatedInterpolation<number> =>
  clock.interpolate({ inputRange: [0, at, Math.min(1, at + 0.001), 1], outputRange: [1, 1, 0, 0] });

/** A clock swinging 0 to 1 and back, `ms` each way and starting `from` along, while the screen is in front. */
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

/**
 * A clock going round from 0 to 1 every `ms` while `alive`. It restarts from 0 each time, since a native-driver loop
 * runs from wherever it started.
 */
function useRound(alive: boolean, ms: number): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) return;
    value.setValue(0);
    const run = Animated.loop(Animated.timing(value, { toValue: 1, duration: ms, easing: Easing.linear, ...native }));
    run.start();
    return () => run.stop();
  }, [alive, ms, value]);
  return value;
}

/** A drawing laid on the window at its own position and size, in points. */
function Art({
  xml,
  left,
  top,
  side,
  style,
}: {
  xml: string;
  left: number;
  top: number;
  side: number;
  style?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  return (
    <Animated.View style={[{ position: 'absolute', left, top, width: side, height: side }, style]} pointerEvents="none">
      <SvgXml xml={xml} width={side} height={side} />
    </Animated.View>
  );
}

/** One picture of a pigeon on its square at a sill spot; its shadow is drawn separately (`Shade`). */
function Pose({
  bird,
  pose,
  letter = false,
  facingLeft = false,
  spot,
  size,
  style,
}: {
  bird: number;
  pose: PigeonPose;
  letter?: boolean;
  facingLeft?: boolean;
  spot: LetterSpot;
  size: number;
  style?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterBirdSvg({ bird, pose, letter, facingLeft, shadow: false, size: 120, idPrefix: id }), [bird, pose, letter, facingLeft, id]);
  const box = boxOn(spot, size);
  return <Art xml={xml} left={box.left} top={box.top} side={box.side} style={style} />;
}

/** A pigeon's shadow on the sill, with its letter's shadow when it holds one (`letter`). */
function Shade({
  pose = 'perched',
  letter = false,
  facingLeft = false,
  spot,
  size,
  style,
}: {
  pose?: PigeonPose;
  letter?: boolean;
  facingLeft?: boolean;
  spot: LetterSpot;
  size: number;
  style?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterShadowSvg({ pose, letter, facingLeft, size: 120, idPrefix: id }), [pose, letter, facingLeft, id]);
  const box = boxOn(spot, size);
  return <Art xml={xml} left={box.left} top={box.top} side={box.side} style={style} />;
}

/** A pigeon asleep on the sill at night, breathing over its shadow. */
function Asleep({ bird, spot, size }: { bird: number; spot: LetterSpot; size: number }): React.JSX.Element {
  const alive = useMotionAlive();
  const clock = useRound(alive, 3400);
  const box = letterSillBox(spot);
  const breathe = {
    transformOrigin: `${(box.left + box.size / 2) * 100}% ${(box.top + box.size * FEET.y) * 100}%`,
    transform: [
      { scaleX: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) },
      { scaleY: clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.035, 1] }) },
    ],
  };
  return (
    <>
      <Shade pose="sleep" spot={spot} size={size} />
      <Animated.View style={[StyleSheet.absoluteFill, breathe]} pointerEvents="none" testID="letter-pigeon-asleep">
        <Pose bird={bird} pose="sleep" spot={spot} size={size} />
      </Animated.View>
    </>
  );
}

/** A letter's square on the sill, as a fraction of a pigeon's, and how far down it the envelope's bottom sits. */
const SILL_LETTER = { share: 0.24, foot: 92 / 120 } as const;

/**
 * An envelope on the sill over its shadow, `at` (fractions of the pigeon's square) in front of the feet of a pigeon
 * at `spot` facing `dir`. The play animates the letter coming down (`style`) and its shadow growing (`shadeStyle`).
 */
function SillLetter({
  at,
  dir,
  spot,
  size,
  style,
  shadeStyle,
}: {
  at: number;
  dir: number;
  spot: LetterSpot;
  size: number;
  style?: Animated.WithAnimatedValue<ViewStyle>;
  shadeStyle?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterEnvelopeSvg({ size: 120, idPrefix: id }), [id]);
  const shadow = useMemo(() => letterEnvelopeSvg({ shadow: true, size: 120, idPrefix: `${id}s` }), [id]);
  const box = boxOn(spot, size);
  const side = box.side * SILL_LETTER.share;
  const left = box.left + box.side * (FEET.x + at * dir) - side / 2;
  const top = box.top + box.side * FEET.y - side * SILL_LETTER.foot;
  // Lying flat, it is seen a little from above.
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
 * A pigeon playing at its spot (LETTER_PLAY), as on the website: every picture of the play stacked and switched on
 * the play's clock, the pigeon moving about its feet over its shadow (letterPlayShadow), with any letter on the sill.
 * It plays once and calls `onEnd`, or loops while the screen is in front if idle. Under Reduce Motion it shows its end.
 */
function Playing({
  bird,
  spot,
  play,
  facingLeft = false,
  size,
  onEnd,
}: {
  bird: number;
  spot: LetterSpot;
  play: LetterPlay;
  facingLeft?: boolean;
  size: number;
  onEnd?: () => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const clock = useRef(new Animated.Value(0)).current;
  const shows = useMemo(() => letterPlayShows(play), [play]);
  const shadow = useMemo(() => letterPlayShadow(play), [play]);
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const dir = facingLeft ? -1 : 1;

  useEffect(() => {
    // A play that tells something always runs; an idle loop waits until the screen is in front.
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

  const box = size * LETTER_SILL_SPOTS[spot].share;
  const feet = feetOf(spot);
  const at = play.moves.map((m) => m.at);
  const ease = { easing: Easing.inOut(Easing.quad) };
  const moved = {
    transformOrigin: feet,
    transform: [
      { translateX: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.x * dir * box), ...ease }) },
      { translateY: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.y * box), ...ease }) },
      { rotate: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => `${m.tilt * dir}deg`), ...ease }) },
      { scaleX: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.sx), ...ease }) },
      { scaleY: clock.interpolate({ inputRange: at, outputRange: play.moves.map((m) => m.sy), ...ease }) },
    ],
  };
  // The shadow stays on the sill: it follows the pigeon along but never up.
  const shadeAt = shadow.moves.map((k) => k.at);
  const shaded = {
    transformOrigin: feet,
    opacity: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.seen), ...ease }),
    transform: [
      { translateX: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.x * dir * box), ...ease }) },
      { scaleX: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.sx), ...ease }) },
      { scaleY: clock.interpolate({ inputRange: shadeAt, outputRange: shadow.moves.map((k) => k.sy), ...ease }) },
    ],
  };
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
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={`letter-pigeon-${play.loop ? 'home' : 'playing'}`}>
      {/* The shadow's shape switches with the pigeon's pictures, including the letter's while it holds one. */}
      <Animated.View style={[StyleSheet.absoluteFill, shaded]}>
        {shadow.shapes.map((shape) => (
          <Shade
            key={`${shape.pose}${shape.letter}`}
            pose={shape.pose}
            letter={shape.letter}
            facingLeft={facingLeft}
            spot={spot}
            size={size}
            style={{ opacity: clock.interpolate({ inputRange: shape.steps.map(([t]) => t), outputRange: shape.steps.map(([, seen]) => seen) }) }}
          />
        ))}
      </Animated.View>
      {letterMoves ? <SillLetter at={play.letterAt} dir={dir} spot={spot} size={size} style={letterMoves} shadeStyle={letterShade} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, moved]}>
        {shows.map((show) => (
          <Pose
            key={`${show.pose}${show.letter}`}
            bird={bird}
            pose={show.pose}
            letter={show.letter}
            facingLeft={facingLeft}
            spot={spot}
            size={size}
            style={{ opacity: clock.interpolate({ inputRange: show.steps.map(([t]) => t), outputRange: show.steps.map(([, seen]) => seen) }) }}
          />
        ))}
      </Animated.View>
    </View>
  );
}

/** Where a bird's sequence on the sill has reached: resting, playing before leaving, flying, playing after arriving, or settled. */
type Phase = 'rest' | 'play' | 'flight' | 'after' | 'settled';
/** One bird's part in the scene, the same for yours and a visitor. */
type Life =
  | { kind: 'none' }
  | { kind: 'home'; bird: number }
  | { kind: 'here'; bird: number }
  | { kind: 'leaving'; bird: number; play: LetterPlay }
  | { kind: 'arriving'; bird: number };

/** A bird's flight on or off the sill: its phase, and the clocks its flight and wings run on. */
interface Flight {
  phase: Phase;
  setPhase: (p: Phase) => void;
  /** 0 on the sill, 1 far off over the landscape; an arriving bird runs it backwards. */
  clock: Animated.Value;
  beat: Animated.Value;
}

/**
 * A bird's sequence and flight: a departing bird plays then flies, an arriving one flies then plays. One eased clock
 * drives both copies of the flying bird (`FlightCopy`) and its shadow (`FlightShade`).
 */
function useFlight(life: Life, onGone: () => void): Flight {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(life.kind === 'here' ? 'settled' : 'rest');
  const clock = useRef(new Animated.Value(life.kind === 'arriving' ? 1 : 0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  const gone = useRef(onGone);
  gone.current = onGone;
  // Set before the next frame, so an arriving bird is never seen standing on the sill for a moment.
  useLayoutEffect(() => {
    if (life.kind === 'arriving') clock.setValue(1);
    if (life.kind === 'leaving') clock.setValue(0);
    setPhase(life.kind === 'leaving' ? 'play' : life.kind === 'arriving' ? 'flight' : life.kind === 'here' ? 'settled' : 'rest');
  }, [life, clock]);
  const back = life.kind === 'arriving';
  useEffect(() => {
    if (phase !== 'flight') return;
    const finish = (): void => {
      if (back) setPhase('after');
      else gone.current();
    };
    if (reduce) {
      clock.setValue(back ? 0 : 1);
      finish();
      return;
    }
    clock.setValue(back ? 1 : 0);
    beat.setValue(0);
    const flap = Animated.loop(Animated.timing(beat, { toValue: 1, duration: LETTER_FLIGHT.beatMs, easing: Easing.linear, ...native }));
    const run = Animated.timing(clock, { toValue: back ? 0 : 1, duration: LETTER_FLIGHT.ms, easing: back ? FLIGHT_EASING.in : FLIGHT_EASING.out, ...native });
    flap.start();
    run.start(({ finished }) => {
      flap.stop();
      if (finished) finish();
    });
    return () => {
      run.stop();
      flap.stop();
    };
  }, [phase, back, reduce, clock, beat]);
  return { phase, setPhase, clock, beat };
}

/** The bird a life is about, while it has one. */
const birdOf = (life: Life): number | null => (life.kind === 'none' ? null : life.bird);

/**
 * One copy of a pigeon in flight from its spot, moved on the flight's clock (letterFlightFrom) while `seen`, standing
 * at take-off and landing and beating its wings between.
 */
function Flying({
  bird,
  spot,
  facingLeft,
  size,
  flight,
  seen,
}: {
  bird: number;
  spot: LetterSpot;
  facingLeft: boolean;
  size: number;
  flight: Flight;
  seen: Animated.AnimatedInterpolation<number>;
}): React.JSX.Element {
  const keys = useMemo(() => letterFlightFrom(spot), [spot]);
  const { clock, beat } = flight;
  const at = keys.map((k) => k.at);
  const moved = {
    transformOrigin: middleOf(spot),
    opacity: Animated.multiply(seen, clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.seen) })),
    transform: [
      { translateX: clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.x * size) }) },
      { translateY: clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.y * size) }) },
      { scale: clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.scale) }) },
    ],
  };
  // It stands for the first moment of a take-off and the last of a landing (the clock runs backwards for arrivals).
  const standing = until(clock, LIFT);
  const winging = Animated.subtract(1, standing);
  const up = until(beat, 0.5);
  const down = Animated.subtract(1, up);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, moved]} pointerEvents="none">
      <Pose bird={bird} pose="perched" letter facingLeft={facingLeft} spot={spot} size={size} style={{ opacity: standing }} />
      <Pose bird={bird} pose="wings-up" letter facingLeft={facingLeft} spot={spot} size={size} style={{ opacity: Animated.multiply(winging, up) }} />
      <Pose bird={bird} pose="wings-down" letter facingLeft={facingLeft} spot={spot} size={size} style={{ opacity: Animated.multiply(winging, down) }} />
    </Animated.View>
  );
}

/** One copy of a flying bird: the one in the room (`inside`) until it passes the window, then the one outside behind the room. */
function FlightCopy({
  life,
  flight,
  spot,
  facingLeft,
  size,
  inside,
}: {
  life: Life;
  flight: Flight;
  spot: LetterSpot;
  facingLeft: boolean;
  size: number;
  inside: boolean;
}): React.JSX.Element | null {
  const bird = birdOf(life);
  if (bird === null) return null;
  const inRoom = until(flight.clock, LETTER_FLIGHT.behindAt);
  return <Flying bird={bird} spot={spot} facingLeft={facingLeft} size={size} flight={flight} seen={inside ? inRoom : Animated.subtract(1, inRoom)} />;
}

/** Keyframes for a flight's shadow on the sill, from the flight's own path: under the bird, smaller and fainter as it rises. */
function flightShadowKeys(spot: LetterSpot): Array<{ at: number; x: number; size: number; seen: number }> {
  const share = LETTER_SILL_SPOTS[spot].share;
  return letterFlightFrom(spot).map((k) => {
    const lift = Math.max(0, (-k.y / share) * 0.7);
    return { at: k.at, x: k.x, size: Math.max(0.3, 1 - lift * 3), seen: Math.max(0, 1 - lift * 6) };
  });
}

/** A flying bird's shadow on the sill, on the same clock as its flight. */
function FlightShade({ flight, spot, facingLeft, size }: { flight: Flight; spot: LetterSpot; facingLeft: boolean; size: number }): React.JSX.Element | null {
  const keys = useMemo(() => flightShadowKeys(spot), [spot]);
  if (flight.phase !== 'flight') return null;
  const at = keys.map((k) => k.at);
  const shaded = {
    transformOrigin: feetOf(spot),
    opacity: flight.clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.seen) }),
    transform: [
      { translateX: flight.clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.x * size) }) },
      { scale: flight.clock.interpolate({ inputRange: at, outputRange: keys.map((k) => k.size) }) },
    ],
  };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, shaded]} pointerEvents="none">
      <Shade letter facingLeft={facingLeft} spot={spot} size={size} />
    </Animated.View>
  );
}

/**
 * A bird on the sill between flights: standing (asleep at night if allowed), playing, or settled with its letter. It
 * stands as it landed, and turns round through facing you when it must face the other way.
 */
function OnSill({
  life,
  flight,
  spot,
  facingLeft,
  asleep,
  beside,
  size,
}: {
  life: Life;
  flight: Flight;
  spot: LetterSpot;
  facingLeft: boolean;
  asleep: boolean;
  /** Another bird is on the sill, so it plays without turning toward it. */
  beside: boolean;
  size: number;
}): React.JSX.Element | null {
  const bird = birdOf(life);
  const { phase, setPhase } = flight;
  const [facing, setFacing] = useState(facingLeft);
  // In the air it faces its flight, so it lands facing the right way.
  useEffect(() => {
    if (phase === 'flight') setFacing(facingLeft);
  }, [phase, facingLeft]);
  if (bird === null || phase === 'flight') return null;
  if (facing !== facingLeft) {
    return <Playing key="turn" bird={bird} spot={spot} play={LETTER_PLAY.turn} facingLeft={facing} size={size} onEnd={() => setFacing(facingLeft)} />;
  }
  const dir = facingLeft ? -1 : 1;
  const plays = beside ? LETTER_PLAY_BESIDE : LETTER_PLAY;
  if (phase === 'play' && life.kind === 'leaving') {
    return <Playing key="play" bird={bird} spot={spot} play={life.play} facingLeft={facingLeft} size={size} onEnd={() => setPhase('flight')} />;
  }
  if (phase === 'after') {
    return <Playing key="after" bird={bird} spot={spot} play={plays.after} facingLeft={facingLeft} size={size} onEnd={() => setPhase('settled')} />;
  }
  if (phase === 'settled') {
    return (
      <>
        <SillLetter at={LETTER_PLAY.after.letterAt} dir={dir} spot={spot} size={size} />
        <Playing key="settled" bird={bird} spot={spot} play={plays.idle} facingLeft={facingLeft} size={size} />
      </>
    );
  }
  if (asleep) return <Asleep bird={bird} spot={spot} size={size} />;
  return <Playing key="idle" bird={bird} spot={spot} play={plays.idle} facingLeft={facingLeft} size={size} />;
}

/** Your bird's hop aside: duration, easing (quick off, settling) and lift. */
const HOP = { ms: 650, easing: Easing.bezier(0.3, 0, 0.3, 1), rise: 0.04 } as const;

/**
 * Your bird's spot, moving aside when a visitor comes and back when it goes; bird, letter and shadow hop together
 * about the feet. It is drawn at the new spot from the start of the hop and animated across from the old one. Under
 * Reduce Motion it moves at once.
 */
function useHop(spot: LetterSpot, size: number): { spot: LetterSpot; style: Animated.WithAnimatedValue<ViewStyle> | undefined } {
  const reduce = useReducedMotion();
  const hop = useRef(new Animated.Value(1)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [place, setPlace] = useState<{ spot: LetterSpot; from: LetterSpot }>({ spot, from: spot });
  useLayoutEffect(() => {
    if (place.spot === spot) return;
    running.current?.stop();
    running.current = null;
    hop.setValue(reduce ? 1 : 0);
    setPlace({ spot, from: place.spot });
    if (reduce) return;
    const run = Animated.timing(hop, { toValue: 1, duration: HOP.ms, easing: HOP.easing, ...native });
    running.current = run;
    run.start();
  }, [spot, place.spot, reduce, hop]);
  useEffect(() => () => running.current?.stop(), []);
  if (place.spot === place.from) return { spot: place.spot, style: undefined };
  const back = letterSillShift(place.spot, place.from);
  const along = back.x * LETTER_SILL_SPOTS[place.spot].share * size;
  const steps = [0, 0.5, 1];
  return {
    spot: place.spot,
    style: {
      transformOrigin: `${(LETTER_SILL_SPOTS[place.spot].x / 120) * 100}% ${(LETTER_SILL.y / 120) * 100}%`,
      transform: [
        { translateX: hop.interpolate({ inputRange: steps, outputRange: [along, along / 2, 0] }) },
        { translateY: hop.interpolate({ inputRange: steps, outputRange: [0, -HOP.rise * size, 0] }) },
        { scale: hop.interpolate({ inputRange: steps, outputRange: [back.scale, (1 + back.scale) / 2, 1] }) },
      ],
    },
  };
}

/** One layer of the window, drifting as far as its depth says. */
function Layer({
  part,
  sky,
  size,
  id,
  style,
}: {
  part: LetterWindowPart;
  sky: ReturnType<typeof treeSkyAt>;
  size: number;
  id: string;
  style?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element {
  const xml = useMemo(() => letterWindowSvg({ sky, part, size, idPrefix: `${id}${part}` }), [sky, part, size, id]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

/**
 * One small drifting thing on its own path (LetterDrift), looping while the screen is in front and started `delay`
 * along so several of a kind are never in step; with `once`, a single pass. A butterfly's wings beat on `flap`.
 */
function Drift({
  drift,
  size,
  once,
  alive,
  flap,
  id,
}: {
  drift: LetterDrift;
  size: number;
  once: boolean;
  alive: boolean;
  flap: Animated.Value;
  id: string;
}): React.JSX.Element {
  const clock = useRef(new Animated.Value(0)).current;
  const xml = useMemo(() => letterSpriteSvg({ sprite: drift.sprite, size: 60, idPrefix: id }), [drift.sprite, id]);
  useEffect(() => {
    // A single pass tells something and always runs; a loop waits until the screen is in front.
    if (!once && !alive) return;
    clock.setValue(0);
    const round = Animated.timing(clock, { toValue: 1, duration: drift.ms, easing: Easing.linear, ...native });
    const run = once ? round : Animated.loop(round);
    run.start();
    return () => run.stop();
  }, [once, alive, drift.ms, clock]);
  const moved = useMemo(() => {
    const along = once ? clock : Animated.modulo(Animated.add(clock, drift.delay), 1);
    const at = drift.keys.map((k) => k.at);
    return {
      opacity: along.interpolate({ inputRange: at, outputRange: drift.keys.map((k) => k.seen) }),
      transform: [
        { translateX: along.interpolate({ inputRange: at, outputRange: drift.keys.map((k) => (k.x - drift.size / 2) * size) }) },
        { translateY: along.interpolate({ inputRange: at, outputRange: drift.keys.map((k) => (k.y - drift.size / 2) * size) }) },
        { rotate: along.interpolate({ inputRange: at, outputRange: drift.keys.map((k) => `${k.turn}deg`) }) },
      ],
    };
  }, [clock, drift, once, size]);
  const side = drift.size * size;
  const beating = drift.flap ? { transform: [{ scaleX: flap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }] } : undefined;
  return (
    <Animated.View style={[styles.drift, { width: side, height: side }, moved]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, beating]}>
        <SvgXml xml={xml} width={side} height={side} />
      </Animated.View>
    </Animated.View>
  );
}

/** Small drifting things on their paths (LetterDrift); not drawn at all under Reduce Motion. */
function Drifts({
  drifts,
  size,
  once = false,
  style,
}: {
  drifts: readonly LetterDrift[];
  size: number;
  once?: boolean;
  style?: Animated.WithAnimatedValue<ViewStyle>;
}): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const id = useRef(nextId()).current;
  const flap = useSwing(alive && drifts.some((d) => d.flap), 260);
  if (reduce) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {drifts.map((d, i) => (
        <Drift key={i} drift={d} size={size} once={once} alive={alive} flap={flap} id={`${id}d${i}`} />
      ))}
    </Animated.View>
  );
}

/**
 * One bird circling over the landscape with its letter (LetterSkyBird), wings beating on `beat`, turning abruptly
 * where its route reverses. Under Reduce Motion it hangs still at its route's start.
 */
function SkyBird({ bird, route, size, alive, beat }: { bird: number; route: LetterSkyBird; size: number; alive: boolean; beat: Animated.Value }): React.JSX.Element {
  const clock = useRound(alive, route.ms);
  const id = useRef(nextId()).current;
  const wingsUp = useMemo(() => letterBirdSvg({ bird, pose: 'wings-up', letter: true, shadow: false, size: 120, idPrefix: `${id}u` }), [bird, id]);
  const wingsDown = useMemo(() => letterBirdSvg({ bird, pose: 'wings-down', letter: true, shadow: false, size: 120, idPrefix: `${id}d` }), [bird, id]);
  const moved = useMemo(() => {
    const at = route.keys.map((k) => k.at);
    // A turn is abrupt: the facing changes between two nearly equal moments.
    const turnAt: number[] = [];
    const facing: number[] = [];
    route.keys.forEach((k, j) => {
      const before = j === 0 ? k.facing : route.keys[j - 1]!.facing;
      if (before !== k.facing) {
        turnAt.push(Math.max(0, k.at - 0.001));
        facing.push(before);
      }
      turnAt.push(k.at);
      facing.push(k.facing);
    });
    return {
      path: {
        transform: [
          { translateX: clock.interpolate({ inputRange: at, outputRange: route.keys.map((k) => (k.x - route.size / 2) * size) }) },
          { translateY: clock.interpolate({ inputRange: at, outputRange: route.keys.map((k) => (k.y - route.size / 2) * size) }) },
        ],
      },
      turn: { transform: [{ scaleX: clock.interpolate({ inputRange: turnAt, outputRange: facing }) }] },
    };
  }, [clock, route, size]);
  const side = route.size * size;
  const up = until(beat, 0.5);
  return (
    <Animated.View style={[styles.drift, { width: side, height: side }, moved.path]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, moved.turn]}>
        <Art xml={wingsUp} left={0} top={0} side={side} style={{ opacity: up }} />
        <Art xml={wingsDown} left={0} top={0} side={side} style={{ opacity: Animated.subtract(1, up) }} />
      </Animated.View>
    </Animated.View>
  );
}

/** How far the sky birds move with the landscape's drift: between the clouds and the far mountains. */
const SKY_DEPTH = 0.016;

/** The birds outside (LETTER_SKY), one per route, the next to come first; their wings share one clock. */
function SkyBirds({ birds, size, style }: { birds: readonly number[]; size: number; style?: Animated.WithAnimatedValue<ViewStyle> }): React.JSX.Element {
  const alive = useMotionAlive();
  const beat = useRound(alive, LETTER_FLIGHT.beatMs);
  const shown = birds.slice(0, LETTER_SKY.length);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {shown.map((bird, i) => (
        <SkyBird key={`${i}-${bird}`} bird={bird} route={LETTER_SKY[i]!} size={size} alive={alive} beat={beat} />
      ))}
    </Animated.View>
  );
}

/** Your bird's part in the scene, as a life on the sill. */
function ownLife(own: WindowScene['own']): Life {
  if (own.kind === 'away') return { kind: 'none' };
  if (own.kind === 'leaving') return { kind: 'leaving', bird: own.bird, play: LETTER_PLAY.before };
  return own;
}
/** A visitor's part in the scene: answered, your letter drops before it and it takes it; sent on, it takes its own back. */
function visitorLife(visitor: WindowScene['visitor']): Life {
  if (visitor.kind === 'none') return visitor;
  if (visitor.kind === 'leaving') return { kind: 'leaving', bird: visitor.bird, play: visitor.how === 'answered' ? LETTER_PLAY.take : LETTER_PLAY.fetch };
  return visitor;
}

/** How long the birdsong notes stay once risen. */
const SONG_MS = 2800;

export function LetterWindow({
  scene,
  size,
  onOwnGone,
  onVisitorGone,
  onVisitorLanded,
  onOwnLanded,
  onTouchdown,
}: {
  scene: WindowScene;
  size: number;
  /** Your bird has flown off through the window. */
  onOwnGone?: () => void;
  /** The visiting bird has flown off through the window. */
  onVisitorGone?: () => void;
  /** The bird in the visitor's spot has landed and laid its letter down. */
  onVisitorLanded?: () => void;
  /** Your bird has flown home and laid its letter on the sill. */
  onOwnLanded?: () => void;
  /** An arriving bird has touched down, in your bird's spot or the visitor's; its letter is there from now on. */
  onTouchdown?: (spot: 'own' | 'sill') => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const id = useRef(nextId()).current;
  const sky = treeSkyAt(new Date().getHours());
  const own = useMemo(() => ownLife(scene.own), [scene.own]);
  const visitor = useMemo(() => visitorLife(scene.visitor), [scene.visitor]);
  // With a visitor, your bird stands aside, facing it.
  const hop = useHop(visitor.kind === 'none' ? 'alone' : 'own', size);
  const ownSpot = hop.spot;
  const ownFlight = useFlight(own, () => onOwnGone?.());
  const visitorFlight = useFlight(visitor, () => onVisitorGone?.());
  const landed = useRef(onVisitorLanded);
  landed.current = onVisitorLanded;
  useEffect(() => {
    if (visitor.kind === 'arriving' && visitorFlight.phase === 'settled') landed.current?.();
  }, [visitor.kind, visitorFlight.phase]);
  // Reported once it is down and has laid its letter (at once under Reduce Motion, where the flight shows its end).
  const ownLanded = useRef(onOwnLanded);
  ownLanded.current = onOwnLanded;
  useEffect(() => {
    if (own.kind === 'arriving' && ownFlight.phase === 'settled') ownLanded.current?.();
  }, [own.kind, ownFlight.phase]);
  // The moment an arriving bird touches down, before it lays its letter: a screen left during that play has still
  // seen it land.
  const touchdown = useRef(onTouchdown);
  touchdown.current = onTouchdown;
  useEffect(() => {
    if (own.kind === 'arriving' && ownFlight.phase === 'after') touchdown.current?.('own');
  }, [own.kind, ownFlight.phase]);
  useEffect(() => {
    if (visitor.kind === 'arriving' && visitorFlight.phase === 'after') touchdown.current?.('sill');
  }, [visitor.kind, visitorFlight.phase]);
  const drifts = useMemo(() => letterDrifts(treeSeasonAt(new Date()), sky), [sky]);
  // The notes rise once each time two people become pen pals, then fade.
  const [song, setSong] = useState<number | null>(null);
  const seenSong = useRef(scene.song);
  useEffect(() => {
    if (scene.song === seenSong.current) return;
    seenSong.current = scene.song;
    setSong(scene.song ?? null);
    const done = setTimeout(() => setSong(null), SONG_MS);
    return () => clearTimeout(done);
  }, [scene.song]);

  // The landscape's drift, the clouds, the shutters, the plant and the light.
  const drift = useSwing(alive, 16000, 0.5);
  const clouds = useSwing(alive, 46000, 0.5);
  const stir = useSwing(alive, 7000);
  const sway = useSwing(alive, LETTER_PLANT_SWAY.ms, 0.5);
  const glow = useSwing(alive, 9000, 0.4);

  const deep = (depth: number) => ({ transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-0.5 * depth * size, 0.5 * depth * size] }) }] });
  const drifting = {
    transform: [...deep(LETTER_WINDOW_DEPTH.clouds).transform, { translateX: clouds.interpolate({ inputRange: [0, 1], outputRange: [-0.07 * size, 0.07 * size] }) }],
  };
  const shutter = (left: boolean) => ({
    transformOrigin: left ? '20% 50%' : '80% 50%',
    transform: [{ scaleX: stir.interpolate({ inputRange: [0, 1], outputRange: left ? [1, 0.92] : [0.92, 1] }) }],
  });
  // The plant sways about the pot's rim, by the shared sway.
  const plant = {
    transformOrigin: `${(LETTER_PLANT_SWAY.x / 120) * 100}% ${(LETTER_PLANT_SWAY.y / 120) * 100}%`,
    transform: [{ rotate: sway.interpolate({ inputRange: [0, 1], outputRange: [`${-LETTER_PLANT_SWAY.turn}deg`, `${LETTER_PLANT_SWAY.turn}deg`] }) }],
  };
  const light = { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) };

  // Birds leave to the right and arrive facing their way in; yours keeps facing its letter until it is read (`here`),
  // then turns round.
  const ownBack = own.kind === 'arriving' || own.kind === 'here';
  const visitorBack = visitor.kind === 'arriving';
  return (
    <View {...HIDDEN} style={[styles.window, { width: size, height: size }]} testID="letter-window">
      <Layer part="sky" sky={sky} size={size} id={id} style={deep(LETTER_WINDOW_DEPTH.sky)} />
      <Layer part="clouds" sky={sky} size={size} id={id} style={drifting} />
      <SkyBirds birds={scene.sky} size={size} style={deep(SKY_DEPTH)} />
      <Layer part="far" sky={sky} size={size} id={id} style={deep(LETTER_WINDOW_DEPTH.far)} />
      <Layer part="near" sky={sky} size={size} id={id} style={deep(LETTER_WINDOW_DEPTH.near)} />
      <Drifts drifts={drifts} size={size} style={deep(LETTER_WINDOW_DEPTH.near * 0.7)} />
      {ownFlight.phase === 'flight' ? <FlightCopy life={own} flight={ownFlight} spot={ownSpot} facingLeft={ownBack} size={size} inside={false} /> : null}
      {visitorFlight.phase === 'flight' ? <FlightCopy life={visitor} flight={visitorFlight} spot="visitor" facingLeft={visitorBack} size={size} inside={false} /> : null}
      <Layer part="room" sky={sky} size={size} id={id} />
      <Layer part="left" sky={sky} size={size} id={id} style={shutter(true)} />
      <Layer part="right" sky={sky} size={size} id={id} style={shutter(false)} />
      <Layer part="plant" sky={sky} size={size} id={id} style={plant} />
      {/* The light lies on the sill, so a pigeon standing there is always over it. */}
      <Layer part="light" sky={sky} size={size} id={id} style={light} />
      <Animated.View style={[StyleSheet.absoluteFill, hop.style]} pointerEvents="none">
        <FlightShade flight={ownFlight} spot={ownSpot} facingLeft={ownBack} size={size} />
        <OnSill life={own} flight={ownFlight} spot={ownSpot} facingLeft={ownBack} asleep={sky === 'night'} beside={visitor.kind !== 'none'} size={size} />
      </Animated.View>
      <FlightShade flight={visitorFlight} spot="visitor" facingLeft={visitorBack} size={size} />
      <OnSill life={visitor} flight={visitorFlight} spot="visitor" facingLeft asleep={false} beside size={size} />
      {ownFlight.phase === 'flight' ? <FlightCopy life={own} flight={ownFlight} spot={ownSpot} facingLeft={ownBack} size={size} inside /> : null}
      {visitorFlight.phase === 'flight' ? <FlightCopy life={visitor} flight={visitorFlight} spot="visitor" facingLeft={visitorBack} size={size} inside /> : null}
      {song !== null && !reduce ? <Drifts key={song} drifts={LETTER_NOTES} size={size} once /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { alignSelf: 'center', overflow: 'hidden', borderRadius: radii.xl },
  drift: { position: 'absolute', left: 0, top: 0 },
});
