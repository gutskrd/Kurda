import { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { giftMeaning, reactionDelayMs } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { sayReactionLater } from '../characters/reactions';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { cellState, dailyAction, dailyClaimed, hasDailyZer, type DailyClaim, type DailyStatus } from '../rewards/daily';
import { plusPitchAllowed } from '../gifts/nudges';
import { ConfettiBurst, GlowRing, useCelebration } from '../theme/CelebrationParts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography, wash } from '../theme/tokens';

const COIN = 36;
const COIN_STAGE = 44;

/**
 * Today's Zêr inside the daily view, as on the website: the day's reward with a claim button (the server sets the
 * amount), a lesson first until one is finished today, or tomorrow once taken, and the cycle as a quiet row of coins.
 * A claim plays the app's celebration around the coin once, with a word from Xezo, and tells the rest of the app
 * (`dailyClaimed`), so Learn's purse shows the new Zêr. The Zêr is a Hevalo+ member's; everyone claims the day for a
 * small gift in the gift bag, said with the claim, and a free account the server knows is an adult hears with its claim
 * that members also earn Zêr here, while Hevalo+ is on sale.
 */
export function DailyZer({ daily, onClaimed, onLearn }: { daily: DailyStatus; onClaimed: (daily: DailyStatus) => void; onLearn?: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const member = hasDailyZer(daily);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<DailyClaim | null>(null);
  const action = dailyAction(daily);
  const n = (v: number) => formatNumber(v, locale);
  const reduce = useReducedMotion();
  useEffect(() => (landed ? sayReactionLater(reactionDelayMs('celebration', reduce), { moment: 'daily-zer' }) : undefined), [landed, reduce]);

  const claim = useCallback(async () => {
    setBusy(true);
    const res = await client.post<DailyClaim & { cycleDay: number }>('/rewards/daily/claim');
    setBusy(false);
    if (res.ok) {
      setLanded(res.data);
      dailyClaimed();
      onClaimed({ ...daily, canClaim: false, alreadyClaimedToday: true, cycleDay: res.data.cycleDay ?? daily.claimableDay });
      return;
    }
    // Refused (a status from before midnight, nothing learned today): the view asks again and says what is needed.
    onClaimed(daily);
  }, [client, daily, onClaimed]);

  const gift = landed?.bagGift ?? null;
  const giftMeant = gift ? giftMeaning(gift.sku, locale) : null;
  const giftWords = gift ? t('daily.gift.landed', { item: giftMeant ? `${gift.name} (${giftMeant})` : gift.name }) : null;
  const words = member
    ? landed
      ? t('rewards.claimedZer', { amount: n(landed.reward) })
      : action === 'claim'
        ? t('daily.dayReward', { day: n(daily.claimableDay), amount: n(daily.reward) })
        : action === 'learnFirst'
          ? t('daily.learnFirst', { amount: n(daily.reward) })
          : t('daily.comeBack')
    : landed
      ? (giftWords ?? t('daily.gift.full'))
      : action === 'claim'
        ? t('daily.gift.claim')
        : action === 'learnFirst'
          ? t('daily.gift.learnFirst')
          : t('daily.comeBack');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="daily-zer">
      <View style={[styles.top, { flexDirection: dir.row }]}>
        <View style={[styles.coin, { backgroundColor: wash(colors.gold) }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {member ? landed ? <ClaimedCoin /> : <Icon name="coin" size={COIN} /> : <Icon name="gift" size={COIN - 12} color={colors.goldText} />}
        </View>
        <View style={styles.words}>
          <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t(member ? 'daily.title' : 'daily.gift.title')}
          </Text>
          <Text style={[styles.line, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion={landed ? 'polite' : undefined}>
            {words}
          </Text>
          {member && giftWords ? <Text style={[styles.line, dir.text, { color: colors.textSecondary }]}>{giftWords}</Text> : null}
          {!member && landed && plusPitchAllowed(landed.nudges) ? (
            <Text style={[styles.line, dir.text, { color: colors.textSecondary }]}>{t('gift.membersEarnZer')}</Text>
          ) : null}
          {member ? (
          <View style={[styles.cycle, { flexDirection: dir.row }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {daily.schedule.map((_, i) => {
              const cell = cellState(daily, i + 1);
              return (
                <View
                  key={i}
                  style={[
                    styles.cycleDay,
                    cell === 'claimed'
                      ? { backgroundColor: colors.gold }
                      : { borderWidth: cell === 'today' ? 2 : 1.5, borderColor: cell === 'today' ? colors.gold : colors.lockedMark },
                  ]}
                />
              );
            })}
          </View>
          ) : null}
        </View>
        {action === 'claim' ? (
          <ClayButton label={t('daily.claimNow')} tone="primary" busy={busy} onPress={() => void claim()} testID="daily-claim" />
        ) : action === 'claimed' ? (
          <View style={[styles.done, { backgroundColor: colors.gold }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Icon name="check" size={18} color={colors.textOnGold} />
          </View>
        ) : null}
      </View>
      {action === 'learnFirst' && onLearn ? (
        <View style={[styles.under, { flexDirection: dir.row }]}>
          <ClayButton label={t('daily.goLearn')} variant="outline" onPress={onLearn} />
        </View>
      ) : null}
    </View>
  );
}

/** The coin after a claim: it springs in with the ring and flecks the app celebrates with, once; under Reduce Motion it fades in. */
function ClaimedCoin(): React.JSX.Element {
  const { colors } = useTheme();
  const moment = useCelebration();
  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.stage} testID="daily-zer-landed">
      {moment.plan.travel ? <GlowRing progress={moment.ring} colour={colors.gold} size={COIN_STAGE + 16} /> : null}
      {moment.plan.travel ? <ConfettiBurst progress={moment.burst} count={8} seed={7} colours={[colors.primary, colors.textSecondary]} reach={40} /> : null}
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Icon name="coin" size={COIN} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.md, gap: spacing.sm },
  top: { alignItems: 'center', gap: spacing.sm + 4 },
  coin: { width: COIN_STAGE, height: COIN_STAGE, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  stage: { width: COIN_STAGE, height: COIN_STAGE, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, gap: 3 },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  line: { fontSize: typography.sizes.text, lineHeight: 21 },
  cycle: { gap: 5, marginTop: 4 },
  cycleDay: { width: 8, height: 8, borderRadius: radii.pill },
  done: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  under: { paddingStart: COIN_STAGE + spacing.sm + 4 },
});
