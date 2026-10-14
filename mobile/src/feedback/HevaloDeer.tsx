import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * Hevalo the deer, drawn by hand in SVG, holding up a wooden board.
 *
 * The app's deer only ever existed as a picture (the logo, the splash); this is
 * the same deer in the same colours — sampled from the logo (map3-rating §1):
 * fur, darker antlers, a cream muzzle, freckles, dark eyes — as something that
 * can move. It holds the rating board with its five stars, or a sign with the
 * letters it wants you to be able to type.
 *
 * Alive but calm: it bobs a little, blinks, and now and then twitches an ear.
 * As stars are chosen the board tips up and the smile grows — it never frowns,
 * because a low rating is somebody being kind enough to tell us, and a sad
 * mascot would make them feel bad for it (house guidance: no guilt-tripping
 * mascot). With Reduce Motion on, it simply stands still.
 *
 * The parts that move are separate drawings stacked on top of each other, each
 * in its own Animated.View, because React Native animates views, not the
 * shapes inside an SVG. Every layer shares one viewBox, so they line up.
 */

/** The drawing's own coordinates; the layers all use these. */
const VB_W = 200;
const VB_H = 220;

const FUR = '#c08145';
const FUR_DARK = '#b27043';
const ANTLER = '#785145';
const ANTLER_DARK = '#5b3a2e';
const CREAM = '#f0d4a9';
const CHIN = '#e2b282';
const FRECKLE = '#dda66f';
const EYE = '#4f2e27';
const CARD = '#b874f0';
const WOOD = '#cf9a5e';
const WOOD_EDGE = '#8f5d34';
const STAR = '#f5c242';
const BLUSH = 'rgba(236,128,128,0.38)';

export type DeerBoard = { kind: 'stars'; stars: number } | { kind: 'letters'; letters: string };

export function HevaloDeer({
  size = 150,
  board,
  cheer = false,
}: {
  /** width in points; the drawing is a little taller than it is wide */
  size?: number;
  board: DeerBoard;
  /** a little hop of joy (the keyboard try-it box, when all five letters are in) */
  cheer?: boolean;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const height = (size * VB_H) / VB_W;
  const stars = board.kind === 'stars' ? Math.max(0, Math.min(5, Math.round(board.stars))) : 4;

  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const earL = useRef(new Animated.Value(0)).current;
  const earR = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(tiltFor(stars))).current;
  const hop = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  // the idle loop: a slow bob, a blink every few seconds, an ear now and then
  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      blink.setValue(1);
      earL.setValue(0);
      earR.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: native }),
        Animated.delay(1700),
        Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: native }),
      ]),
    );
    const twitch = (ear: Animated.Value, dir: number) =>
      Animated.sequence([
        Animated.timing(ear, { toValue: dir, duration: 90, useNativeDriver: native }),
        Animated.timing(ear, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      ]);
    const earLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        twitch(earR, 1),
        Animated.delay(3900),
        twitch(earL, -1),
        Animated.delay(800),
      ]),
    );
    bobLoop.start();
    blinkLoop.start();
    earLoop.start();
    return () => {
      bobLoop.stop();
      blinkLoop.stop();
      earLoop.stop();
    };
  }, [reduce, bob, blink, earL, earR, native]);

  // more stars, the board tips up a little further, with a small hop each time
  useEffect(() => {
    const to = tiltFor(stars);
    if (reduce) {
      tilt.setValue(to);
      return;
    }
    Animated.parallel([
      Animated.spring(tilt, { toValue: to, friction: 5, tension: 120, useNativeDriver: native }),
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(hop, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]),
    ]).start();
  }, [stars, reduce, tilt, hop, native]);

  useEffect(() => {
    if (!cheer || reduce) return;
    Animated.sequence([
      Animated.timing(hop, { toValue: 2.5, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(hop, { toValue: 0, duration: 260, easing: Easing.bounce, useNativeDriver: native }),
    ]).start();
  }, [cheer, reduce, hop, native]);

  const layer = (children: React.ReactNode) => (
    <Svg width={size} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {children}
    </Svg>
  );

  const lift = Animated.add(
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
    hop.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
  );

  return (
    <View
      style={{ width: size, height }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {/* the lilac card the logo's deer sits on, as a soft disc that does not move */}
      <View style={StyleSheet.absoluteFill}>{layer(<Circle cx={100} cy={112} r={92} fill={CARD} opacity={0.16} />)}</View>

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <View style={StyleSheet.absoluteFill}>{layer(<Antlers />)}</View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: `${(64 / VB_W) * 100}% ${(78 / VB_H) * 100}%`,
              transform: [{ rotate: earL.interpolate({ inputRange: [-1, 0], outputRange: ['-14deg', '0deg'] }) }],
            },
          ]}
        >
          {layer(<Ear side="left" />)}
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: `${(136 / VB_W) * 100}% ${(78 / VB_H) * 100}%`,
              transform: [{ rotate: earR.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] }) }],
            },
          ]}
        >
          {layer(<Ear side="right" />)}
        </Animated.View>
        <View style={StyleSheet.absoluteFill}>{layer(<Face stars={stars} />)}</View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transformOrigin: `50% ${(84 / VB_H) * 100}%`, transform: [{ scaleY: blink }] },
          ]}
        >
          {layer(<Eyes />)}
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: `50% ${(146 / VB_H) * 100}%`,
              transform: [{ rotate: tilt.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) }],
            },
          ]}
        >
          {layer(<Board board={board} />)}
          {/*
            The letters are the system font's, not the SVG's: ç ê î ş û (and
            the Soranî letters) are exactly what an SVG text element in an
            unknown font gets wrong.
          */}
          {board.kind === 'letters' ? (
            <View
              style={{
                position: 'absolute',
                left: (34 / VB_W) * size,
                top: (140 / VB_H) * height,
                width: (132 / VB_W) * size,
                height: (58 / VB_H) * height,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: EYE, fontSize: size * 0.115, fontWeight: '700', letterSpacing: size * 0.012 }}>
                {board.letters}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * The board's angle for a number of stars: tipped down and to one side with
 * none chosen, level at three, held up at a jaunty angle at five.
 */
export function tiltFor(stars: number): number {
  return [-6, -4, -2, 0, 3, 6][Math.max(0, Math.min(5, stars))]!;
}

/**
 * How far the corners of the mouth lift, by stars: a small kind smile with
 * none, a big open one at five. Never below zero — the deer does not frown.
 */
export function smileFor(stars: number): number {
  return [2.5, 3.5, 5, 6.5, 8, 10][Math.max(0, Math.min(5, stars))]!;
}

function Antlers(): React.JSX.Element {
  const strokes = {
    stroke: ANTLER,
    strokeWidth: 7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <G>
      {/* left: a main beam, two tines out and one up */}
      <Path d="M80 56 C76 42 70 32 62 20" {...strokes} />
      <Path d="M72 36 C64 36 56 32 50 26" {...strokes} />
      <Path d="M66 26 C66 18 68 12 72 8" {...strokes} stroke={ANTLER_DARK} strokeWidth={6} />
      {/* right, mirrored */}
      <Path d="M120 56 C124 42 130 32 138 20" {...strokes} />
      <Path d="M128 36 C136 36 144 32 150 26" {...strokes} />
      <Path d="M134 26 C134 18 132 12 128 8" {...strokes} stroke={ANTLER_DARK} strokeWidth={6} />
    </G>
  );
}

function Ear({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  // drawn for the left and mirrored about the middle for the right
  const flip = side === 'right' ? 'translate(200 0) scale(-1 1)' : undefined;
  return (
    <G transform={flip}>
      <Path d="M66 78 C50 80 30 72 22 58 C38 52 58 56 70 70 Z" fill={FUR} />
      <Path d="M62 74 C50 74 38 68 32 61 C44 59 56 62 64 70 Z" fill={CREAM} />
    </G>
  );
}

function Face({ stars }: { stars: number }): React.JSX.Element {
  const s = smileFor(stars);
  const open = stars >= 4;
  return (
    <G>
      {/* the body under the head, mostly behind the board */}
      <Path d="M64 196 C62 160 72 128 100 124 C128 128 138 160 136 196 Z" fill={FUR_DARK} />
      <Path d="M86 196 C86 168 92 140 100 136 C108 140 114 168 114 196 Z" fill={CREAM} opacity={0.9} />
      {/* the head */}
      <Ellipse cx={100} cy={86} rx={46} ry={42} fill={FUR} />
      <Path d="M58 100 C64 122 84 130 100 130 C116 130 136 122 142 100 C130 116 116 122 100 122 C84 122 70 116 58 100 Z" fill={FUR_DARK} opacity={0.55} />
      {/* freckles, the deer's spots, across the forehead */}
      <Circle cx={90} cy={58} r={2.6} fill={FRECKLE} />
      <Circle cx={100} cy={54} r={3} fill={FRECKLE} />
      <Circle cx={110} cy={58} r={2.6} fill={FRECKLE} />
      <Circle cx={95} cy={65} r={1.8} fill={FRECKLE} />
      <Circle cx={105} cy={65} r={1.8} fill={FRECKLE} />
      {/* cheeks */}
      <Ellipse cx={70} cy={100} rx={9} ry={5.5} fill={BLUSH} />
      <Ellipse cx={130} cy={100} rx={9} ry={5.5} fill={BLUSH} />
      {/* the muzzle, the chin, the nose */}
      <Ellipse cx={100} cy={106} rx={25} ry={18} fill={CREAM} />
      <Ellipse cx={100} cy={118} rx={14} ry={6} fill={CHIN} opacity={0.8} />
      <Path d="M92 96 C92 91 108 91 108 96 C108 101 103 104 100 104 C97 104 92 101 92 96 Z" fill={EYE} />
      <Ellipse cx={96.5} cy={95} rx={2.4} ry={1.4} fill="#fffffe" opacity={0.7} />
      {/* the smile: wider and lifted with more stars, open at four and five */}
      {open ? (
        <Path
          d={`M${92 - s / 3} 108 Q100 ${108 + s * 1.3} ${108 + s / 3} 108 Q100 ${110 + s * 0.4} ${92 - s / 3} 108 Z`}
          fill={EYE}
        />
      ) : (
        <Path
          d={`M${93 - s / 4} 108 Q100 ${108 + s} ${107 + s / 4} 108`}
          stroke={EYE}
          strokeWidth={2.4}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </G>
  );
}

function Eyes(): React.JSX.Element {
  return (
    <G>
      <Ellipse cx={82} cy={84} rx={7.5} ry={9.5} fill={EYE} />
      <Ellipse cx={118} cy={84} rx={7.5} ry={9.5} fill={EYE} />
      <Circle cx={85} cy={80} r={2.8} fill="#fffffe" />
      <Circle cx={121} cy={80} r={2.8} fill="#fffffe" />
      <Circle cx={80} cy={88} r={1.2} fill="#fffffe" opacity={0.8} />
      <Circle cx={116} cy={88} r={1.2} fill="#fffffe" opacity={0.8} />
    </G>
  );
}

/** A five-pointed star centred on (cx, cy). */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function Board({ board }: { board: DeerBoard }): React.JSX.Element {
  return (
    <G>
      {/* forelegs reaching up to the board's top corners */}
      <Path d="M76 150 C70 146 62 142 56 140" stroke={FUR} strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d="M124 150 C130 146 138 142 144 140" stroke={FUR} strokeWidth={9} strokeLinecap="round" fill="none" />
      <Rect x={34} y={140} width={132} height={58} rx={12} fill={WOOD} stroke={WOOD_EDGE} strokeWidth={3} />
      {/* a little grain */}
      <Path d="M44 152 C70 149 96 154 124 150" stroke={WOOD_EDGE} strokeWidth={1.2} opacity={0.35} fill="none" />
      <Path d="M70 190 C96 187 126 192 156 188" stroke={WOOD_EDGE} strokeWidth={1.2} opacity={0.35} fill="none" />
      {board.kind === 'stars'
        ? [0, 1, 2, 3, 4].map((i) => (
            <Path
              key={i}
              d={starPath(56 + i * 22, 170, 9.5)}
              fill={i < board.stars ? STAR : 'none'}
              stroke={i < board.stars ? '#c98f12' : WOOD_EDGE}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          ))
        : null}
      {/* the hooves, holding on */}
      <Ellipse cx={52} cy={142} rx={8} ry={6.5} fill={ANTLER_DARK} />
      <Ellipse cx={148} cy={142} rx={8} ry={6.5} fill={ANTLER_DARK} />
    </G>
  );
}
