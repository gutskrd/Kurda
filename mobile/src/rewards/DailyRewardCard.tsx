import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface DailyStatus {
  canClaim: boolean;
  claimableDay: number;
  reward: number;
  schedule: number[];
  alreadyClaimedToday: boolean;
  cycleDay: number;
}

type CellState = 'claimed' | 'today' | 'upcoming';

/** Login calendar + daily Zêr claim (KUR-067). */
export function DailyRewardCard() {
  const { client } = useAuth();
  const { colors } = useTheme();
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
    if (res.ok) {
      setJustEarned(res.data.reward);
      load();
    }
  }, [client, load]);

  if (!status) return null;

  const cellState = (day: number): CellState => {
    if (status.canClaim) {
      if (day < status.claimableDay) return 'claimed';
      if (day === status.claimableDay) return 'today';
      return 'upcoming';
    }
    return day <= status.cycleDay ? 'claimed' : 'upcoming';
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Daily Zêr</Text>
      <View style={styles.row}>
        {status.schedule.map((amount, i) => {
          const day = i + 1;
          const state = cellState(day);
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

      {status.canClaim ? (
        <Pressable onPress={claim} disabled={claiming} style={[styles.claim, { backgroundColor: colors.primary }]}>
          {claiming ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={[styles.claimText, { color: colors.textOnPrimary }]}>Claim {status.reward} Zêr</Text>
          )}
        </Pressable>
      ) : (
        <Text style={[styles.done, { color: colors.textSecondary }]}>
          {justEarned != null ? `+${justEarned} Zêr claimed!` : 'Come back tomorrow'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 1, gap: 2 },
  cellToday: { borderWidth: 2 },
  cellDay: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  cellAmount: { fontSize: typography.sizes.xs },
  claim: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  claimText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  done: { textAlign: 'center', fontSize: typography.sizes.sm, paddingVertical: spacing.sm },
});
