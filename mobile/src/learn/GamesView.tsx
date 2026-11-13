import { useCallback, useState, type Ref } from 'react';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { gameOfTheDay, type IncomingInvite, type MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { Icon } from '../theme/Icon';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { getMyRanks } from '../ranks/api';
import { daysLeftText, seasonTitle } from '../ranks/format';
import { acceptInvite, listInvites } from '../play/api';
import { applyInviteEvent, liveInvites } from '../play/invites';
import { joining } from '../play/joining';
import { JoinCodeCard } from '../play/JoinByCode';
import { GAME_NAME_KEY } from '../play/labels';
import { lobbyRoute } from '../play/routes';
import { usePullRefresh } from '../net/usePullRefresh';
import { useUserEvents } from '../realtime/useUserEvents';
import { PHONE_LEARN_GAMES, useListedLearnGames } from '../games/learnGames';
import { GAME_CARDS, GAME_MEANING, learnGameCard, type GameCard, type GameMode, type GameWay } from '../games/gameCards';
import { GameArt } from '../games/GameArt';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';

type Mode = GameMode;
type Way = GameWay;
type Filter = 'all' | 'solo' | 'friends';

const MODE_LABEL: Record<Mode, TranslationKey> = {
  solo: 'games.mode.solo',
  friends: 'games.mode.friends',
  both: 'games.mode.both',
};

const FILTERS: ReadonlyArray<{ id: Filter; label: TranslationKey }> = [
  { id: 'all', label: 'games.filter.all' },
  { id: 'solo', label: 'games.mode.solo' },
  { id: 'friends', label: 'games.mode.friends' },
];

/** Whether a game is played the way a filter asks for. */
const playedAs = (mode: Mode, filter: Filter): boolean => filter === 'all' || mode === 'both' || mode === filter;

/**
 * The game the screen puts forward today: one of those that can be played,
 * the same one the website puts forward (pure, for the tests).
 */
export function featuredCard(cards: readonly GameCard[], now: number): GameCard | null {
  const open = cards.filter((c) => !c.soon);
  const today = gameOfTheDay(open.length, now);
  return today === null ? null : open[today]!;
}

/**
 * Learn's third group: the games.
 *
 * At the top, small, the way into the rankings and the league — there for the
 * people who look for them, out of the way of the people who only came to
 * play. Then any game a friend has asked you into, because an invite runs out
 * and the games will still be here. Then the game put forward today, on the
 * night the party games are played on, and the way into a game a friend told
 * you the code of.
 *
 * Then the games themselves, each one card: its drawn cover, a line about
 * it, and a way in. A game with one way in opens
 * when its card is pressed; a game with a screen for playing alone and
 * another for playing a friend has a button for each, and so has Who Am I?,
 * played on this phone or with friends, so a game is one tap from here. A
 * filter shows the games played alone or with friends, and a game still
 * short of approved content is only named, under the cards.
 */
export function GamesView({ scrollRef }: { scrollRef?: Ref<ScrollView> }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, isGuest } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  // the season's line under Ranks is held in grey until its answer, so the word above it does not jump
  const [ranksSettled, setRanksSettled] = useState(false);
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  // the learning games (games/learnGames.ts): all of them, those without enough approved content yet as coming soon
  const learnGames = useListedLearnGames();
  const [filter, setFilter] = useState<Filter>('all');
  // the emblems act while this screen is the one being looked at, and rest while another is
  const watching = useIsFocused();
  const cards: GameCard[] = [
    ...GAME_CARDS,
    ...learnGames.flatMap(({ game: g, ready }): GameCard[] => {
      const phone = PHONE_LEARN_GAMES[g.id];
      const mode: Mode = g.mode === 'solo' ? 'solo' : g.mode === 'multi' ? 'friends' : 'both';
      return phone ? [learnGameCard({ id: g.id, ...phone, mode, ready })] : [];
    }),
  ];
  // the game put forward stands above the cards, and is not said twice among them; under a filter the cards are whole
  const featured = filter === 'all' ? featuredCard(cards, Date.now()) : null;
  // what the featured game's name means, unless the interface is Kurdish and the two are the same words
  const featuredMeaningKey = featured ? GAME_MEANING[featured.emblem] : undefined;
  const featuredMeaning = featured && featuredMeaningKey && t(featuredMeaningKey) !== t(featured.name) ? t(featuredMeaningKey) : null;
  const shelf = cards.filter((c) => !c.soon && c !== featured && playedAs(c.mode, filter));
  const upcoming = cards.filter((c) => c.soon);

  /**
   * Reads the rank and the invites, for the screen coming into view and for a
   * pull. `live` says whether the answer is still wanted: a screen left while
   * it travelled takes none of it.
   */
  const read = useCallback(
    async (live: () => boolean): Promise<void> => {
      // a guest holds no rank and is sent no invites, and the server refuses both questions
      if (isGuest) {
        setRanksSettled(true);
        return;
      }
      await Promise.all([
        getMyRanks(client).then((res) => {
          if (!live()) return;
          if (res.ok) setRanks(res.data);
          setRanksSettled(true);
        }),
        listInvites(client).then((res) => {
          if (live() && res.ok) setInvites(res.data.incoming);
        }),
      ]);
    },
    [client, isGuest],
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void read(() => live);
      return () => {
        live = false;
      };
    }, [read]),
  );

  // pulled down, it reads again, as Lessons and Stories beside it do — an invite or a rank that changed elsewhere need not wait for a tab change
  const pull = usePullRefresh(() => read(() => true));

  // an invite that arrives, or is answered somewhere else, while this is open
  useUserEvents(
    useCallback((ev) => {
      if (ev.type === 'play_invite' || ev.type === 'play_invite_update') setInvites((list) => applyInviteEvent(list, ev));
    }, []),
  );

  const join = useCallback(
    (invite: IncomingInvite) => {
      setInvites((list) => list.filter((i) => i.id !== invite.id));
      /*
       * The lobby opens at once, and the invite is accepted behind it: its
       * first read waits for that (play/joining.ts). The row used to go, and
       * then nothing happened for the length of a request. One that can no
       * longer be accepted still opens the game, which says why.
       */
      joining(invite.lobbyId, acceptInvite(client, invite.id));
      const route = lobbyRoute(invite.game, invite.lobbyId);
      navigation.navigate(route.name, route.params as never);
    },
    [client, navigation],
  );

  const open = useCallback(
    (way: Way) => {
      // only Who Am I?'s screen takes a way to open on; every other game has a screen for each of its ways
      if (way.route === 'WhoAmI' && way.params) navigation.navigate('WhoAmI', way.params);
      else navigation.navigate(way.route);
    },
    [navigation],
  );

  const shown = liveInvites(invites, Date.now());
  // the season's name on the chip; how long it has left is said to a screen reader and on the Ranks screen
  const season = ranks ? seasonTitle(t, ranks.season) : null;
  const seasonSpoken = ranks ? `${seasonTitle(t, ranks.season)}, ${daysLeftText(t, ranks.season.daysLeft)}` : null;
  const cooldown = ranks?.cooldownUntil ? new Date(ranks.cooldownUntil) : null;
  const cooling = cooldown !== null && cooldown.getTime() > Date.now();

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}
      showsVerticalScrollIndicator={false}
      refreshControl={pull}
    >
      {/* rankings and the league: small, at the top, for whoever looks for them */}
      <View style={[styles.entries, { flexDirection: dir.row }]}>
        <PressableScale
          onPress={() => navigation.navigate('Ranks')}
          accessibilityRole="button"
          accessibilityLabel={seasonSpoken ? `${t('ranks.title')}, ${seasonSpoken}` : t('ranks.title')}
          style={[styles.entry, { backgroundColor: colors.surface }]}
        >
          <Icon name="mountains" size={20} color={colors.textPrimary} />
          <View style={styles.entryText}>
            <Text style={[styles.entryTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('ranks.title')}
            </Text>
            {season ? (
              <Text style={[styles.entryDetail, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                {season}
              </Text>
            ) : !ranksSettled ? (
              <SkeletonText size={typography.sizes.xs} width={72} style={{ alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' }} />
            ) : null}
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => navigation.navigate('League')}
          accessibilityRole="button"
          accessibilityLabel={t('leagues.screenTitle')}
          style={[styles.entry, { backgroundColor: colors.surface }]}
        >
          <Icon name="trophy" size={20} color={colors.textPrimary} />
          <View style={styles.entryText}>
            <Text style={[styles.entryTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('leagues.screenTitle')}
            </Text>
            <Text style={[styles.entryDetail, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('learn.games.leagueHint')}
            </Text>
          </View>
        </PressableScale>
      </View>
      {cooling && cooldown ? (
        <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>
          {t('ranks.cooldown', { time: cooldown.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
        </Text>
      ) : null}

      {shown.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('learn.games.invites')}
          </Text>
          {shown.map((invite) => {
            const game = t(GAME_NAME_KEY[invite.game]);
            const headline = invite.rematch
              ? t('play.banner.rematch', { name: invite.from.name, game })
              : t('play.banner.invited', { name: invite.from.name, game });
            return (
              <View key={invite.id} style={[styles.invite, { backgroundColor: colors.surface, flexDirection: dir.row }]}>
                <InitialsAvatar name={invite.from.name} id={invite.from.name} size={36} photoUrl={invite.from.avatarUrl} />
                <Text style={[styles.inviteText, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
                  {headline}
                </Text>
                <PressableScale
                  onPress={() => join(invite)}
                  accessibilityRole="button"
                  accessibilityLabel={t('play.banner.joinLabel', { name: invite.from.name, game })}
                  hitSlop={JOIN_SLOP}
                  style={[styles.joinButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.joinText, { color: colors.textOnPrimary }]}>{t('play.banner.join')}</Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      ) : null}

      {featured ? (
        <Cloth style={styles.hero}>
          <GameArt game={featured.emblem} size={132} moving={watching} />
          <Text style={styles.heroKicker}>{t('games.featured')}</Text>
          <Text style={styles.heroName} accessibilityRole="header">
            {t(featured.name)}
          </Text>
          {featuredMeaning ? <Text style={styles.heroMeaning}>{featuredMeaning}</Text> : null}
          <Text style={styles.heroLine}>{t(featured.line)}</Text>
          <View style={styles.heroWays}>
            {featured.ways.map((way, i) =>
              i === 0 ? (
                <GoldButton key={way.key} label={t(way.label)} onPress={() => open(way)} testID={`game-${way.key}`} />
              ) : (
                <PressableScale
                  key={way.key}
                  onPress={() => open(way)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(featured.name)}, ${t(way.label)}`}
                  testID={`game-${way.key}`}
                  style={styles.heroOther}
                >
                  <Icon name="people" size={18} color={TABLE.ink} />
                  <Text style={styles.heroOtherText}>{t(way.label)}</Text>
                </PressableScale>
              ),
            )}
          </View>
        </Cloth>
      ) : null}

      {/* a code a friend read out or sent opens their game, whichever of the games it is */}
      <JoinCodeCard />

      <View style={styles.section}>
        <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('nav.games')}
        </Text>
        <View style={[styles.filters, { flexDirection: dir.row }]}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <PressableScale
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="button"
                accessibilityLabel={t(f.label)}
                accessibilityState={{ selected: on }}
                aria-pressed={on}
                testID={`games-filter-${f.id}`}
                style={[styles.filter, { backgroundColor: on ? colors.textPrimary : colors.surface }]}
              >
                <Text style={[styles.filterText, { color: on ? colors.background : colors.textPrimary }]}>{t(f.label)}</Text>
              </PressableScale>
            );
          })}
        </View>
        <View style={styles.cards}>
          {shelf.map((card, place) => {
            const name = t(card.name);
            const meaningKey = GAME_MEANING[card.emblem];
            // what the name means, unless the interface is Kurdish and the two are the same words
            const meaning = meaningKey && t(meaningKey) !== name ? t(meaningKey) : null;
            const single = card.ways.length === 1 ? card.ways[0]! : null;
            const inside = (
              <>
                <View style={styles.cardArt}>
                  {/* each card a little after the one before, so the list never moves as one */}
                  <GameArt game={card.emblem} size={96} moving={watching} after={900 + place * 1300} />
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardName, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
                    {name}
                  </Text>
                  {meaning ? <Text style={[styles.cardMeaning, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
                  <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]}>{t(card.line)}</Text>
                  {single ? (
                    <View style={[styles.cardFoot, { flexDirection: dir.row }]}>
                      <View style={[styles.play, { backgroundColor: TABLE.gold }]}>
                        <Text style={[styles.playText, { color: TABLE.goldInk }]}>{t('games.play')}</Text>
                      </View>
                      <View style={[styles.mode, { flexDirection: dir.row }]}>
                        <Icon name={card.mode === 'solo' ? 'person' : 'people'} size={13} color={colors.textSecondary} />
                        <Text style={[styles.modeText, { color: colors.textSecondary }]} numberOfLines={2}>
                          {t(MODE_LABEL[card.mode])}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.cardFoot, { flexDirection: dir.row }]}>
                      {card.ways.map((way, i) => (
                        <PressableScale
                          key={way.key}
                          onPress={() => open(way)}
                          accessibilityRole="button"
                          accessibilityLabel={`${name}, ${t(way.label)}`}
                          hitSlop={WAY_SLOP}
                          testID={`game-${way.key}`}
                          style={[styles.play, { backgroundColor: i === 0 ? TABLE.gold : colors.controlTrack }]}
                        >
                          <Text style={[styles.playText, { color: i === 0 ? TABLE.goldInk : colors.textPrimary }]}>{t(way.label)}</Text>
                        </PressableScale>
                      ))}
                    </View>
                  )}
                </View>
              </>
            );
            // one way in: the whole card opens it. Two: the card holds a button for each, and is not itself pressed.
            return single ? (
              <PressableScale
                key={card.key}
                onPress={() => open(single)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${t(MODE_LABEL[card.mode])}. ${t(card.line)}`}
                testID={`game-${card.key}`}
                style={[styles.card, { backgroundColor: colors.surface, flexDirection: dir.row }]}
              >
                {inside}
              </PressableScale>
            ) : (
              <View key={card.key} testID={`card-${card.key}`} style={[styles.card, { backgroundColor: colors.surface, flexDirection: dir.row }]}>
                {inside}
              </View>
            );
          })}
        </View>
      </View>

      {upcoming.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('games.comingSoon')}
          </Text>
          <View style={[styles.soonRow, { flexDirection: dir.row }]}>
            {upcoming.map((card) => (
              <View
                key={card.key}
                accessible
                accessibilityLabel={`${t(card.name)}, ${t('games.comingSoon')}`}
                testID={`game-${card.key}`}
                style={[styles.soon, { backgroundColor: colors.surface, flexDirection: dir.row }]}
              >
                <View style={styles.soonArt}>
                  <GameArt game={card.emblem} size={36} />
                </View>
                <Text style={[styles.soonName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t(card.name)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * Join is drawn as tall as the avatar it shares a row with, and caught as a
 * full fingertip: the slop above and below makes up the difference.
 */
const JOIN_HEIGHT = 36;
const JOIN_SLOP = hitSlopFor(MIN_TOUCH_TARGET, JOIN_HEIGHT);
/** A card's button is drawn a little shorter than a fingertip and caught as a whole one, as Join is. */
const PLAY_HEIGHT = 36;
const WAY_SLOP = hitSlopFor(MIN_TOUCH_TARGET, PLAY_HEIGHT);
const FILTER_HEIGHT = MIN_TOUCH_TARGET;

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.lg },
  entries: { gap: layout.rowGap },
  entry: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET + 8,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  entryText: { flex: 1, gap: 1 },
  entryTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  entryDetail: { fontSize: typography.sizes.xs },
  note: { fontSize: typography.sizes.xs, marginTop: -spacing.sm },

  section: { gap: spacing.sm },
  heading: { ...sectionLabel },
  invite: { alignItems: 'center', gap: spacing.md - 4, borderRadius: radii.md, padding: spacing.md - 4 },
  inviteText: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  joinButton: { minHeight: JOIN_HEIGHT, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },

  // the game put forward: on the night the party games are played on, in the light theme and the dark alike
  hero: { alignItems: 'center', gap: spacing.xs, borderRadius: radii.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  heroKicker: { marginTop: spacing.sm, color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  heroName: { color: TABLE.ink, fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, textAlign: 'center' },
  heroMeaning: { marginTop: -6, color: TABLE.inkSoft, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  heroLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  heroWays: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  heroOther: {
    minHeight: MIN_TOUCH_TARGET + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: TABLE.veil,
  },
  heroOtherText: { color: TABLE.ink, fontSize: typography.ios.button, fontWeight: typography.weights.semibold },

  filters: { gap: spacing.sm },
  filter: { minHeight: FILTER_HEIGHT, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill },
  filterText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  cards: { gap: layout.rowGap },
  // a card lies on its side, picture first, so its words have the width of the screen
  card: { alignItems: 'stretch', gap: spacing.md, borderRadius: radii.lg, padding: spacing.sm + 2 },
  cardArt: { alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, justifyContent: 'center', gap: 4, paddingVertical: 2 },
  cardName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  cardMeaning: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, marginTop: -2 },
  cardLine: { fontSize: typography.sizes.sm, lineHeight: 19 },
  cardFoot: { flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  play: { minHeight: PLAY_HEIGHT, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill },
  playText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  mode: { flexShrink: 1, alignItems: 'center', gap: 4 },
  // a long "Solo or with friends" wraps beside the button rather than running off the card
  modeText: { flexShrink: 1, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },

  // a game not open yet is only named: quieter than a card, and nothing to press
  soonRow: { flexWrap: 'wrap', gap: spacing.sm },
  soon: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.pill, paddingVertical: 6, paddingStart: 6, paddingEnd: spacing.md },
  soonArt: { opacity: 0.7 },
  soonName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
