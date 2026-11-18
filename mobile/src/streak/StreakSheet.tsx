import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { fireLadder, fireLevel, fireSizeToFit, type FireLadderPlace, type StreakRepairOffer } from '@kurda/shared';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { formatDay, formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography, wash } from '../theme/tokens';
import { FIRE_STAGE_NAME } from './fireWords';
import { learningStats, streakLabelKey, type Streak } from './format';
import { freezeSlots } from './kept';
import { gemsShort, repairLastDay, repairRefusal, type RepairResult } from './repair';

/**
 * The streak in a sheet: its length, beside it the numbers a missed day never resets (longest run, days learned,
 * freezes earned with their cost), and under them the ladder of fire stages. The streak never stands alone, since
 * it is the number most likely to discourage after a lapse. Opened from Learn's fire and the profile; `streak`
 * null keeps it closed.
 *
 * While an ended streak can be restored (`streak.repair`), the sheet says so once, plainly: which streak, the
 * last day, and one button with the cost. No countdown and nothing about loss. `onRestored` passes the restored
 * streak to the opener.
 */
export function StreakSheet({ streak, onClose, onRestored }: { streak: Streak | null; onClose: () => void; onRestored?: (streak: Streak) => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <BottomSheet visible={streak !== null} onClose={onClose} title={t('profile.stat.streak')} contentStyle={styles.scroller}>
      {streak ? <StreakBody streak={streak} onRestored={onRestored} /> : null}
    </BottomSheet>
  );
}

/** The open sheet's content, mounted only while open, so the just-restored state is forgotten on close. */
function StreakBody({ streak, onRestored }: { streak: Streak; onRestored?: (streak: Streak) => void }): React.JSX.Element {
  const [restored, setRestored] = useState<Streak | null>(null);
  const shown = restored ?? streak;
  const offer = restored ? null : (streak.repair ?? null);
  const done = useCallback(
    (next: Streak) => {
      setRestored(next);
      onRestored?.(next);
    },
    [onRestored],
  );
  return (
    <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {restored ? <Restored streak={restored} /> : <StreakHead streak={streak} />}
      {offer ? <RepairOffer offer={offer} onRestored={done} /> : null}
      <StreakNumbers streak={shown} />
      <FireLadder days={shown.current} />
    </SheetScrollView>
  );
}

/** The fire beside the streak in words: framed in a square this big, whatever its stage. */
const HEAD_FIRE = 48;

function StreakHead({ streak }: { streak: Streak }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const days = streak.current;
  const level = fireLevel(days);
  const words = days > 0 ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');
  return (
    <View style={[styles.head, { flexDirection: dir.row }]}>
      <View style={styles.headFire}>
        <Fire size={fireSizeToFit(level.stage, HEAD_FIRE, HEAD_FIRE)} level={level} framed />
      </View>
      <Text style={[styles.words, dir.text, { color: colors.textPrimary }]}>{words}</Text>
    </View>
  );
}

/**
 * The offer to restore an ended streak: one sentence naming the streak and the last day, and one button with the
 * gem price, or free for a Hevalo+ member's monthly restore. When gems are known to be short the button is
 * disabled, with the balance and the shop's one line on earning gems above it. The server decides: a refusal is
 * read by `repairRefusal`, reloading the balance if gems were short after all, or replacing the offer with a
 * sentence if the streak can no longer be restored.
 */
function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: Streak) => void }): React.JSX.Element {
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
      <ClayButton
        label={offer.free ? t('streak.repair.restoreFree') : t('streak.repair.restoreFor', { count: count(offer.costGems) })}
        icon={offer.free ? undefined : 'gem'}
        tone="primary"
        size="large"
        busy={busy}
        disabled={short}
        onPress={() => void restore()}
      />
      {problem ? (
        <Text style={[styles.hint, dir.text, { color: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/** The restored streak's fire, framed in a square this big inside the glow it arrives in. */
const BACK_FIRE = 72;
const BACK_STAGE = 132;

/**
 * The restored streak: its fire arrives with `useCelebration` (spring, ring, flecks, success haptic and chime),
 * then the text. Under Reduce Motion the fire fades in. The headline is announced as it lands.
 */
function Restored({ streak }: { streak: Streak }): React.JSX.Element {
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
          <ConfettiBurst progress={moment.burst} count={10} seed={streak.current} colours={[colors.gold, colors.accent, colors.primary]} reach={BACK_STAGE * 0.6} testID="streak-restored-burst" />
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

function StreakNumbers({ streak }: { streak: Streak }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const stats = learningStats(streak);
  // A Hevalo+ member has room for a second freeze, and the hint says how many rather than "one".
  const room = freezeSlots(streak).max;
  const cells = [
    { label: t('profile.stat.longestStreak'), value: stats.longest },
    { label: t('profile.stat.daysLearned'), value: stats.daysLearned },
    { label: t('profile.stat.freezes'), value: stats.freezes },
  ];
  return (
    <>
      <View style={[styles.cells, { flexDirection: dir.row }]}>
        {cells.map((cell) => (
          <View key={cell.label} style={[styles.cell, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${cell.value} ${cell.label}`}>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatNumber(cell.value, locale)}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>
        {room > 1
          ? t('profile.freezeHintPlus', { count: stats.sessionsPerFreeze, max: formatNumber(room, locale) })
          : t('profile.freezeHint', { count: stats.sessionsPerFreeze })}
      </Text>
    </>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, TranslationKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** The square each ladder fire is framed to fill (so every stage reads and every row is as tall), and the disc it stands on. */
const RUNG_FIRE = 44;
const RUNG_ART = 52;

/**
 * The fire stages from spark to Newroz fire (shared `fireLadder`), each a small fire with its name and day:
 * reached ones burning with a check, the current one ringed and tagged "Now", later ones still and dimmed but
 * never greyed. Each is one element for screen readers. "Now" uses the app's violet for the current place; the
 * fires keep their gold.
 */
function FireLadder({ days }: { days: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.ladder} testID="fire-ladder">
      <Text style={[styles.ladderTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('fire.ladder.title')}
      </Text>
      {fireLadder(days).map((step) => {
        const name = t(FIRE_STAGE_NAME[step.stage]);
        const day = formatNumber(step.day, locale);
        const now = step.place === 'now';
        return (
          <View
            key={step.stage}
            style={[styles.rung, { flexDirection: dir.row }, now && { backgroundColor: wash(colors.primary) }]}
            accessible
            accessibilityLabel={t(PLACE_WORDS[step.place], { stage: name, count: day })}
            testID={`rung-${step.place}`}
          >
            <View style={[styles.rungArt, now && { borderColor: colors.primary }, step.place === 'ahead' && styles.ahead]}>
              <Fire size={fireSizeToFit(step.stage, RUNG_FIRE, RUNG_FIRE)} level={step.level} still={step.place === 'ahead'} framed />
            </View>
            <View style={styles.rungWords}>
              <View style={[styles.rungName, { flexDirection: dir.row }]}>
                <Text style={[styles.name, dir.text, { color: colors.textPrimary }]}>{name}</Text>
                {step.place === 'reached' ? <Icon name="check" size={16} color={colors.success} /> : null}
              </View>
              <Text style={[styles.day, dir.text, { color: colors.textSecondary }]}>{t('fire.ladder.day', { count: day })}</Text>
            </View>
            {now ? (
              <View style={[styles.now, { backgroundColor: colors.primary }]}>
                <Text style={[styles.nowText, { color: colors.textOnPrimary }]}>{t('fire.ladder.now')}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: { paddingHorizontal: 0 },
  body: { gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  head: { alignItems: 'center', gap: spacing.sm },
  headFire: { width: HEAD_FIRE, height: HEAD_FIRE, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, ...display(typography.sizes.xl) },
  cells: { gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.md },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, textAlign: 'center' },
  hint: { fontSize: typography.sizes.xs, lineHeight: 18 },
  offer: { gap: spacing.sm + 4, padding: spacing.md, borderRadius: radii.lg },
  offerText: { fontSize: typography.sizes.md, lineHeight: 22 },
  shortLines: { gap: spacing.xs },
  balance: { alignItems: 'center', gap: spacing.xs + 2 },
  balanceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  back: { alignItems: 'center', gap: spacing.sm },
  backStage: { width: BACK_STAGE, height: BACK_STAGE, alignItems: 'center', justifyContent: 'center' },
  backTitle: { ...display(typography.sizes.xl), textAlign: 'center' },
  backLine: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  ladder: { gap: 2, marginTop: spacing.xs },
  ladderTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, marginBottom: spacing.xs },
  rung: { alignItems: 'center', gap: spacing.sm + 4, minHeight: RUNG_ART + 4, padding: 2, borderRadius: radii.lg },
  rungArt: { width: RUNG_ART, height: RUNG_ART, borderRadius: radii.pill, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  // Still to come: quieter, never grey.
  ahead: { opacity: 0.5 },
  rungWords: { flex: 1, gap: 1 },
  rungName: { alignItems: 'center', gap: spacing.xs + 2 },
  name: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  day: { fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  now: { paddingVertical: 3, paddingHorizontal: spacing.sm + 2, borderRadius: radii.pill, marginHorizontal: spacing.sm },
  nowText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
