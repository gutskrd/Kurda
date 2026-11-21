import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PATH_RETURN, PATH_RING, ringPieces, roundStars, starPath } from '@kurda/shared';
import { timing } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { RING, STAR } from './path';

/**
 * A topic's ring and stars on the lesson path. The rules and geometry are shared (lesson-rounds.ts), so the website
 * draws the same: one piece per lesson, violet once finished in the current round, gold all round once every round
 * is played, and a star per round on the finished coin.
 *
 * After a lesson the ring animates from `from`: new pieces fill in turn, and a whole round turns the ring gold with
 * the stop (`PATH_RETURN.finishAtMs`), drops its star in (`starAtMs`), then starts the next round. Opacity and scale
 * only, on the native driver; under Reduce Motion there is no `from`.
 */

/** What a ring shows: `of` pieces, `filled` of them; `whole` once all three rounds are played. */
interface RingShown {
  of: number;
  filled: number;
  whole: boolean;
}

const { pad, box, width: STROKE } = PATH_RING;

export function TopicRing({
  ring,
  from,
  roundDone = false,
  tint,
  mirrored = false,
}: {
  ring: RingShown;
  /** The ring before the lesson just played, when it has moved on since. */
  from?: RingShown | null;
  /** A round was completed since: the ring fills, goes gold, then starts the next round. */
  roundDone?: boolean;
  /** The colour finished pieces are drawn in, where not the ink: the violet of the stop to do now. */
  tint?: string;
  /** Fills the other way round, for a mirrored right-to-left path. */
  mirrored?: boolean;
}): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const pieces = ringPieces(ring.of);
  const track = RING[scheme];
  const flip = mirrored ? styles.mirrored : null;
  const draw = (d: string, colour: string, key: string) => [
    <Path key={`${key}e`} d={d} stroke={track.edge} strokeWidth={STROKE + 3} strokeLinecap="round" fill="none" />,
    <Path key={key} d={d} stroke={colour} strokeWidth={STROKE} strokeLinecap="round" fill="none" />,
  ];
  if (!from) {
    const colourOf = (k: number): string => (ring.whole ? colors.gold : k < ring.filled ? (tint ?? colors.primary) : track.track);
    return (
      <View style={[styles.box, flip]} pointerEvents="none" aria-hidden testID="lp-ring">
        <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${box} ${box}`}>
          {pieces.flatMap((d, k) => draw(d, colourOf(k), `p${k}`))}
        </Svg>
      </View>
    );
  }
  return <MovingRing ring={ring} from={from} roundDone={roundDone} pieces={pieces} flip={flip} draw={draw} tint={tint ?? colors.primary} />;
}

/** The ring animating from its old state, piece by piece, gold for a completed round, then its next round. */
function MovingRing({
  ring,
  from,
  roundDone,
  pieces,
  flip,
  draw,
  tint,
}: {
  ring: RingShown;
  from: RingShown;
  roundDone: boolean;
  pieces: string[];
  flip: object | null;
  draw: (d: string, colour: string, key: string) => React.JSX.Element[];
  tint: string;
}): React.JSX.Element {
  const { scheme, colors } = useTheme();
  // A completed round fills all the way before the next begins.
  const target = roundDone ? ring.of : ring.filled;
  const shown = useRef(new Animated.Value(from.filled)).current;
  const gold = useRef(new Animated.Value(from.whole ? 1 : 0)).current;
  useEffect(() => {
    shown.setValue(from.filled);
    gold.setValue(from.whole ? 1 : 0);
    const { settleMs, ringMs, finishAtMs, starAtMs, starMs } = PATH_RETURN;
    const filledAt = settleMs + ringMs;
    const landed = starAtMs + starMs;
    // One sequence per value: starting a second animation on a value stops the first, even during its delay.
    const fill: Animated.CompositeAnimation[] = [timing(shown, target, ringMs, { delay: settleMs })];
    const turn: Animated.CompositeAnimation[] = [];
    if (roundDone) {
      turn.push(timing(gold, 1, 120, { delay: finishAtMs - 120 }));
      // As the star lands the next round begins; after the third the ring stays gold.
      if (!ring.whole) {
        fill.push(timing(shown, ring.filled, 1, { delay: Math.max(0, landed - filledAt) }));
        turn.push(timing(gold, 0, 160, { delay: Math.max(0, landed - finishAtMs) }));
      }
    }
    const run = Animated.parallel([Animated.sequence(fill), ...(turn.length > 0 ? [Animated.sequence(turn)] : [])]);
    run.start();
    return () => run.stop();
  }, [from.filled, from.whole, target, roundDone, ring.whole, ring.filled, shown, gold]);
  const track = RING[scheme].track;
  return (
    <View style={[styles.box, flip]} pointerEvents="none" aria-hidden testID="lp-ring">
      <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${box} ${box}`}>
        {pieces.flatMap((d, k) => draw(d, track, `t${k}`))}
      </Svg>
      {pieces.map((d, k) => (
        <Animated.View key={k} style={[StyleSheet.absoluteFill, { opacity: shown.interpolate({ inputRange: [k, k + 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
          <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${box} ${box}`}>
            <Path d={d} stroke={tint} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ))}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gold }]} testID="lp-ring-gold">
        <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${box} ${box}`}>
          {pieces.map((d, k) => (
            <Path key={k} d={d} stroke={colors.gold} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * A finished topic's stars (one to three) on its gold coin, cream with a deep gold edge so they read on the gold.
 * `earned` drops the newest star in (`PATH_RETURN.starAtMs`).
 */
export function RoundStars({ rounds, earned = false }: { rounds: number; earned?: boolean }): React.JSX.Element | null {
  const stars = roundStars(rounds);
  const fall = useRef(new Animated.Value(earned ? 0 : 1)).current;
  useEffect(() => {
    if (!earned) {
      fall.setValue(1);
      return;
    }
    fall.setValue(0);
    const run = timing(fall, 1, PATH_RETURN.starMs, { delay: PATH_RETURN.starAtMs });
    run.start();
    return () => run.stop();
  }, [earned, fall]);
  if (stars.length === 0) return null;
  const last = stars[stars.length - 1]!;
  const before = earned ? stars.slice(0, -1) : stars;
  const one = (s: { x: number; y: number; r: number }, key: number) => (
    <Path key={key} d={starPath(s.x, s.y, s.r)} fill={STAR.fill} stroke={STAR.edge} strokeWidth={1.6} strokeLinejoin="round" />
  );
  // The dropping star is drawn in its own box so it grows from its centre.
  const size = last.r * 4;
  return (
    <View style={styles.stars} pointerEvents="none" aria-hidden testID={`lp-stars-${rounds}`}>
      <Svg width={72} height={72} viewBox="0 0 72 72">
        {before.map(one)}
      </Svg>
      {earned ? (
        <Animated.View
          style={[
            styles.falling,
            { left: last.x - size / 2, top: last.y - size / 2, width: size, height: size },
            {
              opacity: fall.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
              transform: [
                { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
                { scale: fall.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1.8, 0.92, 1] }) },
              ],
            },
          ]}
          testID="lp-star-earned"
        >
          <Svg width={size} height={size} viewBox={`${last.x - size / 2} ${last.y - size / 2} ${size} ${size}`}>
            {one(last, 0)}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The ring's square, laid over the stop's 72-point button from `pad` out.
  box: { position: 'absolute', left: -pad, top: -pad, width: box, height: box },
  mirrored: { transform: [{ scaleX: -1 }] },
  stars: { position: 'absolute', left: 0, top: 0, width: 72, height: 72 },
  falling: { position: 'absolute' },
});
