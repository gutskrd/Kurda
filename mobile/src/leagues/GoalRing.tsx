import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ease } from '../theme/animate';
import { duration } from '../theme/motion';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { goalFraction } from './format';

let rings = 0;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The weekly goal as a ring (contract 4 §L3, §U): XP this week against the
 * goal, filled in the league's own water colour, and a check in the middle
 * once it is met — the moment demotion stops being possible. The same ring
 * in league and personal mode: the goal is the learner's either way.
 *
 * It fills to its value as it appears, and to each new value after, on the
 * out-curve in `duration.progress`. A stroke along a circle is not something
 * the native driver can move, so this one short animation runs on the JS
 * thread; under Reduce Motion the ring is simply where it is.
 */
export function GoalRing({
  xp,
  goal,
  size = 96,
  tint,
  showNumbers = true,
}: {
  xp: number;
  goal: number;
  size?: number;
  tint: readonly [string, string];
  /** the XP in the middle; a small ring shows only the check or nothing */
  showNumbers?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const met = xp >= goal;
  const stroke = Math.max(5, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = goalFraction(xp, goal);
  const reduce = useReducedMotion();
  const shown = useRef(new Animated.Value(reduce ? f : 0)).current;
  useEffect(() => {
    if (reduce) {
      shown.setValue(f);
      return;
    }
    const run = Animated.timing(shown, { toValue: f, duration: duration.progress, easing: ease.out, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [f, reduce, shown]);
  const offset = shown.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  // its own gradient id: a ring left on a screen behind this one must not own this one's fill (browser build)
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    rings += 1;
    ref.current = `goal${rings.toString(36)}`;
  }
  const id = ref.current;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('leagues.goalA11y', { xp, goal })}
      accessibilityValue={{ min: 0, max: goal, now: Math.min(xp, goal) }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tint[0]} />
            <Stop offset="1" stopColor={tint[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.controlTrack} strokeWidth={stroke} fill="none" />
        {f > 0 ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {met ? (
          <Icon name="seal-check" size={Math.round(size * (showNumbers ? 0.3 : 0.45))} color={tint[1]} />
        ) : showNumbers ? (
          <>
            <Text style={[styles.xp, { color: colors.textPrimary, fontSize: Math.round(size / 4.2) }]} numberOfLines={1}>
              {formatNumber(xp, locale)}
            </Text>
            <Text style={[styles.of, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('leagues.goalOf', { goal: formatNumber(goal, locale) })}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  xp: { fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  of: { fontSize: typography.sizes.xs },
});
