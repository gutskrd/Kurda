import { useI18n } from '../i18n/I18nContext';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { cellState, dailyAction, type DailyStatus } from './daily';

/**
 * The daily Zêr calendar and claim (KUR-067).
 *
 * The reward is paid for learning: until a lesson or practice session has been
 * finished today, the card says so instead of offering a claim the server would
 * refuse. It sits on the Learn screen, above the lessons it is asking for.
 */
export function DailyRewardCard() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justEarned, setJustEarned] = useState<number | null>(null);

  const load = useCallback(() => {
    void client.get<DailyStatus>('/rewards/daily').then((res) => {
      if (res.ok) setStatus(res.data);
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const claim = useCallback(async () => {
    setClaiming(true);
    const res = await client.post<{ reward: number }>('/rewards/daily/claim');
    setClaiming(false);
    if (res.ok) setJustEarned(res.data.reward);
    // refused (say, the status was stale and nothing was learned today yet):
    // read it again, so the card says what is needed instead
    load();
  }, [client, load]);

  if (!status) return null;
  const action = dailyAction(status);

  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>{t('daily.title')}</Text>
      <View style={styles.row}>
        {status.schedule.map((amount, i) => {
          const day = i + 1;
          const state = cellState(status, day);
          const bonus = day === status.schedule.length;
          const active = state !== 'upcoming';
          const borderColor =
            state === 'claimed' ? colors.success : state === 'today' ? colors.primary : bonus ? colors.accent : colors.glassBorder;
          const textColor = active ? colors.textOnPrimary : colors.textSecondary;
          return (
            <View
              key={day}
              style={[
                styles.cell,
                { borderColor, backgroundColor: state === 'claimed' ? colors.success : colors.glassFill },
                state === 'today' && styles.cellToday,
              ]}
            >
              <Text style={[styles.cellDay, { color: textColor }]}>{state === 'claimed' ? '✓' : `D${day}`}</Text>
              <Text style={[styles.cellAmount, { color: textColor }]}>{amount}</Text>
            </View>
          );
        })}
      </View>

      {action === 'claim' ? (
        <ClayButton
          label={t('rewards.claimZer', { amount: status.reward })}
          tone="primary"
          busy={claiming}
          onPress={claim}
        />
      ) : action === 'learnFirst' ? (
        <Text style={[styles.done, { color: colors.textPrimary }]}>{t('daily.learnFirst', { amount: status.reward })}</Text>
      ) : (
        <Text style={[styles.done, { color: colors.textSecondary }]}>
          {justEarned != null ? t('rewards.claimedZer', { amount: justEarned }) : t('rewards.comeBackTomorrow')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 1, gap: 2 },
  cellToday: { borderWidth: 2 },
  cellDay: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  cellAmount: { fontSize: typography.sizes.xs },
  done: { textAlign: 'center', fontSize: typography.sizes.sm, paddingVertical: spacing.sm },
});
