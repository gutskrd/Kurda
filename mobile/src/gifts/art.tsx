import { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, SvgXml } from 'react-native-svg';
import {
  GIFT_BOX_EXIT,
  GIFT_BOX_FOOT,
  GIFT_BOX_GLINT_PHASES,
  GIFT_BOX_IDLE,
  GIFT_BOX_LID_PARTS,
  GIFT_BOX_REST,
  GIFT_BOX_SEND,
  GIFT_BOX_SHUT,
  GIFT_BOX_UNWRAPS,
  giftBoxDrawing,
  giftBoxGlint,
  giftBoxGlintKeys,
  giftBoxLayerSvg,
  type GiftBoxDrawing,
  type GiftBoxKey,
  type GiftBoxLayer,
  type GiftBoxPart,
  type GiftBoxPlay,
  type GiftBoxTrack,
  type GiftTier,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * The gift's own art: the wrapped box (shared art/gift-box.ts), drawn and moved as on the website, and the night sky a
 * grand gift opens on. Each part of the box is its own small picture over the same frame, so parts move on the native
 * driver with nothing drawn again: `idle` hops now and then with a glint between (only while its screen is in front),
 * `unwrap` plays the tier's opening and stays open and lit, `exit` lets the open box give way to the gift, and `send`
 * drops it over a gift being sent, ties its bow and flies it off. Under Reduce Motion it stands still. Decorative: the
 * words beside it say what it is.
 */
export type GiftBoxMotion = 'still' | 'idle' | 'unwrap' | 'exit' | 'send';

/** The play behind each motion. */
function playOf(motion: GiftBoxMotion, tier: GiftTier): GiftBoxPlay | null {
  if (motion === 'idle') return GIFT_BOX_IDLE;
  if (motion === 'unwrap') return GIFT_BOX_UNWRAPS[tier];
  if (motion === 'exit') return GIFT_BOX_EXIT;
  if (motion === 'send') return GIFT_BOX_SEND;
  return null;
}

/** A seed's share of the idle round, so boxes side by side do not all hop at once (the website's own reckoning). */
function offsetOf(seed: string): number {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

type Motion = Animated.WithAnimatedObject<ViewStyle>;

/** A track as a style on one value running 0 to 1: only what changes along it is interpolated. */
function styleOf(keys: readonly GiftBoxKey[], value: Animated.Value, unit: number): Motion {
  const inputRange = keys.map((k) => k.at);
  const along = (pick: (k: GiftBoxKey) => number): Animated.AnimatedInterpolation<number> | number => {
    const out = keys.map(pick);
    return out.every((v) => v === out[0]) ? (out[0] ?? 0) : value.interpolate({ inputRange, outputRange: out, extrapolate: 'clamp' });
  };
  const rots = keys.map((k) => k.rot);
  const rotate = rots.every((v) => v === rots[0]) ? `${rots[0] ?? 0}deg` : value.interpolate({ inputRange, outputRange: rots.map((r) => `${r}deg`), extrapolate: 'clamp' });
  return {
    opacity: along((k) => k.o),
    transform: [{ translateX: along((k) => k.x * unit) }, { translateY: along((k) => k.y * unit) }, { rotate }, { scaleX: along((k) => k.sx) }, { scaleY: along((k) => k.sy) }],
  } as Motion;
}

/**
 * The wrapped gift at `size` points square, the box filling most of it. `seed` (the gift's id) sets when in its round
 * an idle box hops, so a chat of them does not hop together.
 */
export function GiftBox({
  size,
  tier,
  limited,
  motion = 'still',
  seed = '',
  style,
  testID,
}: {
  size: number;
  tier: GiftTier;
  /** a season's gift, with a Newroz flame for its tag; a legendary one is unless told otherwise */
  limited?: boolean;
  motion?: GiftBoxMotion;
  seed?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  const drawing = useMemo(() => giftBoxDrawing(tier, { size: size > 0 ? size : 64, limited }), [tier, size, limited]);
  const alive = useMotionAlive();
  const reduce = useReducedMotion();
  const wanted = playOf(motion, tier);
  // A waiting box moves only while its screen is in front; an opening one plays through, unless motion is reduced.
  const play = wanted && (wanted.loop ? alive : !reduce) ? wanted : null;
  // A clock of its own for each play, so the next one never shows the last one's end for a frame.
  const progress = useMemo(() => new Animated.Value(0), [play]);
  const unit = size / drawing.view.w;

  useEffect(() => {
    if (!play) return;
    const run = Animated.timing(progress, { toValue: 1, duration: play.ms, easing: Easing.linear, useNativeDriver: true, isInteraction: false });
    const anim = play.loop
      ? Animated.sequence([Animated.delay(Math.round(600 + offsetOf(seed || tier) * play.ms * 0.4)), Animated.loop(run)])
      : run;
    anim.start();
    return () => anim.stop();
  }, [play, progress, seed, tier]);

  const moving = useMemo(() => {
    const out: Partial<Record<GiftBoxTrack, Motion>> = {};
    if (play) for (const [name, keys] of Object.entries(play.tracks) as [GiftBoxTrack, readonly GiftBoxKey[]][]) out[name] = styleOf(keys, progress, unit);
    return out;
  }, [play, progress, unit]);
  const glints = useMemo(() => {
    if (!play || play.glints.length === 0) return [];
    const keys = giftBoxGlintKeys(play);
    return GIFT_BOX_GLINT_PHASES.map((phase, i) => ({ layer: giftBoxGlint(phase), opacity: progress.interpolate({ inputRange: keys[i]!.map((k) => k.at), outputRange: keys[i]!.map((k) => k.o), extrapolate: 'clamp' }) }));
  }, [play, progress]);

  const part = (id: GiftBoxPart): React.JSX.Element | null => {
    if (!play && !GIFT_BOX_SHUT.includes(id)) return null;
    const track = id as GiftBoxTrack;
    const rest = GIFT_BOX_REST[track] as (typeof GIFT_BOX_REST)[GiftBoxTrack] | undefined;
    return (
      <Part
        key={id}
        drawing={drawing}
        layer={drawing.layers[id]}
        unit={unit}
        style={moving[track] ?? (rest && rest.o !== 1 ? { opacity: rest.o } : undefined)}
        testID={testID ? `${testID}-${id}` : undefined}
      />
    );
  };
  const origin = ([x, y]: readonly [number, number]): ViewStyle => ({ transformOrigin: `${x * unit}px ${y * unit}px` });

  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {part('shadow')}
      {part('splash')}
      <Animated.View style={[StyleSheet.absoluteFill, origin(GIFT_BOX_FOOT), moving.hop]} testID={testID && play ? `${testID}-${motion}` : undefined}>
        {(['body', 'ribbon', 'lidShade', 'inside', 'light'] as const).map(part)}
        <Animated.View style={[StyleSheet.absoluteFill, origin(drawing.pivots.lid), moving.lid]}>{GIFT_BOX_LID_PARTS.map(part)}</Animated.View>
        {glints.map((g, i) => (
          <Part key={`glint${i}`} drawing={drawing} layer={g.layer} unit={unit} style={{ opacity: g.opacity }} />
        ))}
        {part('sparks')}
      </Animated.View>
    </View>
  );
}

/** One part of the box, in its own box over the frame, turned and scaled about its pivot. */
function Part({
  drawing,
  layer,
  unit,
  style,
  testID,
}: {
  drawing: GiftBoxDrawing;
  layer: GiftBoxLayer;
  unit: number;
  style?: Motion;
  testID?: string;
}): React.JSX.Element {
  const xml = useMemo(() => giftBoxLayerSvg(layer), [layer]);
  const { x, y, w, h } = layer.box;
  const [px, py] = drawing.pivots[layer.id];
  const place: ViewStyle = { position: 'absolute', left: x * unit, top: y * unit, width: w * unit, height: h * unit, transformOrigin: `${(px - x) * unit}px ${(py - y) * unit}px` };
  return (
    <Animated.View style={[place, style]} pointerEvents="none" testID={testID}>
      <SvgXml xml={xml} width={w * unit} height={h * unit} />
    </Animated.View>
  );
}

/** Where the stars of the night sky sit, seeded so the sky is the same each time. */
const STARS = Array.from({ length: 40 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(11) * 100, y: r(13) * 100, size: 0.25 + r(17) * 0.5 };
});

/**
 * The night a grand gift opens on: stars across the screen and a glow of the app's gold rising behind the gift. The
 * stars are the gold too, so the sky follows the palette.
 */
export function NightSky({ width, height, gold }: { width: number; height: number; gold: string }): React.JSX.Element {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id="sky-glow" cx="50" cy="55" r="45" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={gold} stopOpacity={0.45} />
          <Stop offset="1" stopColor={gold} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={55} r={45} fill="url(#sky-glow)" />
      {STARS.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.size} fill={gold} opacity={0.85} />
      ))}
    </Svg>
  );
}
