import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';

/**
 * Thin lesson progress bar; `value` is 0..1.
 *
 * It moves to each new value on the out-curve (`duration.progress`) rather
 * than jumping, so an answer visibly takes the lesson a step on. The fill is a
 * full-width bar slid along its track — a transform, on the native driver —
 * rather than a width that changes, which would lay the row out again on every
 * frame. Under Reduce Motion it is simply where it is.
 */
export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  const [width, setWidth] = useState(0);
  const p = useRef(new Animated.Value(v)).current;

  useEffect(() => {
    if (reduce) {
      p.setValue(v);
      return;
    }
    const run = timing(p, v, duration.progress);
    run.start();
    return () => run.stop();
  }, [v, reduce, p]);

  const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <View
      style={[styles.track, { backgroundColor: colors.glassBorder }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* unseen until the track has been measured, so it never shows full for a frame */}
      <Animated.View style={[styles.fill, { backgroundColor: colors.success, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]} />
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
  },
});
