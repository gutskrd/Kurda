import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { fireLevel, fireSizeToFit, type StreakRepairOffer } from '@kurda/shared';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { formatDay, formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import type { Streak } from '../streak/format';
import { gemsShort, repairLastDay, repairRefusal, type RepairResult } from '../streak/repair';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * The offer to restore an ended streak, quietly: one sentence naming the streak and the last day, and one button with
 * the gem price, or free for a Hevalo+ member's monthly restore. No countdown and nothing about loss. When gems are
 * known to be short the button is disabled, with the balance and the shop's line on earning gems. The server decides:
 * a refusal is read by `repairRefusal`, reloading the balance if gems were short after all, or replacing the offer with
 * a sentence if the streak can no longer be restored.
 */
export function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: Streak) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [gems, setGems] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const readGems = useCallback(async () => {
    const res = await client.get<{ balances: { gems: number } }>('/me/wallet');
    if (res.ok) setGems(res.data.balances.gems);
  }, [client]);

  // A free restore needs no balance; a priced one says it only when the gems are short.
  useEffect(() => {
    if (!offer.free) void readGems();
  }, [offer.free, readGems]);

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
    if (why === 'short') await readGems();
    else if (why === 'gone') setGone(true);
    else setProblem(describeError(res.error, t));
  }, [client, onRestored, readGems, t]);

  const lastDay = repairLastDay(offer);
  const short = gemsShort(offer, gems);
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
  return (
    <View style={[styles.offer, { backgroundColor: colors.surface }]} testID="streak-repair">
      <Text style={[styles.offerText, dir.text, { color: colors.textPrimary }]}>
        {t('streak.repair.offer', { count: count(offer.days), date: lastDay ? formatDay(lastDay, locale) : '' })}
      </Text>
      {short && gems !== null ? (
        <View style={styles.shortLines}>
          <View style={[styles.balance, { flexDirection: dir.row }]}>
            <Icon name="gem" size={18} color={colors.textSecondary} />
            <Text style={[styles.balanceText, dir.text, { color: colors.textPrimary }]}>{t('streak.repair.gems', { count: count(gems) })}</Text>
          </View>
          <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('shop.earnMoreGems')}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: dir.row }}>
        <ClayButton
          label={offer.free ? t('streak.repair.restoreFree') : t('streak.repair.restoreFor', { count: count(offer.costGems) })}
          icon={offer.free ? undefined : 'gem'}
          variant="outline"
          busy={busy}
          disabled={short}
          onPress={() => void restore()}
        />
      </View>
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
 * haptic and chime), then the text. Under Reduce Motion the fire fades in. The headline is announced as it lands.
 */
export function Restored({ streak }: { streak: Streak }): React.JSX.Element {
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
      <Text style={[styles.backLine, { color: colors.textSecondary }]}>{t('streak.repair.restoredBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offer: { gap: spacing.sm + 2, padding: spacing.md, borderRadius: radii.lg },
  offerText: { fontSize: typography.sizes.text, lineHeight: 21 },
  shortLines: { gap: 2 },
  balance: { alignItems: 'center', gap: spacing.xs + 2 },
  balanceText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  hint: { fontSize: typography.sizes.text, lineHeight: 22 },
  back: { alignItems: 'center', gap: spacing.xs },
  backStage: { width: BACK_STAGE, height: BACK_STAGE, alignItems: 'center', justifyContent: 'center' },
  backTitle: { ...display(typography.sizes.text), textAlign: 'center' },
  backLine: { fontSize: typography.sizes.text, lineHeight: 21, textAlign: 'center' },
});
