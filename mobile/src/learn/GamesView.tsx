import { useCallback, useState, type Ref } from 'react';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { gameOfTheDay, type IncomingInvite, type MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
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
import { GameStamp } from '../games/GameStamp';

type Mode = GameMode;
type Way = GameWay;

const MODE_LABEL: Record<Mode, TranslationKey> = {
  solo: 'games.mode.solo',
  friends: 'games.mode.friends',
  both: 'games.mode.both',
};

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
 * and the games will still be here. Then the game put forward today, and the
 * way into a game a friend told you the code of.
 *
 * Every game is a stamp (games/GameStamp.tsx): its drawn cover on paper of
 * its own hue, its Kurdish name, and what the name means. The one put forward
 * today is a large stamp on its own, with a line about it and its ways in
 * under it, one tap from here. The rest stand two to a row, like a page of a
 * collection. A stamp with one way in opens the game when it is pressed; a
 * game with two — alone or with a friend, on this phone or with friends —
 * opens a small sheet that says what the game is and offers each way, since
 * two buttons do not fit on a stamp and half a row of them made the page a
 * list of buttons. There is no filter: a handful of games is read faster
 * than a control that sorts them. A game still short of approved content is
 * only named, under the stamps.
 */
export function GamesView({ scrollRef }: { scrollRef?: Ref<ScrollView> }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client, isGuest } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  const { width: windowWidth } = useWindowDimensions();
  // two stamps to a row, three where there is room; the page is never wider than a column of reading,
  // and never narrower than the narrowest phone, which is what a window says before it has been measured
  const column = Math.max(NARROWEST, Math.min(windowWidth, layout.column)) - layout.gutter * 2;
  const columns = column >= 560 ? 3 : 2;
  const stampWidth = Math.floor((column - STAMP_GAP * (columns - 1)) / columns);
  const heroWidth = Math.min(HERO_STAMP, column - spacing.xl * 2);
  // the game whose ways in are being offered, while its sheet is up
  const [choosing, setChoosing] = useState<GameCard | null>(null);
  // the stamps are laid down one after another as the page arrives, and simply stand there on a later visit
  const enter = useListEntrance(true);
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  // the season's line under Ranks is held in grey until its answer, so the word above it does not jump
  const [ranksSettled, setRanksSettled] = useState(false);
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  // the learning games (games/learnGames.ts): all of them, those without enough approved content yet as coming soon
  const learnGames = useListedLearnGames();
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
  // the game put forward stands above the cards, and is not said twice among them
  const featured = featuredCard(cards, Date.now());
  // what the featured game's name means, unless the interface is Kurdish and the two are the same words
  const featuredMeaningKey = featured ? GAME_MEANING[featured.emblem] : undefined;
  const featuredMeaning = featured && featuredMeaningKey && t(featuredMeaningKey) !== t(featured.name) ? t(featuredMeaningKey) : null;
  const shelf = cards.filter((c) => !c.soon && c !== featured);
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
      setChoosing(null);
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

  const page = (
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
        <View style={styles.hero}>
          <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('games.featured')}</Text>
          <Rise delay={enter(0)} style={styles.heroStamp}>
            <PressableScale
              onPress={() => (featured.ways.length === 1 ? open(featured.ways[0]!) : setChoosing(featured))}
              accessibilityRole="button"
              accessibilityLabel={`${t(featured.name)}${featuredMeaning ? `, ${featuredMeaning}` : ''}. ${t(featured.line)}`}
              testID="game-featured"
            >
              <GameStamp game={featured.emblem} name={t(featured.name)} meaning={featuredMeaning} width={heroWidth} large moving={watching} />
            </PressableScale>
          </Rise>
          <Text style={[styles.heroLine, { color: colors.textSecondary }]}>{t(featured.line)}</Text>
          <View style={styles.heroWays}>
            {featured.ways.map((way, i) => (
              // said with the game's name, as the other way beside it is: "Play" alone tells a screen reader nothing
              <ClayButton
                key={way.key}
                label={t(way.label)}
                accessibilityLabel={`${t(featured.name)}, ${t(way.label)}`}
                tone={i === 0 ? 'primary' : 'neutral'}
                size="large"
                icon={i === 0 ? undefined : 'people'}
                onPress={() => open(way)}
                testID={`game-${way.key}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* a code a friend read out or sent opens their game, whichever of the games it is */}
      <JoinCodeCard />

      <View style={styles.section}>
        <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('nav.games')}
        </Text>
        <View style={[styles.stamps, { flexDirection: dir.row }]}>
          {shelf.map((card, place) => {
            const name = t(card.name);
            const meaningKey = GAME_MEANING[card.emblem];
            // what the name means, unless the interface is Kurdish and the two are the same words
            const meaning = meaningKey && t(meaningKey) !== name ? t(meaningKey) : null;
            const single = card.ways.length === 1 ? card.ways[0]! : null;
            return (
              <Rise key={card.key} delay={enter(place + 1)}>
                <PressableScale
                  onPress={() => (single ? open(single) : setChoosing(card))}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}, ${t(MODE_LABEL[card.mode])}. ${t(card.line)}`}
                  // one way in: the stamp is the game. Two: the stamp is the card that offers them.
                  testID={single ? `game-${card.key}` : `card-${card.key}`}
                >
                  {/* each cover a little after the one before, so the page never moves as one */}
                  <GameStamp game={card.emblem} name={name} meaning={meaning} width={stampWidth} moving={watching} after={900 + place * 1300} />
                </PressableScale>
              </Rise>
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

  return (
    <>
      {page}
      {/* beside the page, not in it: a sheet among the page's rows would be given a row's gap of its own */}
      <WaysSheet card={choosing} onClose={() => setChoosing(null)} onOpen={open} />
    </>
  );
}

/**
 * The ways into a game that has more than one: what the game is, in a line,
 * and a button for each way, the first of them the app's own. It opens from
 * the stamp that was pressed and goes when a way is chosen or it is put away.
 * It keeps the last game it showed while it leaves, so its words do not
 * vanish before it has.
 */
function WaysSheet({ card, onClose, onOpen }: { card: GameCard | null; onClose: () => void; onOpen: (way: Way) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [last, setLast] = useState<GameCard | null>(card);
  if (card && card !== last) setLast(card);
  const shown = card ?? last;
  return (
    <BottomSheet visible={card !== null} onClose={onClose} title={shown ? t(shown.name) : undefined} testID="game-ways">
      {shown ? (
        <View style={styles.ways}>
          <View style={[styles.waysTop, { flexDirection: dir.row }]}>
            <GameArt game={shown.emblem} size={72} />
            <Text style={[styles.waysLine, dir.text, { color: colors.textSecondary }]}>{t(shown.line)}</Text>
          </View>
          {shown.ways.map((way, i) => (
            <ClayButton
              key={way.key}
              label={t(way.label)}
              accessibilityLabel={`${t(shown.name)}, ${t(way.label)}`}
              tone={i === 0 ? 'primary' : 'neutral'}
              size="large"
              icon={way.label === 'games.mode.friends' ? 'people' : undefined}
              onPress={() => onOpen(way)}
              testID={`game-${way.key}`}
            />
          ))}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/**
 * Join is drawn as tall as the avatar it shares a row with, and caught as a
 * full fingertip: the slop above and below makes up the difference.
 */
const JOIN_HEIGHT = 36;
const JOIN_SLOP = hitSlopFor(MIN_TOUCH_TARGET, JOIN_HEIGHT);
/** Between two stamps, across and down: room for each one's light to fade before the next begins. */
const STAMP_GAP = 20;
/** The stamp put forward today, at its widest. */
const HERO_STAMP = 228;
/** The narrowest screen the page is laid out for. */
const NARROWEST = 320;

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

  // the game put forward: its stamp in the middle of the page, its line and its ways in under it
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xs },
  heroStamp: { marginVertical: spacing.sm },
  heroLine: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', paddingHorizontal: spacing.md },
  heroWays: { alignSelf: 'stretch', gap: spacing.sm },

  // a page of a collection: the stamps stand in rows, each row level, with air between for their light
  stamps: { flexWrap: 'wrap', columnGap: STAMP_GAP, rowGap: STAMP_GAP + 4, paddingTop: spacing.sm },

  ways: { gap: spacing.sm, paddingBottom: spacing.sm },
  waysTop: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  waysLine: { flex: 1, fontSize: typography.sizes.md, lineHeight: 23 },

  // a game not open yet is only named: quieter than a card, and nothing to press
  soonRow: { flexWrap: 'wrap', gap: spacing.sm },
  soon: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.pill, paddingVertical: 6, paddingStart: 6, paddingEnd: spacing.md },
  soonArt: { opacity: 0.7 },
  soonName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
