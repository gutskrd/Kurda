import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { radii, spacing } from './tokens';
import { useTheme } from './ThemeProvider';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * Skeleton placeholder. A soft translucent block that gently
 * pulses while content loads — the glass-native replacement for spinning loaders.
 * Honours reduce-motion (holds a static dimmed state) and is hidden from screen
 * readers (it's decorative; the screen announces "loading" via the boundary).
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (reduce) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.controlTrack, opacity: pulse }, style]}
    />
  );
}

/** A skeleton mimicking a list row: a circular avatar + two text lines. */
export function SkeletonRow({ avatar = true }: { avatar?: boolean }): React.JSX.Element {
  return (
    <View style={styles.row}>
      {avatar ? <Skeleton width={40} height={40} radius={radii.pill} /> : null}
      <View style={styles.rowLines}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="82%" height={11} />
      </View>
    </View>
  );
}

/** A stack of text-line skeletons of varying widths — for article/detail bodies. */
export function SkeletonLines({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const widths = ['70%', '92%', '85%', '78%', '60%'];
  return (
    <View style={[styles.lines, style]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length] as DimensionValue} height={13} />
      ))}
    </View>
  );
}

/** A stack of skeleton rows — the default "loading" state for list/feed screens. */
export function SkeletonList({ count = 6, avatar = true, style }: { count?: number; avatar?: boolean; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <View style={[styles.list, style]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} avatar={avatar} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg, paddingVertical: spacing.md },
  lines: { gap: spacing.sm, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLines: { flex: 1, gap: spacing.sm },
});
