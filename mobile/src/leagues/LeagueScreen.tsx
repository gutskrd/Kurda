import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { countdown, tierMeta, zoneFor, type Zone } from './format';

interface StandingRow {
  userId: string;
  username: string;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
}
interface LeagueView {
  tier: string;
  weekKey: string;
  rank: number;
  promoteCount: number;
  demoteCount: number;
  standings: StandingRow[];
}
interface BoardEntry {
  userId: string;
  username: string;
  score: number;
  rank: number;
}
interface Board {
  top: BoardEntry[];
  me: { rank: number; score: number } | null;
}

type Tab = 'league' | 'global' | 'friends';

const zoneColor: Record<Zone, string> = { promotion: colors.success, demotion: colors.danger, safe: colors.border };

/** League standings + global/friends leaderboards (KUR-064). */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const [tab, setTab] = useState<Tab>('league');
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [global, setGlobal] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      client.get<LeagueView>('/me/league'),
      client.get<Board>('/leaderboards/rating'),
    ]).then(([lg, gl]) => {
      if (lg.ok) setLeague(lg.data);
      if (gl.ok) setGlobal(gl.data);
      setLoading(false);
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));
  // live countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={onExit} hitSlop={10}><Text style={styles.close}>✕</Text></Pressable>
      <Text style={styles.title}>League</Text>
      <View style={{ width: 20 }} />
    </View>
  );

  const tabs = (
    <View style={styles.tabs}>
      {(['league', 'global', 'friends'] as Tab[]).map((t) => (
        <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
          <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
            {t === 'league' ? 'League' : t === 'global' ? 'Global' : 'Friends'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      {header}
      {tabs}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : tab === 'league' ? (
        <LeagueTab league={league} />
      ) : tab === 'global' ? (
        <BoardTab board={global} unit="rating" />
      ) : (
        <Centered>
          <Text style={styles.emoji}>👥</Text>
          <Text style={styles.ctaText}>Add friends to race them here.</Text>
          <Text style={styles.dim}>Friends leaderboards are coming soon.</Text>
        </Centered>
      )}
    </View>
  );
}

function LeagueTab({ league }: { league: LeagueView | null }) {
  if (!league) return <Centered><Text style={styles.dim}>No league yet.</Text></Centered>;
  const meta = tierMeta(league.tier);
  const total = league.standings.length;
  const self = league.standings.find((s) => s.isSelf);
  const notStarted = !self || self.weeklyXp === 0;

  return (
    <FlatList
      data={league.standings}
      keyExtractor={(s) => s.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.leagueHead}>
          <Text style={[styles.tierName, { color: meta.color }]}>{meta.emoji} {meta.label} League</Text>
          <Text style={styles.countdown}>Ends in {countdown(league.weekKey)} · UTC</Text>
          {notStarted ? (
            <Text style={styles.cta}>Do a lesson to enter this week’s race! 🚀</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const zone = zoneFor(item.rank, total, league.promoteCount, league.demoteCount);
        return (
          <View style={[styles.row, item.isSelf && styles.rowSelf, { borderLeftColor: zoneColor[zone], borderLeftWidth: 4 }]}>
            <Text style={styles.rank}>{item.rank}</Text>
            <InitialsAvatar name={item.username} id={item.userId} size={28} />
            <Text style={[styles.name, item.isSelf && styles.nameSelf]} numberOfLines={1}>{item.username}</Text>
            <Text style={styles.score}>{item.weeklyXp} XP</Text>
          </View>
        );
      }}
    />
  );
}

function BoardTab({ board, unit }: { board: Board | null; unit: string }) {
  if (!board) return <Centered><Text style={styles.dim}>No board yet.</Text></Centered>;
  return (
    <FlatList
      data={board.top}
      keyExtractor={(e) => e.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        board.me ? <Text style={styles.myRank}>You’re #{board.me.rank} · {board.me.score} {unit}</Text> : null
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.rank}>{item.rank}</Text>
          <InitialsAvatar name={item.username} id={item.userId} size={28} />
          <Text style={styles.name} numberOfLines={1}>{item.username}</Text>
          <Text style={styles.score}>{item.score}</Text>
        </View>
      )}
      ListEmptyComponent={<Centered><Text style={styles.dim}>Nobody ranked yet.</Text></Centered>}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  close: { fontSize: typography.sizes.lg, color: colors.textSecondary },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surface, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textSecondary },
  tabTextActive: { color: colors.textOnPrimary },
  list: { padding: spacing.lg, gap: spacing.xs },
  leagueHead: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  tierName: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  countdown: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  cta: { marginTop: spacing.sm, color: colors.accent, fontWeight: typography.weights.bold, textAlign: 'center' },
  myRank: { textAlign: 'center', color: colors.textPrimary, fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm },
  rowSelf: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  rank: { width: 28, textAlign: 'center', fontWeight: typography.weights.bold, color: colors.textSecondary },
  name: { flex: 1, fontSize: typography.sizes.md, color: colors.textPrimary },
  nameSelf: { fontWeight: typography.weights.bold },
  score: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textPrimary },
  emoji: { fontSize: 48 },
  ctaText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary, textAlign: 'center' },
  dim: { color: colors.textSecondary, textAlign: 'center' },
});
