import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { fireLevel } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useIntents } from '../api/optimistic';
import { DailySheet } from '../daily/DailySheet';
import { useToday } from '../daily/today';
import { GoalPicker } from '../goals/GoalPicker';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { GoalRing } from '../leagues/GoalRing';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabFocusLoad } from '../navigation/tabFocusLoad';
import { useDirection } from '../reports/direction';
import { streakLabelKey, type Streak } from '../streak/format';
import { BottomSheet } from '../theme/BottomSheet';
import { Fire } from '../theme/Fire';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { pressedDim } from '../theme/motion';

/** The ring in the bar: an icon's size. */
const RING = 24;

/**
 * Today's status in Learn's top corner: the streak, the daily goal as a filling ring with its XP beside it, as on the
 * website, and the Zêr balance, each opening more (the daily view, the goal picker, the shop). The numbers are plain: nothing counts down or warns
 * of loss, and a zero streak shows a cold fire saying a lesson today starts one. Some readers are children.
 *
 * The streak it reads is passed on (`onStreak`) for Learn's own moments; a new `reloadKey` reloads all three
 * (pull to refresh).
 */
export function LearnBar({ reloadKey = 0, onStreak }: { reloadKey?: number; onStreak?: (streak: Streak) => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [goal, setGoal] = useState<DailyGoalStatus | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const [open, setOpen] = useState<'streak' | 'goal' | null>(null);
  const today = useToday(open === 'streak');

  // Fresh each time Learn comes back from a lesson or any other page, since a lesson moves all three; a quick tab
  // switch keeps them (navigation/tabFocusLoad). The streak is only on GET /me.
  const load = useCallback(
    async (live: () => boolean) => {
      const [g, me, wallet] = await Promise.all([
        client.get<DailyGoalStatus>('/me/daily-goal'),
        client.get<{ user: { streak?: Streak } }>('/me'),
        client.get<{ balances: { zer: number } }>('/me/wallet'),
      ]);
      if (!live()) return false;
      if (g.ok) setGoal(g.data);
      if (me.ok && me.data.user.streak) {
        setStreak(me.data.user.streak);
        onStreak?.(me.data.user.streak);
      }
      if (wallet.ok) setZer(wallet.data.balances.zer);
      setSettled(true);
      return g.ok && me.ok && wallet.ok;
    },
    [client, reloadKey, onStreak],
  );
  useTabFocusLoad(load);

  // The choice is shown at once; the server's answer brings what follows from it (the ring's goal for today).
  const choosing = useIntents<'goal', GoalOption, DailyGoalStatus>(
    async (_key, next) => {
      const res = await client.put<DailyGoalStatus>('/me/daily-goal', { goal: next });
      if (res.ok) setGoal(res.data);
      return res;
    },
    { answered: (status) => status.goal },
  );
  const chosen = goal ? choosing.shown('goal', goal.goal) : null;
  const changeGoal = (next: GoalOption): void => {
    if (goal) choosing.want('goal', next, goal.goal);
  };

  const days = streak?.current ?? 0;
  const lit = days > 0;
  const streakWords = lit ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');
  const goalWords = goal
    ? goal.completed
      ? t('learn.today.goalMet')
      : t('learn.today.goal', { xp: formatNumber(goal.earnedXp, locale), goal: formatNumber(goal.effectiveGoal, locale) })
    : '';
  // A button that opens a sheet: the sheet arriving is the answer, not a buzz.
  const show = (which: 'streak' | 'goal') => setOpen(which);

  if (!settled) {
    return (
      <View style={[styles.bar, { flexDirection: dir.row }]}>
        <Skeleton width={44} height={24} radius={radii.pill} />
        <Skeleton width={RING} height={RING} radius={radii.pill} />
        <Skeleton width={64} height={24} radius={radii.pill} />
      </View>
    );
  }

  return (
    <View style={[styles.bar, { flexDirection: dir.row }]}>
      {streak ? (
        <Pressable
          onPress={() => show('streak')}
          accessibilityRole="button"
          accessibilityLabel={t('learn.bar.streak', { days: streakWords })}
          style={({ pressed }) => [styles.stat, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
          testID="learn-bar-streak"
        >
          <Fire size={24} level={fireLevel(days)} />
          <Text style={[styles.number, { color: lit ? colors.textPrimary : colors.textSecondary }]}>{formatNumber(days, locale)}</Text>
        </Pressable>
      ) : null}
      {goal ? (
        <Pressable
          onPress={() => show('goal')}
          accessibilityRole="button"
          accessibilityLabel={goalWords}
          style={({ pressed }) => [styles.stat, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
          testID="learn-bar-goal"
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <GoalRing xp={goal.earnedXp} goal={goal.effectiveGoal} size={RING} tint={[colors.gold, colors.goldText]} showNumbers={false} />
          </View>
          {/* A passed goal shows what was earned, not "130/20 XP". */}
          <Text style={[styles.number, { color: colors.textPrimary }]}>
            {goal.completed
              ? t('leagues.xpCount', { xp: formatNumber(goal.earnedXp, locale) })
              : t('learn.today.goalShort', { xp: formatNumber(goal.earnedXp, locale), goal: formatNumber(goal.effectiveGoal, locale) })}
          </Text>
        </Pressable>
      ) : null}
      {zer !== null ? (
        <Pressable
          onPress={() => navigation.navigate('Shop')}
          accessibilityRole="button"
          accessibilityLabel={t('learn.bar.zer', { count: formatNumber(zer, locale) })}
          style={({ pressed }) => [styles.stat, { flexDirection: dir.row, opacity: pressed ? pressedDim : 1 }]}
          testID="learn-bar-zer"
        >
          <Icon name="coin" size={22} color={colors.gold} />
          <Text style={[styles.number, { color: colors.textPrimary }]}>{formatNumber(zer, locale)}</Text>
        </Pressable>
      ) : null}

      <DailySheet
        visible={open === 'streak'}
        onClose={() => setOpen(null)}
        today={today}
        // A streak restored in the daily view is the streak everywhere: the bar's fire and Learn's own moments.
        onStreak={(next) => {
          setStreak(next);
          onStreak?.(next);
        }}
      />
      <BottomSheet visible={open === 'goal'} onClose={() => setOpen(null)} title={t('learn.today.title')} icon="bolt">
        {goal ? (
          <View style={styles.sheetBody}>
            <View style={[styles.goalHead, { flexDirection: dir.row }]}>
              <GoalRing xp={goal.earnedXp} goal={goal.effectiveGoal} size={56} tint={[colors.gold, colors.goldText]} showNumbers={false} />
              <Text style={[styles.goalWords, dir.text, { color: colors.textPrimary }]}>{goalWords}</Text>
            </View>
            <Text style={[styles.caption, dir.text, { color: colors.textSecondary }]}>
              {t('learn.today.goalSetting', { xp: formatNumber(chosen ?? goal.goal, locale) })}
            </Text>
            <GoalPicker value={chosen ?? goal.goal} onChange={changeGoal} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', gap: spacing.xs },
  // Each stat is a 44pt target however small its number.
  stat: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  number: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.sm },
  goalHead: { alignItems: 'center', gap: spacing.md },
  goalWords: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  caption: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
