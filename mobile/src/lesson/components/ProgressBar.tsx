import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useDirection } from '../../reports/direction';
import { useValley } from '../ValleyScope';

/**
 * The lesson's progress bar; `value` is 0..1.
 *
 * It moves to each new value on the out-curve (`duration.progress`) rather
 * than jumping, so an answer visibly takes the lesson a step on. The fill is a
 * full-width bar slid along its track — a transform, on the native driver —
 * rather than a width that changes, which would lay the row out again on every
 * frame. Under Reduce Motion it is simply where it is.
 *
 * 12 points tall, in the valley's colours: a sandy track with a shade along
 * its top, as if pressed into the paper, and the pomegranate's red filling it
 * with one soft light along its top, so it reads as something filling rather
 * than a line. While a run of right answers is shown (`warm`, from the third)
 * the fill warms from red to the sun's gold, and a miss cools it again — the
 * colour changing in place, a fade of a gold layer over the red, never
 * anything that travels.
 *
 * It fills from the reading side — from the right in Soranî and Arabic.
 */
export function ProgressBar({ value, warm = false }: { value: number; warm?: boolean }) {
  const { colors } = useTheme();
  const valley = useValley();
  const reduce = useReducedMotion();
  const mirrored = useDirection().row === 'row-reverse';
  const v = Math.max(0, Math.min(1, value));
  const [width, setWidth] = useState(0);
  const p = useRef(new Animated.Value(v)).current;
  const gold = useRef(new Animated.Value(warm ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      p.setValue(v);
      return;
    }
    const run = timing(p, v, duration.progress);
    run.start();
    return () => run.stop();
  }, [v, reduce, p]);

  useEffect(() => {
    const run = timing(gold, warm ? 1 : 0, duration.base);
    run.start();
    return () => run.stop();
  }, [warm, gold]);

  const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [mirrored ? width : -width, 0] });
  return (
    <View
      style={[styles.track, { backgroundColor: valley.track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={[styles.shade, { backgroundColor: valley.trackShade }]} />
      {/* unseen until the track has been measured, so it never shows full for a frame */}
      <Animated.View style={[styles.fill, { backgroundColor: valley.red, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.gold, opacity: gold }]} testID="lesson-progress-warm" />
        <View style={styles.sheen} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  // the track pressed into the paper: a darker line along its top edge, under the fill
  shade: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  // one soft light along the top of the fill, cut off by its rounded ends
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
