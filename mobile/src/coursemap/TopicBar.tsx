import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PATH_BAR, PATH_RETURN, TOPIC_STARS, barPieces, starPath } from '@kurda/shared';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { TRACK } from './path';

/**
 * A topic's progress over its stop and its rounds in its card. The rules and shapes are shared (lesson-rounds.ts), so
 * the website draws the same: a slim bar just above the tile with one rounded piece per lesson, in its unit's colour
 * once finished in the current round, and gold once full.
 *
 * After a lesson the bar moves on from `from`: the new pieces fill in turn, and a completed round fills it, turns it
 * gold as the stop is sealed (`PATH_RETURN.finishAtMs`), and once the stamp has pressed starts the next round
 * (`nextAtMs`). Opacity and scale only, on the native driver; under Reduce Motion there is no `from`.
 */

/** What a bar shows: `of` pieces, `filled` of them; `whole` once all three rounds are played. */
interface BarShown {
  of: number;
  filled: number;
  whole: boolean;
}

export function TopicBar({
  bar,
  from,
  roundDone = false,
  tint,
  mirrored = false,
}: {
  bar: BarShown;
  /** The bar before the lesson just played, when it has moved on since. */
  from?: BarShown | null;
  /** A round was completed since: the bar fills, goes gold, then starts the next round. */
  roundDone?: boolean;
  /** The unit's colour, for the pieces finished. */
  tint: string;
  /** Fills from the right, for a mirrored right-to-left path. */
  mirrored?: boolean;
}): React.JSX.Element | null {
  const { scheme, colors } = useTheme();
  const pieces = barPieces(bar.of);
  // A completed round fills all the way before the next begins.
  const target = from && roundDone ? bar.of : bar.filled;
  const shown = useRef(new Animated.Value(from ? from.filled : bar.filled)).current;
  const gold = useRef(new Animated.Value(from ? (from.whole ? 1 : 0) : bar.whole ? 1 : 0)).current;
  useEffect(() => {
    if (!from) {
      shown.setValue(bar.filled);
      gold.setValue(bar.whole ? 1 : 0);
      return;
    }
    shown.setValue(from.filled);
    gold.setValue(from.whole ? 1 : 0);
    const { settleMs, ringMs, finishAtMs, nextAtMs } = PATH_RETURN;
    const filledAt = settleMs + ringMs;
    // One sequence per value: starting a second animation on a value stops the first, even during its delay.
    const fill: Animated.CompositeAnimation[] = [timing(shown, target, ringMs, { delay: settleMs })];
    const turn: Animated.CompositeAnimation[] = [];
    if (roundDone) {
      turn.push(timing(gold, 1, 120, { delay: finishAtMs - 120 }));
      // Once the stamp has pressed the next round begins; after the third the bar stays full and gold.
      if (!bar.whole) {
        fill.push(timing(shown, bar.filled, 1, { delay: Math.max(0, nextAtMs - filledAt) }));
        turn.push(timing(gold, 0, 160, { delay: Math.max(0, nextAtMs - finishAtMs) }));
      }
    }
    const run = Animated.parallel([Animated.sequence(fill), ...(turn.length > 0 ? [Animated.sequence(turn)] : [])]);
    run.start();
    return () => run.stop();
  }, [from, target, roundDone, bar.whole, bar.filled, shown, gold]);
  if (pieces.length === 0) return null;
  const { h, cut } = PATH_BAR;
  // Cut from one bar: round at its two ends, nearly square where it is cut.
  const ends = (k: number): object => {
    const first = k === 0;
    const last = k === pieces.length - 1;
    const [left, right] = mirrored ? [last, first] : [first, last];
    return {
      borderRadius: cut,
      ...(left ? { borderTopLeftRadius: h / 2, borderBottomLeftRadius: h / 2 } : null),
      ...(right ? { borderTopRightRadius: h / 2, borderBottomRightRadius: h / 2 } : null),
    };
  };
  return (
    <View style={styles.bar} pointerEvents="none" aria-hidden testID="lp-bar">
      {pieces.map((p, k) => (
        <View
          key={k}
          style={[styles.piece, ends(k), { left: mirrored ? PATH_BAR.w - (p.x - PATH_BAR.x) - p.w : p.x - PATH_BAR.x, width: p.w, height: h, backgroundColor: TRACK[scheme] }]}
          testID={k < bar.filled ? 'lp-bar-filled' : undefined}
        >
          {/* Filled from the start of the line, in the unit's colour, and gold over it once full. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transformOrigin: mirrored ? '100% 50%' : '0% 50%', backgroundColor: tint, transform: [{ scaleX: shown.interpolate({ inputRange: [k, k + 1], outputRange: [0, 1], extrapolate: 'clamp' }) }] },
            ]}
          />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.gold, opacity: gold }]} testID={k === 0 ? 'lp-bar-gold' : undefined} />
        </View>
      ))}
    </View>
  );
}

/** A star's edge, darker than the gold, so it reads on any unit's wax (as the website's path.css). */
const STAR_EDGE = 'rgba(40, 22, 4, 0.6)';

/** A topic's three stars in its card: gold for each round played, the bar's quiet track for the rest. */
export function StarRow({ rounds }: { rounds: number }): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.row, { flexDirection: dir.row }]} aria-hidden testID={`lp-card-stars-${rounds}`}>
      {Array.from({ length: TOPIC_STARS }, (_, i) => (
        <Svg key={i} width={26} height={26} viewBox="0 0 24 24">
          <Path d={starPath(12, 12.6, 10.6)} fill={i < rounds ? colors.gold : TRACK[scheme]} stroke={i < rounds ? STAR_EDGE : 'transparent'} strokeWidth={1.2} strokeLinejoin="round" />
        </Svg>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the stop's 72-point button, a touch wider than it, its top `PATH_BAR.y` above it.
  bar: { position: 'absolute', left: PATH_BAR.x, top: PATH_BAR.y, width: PATH_BAR.w, height: PATH_BAR.h },
  piece: { position: 'absolute', top: 0, overflow: 'hidden' },
  row: { gap: 4 },
});
