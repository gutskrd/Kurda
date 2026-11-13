import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Animated, Easing, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FIRST_LEAGUE_TIER, LEAGUE_TIERS, leagueTierIndex, type LeagueTier, type LeagueView, type LeagueWeekXp } from '@kurda/shared';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { usePullRefresh } from '../net/usePullRefresh';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { SwipePager } from '../theme/SwipePager';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact, formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { getLeague } from '../ranks/api';
import { leagueTint } from '../ranks/tint';
import { GoalRing } from './GoalRing';
import { LeagueMoment } from './LeagueMoment';
import { Leaderboard, type BoardType, type Scope } from './Leaderboard';
import { springTo, timing, useListEntrance } from '../theme/animate';
import { duration } from '../theme/motion';
import { Rise } from '../theme/MotionParts';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useDirection } from '../reports/direction';
import { knownTier, lastWeekLine, leagueLabel, leagueMeaning, leagueName, tableItems, weekEndText, weekLeftText, zoneRules, type TableItem } from './format';

type Tab = 'league' | 'board';

/** The league's two pages, in the order the switch shows them. */
const TABS: readonly Tab[] = ['league', 'board'];

/**
 * Learning Leagues, rebuilt (contract 4 §L, §U).
 *
 * The league's name and how many days the week has left, then the whole
 * ladder from a drop to the ocean — the leagues behind you in colour, yours
 * large, the ones ahead a quiet outline with a keyhole — so where you are is
 * seen as a place on a journey, not only a rank. Under it the week's group
 * of about twenty, with the zones written out — "Moving up" and "Moving
 * down" as headings in the table, with their icons, so nothing is told by
 * colour alone — the weekly goal as a ring, and "Safe this week" once it is
 * met. Before the week's first lesson, Hevalo is resting, and the first
 * lesson is what starts the week. Last week's result is one kind sentence.
 *
 * Leaving is a button at the end of the page, asked once in plain words and
 * with no pull to stay. Somebody out of the leagues (their choice, or a teen
 * by default) gets their own week instead: the same ring, and how it
 * compares with the weeks before, with nobody else in it.
 */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('league');
  // what the leaderboard ranks and who it compares you with, kept here so the League tab and back finds them as they were
  const [boardType, setBoardType] = useState<BoardType>('weekly_xp');
  const [scope, setScope] = useState<Scope>('global');
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [leagueError, setLeagueError] = useState<ApiError | null>(null);

  const loadLeague = useCallback(
    () =>
      getLeague(client).then((res) => {
        if (res.ok) {
          setLeague(res.data);
          setLeagueError(null);
        } else setLeagueError(res.error);
      }),
    [client],
  );

  useFocusEffect(
    useCallback(() => {
      void loadLeague();
    }, [loadLeague]),
  );
  // pulled down, the week's table is read again
  const pull = usePullRefresh(loadLeague);

  /** In or out, one tap from where the table is or would be (Settings has the other). */
  const [joining, setJoining] = useState(false);
  const setTakingPart = useCallback(
    async (on: boolean) => {
      setJoining(true);
      const res = await client.patch('/me', { leaguesEnabled: on });
      setJoining(false);
      if (res.ok) void loadLeague();
      else Alert.alert(t('error.generic'), t('common.tryAgain'));
    },
    [client, loadLeague, t],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('leagues.screenTitle')} onBack={onExit} leading="close" />
        <View style={styles.tabs}>
          <Segmented<Tab>
            options={TABS}
            value={tab}
            onChange={setTab}
            labelOf={(k) => (k === 'league' ? t('profile.league') : t('rankings.leaderboard'))}
            wrap
          />
        </View>
        {/* the week that closed: its ceremony, once, the first time the league is opened after */}
        <LeagueMoment league={league} />
        {/* the two lie side by side, so a swipe turns from the league to the leaderboard as well as a tap on its name */}
        <SwipePager<Tab>
          pages={TABS}
          value={tab}
          onChange={setTab}
          testID="league-pages"
          renderPage={(page) =>
            page === 'league' ? (
              <AsyncBoundary loading={!league && !leagueError} error={!league ? leagueError : null} onRetry={() => void loadLeague()} skeleton={<LeagueSkeleton />}>
                {league ? (
                  <LeagueTab
                    league={league}
                    joining={joining}
                    onJoin={() => void setTakingPart(true)}
                    onLeave={() => void setTakingPart(false)}
                    refreshControl={pull}
                  />
                ) : null}
              </AsyncBoundary>
            ) : (
              <Leaderboard type={boardType} scope={scope} onType={setBoardType} onScope={setScope} />
            )
          }
        />
      </View>
    </GradientBackground>
  );
}

function LeagueTab({
  league,
  joining,
  onJoin,
  onLeave,
  refreshControl,
}: {
  league: LeagueView;
  joining: boolean;
  onJoin: () => void;
  onLeave: () => void;
  /** pull down to read the week again */
  refreshControl: React.JSX.Element;
}): React.JSX.Element {
  if (league.mode === 'personal') return <PersonalWeek league={league} joining={joining} onJoin={onJoin} refreshControl={refreshControl} />;
  const items = league.joined ? tableItems(league.standings) : [];
  // the first screenful of the table rises in once, as it arrives
  const entering = useListEntrance(items.length > 0);
  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => (item.kind === 'row' ? `r-${item.row.rank}` : `${item.kind}-${i}`)}
      contentContainerStyle={styles.list}
      refreshControl={refreshControl}
      ListHeaderComponent={<LeagueHead league={league} />}
      ListFooterComponent={<LeaveLeagues busy={joining} onLeave={onLeave} />}
      renderItem={({ item, index }) => (
        <Rise delay={entering(index)}>
          <TableRow item={item} delay={entering(index)} />
        </Rise>
      )}
    />
  );
}

/**
 * The week at the top: the league and the days it has left, the ladder, and
 * under a line either the goal ring with the group's rules or, before the
 * week's first lesson, Hevalo resting; last week's result after either.
 */
function LeagueHead({ league }: { league: LeagueView }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tier = knownTier(league.tier) ?? FIRST_LEAGUE_TIER;
  const tint = leagueTint(tier, scheme);
  const rules = zoneRules(t, { tier: knownTier(league.tier), promoteCount: league.promoteCount, demoteCount: league.demoteCount, goalXp: league.goalXp });
  const meaning = leagueMeaning(t, tier);
  return (
    <View style={styles.head}>
      <View style={styles.titleBlock}>
        <Text style={[styles.leagueTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('leagues.leagueName', { tier: leagueName(t, tier) })}
        </Text>
        {meaning ? <Text style={[styles.heroMeaning, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
        {/* how long the week has left, as a quiet pill: whole days, never a clock running down */}
        <View style={[styles.ends, styles.daysPill, { flexDirection: dir.row, backgroundColor: colors.controlTrack, alignSelf: dir.rtl ? 'flex-end' : 'flex-start' }]}>
          <Icon name="timer" size={16} color={colors.textSecondary} />
          <Text style={[styles.left, dir.text, { color: colors.textSecondary }]}>{weekLeftText(t, league.endsAt, locale)}</Text>
        </View>
      </View>

      <Ladder tier={tier} />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />

      {league.joined ? (
        <View style={styles.goalRow}>
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
            {league.groupSize > 0 ? (
              <Text style={[styles.goalHint, { color: colors.textSecondary }]}>{t('leagues.place', { rank: league.rank, count: league.groupSize })}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Resting />
      )}

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
      ) : null}
    </View>
  );
}

/** the gap between two emblems on the ladder */
const LADDER_GAP = spacing.sm + 2;
/** yours, and the others at most and at least */
const LADDER_SIZE = { here: 88, max: 60, min: 36 } as const;

/**
 * All six leagues in a row, a drop to the ocean: the ones behind you in
 * their colours, yours larger, the ones still ahead as their outline with a
 * keyhole. Sized so all six fit across a phone; on one too narrow for that
 * the row scrolls, and starts where yours is.
 */
function Ladder({ tier }: { tier: LeagueTier }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const here = leagueTierIndex(tier);
  const others = LEAGUE_TIERS.length - 1;
  const room = width - 2 * layout.gutter - LADDER_SIZE.here - others * LADDER_GAP;
  const size = Math.max(LADDER_SIZE.min, Math.min(LADDER_SIZE.max, Math.floor(room / others)));
  const scroll = useRef<ScrollView>(null);
  const toHere = (contentWidth: number) => {
    if (contentWidth <= width) return;
    const mid = layout.gutter + here * (size + LADDER_GAP) + LADDER_SIZE.here / 2;
    const fromStart = dir.row === 'row-reverse' ? contentWidth - mid : mid;
    scroll.current?.scrollTo({ x: Math.max(0, fromStart - width / 2), animated: false });
  };
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={toHere}
      style={styles.ladderScroll}
      contentContainerStyle={[styles.ladder, { flexDirection: dir.row }]}
    >
      {LEAGUE_TIERS.map((key, i) => {
        const league = leagueLabel(t, key);
        const label =
          i < here ? t('leagues.ladder.reached', { league }) : i === here ? t('leagues.ladder.here', { league }) : t('leagues.ladder.ahead', { league });
        if (i === here) {
          return (
            <Bobbing key={key}>
              <LeagueEmblem tier={key} size={LADDER_SIZE.here} label={label} />
            </Bobbing>
          );
        }
        return <LeagueEmblem key={key} tier={key} size={size} label={label} locked={i > here} />;
      })}
    </ScrollView>
  );
}

/** How far, and how slowly, the learner's own emblem rides on its water. */
const BOB = { distance: 3, ms: 2600 } as const;

/**
 * The learner's own emblem on the ladder, afloat: it rises and settles a few
 * points every couple of seconds, on the native driver, so the one league
 * that is theirs is the one thing on the row that is alive. It holds still
 * while the page is not in front or the app is in the background, and under
 * Reduce Motion, where it is simply there (`useMotionAlive`).
 */
function Bobbing({ children }: { children: ReactNode }): React.JSX.Element {
  const alive = useMotionAlive();
  const ride = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) {
      ride.setValue(0);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(Animated.sequence([timing(ride, 1, BOB.ms / 2, { easing: ease }), timing(ride, 0, BOB.ms / 2, { easing: ease })]));
    loop.start();
    return () => {
      loop.stop();
      ride.setValue(0);
    };
  }, [alive, ride]);
  const translateY = ride.interpolate({ inputRange: [0, 1], outputRange: [0, -BOB.distance] });
  return <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>;
}

/**
 * Before the week's first lesson: Hevalo asleep, a line in his own words
 * about the lesson that wakes him and puts the two of you on the table, and
 * the lesson itself. Nothing about falling behind — there is nothing to be
 * behind yet.
 */
function Resting(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  return (
    <View style={styles.resting}>
      <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={RESTING_HEIGHT} resting />
      {/* what he would say, were he awake: his words in a bubble, read as his */}
      <View style={[styles.bubble, { backgroundColor: colors.glassFill }]} accessibilityRole="text">
        <Text style={[styles.bubbleText, dir.text, { color: colors.textPrimary }]}>{t('leagues.resting.hevalo')}</Text>
      </View>
      <Text style={[styles.waitTitle, { color: colors.textPrimary }]}>{t('leagues.resting.title')}</Text>
      <Text style={[styles.goalHint, styles.center, { color: colors.textSecondary }]}>{t('leagues.notJoined.body')}</Text>
      <ClayButton
        label={t('leagues.notJoined.start')}
        icon="book"
        tone="primary"
        onPress={() => navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
        style={styles.stretch}
      />
    </View>
  );
}

/** how tall Hevalo is drawn while resting */
const RESTING_HEIGHT = 170;

/**
 * The way out, at the end of the page: asked once, in plain words — what
 * changes and that it can be undone — with Leave and Cancel side by side and
 * neither one dressed up to be chosen.
 */
function LeaveLeagues({ busy, onLeave }: { busy: boolean; onLeave: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const ask = () =>
    Alert.alert(t('leagues.leave.title'), t('leagues.leave.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('leagues.leave.confirm'), onPress: onLeave },
    ]);
  return (
    <View style={styles.leave}>
      <ClayButton label={t('leagues.leave')} icon="sign-out" variant="outline" busy={busy} onPress={ask} />
    </View>
  );
}

/**
 * The week while it loads, in the page's own layout: the league's name and
 * the days left, the ladder's six, the line, the goal ring and its lines,
 * the group's rules, and the table's first rows — what the screen is about
 * to be, in grey.
 */
function LeagueSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const { height, width } = useWindowDimensions();
  const { colors } = useTheme();
  const others = LEAGUE_TIERS.length - 1;
  const size = Math.max(LADDER_SIZE.min, Math.min(LADDER_SIZE.max, Math.floor((width - 2 * layout.gutter - LADDER_SIZE.here - others * LADDER_GAP) / others)));
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      <View style={styles.head}>
        <View style={styles.titleBlock}>
          <SkeletonText size={typography.sizes.xxl} lineHeight={LEAGUE_TITLE_LINE} width="62%" />
          <SkeletonText size={typography.sizes.sm} width={110} style={styles.endsSkeleton} />
        </View>
        <View style={[styles.ladder, styles.ladderScroll, { flexDirection: 'row' }]}>
          {LEAGUE_TIERS.map((key, i) => (
            <Skeleton key={key} width={i === 1 ? LADDER_SIZE.here : size} height={i === 1 ? LADDER_SIZE.here : size} radius={radii.pill} />
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        <View style={styles.goalRow}>
          <Skeleton width={84} height={84} radius={radii.pill} />
          <View style={styles.goalText}>
            <SkeletonText size={typography.sizes.md} width="54%" />
            <SkeletonText size={typography.sizes.sm} lineHeight={19} width="88%" />
            <SkeletonText size={typography.sizes.sm} lineHeight={19} width="40%" />
          </View>
        </View>
        <View style={styles.rules}>
          <SkeletonText size={typography.sizes.xs} width={96} />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width="90%" />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width="76%" />
        </View>
      </View>
      <TableSkeleton rows={Math.max(6, Math.ceil((height - 560) / ROW))} zone />
    </View>
  );
}

/** Rows of a table in grey: the place, the face, the name, the XP. */
function TableSkeleton({ rows, zone = false }: { rows: number; zone?: boolean }): React.JSX.Element {
  return (
    <>
      {/* the "Moving up" heading the group's table opens with */}
      {zone ? <SkeletonText size={typography.sizes.xs} width={96} style={styles.zoneSkeleton} /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonText size={typography.sizes.sm} width={14} align="center" style={styles.rankSkeleton} />
          <Skeleton width={32} height={32} radius={radii.pill} />
          <SkeletonText size={typography.sizes.md} width={i % 2 ? '40%' : '56%'} style={styles.nameSkeleton} />
          <SkeletonText size={typography.sizes.sm} width={52} />
        </View>
      ))}
    </>
  );
}

/** a table row: a fingertip and 4, with the 4 between rows */
const ROW = MIN_TOUCH_TARGET + 4 + spacing.xs;
/** display(34) sets 1.12 */
const LEAGUE_TITLE_LINE = Math.round(typography.sizes.xxl * typography.displayLineHeight);

/**
 * One row of the group's table, drawn once per row and not again when the
 * list re-renders round it. `delay` is the row's place in the entrance, for
 * the learner's own row, which swells once as it arrives so the eye finds
 * it without looking for it.
 */
const TableRow = memo(function TableRow({ item, delay }: { item: TableItem; delay: number | null }): React.JSX.Element {
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
  const label = [`#${row.rank}`, name, t('leagues.xpCount', { xp: row.weeklyXp }), zoneWord].filter(Boolean).join(', ');
  const body = (
    <>
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
    </>
  );
  if (row.isSelf) {
    return (
      <OwnRow accessible accessibilityLabel={label} delay={delay} style={[styles.row, { backgroundColor: colors.glassFill, borderColor: colors.primary, borderWidth: 1 }]}>
        {body}
      </OwnRow>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={styles.row}>
      {body}
    </View>
  );
});

/** How much the learner's own row swells as it arrives. */
const OWN_ROW_SWELL = 1.03;

/**
 * The learner's own row: once it has risen into place it swells a little and
 * settles on the bouncy spring, so it is found at a glance in a table of
 * twenty. Once, as it arrives, and not under Reduce Motion, where its colour
 * and its edge mark it alone. Everything else is a plain View's.
 */
function OwnRow({ delay, style, children, ...rest }: React.ComponentProps<typeof View> & { delay: number | null }): React.JSX.Element {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce || delay === null) return;
    const run = Animated.sequence([timing(scale, OWN_ROW_SWELL, duration.quick + 40, { delay: delay + duration.slow }), springTo(scale, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // once, as the row arrives
  }, []);
  return (
    <Animated.View {...rest} style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * Out of the leagues: no group and no table, and nothing that reads as
 * missing out — the week's own goal ring, and this week beside the ones
 * before it, against nobody but yourself.
 */
function PersonalWeek({
  league,
  joining,
  onJoin,
  refreshControl,
}: {
  league: LeagueView;
  joining: boolean;
  onJoin: () => void;
  refreshControl: React.JSX.Element;
}): React.JSX.Element {
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
      refreshControl={refreshControl}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  head: { gap: spacing.md, marginBottom: spacing.sm },
  titleBlock: { gap: 2, paddingTop: spacing.xs },
  leagueTitle: { ...display(typography.sizes.xxl) },
  left: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  // the ladder runs from one edge of the phone to the other, past the list's gutter
  ladderScroll: { marginHorizontal: -layout.gutter },
  ladder: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: LADDER_GAP, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: -layout.gutter },
  resting: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  // his words, in a bubble under him: filled, not framed, like every surface here
  bubble: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, maxWidth: 320 },
  bubbleText: { fontSize: typography.sizes.md, lineHeight: 22, fontStyle: 'italic', textAlign: 'center' },
  daysPill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, marginTop: spacing.sm },
  leave: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroTitle: { ...display(typography.sizes.xl) },
  heroMeaning: { fontSize: typography.sizes.md },
  ends: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  endsText: { fontSize: typography.sizes.sm },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalText: { flex: 1, gap: spacing.xs },
  endsSkeleton: { marginTop: spacing.xs },
  rankSkeleton: { width: 26 },
  zoneSkeleton: { paddingTop: spacing.sm, paddingBottom: 2, paddingHorizontal: spacing.xs },
  nameSkeleton: { flex: 1 },
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
});
