import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { springTo } from '../../theme/animate';
import type { SlideDirection } from '../../theme/SlideSwap';
import { useScreenFocus } from './focus';

/** How far the art floats up and down, in points, and how long one float there and back takes. */
export const DRIFT = { rise: 4, ms: 5200 } as const;

/** How far the art arrives from, beyond where the slide itself comes from, so it seems a layer nearer than the words. */
export const PARALLAX = 22;

/**
 * A landing screen's art, alive: it floats slowly up and down, the way a
 * thing does that is not pinned to the page, and arrives a little further
 * than the words around it when its slide turns in (`direction`), so the
 * slide reads as having depth rather than as one flat card. One loop and one
 * spring, both transforms on the native driver.
 *
 * The float is a loop, so it stops the moment the screen is behind another
 * and never runs at all for somebody who has asked for less motion; the
 * arrival is then simply the place it ends up.
 */
export function Drift({
  direction,
  mirrored = false,
  children,
  style,
}: {
  /** which way the slide this stands on turned in; none for art that was there from the start */
  direction?: SlideDirection | null;
  /** read from the right: forward comes in from the left */
  mirrored?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
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
    // once, as the art arrives
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
