import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import {
  COLD_FIRE,
  FIRE_CINDER_FADE,
  FIRE_CYCLE_MS,
  FIRE_DISC_FADE,
  FIRE_DRIFT_FADE,
  FIRE_GLOW_FADE,
  FIRE_GROW,
  FIRE_POSE_FIELDS,
  fireColours,
  fireDrawing,
  fireGrowth,
  fireOutlineBox,
  fireSamples,
  type FireBaseGroup,
  type FireBasePiece,
  type FireBox,
  type FireColours,
  type FireDrawing,
  type FireEmber,
  type FireGlow,
  type FireGrowth,
  type FireLevel,
  type FireMotion,
  type FirePose,
  type FireStops,
  type FireTint,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from './ThemeProvider';

/** Without a level, a fire alight is today's campfire. */
const CAMPFIRE: FireLevel = { stage: 'campfire', growth: 0 };

/**
 * The streak's fire (shared `art/fire.ts`), the same drawing the website
 * shows, at its stage (`level`): cold logs with a thread of smoke, a spark
 * caught, on up to the Newroz fire with the sun behind it. Flame tongues
 * each flicker about their own root, the heart pulses, the glow breathes,
 * sparks and broken-off tips rise and fade.
 *
 * Each moving part is its own layer, as big as the part, moved by
 * transforms and opacity read off one clock per fire that loops on the
 * native driver: nothing is drawn again while it burns and React is not
 * asked for a frame. The clock stops when the fire is gone, while the app is
 * in the background, and when it stands still: under Reduce Motion, when
 * `still`, and for the grey flame beside a number with no streak yet. Glow
 * is a soft gradient, never a blur.
 *
 * Given `from`, a smaller fire, it is drawn as that first and grows into
 * `level` as it appears (shared `fireGrowth`): one more native-driven value
 * runs once, `FIRE_GROW.delayMs` after it mounts, for `FIRE_GROW.ms`, and
 * every growing part reads it. Under Reduce Motion it is simply `level`.
 *
 * `size` is its height in points; at `FIRE_SMALL` and under it is the light
 * version for beside a number: the flame alone, a gentler flicker. `accent`
 * is an event theme's colour for the flame. Decorative: the words beside it
 * say the streak.
 */
export function Fire({
  size,
  level,
  from,
  lit = true,
  still = false,
  accent,
}: {
  size: number;
  /** how big it burns (shared `fireLevel`, `runFireLevel`); cold is the fire not burning */
  level?: FireLevel;
  /** grows from this level into `level` as it appears: the day the fire grew */
  from?: FireLevel | null;
  /** without a `level`: burning (today's campfire) or not (cold) */
  lit?: boolean;
  /** drawn standing still, as under reduced motion */
  still?: boolean;
  accent?: string | null;
}): React.JSX.Element {
  const shown = level ?? (lit ? CAMPFIRE : COLD_FIRE);
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const awake = useAwake();
  const id = `fire${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const drawing = useMemo(() => fireDrawing(shown, size), [shown.stage, shown.growth, size]);
  const growth = useMemo(
    () => (reduce || still || !from ? null : fireGrowth(from, shown, size)),
    [reduce, still, from?.stage, from?.growth, shown.stage, shown.growth, size],
  );
  // the growth seen through once, the old fire is let go
  const [grownFrom, setGrownFrom] = useState<FireGrowth | null>(null);
  const growing = growth && grownFrom !== growth ? growth : null;
  const moving = !reduce && !still && drawing.moving;
  const clock = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!moving || !awake) return;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: FIRE_CYCLE_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [moving, awake, clock]);

  useEffect(() => {
    if (!growth) return;
    grow.setValue(0);
    const run = Animated.timing(grow, { toValue: 1, duration: FIRE_GROW.ms, delay: FIRE_GROW.delayMs, easing: Easing.linear, useNativeDriver: true });
    run.start(({ finished }) => finished && setGrownFrom(growth));
    return () => run.stop();
  }, [growth, grow]);

  const { view, root } = drawing;
  /** points per unit of the drawing */
  const unit = size / view.h;
  const at: Place = { view, unit };
  const now = { id: `${id}a`, colours: fireColours({ stage: drawing.stage, scheme, accent }), clock: moving ? clock : null };
  const before = growing ? { id: `${id}b`, colours: fireColours({ stage: growing.from.stage, scheme, accent }), clock: moving ? clock : null } : null;

  return (
    <View
      style={{ width: view.w * unit, height: size }}
      pointerEvents="none"
      aria-hidden
      testID={`fire-${drawing.stage === 'cold' ? 'unlit' : 'lit'}${drawing.small ? '-small' : ''}`}
    >
      <Hearth paint={now} pieces={drawing.back} arrive={growth?.arrive} driver={grow} at={at} />
      {growing && before ? (
        <Grow motion={growing.out} origin={root} driver={grow} at={at}>
          <Burning paint={before} drawing={growing.from} driver={grow} at={at} />
        </Grow>
      ) : null}
      {/* the flash behind the new flame, so the flame itself is never washed out */}
      {growing?.flash ? (
        <Grow motion={growing.flash.motion} origin={[growing.flash.cx, growing.flash.cy]} driver={grow} at={at}>
          <Glow id={`${id}f`} glow={growing.flash} tint={now.colours.glow} clock={null} at={at} />
        </Grow>
      ) : null}
      <Grow motion={growth?.in} origin={root} driver={grow} at={at}>
        <Burning paint={now} drawing={drawing} halo={growth?.halo} driver={grow} at={at} />
      </Grow>
      {growing?.burst.map((e, i) => {
        const colour = sparkColour(e, now.colours);
        return colour ? <Ember key={`b${i}`} ember={e} colour={colour} driver={grow} at={at} /> : null;
      })}
      <Hearth paint={now} pieces={drawing.front} arrive={growth?.arrive} driver={grow} at={at} />
      {drawing.cinder ? <Cinder paint={now} drawing={drawing} at={at} /> : null}
      {growing?.fade && before ? (
        <Grow motion={growing.fade} origin={root} driver={grow} at={at}>
          <Hearth paint={before} pieces={growing.from.front} driver={grow} at={at} />
          {growing.from.cinder ? <Cinder paint={before} drawing={growing.from} at={at} /> : null}
        </Grow>
      ) : null}
    </View>
  );
}

/** Where the fire is laid out: its drawing's box, and points per unit of it. */
interface Place {
  view: FireBox;
  unit: number;
}

/** One drawing's colours, the prefix its gradients are named by, and its clock (null when it stands still). */
interface Paint {
  id: string;
  colours: FireColours;
  clock: Animated.Value | null;
}

/** A spark's colour: the Newroz fire's gold for a gold one, the fire's own for the rest; null when nothing rises. */
const sparkColour = (e: FireEmber, colours: FireColours): string | null => (e.gold ? colours.gold : null) ?? colours.ember;

/** Awake while the app is in front: a fire in the background has nobody to burn for. */
function useAwake(): boolean {
  const [awake, setAwake] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAwake(state !== 'background'));
    return () => sub.remove();
  }, []);
  return awake;
}

/**
 * What burns: the glow, the sun in front of it (opening as it grows, given
 * `halo`, off the growth's `driver`), heat or smoke rising, the broken-off
 * tips and sparks from behind the flame, and the tongues.
 */
function Burning({
  paint: p,
  drawing,
  halo,
  driver,
  at,
}: {
  paint: Paint;
  drawing: FireDrawing;
  halo?: FireMotion | null;
  driver: Animated.Value;
  at: Place;
}): React.JSX.Element {
  const { colours, clock } = p;
  return (
    <>
      {drawing.glow ? <Glow id={`${p.id}g`} glow={drawing.glow} tint={colours.glow} clock={clock} at={at} /> : null}
      {drawing.halo ? (
        <Grow motion={halo} origin={[drawing.halo.cx, drawing.halo.cy]} driver={driver} at={at}>
          <Halo paint={p} drawing={drawing} at={at} />
        </Grow>
      ) : null}
      {drawing.drifts.map((d, i) => {
        const tint = colours[d.kind];
        if (!tint || (!clock && !d.rest)) return null;
        return (
          <Layer key={`d${i}`} box={fireOutlineBox(d.d)} motion={d.motion} rest={d.rest} origin={d.origin} clock={clock} at={at}>
            <Defs>
              <Fade id={`${p.id}d${i}`} tint={tint} fade={FIRE_DRIFT_FADE[d.kind]} linear />
            </Defs>
            <Path d={d.d} fill={`url(#${p.id}d${i})`} />
          </Layer>
        );
      })}
      {/* the broken-off tips and the sparks rise from behind the flame, so they are only seen once clear of it */}
      {clock
        ? drawing.wisps.map((w, i) => (
            <Layer key={`w${i}`} box={fireOutlineBox(w.d)} motion={w.motion} origin={w.origin} clock={clock} at={at}>
              <Defs>
                <Gradient id={`${p.id}w${i}`} stops={colours.tongues.flame} />
              </Defs>
              <Path d={w.d} fill={`url(#${p.id}w${i})`} />
            </Layer>
          ))
        : null}
      {clock
        ? drawing.embers.map((e, i) => {
            const colour = sparkColour(e, colours);
            return colour ? <Ember key={`e${i}`} ember={e} colour={colour} driver={clock} at={at} /> : null;
          })
        : null}
      {drawing.tongues.map((t) => (
        <Layer key={t.id} box={fireOutlineBox(t.d)} motion={t.motion} origin={t.origin} clock={clock} at={at}>
          <Defs>
            <Gradient id={`${p.id}${t.id}`} stops={colours.tongues[t.id]} />
          </Defs>
          <Path d={t.d} fill={`url(#${p.id}${t.id})`} />
        </Layer>
      ))}
    </>
  );
}

/** The sun behind the Newroz fire: its disc, and its rays turning slowly. */
function Halo({ paint: p, drawing, at }: { paint: Paint; drawing: FireDrawing; at: Place }): React.JSX.Element | null {
  const halo = drawing.halo;
  const tint = p.colours.halo;
  if (!halo || !tint) return null;
  const box = { x: halo.cx - halo.reach, y: halo.cy - halo.reach, w: halo.reach * 2, h: halo.reach * 2 };
  return (
    <Layer box={box} motion={halo.motion ?? undefined} origin={[halo.cx, halo.cy]} clock={p.clock} at={at}>
      <Defs>
        <Fade id={`${p.id}disc`} tint={tint.disc} fade={FIRE_DISC_FADE} strength={halo.strength} />
        <Fade
          id={`${p.id}rays`}
          tint={tint.rays}
          fade={halo.rayFade}
          strength={halo.strength}
          space={{ cx: halo.cx, cy: halo.cy, r: halo.reach }}
        />
      </Defs>
      <Circle cx={halo.cx} cy={halo.cy} r={halo.r} fill={`url(#${p.id}disc)`} />
      {halo.rays ? <Path d={halo.rays} fill={`url(#${p.id}rays)`} /> : null}
    </Layer>
  );
}

/** The cold hearth's last ember, brightening and dimming. */
function Cinder({ paint: p, drawing, at }: { paint: Paint; drawing: FireDrawing; at: Place }): React.JSX.Element | null {
  const c = drawing.cinder;
  const tint = p.colours.cinder;
  if (!c || !tint) return null;
  return (
    <Layer box={{ x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 }} motion={c.motion} origin={[c.cx, c.cy]} clock={p.clock} at={at}>
      <Defs>
        <RadialGradient id={`${p.id}cinder`} cx="50%" cy="50%" r="50%">
          {FIRE_CINDER_FADE.map(([offset, which, share]) => (
            <Stop key={offset} offset={offset} stopColor={tint[which]} stopOpacity={share} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={c.cx} cy={c.cy} r={c.r} fill={`url(#${p.id}cinder)`} />
    </Layer>
  );
}

/** Pieces of the hearth, still, one layer to a group; a group the fire did not have before it grew arrives as it grows. */
function Hearth({
  paint: p,
  pieces,
  arrive,
  driver,
  at,
}: {
  paint: Paint;
  pieces: readonly FireBasePiece[];
  arrive?: Readonly<Partial<Record<FireBaseGroup, FireMotion>>>;
  driver: Animated.Value;
  at: Place;
}): React.JSX.Element {
  // consecutive pieces of one group, so an arriving group moves as one
  const runs: { group: FireBaseGroup; pieces: FireBasePiece[] }[] = [];
  for (const piece of pieces) {
    const last = runs.at(-1);
    if (last && last.group === piece.group) last.pieces.push(piece);
    else runs.push({ group: piece.group, pieces: [piece] });
  }
  return (
    <>
      {runs.map((run, i) => {
        const parts = [...new Set(run.pieces.map((piece) => piece.part))];
        const boxes = run.pieces.map((piece) => fireOutlineBox(piece.d));
        const x = Math.min(...boxes.map((b) => b.x));
        const y = Math.min(...boxes.map((b) => b.y));
        const box = { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
        return (
          <Grow key={i} motion={arrive?.[run.group]} origin={[100, 236]} driver={driver} at={at}>
            <Layer box={box} clock={null} at={at}>
              <Defs>
                {parts.map((part) => (
                  <Gradient key={part} id={`${p.id}${i}${part}`} stops={p.colours.base[part]} />
                ))}
              </Defs>
              {run.pieces.map((piece, j) => (
                <Path key={j} d={piece.d} fill={`url(#${p.id}${i}${piece.part})`} />
              ))}
            </Layer>
          </Grow>
        );
      })}
    </>
  );
}

/** Its children growing once by `motion` about `origin`, off the growth's own value; without a motion, just its children. */
function Grow({
  motion,
  origin,
  driver,
  at,
  children,
}: {
  motion?: FireMotion | null;
  origin: readonly [number, number];
  driver: Animated.Value;
  at: Place;
  children: ReactNode;
}): React.JSX.Element {
  const { view, unit } = at;
  const [ox, oy] = origin;
  const style = useMemo(
    () => (motion ? { transformOrigin: `${((ox - view.x) / view.w) * 100}% ${((oy - view.y) / view.h) * 100}%`, ...motionStyle(motion, driver, unit) } : null),
    [motion, ox, oy, view, unit, driver],
  );
  if (!style) return <Fragment>{children}</Fragment>;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

/**
 * One part of the fire, drawn on its own in a box just big enough for it,
 * moved about `origin` by `motion` off the clock; standing still, it is
 * drawn at `rest` (where it has one) or as drawn.
 */
function Layer({
  box,
  clock,
  motion,
  rest,
  origin,
  at,
  children,
}: {
  box: FireBox;
  clock: Animated.Value | null;
  motion?: FireMotion;
  rest?: FirePose | null;
  origin?: readonly [number, number];
  at: Place;
  children: ReactNode;
}): React.JSX.Element {
  const { view, unit } = at;
  // a hair of room round the part, so its soft edge is never cut
  const b = { x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 };
  const style = useMemo(() => {
    if (!origin) return null;
    const pivot = { transformOrigin: `${((origin[0] - b.x) / b.w) * 100}% ${((origin[1] - b.y) / b.h) * 100}%` };
    if (clock && motion) return { ...pivot, ...motionStyle(motion, clock, unit) };
    return rest ? { ...pivot, ...poseStyle(rest, unit) } : null;
  }, [clock, motion, rest, origin, b.x, b.y, b.w, b.h, unit]);
  return (
    <Animated.View style={[{ position: 'absolute', left: (b.x - view.x) * unit, top: (b.y - view.y) * unit, width: b.w * unit, height: b.h * unit }, style]}>
      <Svg width={b.w * unit} height={b.h * unit} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** A spark: a round dot of colour, no drawing needed, rising off `driver` (the clock, or the growth for a burst). */
function Ember({ ember, colour, driver, at }: { ember: FireEmber; colour: string; driver: Animated.Value; at: Place }): React.JSX.Element {
  const { cx, cy, r } = ember;
  const { view, unit } = at;
  const style = useMemo(() => motionStyle(ember.motion, driver, unit), [ember, driver, unit]);
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: (cx - r - view.x) * unit, top: (cy - r - view.y) * unit, width: r * 2 * unit, height: r * 2 * unit, borderRadius: r * unit, backgroundColor: colour },
        style,
      ]}
    />
  );
}

/** A glow, in a box of its own as big as it is; it breathes about its middle. */
function Glow({ id, glow, tint, clock, at }: { id: string; glow: FireGlow; tint: FireTint | null; clock: Animated.Value | null; at: Place }): React.JSX.Element | null {
  const { cx, cy, rx, ry } = glow;
  const { view, unit } = at;
  const style = useMemo(() => (clock ? motionStyle(glow.motion, clock, unit) : null), [glow, clock, unit]);
  if (!tint) return null;
  return (
    <Animated.View
      style={[{ position: 'absolute', left: (cx - rx - view.x) * unit, top: (cy - ry - view.y) * unit, width: rx * 2 * unit, height: ry * 2 * unit }, style]}
    >
      <Svg width={rx * 2 * unit} height={ry * 2 * unit} viewBox={`${cx - rx} ${cy - ry} ${rx * 2} ${ry * 2}`}>
        <Defs>
          <Fade id={id} tint={tint} fade={FIRE_GLOW_FADE} strength={glow.strength} />
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** A colour at its strength, fading by `fade` (an offset, and the share of its strength there): out from the middle, or (`linear`) from the top down. */
function Fade({
  id,
  tint,
  fade,
  strength = 1,
  linear = false,
  space,
}: {
  id: string;
  tint: FireTint;
  fade: readonly (readonly [number, number])[];
  strength?: number;
  linear?: boolean;
  /** a radial fade laid in the drawing's own units, rather than across the shape it fills */
  space?: { cx: number; cy: number; r: number };
}): React.JSX.Element {
  const stops = fade.map(([offset, share]) => <Stop key={offset} offset={offset} stopColor={tint.colour} stopOpacity={Math.min(1, tint.opacity * strength) * share} />);
  if (linear)
    return (
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {stops}
      </LinearGradient>
    );
  return space ? (
    <RadialGradient id={id} gradientUnits="userSpaceOnUse" cx={space.cx} cy={space.cy} r={space.r}>
      {stops}
    </RadialGradient>
  ) : (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      {stops}
    </RadialGradient>
  );
}

/** A tongue's (or a log's) colour from its tip to its root. */
function Gradient({ id, stops }: { id: string; stops: FireStops }): React.JSX.Element {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map((colour, i) => (
        <Stop key={i} offset={i / (stops.length - 1)} stopColor={colour} />
      ))}
    </LinearGradient>
  );
}

/** A pose held still, as transforms in points and an opacity. */
function poseStyle(p: FirePose, unit: number) {
  return {
    transform: [{ translateX: (p.x ?? 0) * unit }, { translateY: (p.y ?? 0) * unit }, { rotate: `${p.r ?? 0}deg` }, { scaleX: p.sx ?? 1 }, { scaleY: p.sy ?? 1 }, { skewX: `${p.skew ?? 0}deg` }],
    opacity: p.o ?? 1,
  };
}

/**
 * A part's motion as transforms and opacity read off `driver` (the fire's
 * clock, or a growth's own value): each pose field that changes becomes an
 * interpolation through the part's samples (shared `fireSamples`); a field
 * that never changes is left out. The order is the website's: moved, turned,
 * stretched, leaning.
 */
function motionStyle(motion: FireMotion, driver: Animated.Value, unit: number) {
  const { input, poses } = fireSamples(motion);
  const varies = (f: (typeof FIRE_POSE_FIELDS)[number]): boolean => poses.some((p) => p[f] !== poses[0]![f]);
  const track = (f: (typeof FIRE_POSE_FIELDS)[number], scale = 1) => driver.interpolate({ inputRange: input, outputRange: poses.map((p) => p[f] * scale) });
  const degrees = (f: 'r' | 'skew') => driver.interpolate({ inputRange: input, outputRange: poses.map((p) => `${p[f]}deg`) });
  const transform = [
    ...(varies('x') ? [{ translateX: track('x', unit) }] : []),
    ...(varies('y') ? [{ translateY: track('y', unit) }] : []),
    ...(varies('r') ? [{ rotate: degrees('r') }] : []),
    ...(varies('sx') ? [{ scaleX: track('sx') }] : []),
    ...(varies('sy') ? [{ scaleY: track('sy') }] : []),
    ...(varies('skew') ? [{ skewX: degrees('skew') }] : []),
  ];
  return { transform, ...(varies('o') ? { opacity: track('o') } : null) };
}
