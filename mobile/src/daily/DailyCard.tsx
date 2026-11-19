import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { fireLevel, fireSizeToFit } from '@kurda/shared';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { dailyAction } from '../rewards/daily';
import { Fire } from '../theme/Fire';
import { Icon } from '../theme/Icon';
import { Pressable } from '../theme/Pressable';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { pressedDim } from '../theme/motion';
import { radii, spacing, typography } from '../theme/tokens';
import { DailySheet } from './DailySheet';
import { useToday } from './today';
import { WeekRow, thisWeek } from './WeekRow';

/** The small fire's square on the card. */
const CARD_FIRE = 44;

/**
 * The daily view's card at the top of Home, as on the website: the small fire with the streak, this week as seven
 * dots, and today's Zêr in one mark (to claim, after a lesson, or taken). One press opens the whole view
 * (`DailySheet`). It is asked for again each time Home comes back, and gives up its place if the view cannot be had.
 */
export function DailyCard({ onLearn }: { onLearn?: () => void }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const today = useToday();
  const [open, setOpen] = useState(false);
  // The first focus is the first load; each later one asks again, since a lesson may have changed the day.
  const { reload } = today;
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) reload();
      seen.current = true;
    }, [reload]),
  );

  const view = today.view;
  if (!view) return today.failed ? null : <Skeleton height={68} radius={radii.lg} />;
  const days = view.streak.current;
  const n = (v: number) => formatNumber(v, locale);
  const action = dailyAction(view.daily);
  const level = fireLevel(days);
  const streakWords = days > 0 ? t(days === 1 ? 'streak.day' : 'streak.days', { count: n(days) }) : t('learn.today.streakStart');
  const zerWords =
    action === 'claim'
      ? t('daily.card.claim', { amount: n(view.daily.reward) })
      : action === 'learnFirst'
        ? t('daily.card.learn', { amount: n(view.daily.reward) })
        : t('daily.card.taken');
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${streakWords}. ${zerWords}`}
        testID="daily-card"
        style={({ pressed }) => [styles.card, { flexDirection: dir.row, backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
      >
        <View style={styles.fire} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Fire size={fireSizeToFit(level.stage, CARD_FIRE, CARD_FIRE)} level={level} framed />
        </View>
        <View style={styles.words}>
          <Text style={[styles.number, dir.text, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            {n(days)}
          </Text>
          <Text style={[styles.unit, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {days === 1 ? t('daily.view.unitOne') : t('daily.view.unit')}
          </Text>
        </View>
        {/* Beside today's mark, at the reading end of the space between. */}
        <View style={[styles.week, { alignItems: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]}>
          <WeekRow week={thisWeek(view.days, view.today, view.weekStart)} mini />
        </View>
        <View
          style={[
            styles.zer,
            { flexDirection: dir.row },
            action === 'claim' ? { backgroundColor: colors.gold } : { borderWidth: 1, borderColor: colors.lockedMark },
          ]}
          testID={`daily-card-${action}`}
        >
          <Icon name="coin" size={18} />
          {action === 'claimed' ? (
            <Icon name="check" size={14} color={colors.success} />
          ) : (
            <Text style={[styles.zerText, { color: action === 'claim' ? colors.textOnGold : colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
              +{n(view.daily.reward)}
            </Text>
          )}
        </View>
        <Icon name={dir.rtl ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textSecondary} />
      </Pressable>
      <DailySheet visible={open} onClose={() => setOpen(false)} today={today} onLearn={onLearn} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm + 6, borderRadius: radii.lg },
  fire: { width: CARD_FIRE, height: CARD_FIRE, alignItems: 'center', justifyContent: 'center' },
  words: { minWidth: 0 },
  number: { fontSize: 24, lineHeight: 26, fontWeight: '800' },
  unit: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  week: { flex: 1 },
  zer: { alignItems: 'center', gap: 4, minHeight: 28, paddingStart: 6, paddingEnd: 10, borderRadius: radii.pill },
  zerText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
});
