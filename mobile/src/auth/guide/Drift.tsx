import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenAwake } from '../../a11y/useMotionAlive';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { springTo } from '../../theme/animate';
import type { SlideDirection } from '../../theme/SlideSwap';

/** How far the art floats up and down, in points, and how long one float there and back takes. */
const DRIFT = { rise: 4, ms: 5200 } as const;

/** How far the art arrives from, beyond where the slide itself comes from, so it seems a layer nearer than the words. */
const PARALLAX = 22;

/**
 * A landing screen's art floating slowly up and down, and arriving from a little further than the words when its slide
 * turns in (`direction`), so the slide reads as having depth. One loop and one spring on the native driver. The float
 * stops behind another screen and never runs under Reduce Motion.
 */
export function Drift({
  direction,
  mirrored = false,
  children,
  style,
}: {
  /** Which way the slide this stands on turned in; none for art that was there from the start. */
  direction?: SlideDirection | null;
  /** Read from the right: forward comes in from the left. */
  mirrored?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  // In front, and the app not in the background: otherwise the float has nobody to move for.
  const focused = useScreenAwake();
  const float = useRef(new Animated.Value(0)).current;
  const across = useRef(new Animated.Value(direction && !reduce ? (direction === 'forward' ? 1 : -1) * (mirrored ? -1 : 1) * PARALLAX : 0)).current;

  useEffect(() => {
    if (reduce) {
      across.setValue(0);
      return;
    }
    const settle = springTo(across, 0, 'standard');
    settle.start();
    return () => settle.stop();
    // Once, as the art arrives.
  }, [reduce, across]);

  useEffect(() => {
    if (reduce || !focused) {
      float.setValue(0);
      return;
    }
    const half = DRIFT.ms / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(float, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      float.setValue(0);
    };
  }, [reduce, focused, float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [DRIFT.rise, -DRIFT.rise] });
  return (
    <Animated.View style={[styles.art, style, { transform: [{ translateX: across }, { translateY }] }]} testID="drift">
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center' },
});
