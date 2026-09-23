import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';

/**
 * What you see while the app finds out who you are.
 *
 * It used to be an `ActivityIndicator` in the middle of a flat background —
 * the only screen in the app with no gradient, no wordmark and nothing of its
 * own. On a cold start that is the first thing anybody sees, and it looked
 * like something had gone wrong rather than like the app opening.
 *
 * So it is the same surface the sign-in screens open on: the gradient, the
 * wordmark, the line underneath. Restoring a session takes a few hundred
 * milliseconds; the point is that those milliseconds look like the app.
 *
 * The spinner is gone with it. A spinner says "this might take a while" and
 * this does not; the name breathing gently says the same thing without the
 * alarm. Reduced motion gets it still.
 */
export function LaunchScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduceMotion]);

  return (
    <GradientBackground>
      <View style={styles.centre}>
        <Animated.View
          style={{
            opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
            transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
          }}
        >
          <Text style={[styles.brand, { color: colors.primary }]}>MyKurda</Text>
        </Animated.View>
        <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
      </View>
    </GradientBackground>
  );
}

/**
 * The app arriving, once it knows where it is going.
 *
 * Every one of the three things that can follow the launch screen — the intro,
 * the sign-in stack, the tabs — used to replace it between two frames. A cut
 * from a still wordmark to a full screen reads as a glitch, which is the same
 * reason the tabs cross-fade rather than swap.
 *
 * So whatever comes next comes up through it: a fade, and a scale that starts
 * just inside its final size, so the screen settles forward rather than
 * appearing at it. 260ms, decelerating, which is the same language as the side
 * panel and half a beat quicker because there is nothing to follow with a
 * finger.
 */
export function Entrance({ children }: { children: React.ReactNode }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.sin),
      useNativeDriver: true,
    }).start();
  }, [enter, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: enter,
          transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  brand: { ...display(typography.sizes.xxl), textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', fontStyle: 'italic' },
});
