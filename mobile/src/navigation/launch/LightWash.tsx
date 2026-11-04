import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useTheme } from '../../theme/ThemeProvider';
import { LAUNCH, WASH } from './splash';

/**
 * A soft light drifting across the launch page.
 *
 * The page is a near-flat gradient, and for the moment the app takes to find
 * out who is holding it that gradient was the only thing on the screen. A
 * band of faint white, leaning a little, crosses it slowly from one side to
 * the other and back — the way light moves over a wall — so the page is
 * alive before anything on it is. It is a gradient view moved by one
 * transform on the native driver, and nothing else: no blur, no frost.
 *
 * It is a loop, which is the one thing a launch page may loop, and so it is
 * not there at all for somebody who has asked for less motion.
 */
export function LightWash(): React.JSX.Element | null {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    const pass = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: LAUNCH.washMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(drift, { toValue: 0, duration: LAUNCH.washMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    pass.start();
    return () => pass.stop();
  }, [reduce, drift]);

  if (reduce) return null;

  // the band leans, so it is drawn taller than the screen to still cover it top to bottom, and starts and ends off the screen's sides
  const band = width * 0.9;
  const tall = height * 1.6;
  const travel = drift.interpolate({ inputRange: [0, 1], outputRange: [-width * 1.2, width * 2.2] });
  return (
    <Animated.View
      pointerEvents="none"
      testID="launch-wash"
      style={[styles.band, { left: -band / 2, top: (height - tall) / 2, width: band, height: tall, transform: [{ translateX: travel }, { rotate: '-18deg' }] }]}
    >
      <LinearGradient colors={['transparent', WASH[colors.scheme], 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute' },
});
