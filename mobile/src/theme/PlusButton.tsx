import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PLUS_STYLE } from '@kurda/shared';
import { Pressable } from './Pressable';
import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { radii, spacing, typography } from './tokens';
import { usePressScale } from './animate';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';

/** Taller than the main button's 50, so the offer reads as the one special thing on its screen. */
const HEIGHT = 58;

/**
 * Hevalo+'s call to join, matching the website's: the one button styled apart from the colour theme, in a rich gold
 * with the crown and larger than any other, with what membership gives in a line beneath it and a way to say no that
 * is just as plain to see where the offer stands alone. It shines once as it arrives, never under Reduce Motion, and
 * nothing about it counts down or comes already chosen.
 */
export function PlusButton({
  label,
  value,
  decline,
  onJoin,
}: {
  label: string;
  /** What membership gives, in one short line, where the offer stands alone. */
  value?: string;
  /** The way to say no, beside an offer that stands alone; a page of its own has its close button instead. */
  decline?: { label: string; onPress: () => void };
  onJoin: () => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const plus = PLUS_STYLE[scheme];
  const reduce = useReducedMotion();
  const press = usePressScale(true);
  const dir = useDirection();
  const [width, setWidth] = useState(0);
  const shine = useRef(new Animated.Value(0)).current;

  // One pass of light across the button once it has a width, a moment after it arrives.
  useEffect(() => {
    if (reduce || width === 0) return;
    const pass = Animated.timing(shine, { toValue: 1, duration: 1100, delay: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    pass.start();
    return () => pass.stop();
  }, [reduce, width, shine]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onJoin}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        reachSize={{ height: HEIGHT }}
        testID="plus-join"
      >
        <Animated.View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[styles.button, { borderColor: plus.edge, shadowColor: plus.glow, transform: [{ scale: press.scale }] }]}
        >
          <LinearGradient colors={plus.fill} style={StyleSheet.absoluteFill} />
          {reduce || width === 0 ? null : (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.shine,
                { width: width * 0.4, transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.5, width * 1.1] }) }] },
              ]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
          <View style={[styles.row, { flexDirection: dir.row }]}>
            <Icon name="crown" size={22} color={plus.ink} />
            <Text style={[styles.label, { color: plus.ink }]}>{label}</Text>
          </View>
        </Animated.View>
      </Pressable>
      {value ? <Text style={[styles.value, { color: colors.textSecondary }]}>{value}</Text> : null}
      {decline ? (
        <Pressable onPress={decline.onPress} accessibilityRole="button" accessibilityLabel={decline.label} style={styles.decline} testID="plus-decline">
          <Text style={[styles.declineText, { color: colors.textPrimary }]}>{decline.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm },
  button: {
    minHeight: HEIGHT,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 28,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  row: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  value: { fontSize: typography.sizes.text, textAlign: 'center' },
  decline: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  declineText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
