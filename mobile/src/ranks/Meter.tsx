import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';

/**
 * A progress bar that fills: to the next division, to a badge's next tier, to
 * the weekly goal. The fill is a gradient in the emblem's own metal and slides
 * in on the native driver (a transform, never a width), from `from` when it is
 * given — the bar after a game starts where the points were. Under Reduce
 * Motion it is simply at its value.
 */
export function Meter({
  fraction,
  from,
  tint,
  height = 8,
  durationMs = 900,
  delayMs = 0,
  label,
  style,
}: {
  /** 0…1 */
  fraction: number;
  /** where the fill starts before sliding to `fraction` (default: no slide) */
  from?: number;
  /** the fill's two colours, light to strong */
  tint: readonly [string, string];
  height?: number;
  durationMs?: number;
  delayMs?: number;
  /** what the bar measures, for a screen reader ("88 to Gir I") */
  label?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const target = clamp(fraction);
  const start = from === undefined ? target : clamp(from);
  const value = useRef(new Animated.Value(start)).current;

  useEffect(() => {
    if (reduce || start === target) {
      value.setValue(target);
      return;
    }
    value.setValue(start);
    const run = Animated.timing(value, {
      toValue: target,
      duration: durationMs,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [reduce, start, target, durationMs, delayMs, value]);

  const translateX = value.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <View
      accessible={label !== undefined}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { height, backgroundColor: colors.controlTrack }, style]}
    >
      {width > 0 ? (
        <Animated.View style={[styles.fill, { width, transform: [{ translateX }] }]}>
          <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', borderRadius: radii.pill, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: radii.pill, overflow: 'hidden' },
});
