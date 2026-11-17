import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { hueSteps } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useDirection } from '../reports/direction';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useCountUp } from '../theme/animate';
import { cellState, dailyAction, plusGemsOf, type DailyClaim, type DailyStatus } from './daily';
import { haptic } from '../feedback/haptics';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';

/**
 * The daily Zêr calendar and claim (KUR-067).
 *
 * The reward is paid for learning: until a lesson or practice session has been
 * finished today, the card says so instead of offering a claim the server would
 * refuse. It sits on the Learn screen, above the lessons it is asking for.
 *
 * On a day already claimed it is not there at all: the balance is in the
 * header, and a calendar with nothing to do in it is one more thing between
 * somebody and their next lesson.
 *
 * A Hevalo+ member's claim also brings a few gems. The card says so in one
 * quiet line: under the button while the claim is there to take, and under the
 * Zêr once it has been. Nobody else sees the line at all.
 *
 * The week's days say where they stand by more than their colour: a day
 * taken has a check where its name was, on the gold of everything earned
 * (the shared gold hue, its words in the hue's own deep shade); today is the
 * day you are on, a wash of the app's violet with a violet edge and its words
 * in the violet; the days to come stand quiet on the track. Taken days were
 * green, which in this app says a right answer. In Soranî and Arabic the week
 * runs from the right. Each day is read out whole: its name, its Zêr, and
 * whether it was taken.
 */
export function DailyRewardCard() {
  const { client } = useAuth();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justEarned, setJustEarned] = useState<DailyClaim | null>(null);
  // until the first answer, the card's place is held in grey; after a failed one it is given up
  const [settled, setSettled] = useState(false);

  const load = useCallback(() => {
    void client.get<DailyStatus>('/rewards/daily').then((res) => {
      if (res.ok) setStatus(res.data);
      setSettled(true);
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const claim = useCallback(async () => {
    setClaiming(true);
    const res = await client.post<DailyClaim>('/rewards/daily/claim');
    setClaiming(false);
    if (res.ok) {
      // the day's Zêr taken: a light knock as it counts up, nothing grander for something that comes every day
      haptic('tap');
      setJustEarned(res.data);
    }
    // refused (say, the status was stale and nothing was learned today yet):
    // read it again, so the card says what is needed instead
    load();
  }, [client, load]);

  if (!status) return settled ? null : <DailyRewardSkeleton />;
  const action = dailyAction(status);
  // a day already claimed when the screen opened has nothing to ask of anybody: the card steps aside for
  // the lessons; one claimed here stays to say what it brought (as on the website's wall)
  if (action === 'claimed' && justEarned == null) return null;
  // what a claim adds for a member, before it; what this one added, after it
  const plusGems = action === 'claim' ? plusGemsOf(status) : action === 'claimed' ? plusGemsOf(justEarned) : null;
  const gold = hueSteps(scheme, 'gold');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.heading, dir.text, { color: colors.textPrimary }]}>{t('daily.title')}</Text>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        {status.schedule.map((amount, i) => {
          const day = i + 1;
          const state = cellState(status, day);
          const name = t('daily.day', { day: formatNumber(day, locale) });
          const zer = formatNumber(amount, locale);
          const face = state === 'claimed' ? gold.wash : state === 'today' ? `${colors.primary}${TODAY_WASH}` : colors.controlTrack;
          const ink = state === 'claimed' ? gold.deep : state === 'today' ? colors.primary : colors.textSecondary;
          return (
            <View
              key={day}
              style={[styles.cell, { backgroundColor: face, borderColor: state === 'today' ? colors.primary : 'transparent' }]}
              accessible
              accessibilityLabel={[name, `${zer} Zêr`, state === 'claimed' ? t('events.claimed') : null].filter(Boolean).join(', ')}
            >
              {state === 'claimed' ? (
                <View style={styles.cellMark}>
                  <Icon name="check" size={12} color={ink} />
                </View>
              ) : (
                // "Day 3" in the reader's own language and digits, where there was a "D3" in every one; it shrinks before it is cut
                <Text style={[styles.cellDay, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {name}
                </Text>
              )}
              <Text style={[styles.cellAmount, { color: ink }, state !== 'upcoming' && styles.cellAmountStrong]}>{zer}</Text>
            </View>
          );
        })}
      </View>

      {action === 'claim' ? (
        // the quieter pill: on Learn the one solid button is the next lesson
        <ClayButton
          label={t('rewards.claimZer', { amount: status.reward })}
          icon="coin"
          busy={claiming}
          onPress={claim}
        />
      ) : action === 'learnFirst' ? (
        <Text style={[styles.done, { color: colors.textPrimary }]}>{t('daily.learnFirst', { amount: status.reward })}</Text>
      ) : (
        justEarned != null ? (
          <ClaimedLine amount={justEarned.reward} />
        ) : (
          <Text style={[styles.done, { color: colors.textSecondary }]}>{t('rewards.comeBackTomorrow')}</Text>
        )
      )}
      {plusGems !== null ? (
        <View style={[styles.plus, { flexDirection: dir.row }]} testID="daily-plus-gems">
          <Icon name="gem" size={16} color={colors.textSecondary} />
          <Text style={[styles.plusText, { color: colors.textSecondary }]}>{t('rewards.plusGems', { count: plusGems })}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The card in grey: its heading, the week's seven days, the button under them. */
function DailyRewardSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <SkeletonText size={typography.sizes.md} width={120} />
      <View style={styles.row}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} height={DAY_CELL} radius={radii.sm} style={styles.cellSkeleton} />
        ))}
      </View>
      <Skeleton height={MIN_TOUCH_TARGET} radius={radii.pill} />
    </View>
  );
}

/** a day: two 13pt lines, 2 between, 8 above and below, inside its 2pt edge */
const DAY_CELL = lineOf(typography.sizes.xs) * 2 + 2 + spacing.sm * 2 + 4;
/** How much of the violet today is, as the last two digits of its colour: the tab bar's own wash. */
const TODAY_WASH = '1F';

/** The Zêr just claimed, counting up to what was paid (theme/animate.ts); read out as the final amount. */
function ClaimedLine({ amount }: { amount: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const shown = useCountUp(amount);
  return (
    <Text style={[styles.done, { color: colors.textSecondary }]} accessibilityLabel={t('rewards.claimedZer', { amount })}>
      {t('rewards.claimedZer', { amount: shown })}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  // every day has the edge's room, so today's edge moves nothing
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 2, gap: 2 },
  cellSkeleton: { flex: 1 },
  cellDay: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  // as tall as the day's line it stands in for, so a day taken keeps its amount where the others have theirs
  cellMark: { height: 16, justifyContent: 'center' },
  cellAmount: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  cellAmountStrong: { fontWeight: typography.weights.semibold },
  done: { textAlign: 'center', fontSize: typography.sizes.sm, paddingVertical: spacing.sm },
  plus: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  plusText: { fontSize: typography.sizes.sm },
});
