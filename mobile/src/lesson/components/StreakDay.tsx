import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { STREAK_DAY_TIMING, freezeLine } from '@kurda/shared';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { haptic } from '../../feedback/haptics';
import { playSound } from '../../feedback/sounds';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useScreenBottomInset, useScreenTopInset } from '../../navigation/tabBarLayout';
import { useDirection } from '../../reports/direction';
import { springTo, useCountUp } from '../../theme/animate';
import { display } from '../../theme/fonts';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import type { Streak } from '../types';

/** How big the flame is drawn. */
const FLAME = 96;

/**
 * "Day N": the one streak card, shown after the results when this lesson was
 * the first today and so kept the streak going — opened by the learner's own
 * tap on the results, never by itself, and gone with one more.
 *
 * The flame arrives on a spring and the day counts on from yesterday's; the
 * reward is heard and felt as it lands (the pacing in each keeps it to one).
 * Under it, the days learned in all — which never go down, whatever happens
 * to the streak — and how near the next freeze is, or how many are saved. No
 * countdown, nothing about losing it: a kept day is said as what it is.
 *
 * Under Reduce Motion it is all simply there; the chime and the buzz follow
 * their own switches.
 */
export function StreakDay({ streak, onContinue }: { streak: Streak; onContinue: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const day = Math.max(1, streak.current);
  const shown = useCountUp(day, { from: day - 1, delayMs: STREAK_DAY_TIMING.countAtMs });
  const flame = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const freeze = freezeLine(streak);
  const share = freeze?.kind === 'toward' ? freeze.done / freeze.per : 1;
  const fill = useRef(new Animated.Value(reduce ? share : 0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const felt = setTimeout(() => {
      haptic('celebrate');
      playSound('reward');
    }, reduce ? 0 : STREAK_DAY_TIMING.rewardAtMs);
    if (reduce) {
      flame.setValue(1);
      fill.setValue(share);
      return () => clearTimeout(felt);
    }
    const run = Animated.parallel([
      springTo(flame, 1, 'bouncy'),
      Animated.timing(fill, { toValue: share, duration: STREAK_DAY_TIMING.freezeMs, delay: STREAK_DAY_TIMING.freezeAtMs, useNativeDriver: true }),
    ]);
    run.start();
    return () => {
      clearTimeout(felt);
      run.stop();
    };
    // once, as the card opens
  }, []);

  const scale = flame.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const opacity = flame.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  // the bar slides in from the reading side, as every bar's fill does
  const translateX = fill.interpolate({ inputRange: [0, 1], outputRange: [dir.rtl ? width : -width, 0] });
  const freezeWords = !freeze
    ? null
    : freeze.kind === 'ready'
      ? freeze.count === 1
        ? t('lesson.streak.freezeReadyOne')
        : t('lesson.streak.freezeReady', { count: formatNumber(freeze.count, locale) })
      : t('lesson.streak.freeze', { done: formatNumber(freeze.done, locale), per: formatNumber(freeze.per, locale) });

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="lesson-streak-day">
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View style={{ opacity, transform: [{ scale }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="flame" size={FLAME} color={colors.gold} />
        </Animated.View>
        {/* read as the day it now is, not the one it counts from */}
        <Text style={[styles.day, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLabel={t('lesson.streak.day', { n: formatNumber(day, locale) })}>
          {t('lesson.streak.day', { n: formatNumber(shown, locale) })}
        </Text>
        {typeof streak.daysLearned === 'number' ? (
          <Text style={[styles.line, { color: colors.textSecondary }]}>{t('lesson.streak.body', { days: formatNumber(streak.daysLearned, locale) })}</Text>
        ) : null}
        {freeze && freezeWords ? (
          <View style={styles.freeze} accessible accessibilityLabel={freezeWords}>
            <View style={[styles.freezeHead, { flexDirection: dir.row }]}>
              <Icon name="ice" size={18} color={colors.textSecondary} />
              <Text style={[styles.freezeText, dir.text, { color: colors.textPrimary }]}>{freezeWords}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.controlTrack }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.fill, { backgroundColor: colors.gold, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]} />
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        <ClayButton label={t('common.continue')} tone="primary" size="large" onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  day: { ...display(typography.sizes.xxl), textAlign: 'center', fontVariant: ['tabular-nums'] },
  line: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  freeze: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  freezeHead: { alignItems: 'center', gap: spacing.sm },
  freezeText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: radii.pill },
  bar: { padding: spacing.lg },
});
