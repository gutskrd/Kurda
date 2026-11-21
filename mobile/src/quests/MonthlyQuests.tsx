import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { QuestDay } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { TONES } from '../coursemap/path';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { ease, timing, useCountUp } from '../theme/animate';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { monthProgress } from './model';

/** When the count starts climbing and the bar filling after the screen appears, and how long they take. */
const FILL_AT_MS = 350;
const FILL_MS = 700;
/** Xezo on the card, head to waist. */
const CHARACTER_HEIGHT = 108;

/**
 * The month's quests as a card: the count done of the month's possible so far, counting up on open over a bar of
 * the same (model.ts `monthProgress`), with "this month" said once in the corner. In a rare chest's saffron, with
 * Xezo at its end cheering when a chest waits. The bar fills with the count (a native-driver translate; the
 * count by frames, as `useCountUp` does); under Reduce Motion both are static. The text says everything Xezo
 * would, so screen readers skip her.
 */
export function MonthlyQuests({ day, cheer }: { day: QuestDay; cheer: boolean }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const tone = TONES[scheme].saffron;
  const { done, possible, share } = monthProgress(day);
  const count = useCountUp(done, { delayMs: FILL_AT_MS, ms: FILL_MS });
  const fill = useRef(new Animated.Value(reduce ? share : 0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (reduce) {
      fill.setValue(share);
      return;
    }
    const run = timing(fill, share, FILL_MS, { delay: FILL_AT_MS, easing: ease.emphasis });
    run.start();
    return () => run.stop();
  }, [reduce, share, fill]);
  // The fill slides in from the reading side, as every bar's fill does.
  const translateX = fill.interpolate({ inputRange: [0, 1], outputRange: [dir.rtl ? width : -width, 0] });
  const soFar = t('quests.monthly.soFar', { done: formatNumber(done, locale), possible: formatNumber(possible, locale) });

  return (
    <View style={[styles.card, { backgroundColor: tone.fill, flexDirection: dir.row }]} testID="quests-month">
      <View style={styles.words}>
        <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]}>{t('quests.monthly.title')}</Text>
        <Text style={[styles.title, dir.text, { color: tone.ink }]} accessibilityRole="header">
          {t('quests.month', { count: formatNumber(count, locale), possible: formatNumber(possible, locale) })}
        </Text>
        <View
          style={[styles.track, { backgroundColor: `${tone.lip}80` }]}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={soFar}
          accessibilityValue={{ min: 0, max: possible, now: done }}
        >
          <Animated.View style={[styles.fill, { backgroundColor: colors.gold, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]} />
        </View>
      </View>
      <View style={styles.character} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SpeakingCharacter speaker="xezo" player={null} playing={false} crop="half" height={CHARACTER_HEIGHT} flip={!dir.rtl} reaction={cheer ? 'cheer' : null} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'flex-end', gap: spacing.sm, borderRadius: radii.lg, paddingTop: spacing.md + 4, paddingHorizontal: spacing.md + 4 },
  words: { flex: 1, gap: spacing.xs, paddingBottom: spacing.md + 4 },
  eyebrow: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.86 },
  title: { ...display(typography.sizes.text), fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden', marginTop: spacing.xs },
  fill: { ...StyleSheet.absoluteFill, borderRadius: radii.pill },
  // She stands on the card's foot, her waist at its edge.
  character: { marginBottom: 0 },
});
