import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Animated, Easing, FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { FIRST_LEAGUE_TIER, LEAGUE_TIERS, leagueTierIndex, type LeagueTier, type LeagueView, type LeagueWeekXp } from '@kurda/shared';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { usePullRefresh } from '../net/usePullRefresh';
import { useAuth } from '../auth/AuthContext';
import { describeError, isMaintenance } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { Avatar } from '../profile/Avatar';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact, formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { getLeague } from '../ranks/api';
import { leagueTint } from '../ranks/tint';
import { GoalRing } from './GoalRing';
import { LeagueMoment } from './LeagueMoment';
import { springTo, timing, useListEntrance } from '../theme/animate';
import { duration } from '../theme/motion';
import { Rise, heldDim } from '../theme/MotionParts';
import { HevaloPeek } from '../characters/HevaloPeek';
import { useDirection } from '../reports/direction';
import { knownTier, lastWeekLine, leagueLabel, leagueMeaning, leagueName, tableItems, weekEndText, weekLeftText, zoneRules, type TableItem } from './format';
import { usePageWidth } from '../theme/pageWidth';

/**
 * The whole league this week, opened from the card at the top of Rankings.
 *
 * The league's name and the days left, then the whole ladder from a drop to the ocean (past leagues in colour,
 * yours large, those ahead as outlines with a keyhole), so your place reads as a journey, not only a rank. Below,
 * the week's group of about twenty with the zones as headings in the table ("Moving up", "Moving down", with
 * icons, not colour alone), the weekly goal ring, and "Safe this week" once met. Before the week's first lesson
 * Hevalo dozes through the page, and that lesson starts the week. Last week's result is one kind sentence.
 *
 * Leaving is a quiet control at the end of the page, confirmed once in plain words with no pressure to stay.
 * Someone out of the leagues (by choice, or a teen by default) gets a personal week: the same ring compared with
 * their past weeks, with nobody else in it.
 */
export function LeagueScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
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
  // Pulled down, the week's table is read again.
  const pull = usePullRefresh(loadLeague);

  /** In or out, one tap from where the table is or would be (Settings has the other). */
  const [joining, setJoining] = useState(false);
  const setTakingPart = useCallback(
    async (on: boolean) => {
      setJoining(true);
      const res = await client.patch('/me', { leaguesEnabled: on });
      setJoining(false);
      // Refused as the Settings switch is: the reason is shown, and nothing over the maintenance notice.
      if (res.ok) void loadLeague();
      else if (!isMaintenance(res.error)) Alert.alert(t('settings.leagues.title'), describeError(res.error, t));
    },
    [client, loadLeague, t],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader title={t('leagues.screenTitle')} onBack={onExit} />
        {/* The week that closed: its ceremony, once, the first time the league is opened after. */}
        <LeagueMoment league={league} />
        <AsyncBoundary loading={!league && !leagueError} error={!league ? leagueError : null} onRetry={() => void loadLeague()} skeleton={<LeagueSkeleton />}>
          {league ? (
            <LeagueTab league={league} joining={joining} onJoin={() => void setTakingPart(true)} onLeave={() => void setTakingPart(false)} refreshControl={pull} />
          ) : null}
        </AsyncBoundary>
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
  /** Pull down to read the week again. */
  refreshControl: React.JSX.Element;
}): React.JSX.Element {
  if (league.mode === 'personal') return <PersonalWeek league={league} joining={joining} onJoin={onJoin} refreshControl={refreshControl} />;
  const items = league.joined ? tableItems(league.standings) : [];
  // The first screenful of the table rises in once, as it arrives.
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
 * The week at the top: the league and days left, the ladder, then the goal ring with the group's rules or, before
 * the first lesson, Hevalo resting; last week's result after either.
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
        {/* How long the week has left, as a quiet pill: whole days, never a clock running down. */}
        <View style={[styles.ends, styles.daysPill, { flexDirection: dir.row, backgroundColor: colors.controlTrack, alignSelf: dir.rtl ? 'flex-end' : 'flex-start' }]}>
          <Icon name="timer" size={16} color={colors.textSecondary} />
          <Text style={[styles.left, dir.text, { color: colors.textSecondary }]}>{weekLeftText(t, league.endsAt, locale)}</Text>
        </View>
      </View>

      <Ladder tier={tier} />
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />

      {league.joined ? (
        <View style={[styles.goalRow, { flexDirection: dir.row }]}>
          <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={84} tint={tint} />
          <View style={styles.goalText}>
            <Text style={[styles.goalTitle, dir.text, { color: colors.textPrimary }]}>
              {t('leagues.goalProgress', { xp: formatNumber(league.weeklyXp, locale), goal: formatNumber(league.goalXp, locale) })}
            </Text>
            {league.safe ? (
              <View style={[styles.safe, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.successFill }]} accessibilityLiveRegion="polite">
                <Icon name="seal-check" size={16} color={colors.success} />
                <Text style={[styles.safeText, { color: colors.success }]}>{t('leagues.safe')}</Text>
              </View>
            ) : (
              <Text style={[styles.goalHint, dir.text, { color: colors.textSecondary }]}>
                {league.demoteCount > 0 ? t('leagues.goalHintSafe') : t('leagues.goalHintUp')}
              </Text>
            )}
            {league.groupSize > 0 ? (
              <Text style={[styles.goalHint, dir.text, { color: colors.textSecondary }]}>{t('leagues.place', { rank: league.rank, count: league.groupSize })}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Resting />
      )}

      {league.lastWeek ? (
        <GlassCard>
          <View style={[styles.lastWeek, { flexDirection: dir.row }]}>
            {league.lastWeek.tierAfter ? (
              <LeagueEmblem tier={league.lastWeek.tierAfter} size={44} label={leagueLabel(t, league.lastWeek.tierAfter)} />
            ) : (
              <Icon name="calendar" size={28} color={colors.textSecondary} />
            )}
            <View style={styles.flex}>
              <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]}>{t('leagues.lastWeek.title')}</Text>
              <Text style={[styles.lastLine, dir.text, { color: colors.textPrimary }]}>{lastWeekLine(t, league.lastWeek)}</Text>
              <Text style={[styles.goalHint, dir.text, { color: colors.textSecondary }]}>
                {[
                  league.lastWeek.rank && league.lastWeek.groupSize ? t('leagues.place', { rank: league.lastWeek.rank, count: league.lastWeek.groupSize }) : null,
                  t('leagues.xpCount', { xp: formatNumber(league.lastWeek.weeklyXp, locale) }),
                  league.lastWeek.zer > 0 ? t('leagues.zer', { count: league.lastWeek.zer }) : null,
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
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('leagues.group')}
          </Text>
          {rules.map((line) => (
            <Text key={line} style={[styles.rule, dir.text, { color: colors.textSecondary }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The gap between two emblems on the ladder. */
const LADDER_GAP = spacing.sm + 2;
/** Yours, and the others at most and at least. */
const LADDER_SIZE = { here: 88, max: 60, min: 36 } as const;

/**
 * All six leagues in a row, a drop to the ocean: past ones in colour, yours larger, those ahead as keyhole
 * outlines. Sized to fit a phone; where it cannot, the row scrolls and starts at yours.
 */
function Ladder({ tier }: { tier: LeagueTier }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const width = usePageWidth();
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
 * The learner's own emblem on the ladder, floating: it rises and settles a few points every couple of seconds on
 * the native driver, the one live thing in the row. Still while the page is unfocused, backgrounded or under
 * Reduce Motion (`useMotionAlive`).
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

/** Before the week's first lesson: Hevalo dozing through the page, one line, and the lesson. Nothing about falling behind. */
function Resting(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  return (
    <View style={styles.resting}>
      <HevaloPeek size={RESTING_HEIGHT} resting pop={false} flip={dir.rtl} />
      <Text style={[styles.waitTitle, { color: colors.textPrimary }]}>{t('leagues.resting.title')}</Text>
      <ClayButton
        label={t('leagues.notJoined.start')}
        icon="book"
        tone="primary"
        onPress={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
        style={styles.stretch}
      />
    </View>
  );
}

/** How tall the page Hevalo dozes through is drawn. */
const RESTING_HEIGHT = 170;

/**
 * Leaving, at the end of the page: confirmed once in plain words (what changes, and that it can be undone), with
 * Leave and Cancel side by side and neither favoured. A quiet text control rather than a button, since almost
 * nobody comes here to leave; it is in Settings too.
 */
function LeaveLeagues({ busy, onLeave }: { busy: boolean; onLeave: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const ask = () =>
    Alert.alert(t('leagues.leave.title'), t('leagues.leave.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('leagues.leave.confirm'), onPress: onLeave },
    ]);
  return (
    <View style={styles.leave}>
      <Pressable
        onPress={ask}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        style={({ pressed }) => [styles.leaveLink, pressed && heldDim]}
      >
        <Text style={[styles.leaveText, { color: colors.textSecondary }]}>{t('leagues.leave')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The loading placeholder in the page's own layout: name and days left, the ladder's six, the goal ring and its
 * lines, the rules and the table's first rows.
 */
function LeagueSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const width = usePageWidth();
  const { colors } = useTheme();
  const others = LEAGUE_TIERS.length - 1;
  const size = Math.max(LADDER_SIZE.min, Math.min(LADDER_SIZE.max, Math.floor((width - 2 * layout.gutter - LADDER_SIZE.here - others * LADDER_GAP) / others)));
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      <View style={styles.head}>
        <View style={styles.titleBlock}>
          <SkeletonText size={typography.sizes.title} lineHeight={LEAGUE_TITLE_LINE} width="62%" />
          <SkeletonText size={typography.sizes.text} width={110} style={styles.endsSkeleton} />
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
            <SkeletonText size={typography.sizes.text} width="54%" />
            <SkeletonText size={typography.sizes.text} lineHeight={19} width="88%" />
            <SkeletonText size={typography.sizes.text} lineHeight={19} width="40%" />
          </View>
        </View>
        <View style={styles.rules}>
          <SkeletonText size={typography.sizes.text} width={96} />
          <SkeletonText size={typography.sizes.text} lineHeight={19} width="90%" />
          <SkeletonText size={typography.sizes.text} lineHeight={19} width="76%" />
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
      {/* The "Moving up" heading the group's table opens with. */}
      {zone ? <SkeletonText size={typography.sizes.text} width={96} style={styles.zoneSkeleton} /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonText size={typography.sizes.text} width={14} align="center" style={styles.rankSkeleton} />
          <Skeleton width={32} height={32} radius={radii.pill} />
          <SkeletonText size={typography.sizes.text} width={i % 2 ? '40%' : '56%'} style={styles.nameSkeleton} />
          <SkeletonText size={typography.sizes.text} width={52} />
        </View>
      ))}
    </>
  );
}

/** A table row: a fingertip and 4, with the 4 between rows. */
const ROW = MIN_TOUCH_TARGET + 4 + spacing.xs;
/** display(34) sets 1.12. */
const LEAGUE_TITLE_LINE = Math.round(typography.sizes.title * typography.displayLineHeight);

/**
 * One group table row, memoised against list re-renders. `delay` is the row's place in the entrance, for the
 * learner's row, which swells once on arrival.
 */
const TableRow = memo(function TableRow({ item, delay }: { item: TableItem; delay: number | null }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // A row starts from the reading side: in Soranî and Arabic the place is on the right and the XP on the left.
  const dir = useDirection();
  if (item.kind === 'gap') return <View style={styles.gap} />;
  if (item.kind === 'zone') {
    const up = item.zone === 'promotion';
    return (
      <View style={[styles.zone, { flexDirection: dir.row }]} accessibilityRole="header">
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
        <Avatar name={row.username} size={32} />
      ) : (
        // Somebody the viewer may not be shown by name: a quiet face rather than anyone's picture.
        <View style={[styles.anon, { backgroundColor: colors.controlTrack }]}>
          <Icon name="person" size={16} color={colors.textSecondary} />
        </View>
      )}
      <Text style={[styles.name, dir.free, { color: colors.textPrimary }, row.isSelf && styles.nameSelf]} numberOfLines={1}>
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
      <OwnRow accessible accessibilityLabel={label} delay={delay} style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill, borderColor: colors.primary, borderWidth: 1 }]}>
        {body}
      </OwnRow>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={[styles.row, { flexDirection: dir.row }]}>
      {body}
    </View>
  );
});

/** How much the learner's own row swells as it arrives. */
const OWN_ROW_SWELL = 1.03;

/**
 * The learner's own row swells slightly and settles on the bouncy spring once it has risen into place, so it is
 * found at a glance. Once, on arrival, and not under Reduce Motion, where its colour and edge mark it.
 */
function OwnRow({ delay, style, children, ...rest }: React.ComponentProps<typeof View> & { delay: number | null }): React.JSX.Element {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce || delay === null) return;
    const run = Animated.sequence([timing(scale, OWN_ROW_SWELL, duration.quick + 40, { delay: delay + duration.slow }), springTo(scale, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // Once, as the row arrives.
  }, []);
  return (
    <Animated.View {...rest} style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * Out of the leagues: no group or table, and nothing that reads as missing out; just the week's goal ring and
 * this week beside past weeks.
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
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  head: { gap: spacing.md, marginBottom: spacing.sm },
  titleBlock: { gap: 2, paddingTop: spacing.xs },
  leagueTitle: { ...display(typography.sizes.title) },
  left: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  // The ladder runs from one edge of the phone to the other, past the list's gutter.
  ladderScroll: { marginHorizontal: -layout.gutter },
  ladder: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: LADDER_GAP, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: -layout.gutter },
  resting: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  daysPill: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, marginTop: spacing.sm },
  leave: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.md },
  // A fingertip tall, however few its words.
  leaveLink: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  leaveText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroTitle: { ...display(typography.sizes.title) },
  heroMeaning: { fontSize: typography.sizes.text },
  ends: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  endsText: { fontSize: typography.sizes.text },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalText: { flex: 1, gap: spacing.xs },
  endsSkeleton: { marginTop: spacing.xs },
  rankSkeleton: { width: 26 },
  zoneSkeleton: { paddingTop: spacing.sm, paddingBottom: 2, paddingHorizontal: spacing.xs },
  nameSkeleton: { flex: 1 },
  goalTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  goalHint: { fontSize: typography.sizes.text, lineHeight: 22 },
  safe: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  safeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  lastWeek: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lastLine: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, lineHeight: 21 },
  flex: { flex: 1, gap: 2 },
  rules: { gap: 4, marginTop: spacing.sm },
  rule: { fontSize: typography.sizes.text, lineHeight: 22 },
  waiting: { alignItems: 'center', gap: spacing.sm },
  waitTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.sm, paddingBottom: 2, paddingHorizontal: spacing.xs },
  zoneText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  gap: { height: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.sm, minHeight: MIN_TOUCH_TARGET + 4 },
  rank: { width: 26, textAlign: 'center', fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: typography.sizes.text },
  nameSelf: { fontWeight: typography.weights.bold },
  anon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  personal: { alignItems: 'center', gap: spacing.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  goalLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.45 },
  goalTag: { position: 'absolute', right: 0, fontSize: typography.sizes.text },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', borderRadius: radii.xs },
  barLabels: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  barLabel: { flex: 1, fontSize: typography.sizes.text, textAlign: 'center' },
});
