import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMotionAlive } from '../../a11y/useMotionAlive';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useTheme } from '../../theme/ThemeProvider';
import { LAUNCH, WASH } from './splash';

/**
 * A faint band of light drifting slowly across the launch page and back, so the page looks alive while the app starts:
 * one gradient view moved by a native-driver transform. It loops, so it is absent under Reduce Motion.
 */
export function LightWash(): React.JSX.Element | null {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;

  // Paused while the app is in the background, where a launch waiting on the network may be left.
  const alive = useMotionAlive();
  useEffect(() => {
    if (!alive) return;
    const pass = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: LAUNCH.washMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(drift, { toValue: 0, duration: LAUNCH.washMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    pass.start();
    return () => pass.stop();
  }, [alive, drift]);

  if (reduce) return null;

  // The band leans, so it is drawn taller than the screen to cover it, and starts and ends off the screen's sides.
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
