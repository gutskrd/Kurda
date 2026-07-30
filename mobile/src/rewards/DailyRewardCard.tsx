import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';

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
    <View style={styles.card}>
      <Text style={styles.heading}>Daily Zêr</Text>
      <View style={styles.row}>
        {status.schedule.map((amount, i) => {
          const day = i + 1;
          const state = cellState(day);
          const bonus = day === status.schedule.length;
          return (
            <View
              key={day}
              style={[
                styles.cell,
                bonus && styles.cellBonus,
                state === 'claimed' && styles.cellClaimed,
                state === 'today' && styles.cellToday,
              ]}
            >
              <Text style={[styles.cellDay, state !== 'upcoming' && styles.cellDayActive]}>
                {state === 'claimed' ? '✓' : `D${day}`}
              </Text>
              <Text style={[styles.cellAmount, state !== 'upcoming' && styles.cellDayActive]}>{amount}</Text>
            </View>
          );
        })}
      </View>

      {status.canClaim ? (
        <Pressable onPress={claim} disabled={claiming} style={styles.claim}>
          {claiming ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.claimText}>Claim {status.reward} Zêr</Text>
          )}
        </Pressable>
      ) : (
        <Text style={styles.done}>
          {justEarned != null ? `+${justEarned} Zêr claimed!` : 'Come back tomorrow 🌙'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  heading: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, gap: 2 },
  cellBonus: { borderColor: colors.accent },
  cellClaimed: { backgroundColor: colors.success, borderColor: colors.success },
  cellToday: { borderColor: colors.primary, borderWidth: 2 },
  cellDay: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontWeight: typography.weights.bold },
  cellDayActive: { color: colors.textOnPrimary },
  cellAmount: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  claim: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  claimText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  done: { textAlign: 'center', color: colors.textSecondary, fontSize: typography.sizes.sm, paddingVertical: spacing.sm },
});
