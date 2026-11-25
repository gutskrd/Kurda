import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { PLUS_ON_SALE, fireLevel, fireSizeToFit, type StreakRepairOffer } from '@kurda/shared';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { formatDay, formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import type { Streak } from '../streak/format';
import { repairLastDay, repairRefusal, winBackProgress, wonBackToday, type RepairResult } from '../streak/repair';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** The days whose won-back streak this app has greeted, so the moment plays once a day rather than at every look. */
const greeted = new Set<string>();

/** Whether to greet a streak won back today, once; a restore the learner made here counts as greeted. */
export function takeWonBack(streak: Pick<Streak, 'restored'>, today: string): boolean {
  if (!wonBackToday(streak, today) || greeted.has(today)) return false;
  greeted.add(today);
  return true;
}

/**
 * The offer to win an ended streak back, quietly: one sentence naming the streak, what wins it back (three lessons or
 * practice sessions in one day) and the last day, with today's sessions as a row of marks. A restore is never bought;
 * a Hevalo+ member with this month's free restore also has one button. No countdown and nothing about loss. The server
 * decides: a refusal is read by `repairRefusal`, and the offer gives way to a sentence once the streak can no longer
 * be won back.
 */
export function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: Streak) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [free, setFree] = useState(offer.free);

  const restore = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const res = await client.post<RepairResult>('/me/streak/repair');
    setBusy(false);
    if (res.ok) {
      onRestored(res.data.streak);
      return;
    }
    // Asked for and refused: felt as the error it is, and said in words.
    haptic('error');
    const why = repairRefusal(res.error.code);
    if (why === 'learn') setFree(false);
    else if (why === 'gone') setGone(true);
    else setProblem(describeError(res.error, t));
  }, [client, onRestored, t]);

  const lastDay = repairLastDay(offer);
  const { done, needed } = winBackProgress(offer);
  const count = (n: number) => formatNumber(n, locale);
  if (gone) {
    return (
      <View style={[styles.offer, { backgroundColor: colors.surface }]} testID="streak-repair">
        <Text style={[styles.offerText, dir.text, { color: colors.textPrimary }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {t('streak.repair.gone')}
        </Text>
      </View>
    );
  }
  const progress = t('streak.repair.progress', { done: count(done), needed: count(needed) });
  return (
    <View style={[styles.offer, { backgroundColor: colors.surface }]} testID="streak-repair">
      <Text style={[styles.offerText, dir.text, { color: colors.textPrimary }]}>
        {t('streak.repair.offer', { count: count(offer.days), sessions: count(needed), date: lastDay ? formatDay(lastDay, locale) : '' })}
      </Text>
      <View style={[styles.progress, { flexDirection: dir.row }]} accessible accessibilityLabel={progress} testID="streak-repair-progress">
        <View style={[styles.marks, { flexDirection: dir.row }]}>
          {Array.from({ length: needed }, (_, i) => (
            <View
              key={i}
              style={[styles.mark, i < done ? { backgroundColor: colors.textPrimary } : { borderWidth: 1.5, borderColor: colors.lockedMark }]}
            />
          ))}
        </View>
        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{progress}</Text>
      </View>
      {free ? (
        <View style={{ flexDirection: dir.row }}>
          <ClayButton label={t('streak.repair.restoreFree')} variant="outline" busy={busy} onPress={() => void restore()} />
        </View>
      ) : PLUS_ON_SALE ? (
        <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('streak.repair.plusPitch')}</Text>
      ) : null}
      {problem ? (
        <Text style={[styles.hint, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/** The restored streak's fire, framed in a square this big inside the glow it arrives in. */
const BACK_FIRE = 96;
const BACK_STAGE = 150;

/**
 * The restored streak, in the head's place: its fire arrives with `useCelebration` (spring, ring, flecks, success
 * haptic and chime), then the text, which says how it came back. Under Reduce Motion the fire fades in. The headline is
 * announced as it lands.
 */
export function Restored({ streak, wonBack = false }: { streak: Streak; wonBack?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const moment = useCelebration();
  const level = fireLevel(streak.current);
  const title = t('streak.repair.restoredTitle', { count: formatNumber(streak.current, locale) });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(title);
    // Said once, as it arrives.
  }, []);

  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.back} testID="streak-restored">
      <View style={styles.backStage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SoftGlow colour={colors.gold} size={BACK_STAGE} id="streak-back-glow" />
        {moment.plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={BACK_STAGE * 0.62} /> : null}
        {moment.plan.travel ? (
          <ConfettiBurst progress={moment.burst} count={10} seed={streak.current} colours={[colors.primary, colors.textSecondary]} reach={BACK_STAGE * 0.6} testID="streak-restored-burst" />
        ) : null}
        <Animated.View style={{ opacity, transform: [{ scale }] }}>
          <Fire size={fireSizeToFit(level.stage, BACK_FIRE, BACK_FIRE)} level={level} framed />
        </Animated.View>
      </View>
      <Text style={[styles.backTitle, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.backLine, { color: colors.textSecondary }]}>{t(wonBack ? 'streak.repair.wonBackBody' : 'streak.repair.restoredBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offer: { gap: spacing.sm + 2, padding: spacing.md, borderRadius: radii.lg },
  offerText: { fontSize: typography.sizes.text, lineHeight: 21 },
  progress: { alignItems: 'center', gap: spacing.sm },
  marks: { gap: spacing.xs + 2 },
  mark: { width: 10, height: 10, borderRadius: radii.pill },
  hint: { fontSize: typography.sizes.text, lineHeight: 22 },
  back: { alignItems: 'center', gap: spacing.xs },
  backStage: { width: BACK_STAGE, height: BACK_STAGE, alignItems: 'center', justifyContent: 'center' },
  backTitle: { ...display(typography.sizes.text), textAlign: 'center' },
  backLine: { fontSize: typography.sizes.text, lineHeight: 21, textAlign: 'center' },
});
