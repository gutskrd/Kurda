import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palette';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact } from '../i18n/format';
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

const zoneColor = (colors: Palette): Record<Zone, string> => ({
  promotion: colors.success,
  demotion: colors.danger,
  safe: colors.glassBorder,
});

/** League standings + global/friends leaderboards (KUR-064). */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
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
      <Pressable onPress={onExit} hitSlop={10}><Text style={[styles.close, { color: colors.textSecondary }]}>✕</Text></Pressable>
      <Text style={[styles.title, { color: colors.primary }]}>League</Text>
      <View style={{ width: 20 }} />
    </View>
  );

  const tabs = (
    <View style={styles.tabs}>
      {(['league', 'global', 'friends'] as Tab[]).map((t) => {
        const active = tab === t;
        return (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, { backgroundColor: active ? colors.primary : colors.controlTrack }]}
          >
            <Text style={[styles.tabText, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>
              {t === 'league' ? 'League' : t === 'global' ? 'Global' : 'Friends'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <GradientBackground>
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
            <Text style={[styles.ctaText, { color: colors.textPrimary }]}>Add friends to race them here.</Text>
            <Text style={[styles.dim, { color: colors.textSecondary }]}>Friends leaderboards are coming soon.</Text>
          </Centered>
        )}
      </View>
    </GradientBackground>
  );
}

function LeagueTab({ league }: { league: LeagueView | null }) {
  const { locale } = useI18n();
  const { colors } = useTheme();
  if (!league) return <Centered><Text style={[styles.dim, { color: colors.textSecondary }]}>No league yet.</Text></Centered>;
  const meta = tierMeta(league.tier);
  const total = league.standings.length;
  const self = league.standings.find((s) => s.isSelf);
  const notStarted = !self || self.weeklyXp === 0;
  const zones = zoneColor(colors);

  return (
    <FlatList
      data={league.standings}
      keyExtractor={(s) => s.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.leagueHead}>
          <Text style={[styles.tierName, { color: meta.color }]}>{meta.emoji} {meta.label} League</Text>
          <Text style={[styles.countdown, { color: colors.textSecondary }]}>Ends in {countdown(league.weekKey)} · UTC</Text>
          {notStarted ? (
            <Text style={[styles.cta, { color: colors.accent }]}>Do a lesson to enter this week’s race! 🚀</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const zone = zoneFor(item.rank, total, league.promoteCount, league.demoteCount);
        return (
          <View
            style={[
              styles.row,
              { backgroundColor: item.isSelf ? colors.glassFill : colors.controlTrack, borderColor: item.isSelf ? colors.primary : 'transparent', borderWidth: item.isSelf ? 1 : 0 },
              { borderLeftColor: zones[zone], borderLeftWidth: 4 },
            ]}
          >
            <Text style={[styles.rank, { color: colors.textSecondary }]}>{item.rank}</Text>
            <InitialsAvatar name={item.username} id={item.userId} size={28} />
            <Text style={[styles.name, { color: colors.textPrimary }, item.isSelf && styles.nameSelf]} numberOfLines={1}>{item.username}</Text>
            <Text style={[styles.score, { color: colors.textPrimary }]}>{formatCompact(item.weeklyXp, locale)} XP</Text>
          </View>
        );
      }}
    />
  );
}

function BoardTab({ board, unit }: { board: Board | null; unit: string }) {
  const { locale } = useI18n();
  const { colors } = useTheme();
  if (!board) return <Centered><Text style={[styles.dim, { color: colors.textSecondary }]}>No board yet.</Text></Centered>;
  return (
    <FlatList
      data={board.top}
      keyExtractor={(e) => e.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        board.me ? <Text style={[styles.myRank, { color: colors.textPrimary }]}>You’re #{board.me.rank} · {formatCompact(board.me.score, locale)} {unit}</Text> : null
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: colors.controlTrack }]}>
          <Text style={[styles.rank, { color: colors.textSecondary }]}>{item.rank}</Text>
          <InitialsAvatar name={item.username} id={item.userId} size={28} />
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.username}</Text>
          <Text style={[styles.score, { color: colors.textPrimary }]}>{formatCompact(item.score, locale)}</Text>
        </View>
      )}
      ListEmptyComponent={<Centered><Text style={[styles.dim, { color: colors.textSecondary }]}>Nobody ranked yet.</Text></Centered>}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  close: { fontSize: typography.sizes.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.pill, alignItems: 'center' },
  tabText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  list: { padding: spacing.lg, gap: spacing.xs },
  leagueHead: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  tierName: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  countdown: { fontSize: typography.sizes.sm },
  cta: { marginTop: spacing.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  myRank: { textAlign: 'center', fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: spacing.sm },
  rank: { width: 28, textAlign: 'center', fontWeight: typography.weights.bold },
  name: { flex: 1, fontSize: typography.sizes.md },
  nameSelf: { fontWeight: typography.weights.bold },
  score: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  emoji: { fontSize: 48 },
  ctaText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  dim: { textAlign: 'center' },
});
