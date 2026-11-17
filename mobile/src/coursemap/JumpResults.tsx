import { useEffect } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HevaloWindow } from '../characters/HevaloWindow';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { JumpOutcome } from '../lesson/types';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import type { JumpTestStart } from './JumpTestScreen';

/** Height of Hevalo's window above the result. */
const WINDOW = 180;

/**
 * The result of a jump-ahead test, as the server graded it. A pass opens the unit and Hevalo cheers; a miss says
 * the score plainly, never as a failure, with "Try again" while today's tries last, and no error buzz.
 */
export function JumpResults({
  test,
  outcome,
  onPath,
  onAgain,
}: {
  test: JumpTestStart['jump'];
  /** Null when the server sent none, which it always does for a test. */
  outcome: JumpOutcome | null;
  onPath: () => void;
  onAgain: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const passed = outcome?.passed === true;
  const n = formatNumber(test.unitNumber, locale);
  const correct = formatNumber(outcome?.correct ?? 0, locale);
  const total = formatNumber(outcome?.total ?? 0, locale);
  const title = passed ? t('coursemap.jump.passed', { n }) : t('coursemap.jump.notYet');
  const body = passed
    ? t('coursemap.jump.passedBody', { correct, total })
    : t('coursemap.jump.notYetBody', { correct, total, n, needed: formatNumber(Math.max(0, (outcome?.total ?? 0) - (outcome?.mistakesAllowed ?? 0)), locale) });

  // Only once, when the result opens.
  useEffect(() => {
    if (passed) haptic('celebrate');
    AccessibilityInfo.announceForAccessibility?.(title);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="jump-results">
      <ScrollView contentContainerStyle={styles.body}>
        <HevaloWindow size={WINDOW} flip={dir.rtl} reaction={passed ? 'cheer' : 'hmm'} />
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.line, { color: colors.textSecondary }]}>{body}</Text>
        {passed ? null : (
          <Text style={[styles.line, { color: colors.textSecondary }]}>
            {test.triesLeft > 0 ? t('coursemap.jump.triesLeft', { count: formatNumber(test.triesLeft, locale) }) : t('coursemap.jump.noTries')}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        {passed ? (
          <ClayButton label={t('coursemap.jump.go', { n })} tone="primary" size="large" onPress={onPath} />
        ) : (
          <>
            <ClayButton label={t('coursemap.jump.keepLearning')} tone="primary" size="large" onPress={onPath} />
            {test.triesLeft > 0 ? <ClayButton label={t('coursemap.jump.tryAgain')} variant="outline" size="large" onPress={onAgain} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  line: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
