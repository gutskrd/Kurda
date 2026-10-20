import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { FIRST_LEAGUE_TIER, type LeagueView, type LeagueWeekXp } from '@kurda/shared';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { formatCompact, formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { getLeague } from '../ranks/api';
import { leagueTint } from '../ranks/tint';
import { GoalRing } from './GoalRing';
import { knownTier, lastWeekLine, leagueLabel, leagueMeaning, leagueName, tableItems, weekEndText, zoneRules, type TableItem } from './format';

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

type Tab = 'league' | 'board';

/**
 * The weekly XP board's three scopes, as the browser offers them. The second
 * board this screen had — the all-time skill rating — read
 * `/leaderboards/rating`, which Game Ranks replaced; a game's rank and its
 * boards live on the Ranks screen now.
 */
type Scope = 'global' | 'friends' | 'country';
const SCOPES: { key: Scope; labelKey: TranslationKey }[] = [
  { key: 'global', labelKey: 'rankings.scope.global' },
  { key: 'friends', labelKey: 'nav.friends' },
  { key: 'country', labelKey: 'rankings.scope.country' },
];

/** One page of the board. The browser uses the same size. */
const PAGE = 25;

/**
 * Learning Leagues, rebuilt (contract 4 §L, §U).
 *
 * The week's group of about twenty, with the zones written out — "Moving up"
 * and "Moving down" as headings in the table, with their icons, so nothing is
 * told by colour alone — the weekly goal as a ring, and "Safe this week" once
 * it is met. When the week ends is a local time, not a countdown. Last week's
 * result is one kind sentence. Somebody out of the leagues (their choice, or
 * a teen by default) gets their own week instead: the same ring, and how it
 * compares with the weeks before, with nobody else in it.
 */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('league');
  const [scope, setScope] = useState<Scope>('global');
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [leagueError, setLeagueError] = useState<ApiError | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [boardError, setBoardError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadLeague = useCallback(() => {
    void getLeague(client).then((res) => {
      if (res.ok) {
        setLeague(res.data);
        setLeagueError(null);
      } else setLeagueError(res.error);
    });
  }, [client]);

  const loadBoard = useCallback(
    (offset: number) => {
      if (offset > 0) setLoadingMore(true);
      void client.get<Board>(`/leaderboards/weekly_xp?scope=${scope}&limit=${PAGE}&offset=${offset}`).then((res) => {
        setLoadingMore(false);
        if (res.ok) {
          setBoard(res.data);
          setEntries((prev) => (offset === 0 ? (res.data.top ?? []) : [...prev, ...(res.data.top ?? [])]));
          setBoardError(null);
        } else setBoardError(res.error);
      });
    },
    [client, scope],
  );

  useFocusEffect(useCallback(() => loadLeague(), [loadLeague]));
  useFocusEffect(
    useCallback(() => {
      if (tab === 'board') loadBoard(0);
    }, [tab, loadBoard]),
  );

  /** The way back in, one tap from where the table would be (Settings has the other). */
  const [joining, setJoining] = useState(false);
  const join = useCallback(async () => {
    setJoining(true);
    const res = await client.patch('/me', { leaguesEnabled: true });
    setJoining(false);
    if (res.ok) loadLeague();
  }, [client, loadLeague]);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('leagues.screenTitle')} onBack={onExit} leading="close" />
        <View style={styles.tabs}>
          <Segmented<Tab>
            options={['league', 'board']}
            value={tab}
            onChange={setTab}
            labelOf={(k) => (k === 'league' ? t('profile.league') : t('rankings.leaderboard'))}
          />
        </View>
        {tab === 'league' ? (
          <AsyncBoundary loading={!league && !leagueError} error={!league ? leagueError : null} onRetry={loadLeague}>
            {league ? <LeagueTab league={league} joining={joining} onJoin={() => void join()} /> : null}
          </AsyncBoundary>
        ) : (
          <>
            <View style={styles.choosers}>
              <Segmented<Scope>
                options={SCOPES.map((s) => s.key)}
                value={scope}
                onChange={setScope}
                labelOf={(key) => t(SCOPES.find((s) => s.key === key)!.labelKey)}
              />
            </View>
            <AsyncBoundary loading={!board && !boardError} error={!board ? boardError : null} onRetry={() => loadBoard(0)}>
              {board ? (
                <BoardTab board={board} entries={entries} scope={scope} loadingMore={loadingMore} onMore={() => loadBoard(entries.length)} />
              ) : null}
            </AsyncBoundary>
          </>
        )}
      </View>
    </GradientBackground>
  );
}

function LeagueTab({ league, joining, onJoin }: { league: LeagueView; joining: boolean; onJoin: () => void }): React.JSX.Element {
  if (league.mode === 'personal') return <PersonalWeek league={league} joining={joining} onJoin={onJoin} />;
  const items = league.joined ? tableItems(league.standings) : [];
  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => (item.kind === 'row' ? `r-${item.row.rank}` : `${item.kind}-${i}`)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<LeagueHead league={league} />}
      renderItem={({ item }) => <TableRow item={item} />}
    />
  );
}

/** The week at the top: the emblem, the league, when it ends, the goal ring, safe, and last week. */
function LeagueHead({ league }: { league: LeagueView }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const tier = knownTier(league.tier) ?? FIRST_LEAGUE_TIER;
  const tint = leagueTint(tier, scheme);
  const rules = zoneRules(t, { tier: knownTier(league.tier), promoteCount: league.promoteCount, demoteCount: league.demoteCount, goalXp: league.goalXp });
  const meaning = leagueMeaning(t, tier);
  return (
    <View style={styles.head}>
      <GlassCard>
        <View style={styles.hero}>
          <LeagueEmblem tier={tier} size={104} label={leagueLabel(t, tier)} />
          <View style={styles.heroText}>
            <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t('leagues.thisWeek')}</Text>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
              {t('leagues.leagueName', { tier: leagueName(t, tier) })}
            </Text>
            {meaning ? <Text style={[styles.heroMeaning, { color: colors.textSecondary }]}>{meaning}</Text> : null}
            <View style={styles.ends}>
              <Icon name="calendar" size={14} color={colors.textSecondary} />
              <Text style={[styles.endsText, { color: colors.textSecondary }]}>{t('leagues.endsAt', { time: weekEndText(league.endsAt, locale) })}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.goalRow, { borderTopColor: colors.separator }]}>
          <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={84} tint={tint} />
          <View style={styles.goalText}>
            <Text style={[styles.goalTitle, { color: colors.textPrimary }]}>
              {t('leagues.goalProgress', { xp: formatNumber(league.weeklyXp, locale), goal: formatNumber(league.goalXp, locale) })}
            </Text>
            {league.safe ? (
              <View style={[styles.safe, { backgroundColor: colors.successFill }]} accessibilityLiveRegion="polite">
                <Icon name="seal-check" size={16} color={colors.success} />
                <Text style={[styles.safeText, { color: colors.success }]}>{t('leagues.safe')}</Text>
              </View>
            ) : (
              <Text style={[styles.goalHint, { color: colors.textSecondary }]}>
                {league.demoteCount > 0 ? t('leagues.goalHintSafe') : t('leagues.goalHintUp')}
              </Text>
            )}
            {league.joined && league.groupSize > 0 ? (
              <Text style={[styles.goalHint, { color: colors.textSecondary }]}>{t('leagues.place', { rank: league.rank, count: league.groupSize })}</Text>
            ) : null}
          </View>
        </View>
      </GlassCard>

      {league.lastWeek ? (
        <GlassCard>
          <View style={styles.lastWeek}>
            {league.lastWeek.tierAfter ? (
              <LeagueEmblem tier={league.lastWeek.tierAfter} size={44} label={leagueLabel(t, league.lastWeek.tierAfter)} />
            ) : (
              <Icon name="calendar" size={28} color={colors.textSecondary} />
            )}
            <View style={styles.flex}>
              <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t('leagues.lastWeek.title')}</Text>
              <Text style={[styles.lastLine, { color: colors.textPrimary }]}>{lastWeekLine(t, league.lastWeek)}</Text>
              <Text style={[styles.goalHint, { color: colors.textSecondary }]}>
                {[
                  league.lastWeek.rank && league.lastWeek.groupSize ? t('leagues.place', { rank: league.lastWeek.rank, count: league.lastWeek.groupSize }) : null,
                  t('leagues.xpCount', { xp: formatNumber(league.lastWeek.weeklyXp, locale) }),
                  league.lastWeek.gems > 0 ? t('leagues.gems', { count: league.lastWeek.gems }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        </GlassCard>
      ) : null}

      {league.joined ? (
        <View style={styles.rules}>
          <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('leagues.group')}
          </Text>
          {rules.map((line) => (
            <Text key={line} style={[styles.rule, { color: colors.textSecondary }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <GlassCard>
          <View style={styles.waiting}>
            <Icon name="people" size={28} color={colors.textSecondary} />
            <Text style={[styles.waitTitle, { color: colors.textPrimary }]}>{t('leagues.notJoined.title')}</Text>
            <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>{t('leagues.notJoined.body')}</Text>
            <ClayButton label={t('leagues.notJoined.start')} icon="book" tone="primary" onPress={() => navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } })} style={styles.stretch} />
          </View>
        </GlassCard>
      )}
    </View>
  );
}

function TableRow({ item }: { item: TableItem }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  if (item.kind === 'gap') return <View style={styles.gap} />;
  if (item.kind === 'zone') {
    const up = item.zone === 'promotion';
    return (
      <View style={styles.zone} accessibilityRole="header">
        <Icon name={up ? 'move-up' : 'move-down'} size={14} color={up ? colors.success : colors.textSecondary} />
        <Text style={[styles.zoneText, { color: up ? colors.success : colors.textSecondary }]}>
          {up ? t('leagues.zone.promotion') : t('leagues.zone.demotion')}
        </Text>
      </View>
    );
  }
  const row = item.row;
  const name = row.isSelf ? t('games.you') : (row.username ?? t('leagues.unnamed'));
  const zoneWord = row.zone === 'promotion' ? t('leagues.zone.promotion') : row.zone === 'demotion' ? t('leagues.zone.demotion') : null;
  return (
    <View
      accessible
      accessibilityLabel={[`#${row.rank}`, name, t('leagues.xpCount', { xp: row.weeklyXp }), zoneWord].filter(Boolean).join(', ')}
      style={[styles.row, { backgroundColor: row.isSelf ? colors.glassFill : 'transparent' }, row.isSelf && { borderColor: colors.primary, borderWidth: 1 }]}
    >
      <Text style={[styles.rank, { color: colors.textSecondary }]}>{row.rank}</Text>
      {row.username ? (
        <InitialsAvatar name={row.username} id={row.userId ?? `row-${row.rank}`} size={32} />
      ) : (
        // somebody the viewer may not be shown by name: a quiet face, not initials made up from "A learner"
        <View style={[styles.anon, { backgroundColor: colors.controlTrack }]}>
          <Icon name="person" size={16} color={colors.textSecondary} />
        </View>
      )}
      <Text style={[styles.name, { color: colors.textPrimary }, row.isSelf && styles.nameSelf]} numberOfLines={1}>
        {name}
      </Text>
      {row.zone !== 'stay' ? (
        <Icon name={row.zone === 'promotion' ? 'move-up' : 'move-down'} size={12} color={row.zone === 'promotion' ? colors.success : colors.textSecondary} />
      ) : null}
      <Text style={[styles.score, { color: colors.textPrimary }]}>{t('leagues.xpCount', { xp: formatCompact(row.weeklyXp, locale) })}</Text>
    </View>
  );
}

/**
 * Out of the leagues: no group and no table, and nothing that reads as
 * missing out — the week's own goal ring, and this week beside the ones
 * before it, against nobody but yourself.
 */
function PersonalWeek({ league, joining, onJoin }: { league: LeagueView; joining: boolean; onJoin: () => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const tint = leagueTint(knownTier(league.tier) ?? 'kani', scheme);
  const weeks = league.recentWeeks.slice(-6);
  const previous = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  return (
    <FlatList
      data={[]}
      renderItem={null}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.head}>
          <GlassCard>
            <View style={styles.personal}>
              <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t('leagues.personal.kicker')}</Text>
              <Text style={[styles.heroTitle, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('leagues.personal.title')}
              </Text>
              <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={148} tint={tint} />
              {previous ? (
                <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>
                  {t('leagues.personal.lastWeek', { xp: formatNumber(previous.xp, locale) })}
                </Text>
              ) : null}
              <View style={styles.ends}>
                <Icon name="calendar" size={14} color={colors.textSecondary} />
                <Text style={[styles.endsText, { color: colors.textSecondary }]}>{t('leagues.endsAt', { time: weekEndText(league.endsAt, locale) })}</Text>
              </View>
            </View>
          </GlassCard>
          {weeks.length > 1 ? <WeekBars weeks={weeks} goal={league.goalXp} tint={tint} /> : null}
          <GlassCard>
            <View style={styles.waiting}>
              <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>{t('leagues.personal.body')}</Text>
              <ClayButton label={t('leagues.optedOut.join')} variant="outline" busy={joining} onPress={onJoin} style={styles.stretch} />
            </View>
          </GlassCard>
        </View>
      }
    />
  );
}

/** "You vs last week": the recent weeks as bars, the goal as a line across them. */
function WeekBars({ weeks, goal, tint }: { weeks: LeagueWeekXp[]; goal: number; tint: readonly [string, string] }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const top = Math.max(goal, ...weeks.map((w) => w.xp), 1);
  const height = 96;
  return (
    <GlassCard>
      <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('leagues.personal.weeks')}
      </Text>
      <View style={[styles.bars, { height }]}>
        <View style={[styles.goalLine, { bottom: (goal / top) * height, backgroundColor: colors.textSecondary }]} />
        <Text style={[styles.goalTag, { bottom: (goal / top) * height + 2, color: colors.textSecondary }]}>
          {t('leagues.personal.goalLine', { goal: formatNumber(goal, locale) })}
        </Text>
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1;
          return (
            <View
              key={w.weekKey}
              style={styles.barCol}
              accessible
              accessibilityLabel={t('leagues.personal.weekA11y', { date: w.weekKey, xp: w.xp })}
            >
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, (w.xp / top) * height), backgroundColor: last ? tint[1] : colors.controlTrack },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {weeks.map((w, i) => (
          <Text key={w.weekKey} style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {i === weeks.length - 1 ? t('leagues.personal.now') : new Date(`${w.weekKey}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        ))}
      </View>
    </GlassCard>
  );
}

/**
 * The weekly XP board, a page at a time. The empty state names the scope:
 * nobody at all, none of your friends, or nobody from your country are three
 * different things.
 */
function BoardTab({
  board,
  entries,
  scope,
  loadingMore,
  onMore,
}: {
  board: Board;
  entries: BoardEntry[];
  scope: Scope;
  loadingMore: boolean;
  onMore: () => void;
}): React.JSX.Element {
  const { locale, t } = useI18n();
  const { colors } = useTheme();
  if (scope === 'country' && board.country == null) {
    return (
      <View style={styles.centered}>
        <Icon name="globe" size={48} tone="secondary" />
        <Text style={[styles.waitTitle, { color: colors.textPrimary }]}>{t('rankings.noCountry')}</Text>
        <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>{t('rankings.noCountryBody')}</Text>
      </View>
    );
  }
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
        <View style={styles.boardHead}>
          <Text style={[styles.goalHint, { color: colors.textSecondary }]}>{t('rankings.board.weeklyXpBlurb')}</Text>
          {board.me ? (
            <Text style={[styles.myRank, { color: colors.textPrimary }]}>
              {t('games.you')} · #{board.me.rank} · {t('leagues.xpCount', { xp: formatCompact(board.me.score, locale) })}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={[styles.rank, { color: colors.textSecondary }]}>{item.rank}</Text>
          <InitialsAvatar name={item.username} id={item.userId} size={32} />
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.username}
          </Text>
          <Text style={[styles.score, { color: colors.textPrimary }]}>{t('leagues.xpCount', { xp: formatCompact(item.score, locale) })}</Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={[styles.waitTitle, { color: colors.textPrimary }]}>{t(empty[0])}</Text>
          <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>{t(empty[1])}</Text>
        </View>
      }
      ListFooterComponent={
        entries.length > 0 && entries.length < board.total ? (
          <Pressable onPress={onMore} disabled={loadingMore} accessibilityRole="button" style={styles.more}>
            <Text style={[styles.moreText, { color: colors.primary }]}>{t('rankings.showMore', { count: board.total - entries.length })}</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  choosers: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  head: { gap: spacing.md, marginBottom: spacing.sm },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { ...display(typography.sizes.xl) },
  heroMeaning: { fontSize: typography.sizes.md },
  ends: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  endsText: { fontSize: typography.sizes.sm },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  goalText: { flex: 1, gap: spacing.xs },
  goalTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  goalHint: { fontSize: typography.sizes.sm, lineHeight: 19 },
  safe: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  safeText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  lastWeek: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lastLine: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, lineHeight: 21 },
  flex: { flex: 1, gap: 2 },
  rules: { gap: 4, marginTop: spacing.sm },
  rule: { fontSize: typography.sizes.sm, lineHeight: 19 },
  waiting: { alignItems: 'center', gap: spacing.sm },
  waitTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.sm, paddingBottom: 2, paddingHorizontal: spacing.xs },
  zoneText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  gap: { height: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.sm, minHeight: MIN_TOUCH_TARGET + 4 },
  rank: { width: 26, textAlign: 'center', fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: typography.sizes.md },
  nameSelf: { fontWeight: typography.weights.bold },
  anon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  personal: { alignItems: 'center', gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  goalLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.45 },
  goalTag: { position: 'absolute', right: 0, fontSize: typography.sizes.xs },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', borderRadius: radii.xs },
  barLabels: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  barLabel: { flex: 1, fontSize: typography.sizes.xs, textAlign: 'center' },
  boardHead: { gap: spacing.xs, marginBottom: spacing.sm },
  myRank: { fontWeight: typography.weights.bold },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  more: { alignItems: 'center', paddingVertical: spacing.md, minHeight: MIN_TOUCH_TARGET },
  moreText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
