import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { GoalPicker } from '../goals/GoalPicker';
import type { DailyGoalStatus, GoalOption } from '../goals/format';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { GoalRing } from '../leagues/GoalRing';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { learningStats, streakLabelKey, type Streak } from '../streak/format';
import { BottomSheet } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/** The ring in the bar: an icon's size. */
const RING = 24;

/**
 * Where today stands, in the top corner of Learn: the streak, the day's goal
 * as a ring filling up, and the Zêr in your pocket. Three glances' worth,
 * always in the same place, the way a learning app's corner is read — and
 * each one opens onto more: the streak's whole story, the goal (where it can
 * be changed), the shop.
 *
 * The numbers are plain. Nothing counts down and nothing warns about what
 * could be lost: a streak at zero shows a cold flame and says a lesson today
 * starts one. Some of the people reading it are children.
 */
export function LearnBar(): React.JSX.Element {
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

  // fresh each time Learn comes back into view: a lesson just finished moved all three
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        client.get<DailyGoalStatus>('/me/daily-goal'),
        client.get<{ user: { streak?: Streak } }>('/me'),
        client.get<{ balances: { zer: number } }>('/me/wallet'),
      ]).then(([g, me, wallet]) => {
        if (!active) return;
        if (g.ok) setGoal(g.data);
        if (me.ok && me.data.user.streak) setStreak(me.data.user.streak);
        if (wallet.ok) setZer(wallet.data.balances.zer);
        setSettled(true);
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

  const changeGoal = useCallback(
    async (next: GoalOption) => {
      setGoal((g) => (g ? { ...g, goal: next } : g));
      const res = await client.put<DailyGoalStatus>('/me/daily-goal', { goal: next });
      if (res.ok) setGoal(res.data);
    },
    [client],
  );

  const days = streak?.current ?? 0;
  const lit = days > 0;
  const streakWords = lit ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');
  const goalWords = goal
    ? goal.completed
      ? t('learn.today.goalMet')
      : t('learn.today.goal', { xp: formatNumber(goal.earnedXp, locale), goal: formatNumber(goal.effectiveGoal, locale) })
    : '';
  const show = (which: 'streak' | 'goal') => {
    haptic('select');
    setOpen(which);
  };

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
          style={({ pressed }) => [styles.stat, { flexDirection: dir.row, opacity: pressed ? 0.6 : 1 }]}
          testID="learn-bar-streak"
        >
          <Icon name="flame" size={22} color={lit ? colors.goldText : colors.textSecondary} />
          <Text style={[styles.number, { color: lit ? colors.textPrimary : colors.textSecondary }]}>{formatNumber(days, locale)}</Text>
        </Pressable>
      ) : null}
      {goal ? (
        <Pressable
          onPress={() => show('goal')}
          accessibilityRole="button"
          accessibilityLabel={goalWords}
          style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.6 : 1 }]}
          testID="learn-bar-goal"
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <GoalRing xp={goal.earnedXp} goal={goal.effectiveGoal} size={RING} tint={[colors.gold, colors.goldText]} showNumbers={false} />
          </View>
        </Pressable>
      ) : null}
      {zer !== null ? (
        <Pressable
          onPress={() => navigation.navigate('Shop')}
          accessibilityRole="button"
          accessibilityLabel={t('learn.bar.zer', { count: formatNumber(zer, locale) })}
          style={({ pressed }) => [styles.stat, { flexDirection: dir.row, opacity: pressed ? 0.6 : 1 }]}
          testID="learn-bar-zer"
        >
          <Icon name="coin" size={22} color={colors.gold} />
          <Text style={[styles.number, { color: colors.textPrimary }]}>{formatNumber(zer, locale)}</Text>
        </Pressable>
      ) : null}

      <BottomSheet visible={open === 'streak'} onClose={() => setOpen(null)} title={t('profile.stat.streak')} icon="flame">
        {streak ? <StreakDetail streak={streak} words={streakWords} lit={lit} /> : null}
      </BottomSheet>
      <BottomSheet visible={open === 'goal'} onClose={() => setOpen(null)} title={t('learn.today.title')} icon="bolt">
        {goal ? (
          <View style={styles.sheetBody}>
            <View style={[styles.goalHead, { flexDirection: dir.row }]}>
              <GoalRing xp={goal.earnedXp} goal={goal.effectiveGoal} size={56} tint={[colors.gold, colors.goldText]} showNumbers={false} />
              <Text style={[styles.goalWords, dir.text, { color: colors.textPrimary }]}>{goalWords}</Text>
            </View>
            <Text style={[styles.caption, dir.text, { color: colors.textSecondary }]}>{t('learn.today.goalSetting', { xp: goal.goal })}</Text>
            <GoalPicker value={goal.goal} onChange={(next) => void changeGoal(next)} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

/** The streak's whole story: how long it is, and the three numbers that never go down. */
function StreakDetail({ streak, words, lit }: { streak: Streak; words: string; lit: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const stats = learningStats(streak);
  const cells = [
    { label: t('profile.stat.longestStreak'), value: stats.longest },
    { label: t('profile.stat.daysLearned'), value: stats.daysLearned },
    { label: t('profile.stat.freezes'), value: stats.freezes },
  ];
  return (
    <View style={styles.sheetBody}>
      <View style={[styles.streakHead, { flexDirection: dir.row }]}>
        <Icon name="flame" size={40} color={lit ? colors.goldText : colors.textSecondary} />
        <Text style={[styles.streakWords, dir.text, { color: colors.textPrimary }]}>{words}</Text>
      </View>
      <View style={[styles.cells, { flexDirection: dir.row }]}>
        {cells.map((cell) => (
          <View key={cell.label} style={[styles.cell, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${cell.value} ${cell.label}`}>
            <Text style={[styles.cellValue, { color: colors.textPrimary }]}>{formatNumber(cell.value, locale)}</Text>
            <Text style={[styles.cellLabel, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.caption, dir.text, { color: colors.textSecondary }]}>{t('profile.freezeHint', { count: stats.sessionsPerFreeze })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', gap: spacing.xs },
  // each stat is a 44pt target however small its number
  stat: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  number: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.sm },
  goalHead: { alignItems: 'center', gap: spacing.md },
  goalWords: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  streakHead: { alignItems: 'center', gap: spacing.sm },
  streakWords: { flex: 1, ...display(typography.sizes.xl) },
  cells: { gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.md },
  cellValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  cellLabel: { fontSize: typography.sizes.xs, textAlign: 'center' },
  caption: { fontSize: typography.sizes.xs, lineHeight: 18 },
});
