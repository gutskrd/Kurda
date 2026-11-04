import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { radii } from '../theme/tokens';

/**
 * The face on its own small stage: two soft discs of the profile's colour
 * behind it — the league's water, or the brand before there is a league —
 * and the face springing in onto them as the profile opens, on the bouncy
 * spring, from a little smaller. The discs are decoration and say nothing to
 * a screen reader; under Reduce Motion the face is simply there. `size` is
 * the stage; the face inside is the caller's and keeps its own size, so a
 * season frame round it stays exactly as it was.
 */
export function AvatarStage({ tint, size, children }: { tint: string; size: number; children: ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const arrive = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      arrive.setValue(1);
      return;
    }
    const run = springTo(arrive, 1, 'bouncy');
    run.start();
    return () => run.stop();
  }, [reduce, arrive]);
  const scale = arrive.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const opacity = arrive.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const inner = Math.round(size * 0.8);
  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.disc, styles.outer, { width: size, height: size, backgroundColor: tint }]}
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.disc, styles.inner, { width: inner, height: inner, top: (size - inner) / 2, left: (size - inner) / 2, backgroundColor: tint }]}
      />
      <Animated.View style={[styles.face, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', borderRadius: radii.pill },
  // the outer disc is barely there, the inner one a shade more, so the face sits in a pool of its colour rather than on a badge
  outer: { top: 0, left: 0, opacity: 0.1 },
  inner: { opacity: 0.16 },
  face: { alignItems: 'center', justifyContent: 'center' },
});
