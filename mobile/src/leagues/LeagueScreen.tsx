import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { Palette } from '../theme/palette';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
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
  total: number;
  me: { rank: number; score: number } | null;
  /** country scope only; null when the profile has no country set */
  country?: string | null;
}

type Tab = 'league' | 'rankings';

/**
 * The same two boards and three scopes the browser offers.
 *
 * The phone showed one board (rating, global) and told you friends
 * leaderboards were "coming soon" — which the API had supported all along:
 * `/leaderboards/:type?scope=friends` puts you on your own friends board and
 * has since KUR-064. It was not unbuilt, it was unasked for.
 */
type BoardType = 'weekly_xp' | 'rating';
type Scope = 'global' | 'friends' | 'country';

const BOARDS: { key: BoardType; labelKey: TranslationKey; unitKey: TranslationKey; blurbKey: TranslationKey }[] = [
  { key: 'weekly_xp', labelKey: 'rankings.board.weeklyXp', unitKey: 'rankings.unit.xp', blurbKey: 'rankings.board.weeklyXpBlurb' },
  { key: 'rating', labelKey: 'rankings.board.rating', unitKey: 'rankings.board.rating', blurbKey: 'rankings.board.ratingBlurb' },
];

const SCOPES: { key: Scope; labelKey: TranslationKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

/** One page of a board. The browser uses the same size. */
const PAGE = 25;

const zoneColor = (colors: Palette): Record<Zone, string> => ({
  promotion: colors.success,
  demotion: colors.danger,
  safe: colors.glassBorder,
});

/** League standings + global/friends leaderboards (KUR-064). */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('league');
  const [type, setType] = useState<BoardType>('weekly_xp');
  const [scope, setScope] = useState<Scope>('global');
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [, setTick] = useState(0);

  const meta = BOARDS.find((b) => b.key === type)!;

  /**
   * One page of the chosen board. `offset` 0 replaces, anything else appends.
   *
   * The league standings come along on the first page only — they do not
   * change with the board you are looking at.
   */
  const load = useCallback(
    (offset: number) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      const query = `scope=${scope}&limit=${PAGE}&offset=${offset}`;
      void Promise.all([
        offset === 0 ? client.get<LeagueView>('/me/league') : Promise.resolve(null),
        client.get<Board>(`/leaderboards/${type}?${query}`),
      ]).then(([lg, bd]) => {
        if (lg?.ok) setLeague(lg.data);
        if (bd.ok) {
          setBoard(bd.data);
          const batch = bd.data.top ?? [];
          setEntries((prev) => (offset === 0 ? batch : [...prev, ...batch]));
        }
        // only a hard failure of the board itself is worth an error state;
        // the league is a second panel and can be missing on its own
        setError(bd.ok ? null : bd.error);
        setLoading(false);
        setLoadingMore(false);
      });
    },
    [client, type, scope],
  );

  useFocusEffect(useCallback(() => load(0), [load]));
  // live countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const header = <ScreenHeader title={t('rankings.title')} onBack={onExit} leading="close" />;

  const tabs = (
    <View style={styles.tabs}>
      {([['league', 'profile.league'], ['rankings', 'rankings.leaderboard']] as const).map(([key, labelKey]) => {
        const active = tab === key;
        return (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, { backgroundColor: active ? colors.primary : colors.controlTrack }]}
          >
            <Text style={[styles.tabText, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>
              {t(labelKey)}
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
        {tab === 'rankings' ? (
          <View style={styles.choosers}>
            <Segmented
              options={BOARDS.map((b) => b.key)}
              value={type}
              onChange={setType}
              labelOf={(key) => t(BOARDS.find((b) => b.key === key)!.labelKey)}
            />
            <Segmented
              options={SCOPES.map((sc) => sc.key)}
              value={scope}
              onChange={setScope}
              labelOf={(key) => t(SCOPES.find((sc) => sc.key === key)!.labelKey)}
            />
            <Text style={[styles.dim, { color: colors.textSecondary }]}>{t(meta.blurbKey)}</Text>
          </View>
        ) : null}

        <AsyncBoundary
          loading={loading && !league && !board}
          error={!league && !board ? error : null}
          onRetry={() => load(0)}
        >
          {tab === 'league' ? (
            <LeagueTab league={league} />
          ) : scope === 'country' && board?.country == null ? (
            <Centered>
              <Icon name="globe" size={48} tone="secondary" />
              <Text style={[styles.ctaText, { color: colors.textPrimary }]}>{t('rankings.noCountry')}</Text>
              <Text style={[styles.dim, { color: colors.textSecondary }]}>{t('rankings.noCountryBody')}</Text>
            </Centered>
          ) : (
            <BoardTab
              board={board}
              entries={entries}
              unit={t(meta.unitKey)}
              scope={scope}
              loadingMore={loadingMore}
              onMore={() => load(entries.length)}
            />
          )}
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

function LeagueTab({ league }: { league: LeagueView | null }) {
  const { locale } = useI18n();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!league) return <Centered><Text style={[styles.dim, { color: colors.textSecondary }]}>{t('leagues.noLeague')}</Text></Centered>;
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
            <Text style={[styles.cta, { color: colors.accent }]}>{t('leagues.doALesson')}</Text>
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

/**
 * One board, one page at a time.
 *
 * The empty state names the scope, because "nobody ranked yet" means three
 * different things: nobody at all, none of your friends, or nobody from your
 * country — and only one of those is something you can do anything about.
 */
function BoardTab({
  board,
  entries,
  unit,
  scope,
  loadingMore,
  onMore,
}: {
  board: Board | null;
  entries: BoardEntry[];
  unit: string;
  scope: Scope;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { locale, t } = useI18n();
  const { colors } = useTheme();
  if (!board) return <Centered><Text style={[styles.dim, { color: colors.textSecondary }]}>{t('leagues.noBoard')}</Text></Centered>;
  const empty =
    scope === 'friends'
      ? (['rankings.empty.friends', 'rankings.empty.friendsBody'] as const)
      : scope === 'country'
        ? (['rankings.empty.country', 'rankings.empty.countryBody'] as const)
        : (['rankings.empty.global', 'rankings.empty.globalBody'] as const);
  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.userId}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        board.me ? (
          <Text style={[styles.myRank, { color: colors.textPrimary }]}>
            {t('games.you')} · #{board.me.rank} · {formatCompact(board.me.score, locale)} {unit}
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: colors.controlTrack }]}>
          <Text style={[styles.rank, { color: colors.textSecondary }]}>{item.rank}</Text>
          <InitialsAvatar name={item.username} id={item.userId} size={28} />
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.username}</Text>
          <Text style={[styles.score, { color: colors.textPrimary }]}>{formatCompact(item.score, locale)}</Text>
        </View>
      )}
      ListEmptyComponent={
        <Centered>
          <Text style={[styles.ctaText, { color: colors.textPrimary }]}>{t(empty[0])}</Text>
          <Text style={[styles.dim, { color: colors.textSecondary }]}>{t(empty[1])}</Text>
        </Centered>
      }
      ListFooterComponent={
        entries.length > 0 && entries.length < board.total ? (
          <Pressable onPress={onMore} disabled={loadingMore} style={styles.more}>
            <Text style={[styles.moreText, { color: colors.primary }]}>
              {t('rankings.showMore', { count: board.total - entries.length })}
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  choosers: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  more: { alignItems: 'center', paddingVertical: spacing.md },
  moreText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
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
  ctaText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  dim: { textAlign: 'center' },
});
