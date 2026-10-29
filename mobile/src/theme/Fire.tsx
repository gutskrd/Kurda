import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import {
  FIRE_BASE,
  FIRE_CYCLE_MS,
  FIRE_GLOW,
  FIRE_SMALL_CALM,
  calmMotion,
  fireColours,
  fireParts,
  fireSamples,
  type FireMotion,
  type FirePose,
  type FireStops,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from './ThemeProvider';

type Box = { x: number; y: number; w: number; h: number };

/**
 * The streak's fire (shared `art/fire.ts`), the same drawing the website
 * shows: flame tongues each flickering about its own root, a heart that
 * pulses, a glow that breathes, sparks and broken-off tips rising and
 * fading, on a pair of logs.
 *
 * Each moving part is its own layer, moved by transforms and opacity read
 * off one clock per fire that loops on the native driver: nothing is drawn
 * again while it burns and React is not asked for a frame. The clock stops
 * when the fire is gone, while the app is in the background, unlit, and
 * under Reduce Motion, where the fire stands still. Glow is a soft gradient,
 * never a blur.
 *
 * `size` is its height in points; at `FIRE_SMALL` and under it is the light
 * version for beside a number: three tongues, a gentler flicker, nothing
 * around it. `lit` false is a streak not burning: grey and still. `accent`
 * is an event theme's colour for the flame. Decorative: the words beside it
 * say the streak.
 */
export function Fire({ size, lit = true, accent }: { size: number; lit?: boolean; accent?: string | null }): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const awake = useAwake();
  const id = `fire${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const parts = useMemo(() => fireParts(size), [size]);
  // the light version flickers gentler; made once, so a render does not rebuild every layer's motion
  const tongues = useMemo(() => parts.tongues.map((t) => ({ ...t, motion: parts.small ? calmMotion(t.motion, FIRE_SMALL_CALM) : t.motion })), [parts]);
  const colours = fireColours({ lit, scheme, accent });
  const moving = lit && !reduce;
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!moving || !awake) return;
    const loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: FIRE_CYCLE_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [moving, awake, clock]);

  const { view } = parts;
  /** points per unit of the drawing */
  const unit = size / view.h;
  const width = view.w * unit;
  const drawing = { view, unit, clock: moving ? clock : null };
  const glow = parts.glow ? colours.glow : null;
  const ember = moving ? colours.ember : null;

  return (
    <View
      style={{ width, height: size }}
      pointerEvents="none"
      aria-hidden
      testID={`fire-${lit ? 'lit' : 'unlit'}${parts.small ? '-small' : ''}`}
    >
      {glow ? <Glow id={`${id}g`} colour={glow.colour} opacity={glow.opacity} {...drawing} /> : null}
      {moving
        ? parts.wisps.map((w, i) => (
            <Layer key={`w${i}`} motion={w.motion} origin={w.origin} {...drawing}>
              <Defs>
                <Gradient id={`${id}w${i}`} stops={colours.tongues.flame} />
              </Defs>
              <Path d={w.d} fill={`url(#${id}w${i})`} />
            </Layer>
          ))
        : null}
      {tongues.map((t) => (
        <Layer key={t.id} motion={t.motion} origin={t.origin} {...drawing}>
          <Defs>
            <Gradient id={`${id}${t.id}`} stops={colours.tongues[t.id]} />
          </Defs>
          <Path d={t.d} fill={`url(#${id}${t.id})`} />
        </Layer>
      ))}
      {parts.base ? (
        <Layer {...drawing} clock={null}>
          <Defs>
            {[...new Set(FIRE_BASE.map((p) => p.part))].map((part) => (
              <Gradient key={part} id={`${id}${part}`} stops={colours.base[part]} />
            ))}
          </Defs>
          {FIRE_BASE.map((p, i) => (
            <Path key={i} d={p.d} fill={`url(#${id}${p.part})`} />
          ))}
        </Layer>
      ) : null}
      {ember && drawing.clock
        ? parts.embers.map((e, i) => (
            <Animated.View
              key={`e${i}`}
              style={[
                {
                  position: 'absolute',
                  left: (e.cx - e.r - view.x) * unit,
                  top: (e.cy - e.r - view.y) * unit,
                  width: e.r * 2 * unit,
                  height: e.r * 2 * unit,
                  borderRadius: e.r * unit,
                  backgroundColor: ember,
                },
                motionStyle(e.motion, drawing.clock!, unit),
              ]}
            />
          ))
        : null}
    </View>
  );
}

/** Awake while the app is in front: a fire in the background has nobody to burn for. */
function useAwake(): boolean {
  const [awake, setAwake] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAwake(state !== 'background'));
    return () => sub.remove();
  }, []);
  return awake;
}

/** One part of the fire: the whole box, drawn on its own, moved about `origin` by `motion` off the clock. */
function Layer({
  view,
  unit,
  clock,
  motion,
  origin,
  children,
}: {
  view: Box;
  unit: number;
  clock: Animated.Value | null;
  motion?: FireMotion;
  origin?: readonly [number, number];
  children: ReactNode;
}): React.JSX.Element {
  const style = useMemo(() => {
    if (!clock || !motion || !origin) return null;
    return { transformOrigin: `${((origin[0] - view.x) / view.w) * 100}% ${((origin[1] - view.y) / view.h) * 100}%`, ...motionStyle(motion, clock, unit) };
  }, [clock, motion, origin, view, unit]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={view.w * unit} height={view.h * unit} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** The glow, in a box of its own as big as it is, so the fire's box does not clip it; it breathes about its middle. */
function Glow({ id, colour, opacity, view, unit, clock }: { id: string; colour: string; opacity: number; view: Box; unit: number; clock: Animated.Value | null }): React.JSX.Element {
  const { cx, cy, rx, ry } = FIRE_GLOW;
  const style = useMemo(() => (clock ? motionStyle(FIRE_GLOW.motion, clock, unit) : null), [clock, unit]);
  return (
    <Animated.View
      style={[{ position: 'absolute', left: (cx - rx - view.x) * unit, top: (cy - ry - view.y) * unit, width: rx * 2 * unit, height: ry * 2 * unit }, style]}
    >
      <Svg width={rx * 2 * unit} height={ry * 2 * unit} viewBox={`${cx - rx} ${cy - ry} ${rx * 2} ${ry * 2}`}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            {FIRE_GLOW.fade.map(([offset, share]) => (
              <Stop key={offset} offset={offset} stopColor={colour} stopOpacity={opacity * share} />
            ))}
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** A tongue's (or a log's) colour from its tip to its root. */
function Gradient({ id, stops }: { id: string; stops: FireStops }): React.JSX.Element {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={stops[0]} />
      <Stop offset="1" stopColor={stops[1]} />
    </LinearGradient>
  );
}

/**
 * A part's motion as transforms and opacity read off the fire's clock: each
 * pose field that changes becomes an interpolation of the clock through the
 * part's samples (shared `fireSamples`); a field that never changes is left out.
 */
function motionStyle(motion: FireMotion, clock: Animated.Value, unit: number) {
  const { input, poses } = fireSamples(motion);
  const varies = (f: keyof FirePose): boolean => poses.some((p) => p[f] !== poses[0]![f]);
  const track = (f: keyof FirePose, scale = 1) => clock.interpolate({ inputRange: input, outputRange: poses.map((p) => p[f] * scale) });
  const transform = [
    ...(varies('x') ? [{ translateX: track('x', unit) }] : []),
    ...(varies('y') ? [{ translateY: track('y', unit) }] : []),
    ...(varies('sx') ? [{ scaleX: track('sx') }] : []),
    ...(varies('sy') ? [{ scaleY: track('sy') }] : []),
    ...(varies('skew') ? [{ skewX: clock.interpolate({ inputRange: input, outputRange: poses.map((p) => `${p.skew}deg`) }) }] : []),
  ];
  return { transform, ...(varies('o') ? { opacity: track('o') } : null) };
}
