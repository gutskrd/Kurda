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
 * The lesson's progress bar; `value` is 0..1. It eases to each new value (`duration.progress`) by sliding a
 * full-width fill along the track, a native-driver transform rather than a width change that would relayout every
 * frame; under Reduce Motion it jumps. During a run of right answers (`warm`, from the third) a gold layer fades in
 * over the red, and a miss fades it out. It fills from the reading side.
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
      {/* Hidden until the track is measured, so it never flashes full. */}
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
  // The track looks pressed into the paper: a darker line along its top, under the fill.
  shade: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  // One soft light along the fill's top, clipped by its rounded ends.
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
