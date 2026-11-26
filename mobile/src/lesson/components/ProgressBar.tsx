import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useDirection } from '../../reports/direction';

/**
 * The lesson's progress bar, chunky and in the one accent on the slate of what is not done yet; `value` is 0..1. It
 * eases to each new value (`duration.progress`) by sliding a full-width fill along the track, a native-driver transform
 * rather than a width change that would relayout every frame; under Reduce Motion it jumps. During a run of right
 * answers (`warm`, from the third) a gold layer fades in over the accent, and a miss fades it out. It fills from the
 * reading side.
 */
export function ProgressBar({ value, warm = false }: { value: number; warm?: boolean }) {
  const { colors } = useTheme();
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
      style={[styles.track, { backgroundColor: colors.locked }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Hidden until the track is measured, so it never flashes full. */}
      <Animated.View style={[styles.fill, { backgroundColor: colors.accent, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.gold, opacity: gold }]} testID="lesson-progress-warm" />
        <View style={styles.sheen} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 16,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  // One soft light along the fill's top, inset from its rounded ends.
  sheen: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
