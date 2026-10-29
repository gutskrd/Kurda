import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { useI18n } from '../../i18n/I18nContext';
import { springTo, timing } from '../../theme/animate';
import { SoftGlow } from '../../theme/CelebrationParts';
import { GradientBackground } from '../../theme/glass';
import { display } from '../../theme/fonts';
import { Icon } from '../../theme/Icon';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

/** How long a run's milestone holds the screen before the next exercise, unless it is tapped away sooner. */
export const RUN_MOMENT_MS = 1000;

/**
 * "4 in a row", with a flame, in gold, just above the progress bar while a run
 * of right answers lasts (shown from `RUN_SHOWN_FROM`). It pops as it grows,
 * and is still under Reduce Motion. `end` is a mirrored header's: it sits over
 * the start of the bar, on the right.
 */
export function RunLabel({ count, end }: { count: number; end: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const was = useRef(count);
  useEffect(() => {
    const grew = count > was.current;
    was.current = count;
    if (!grew || reduce) return;
    scale.setValue(0.7);
    const run = springTo(scale, 1, 'bouncy');
    run.start();
    return () => run.stop();
  }, [count, reduce, scale]);
  return (
    <Animated.View style={[styles.label, end ? styles.labelEnd : styles.labelStart, { transform: [{ scale }] }]} testID="lesson-in-a-row">
      <Icon name="flame" size={14} color={colors.goldText} />
      <Text style={[styles.labelText, { color: colors.goldText }]}>{t('lesson.inARow', { count })}</Text>
    </Animated.View>
  );
}

/**
 * A run's milestone (`runMilestone`: 5, 10, …), between one exercise and the
 * next: "10 in a row!" in big gold letters, springing in over the lesson
 * (under its bar, which stays gold) for about a second, and said to a screen
 * reader. A tap anywhere moves on at once. Under Reduce Motion it fades in
 * where it is.
 */
export function RunMoment({ count, onDone }: { count: number; onDone: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  const words = t('lesson.run.milestone', { count });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(words);
    const run = reduce ? timing(p, 1, duration.base) : springTo(p, 1, 'bouncy');
    run.start();
    const id = setTimeout(() => done.current(), RUN_MOMENT_MS);
    return () => {
      run.stop();
      clearTimeout(id);
    };
    // once, as it arrives
  }, []);

  const scale = reduce ? 1 : p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const opacity = p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    // the page itself again, laid over the lesson: the same light, so nothing shows where it begins
    <GradientBackground style={styles.over}>
      <Pressable onPress={() => done.current()} accessibilityRole="button" accessibilityLabel={words} aria-modal style={styles.moment} testID="lesson-run-moment">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
          <SoftGlow colour={colors.gold} size={360} id="run-moment-glow" />
        </Animated.View>
        <Animated.View style={[styles.momentBody, { opacity, transform: [{ scale }] }]}>
          <Icon name="flame" size={56} color={colors.goldText} />
          <Text style={[styles.momentText, { color: colors.goldText }]}>{words}</Text>
        </Animated.View>
      </Pressable>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', bottom: '100%', marginBottom: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: 4 },
  labelStart: { left: spacing.xs },
  labelEnd: { right: spacing.xs, flexDirection: 'row-reverse' },
  labelText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  over: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  moment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  momentBody: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  momentText: { ...display(44), textAlign: 'center' },
});
