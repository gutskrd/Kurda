import { useCallback, useState, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import type { IncomingInvite, MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { Icon, type IconName } from '../theme/Icon';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { listStories } from '../stories/api';
import { getMyRanks } from '../ranks/api';
import { daysLeftText, seasonTitle } from '../ranks/format';
import { acceptInvite, listInvites } from '../play/api';
import { applyInviteEvent, liveInvites } from '../play/invites';
import { GAME_NAME_KEY } from '../play/labels';
import { lobbyRoute } from '../play/routes';
import { useUserEvents } from '../realtime/useUserEvents';

type GameRoute = 'Stories' | 'Wordle' | 'WordleBattle' | 'Rhyme' | 'RhymeMatch' | 'Race';
type Mode = 'solo' | 'friends' | 'both';

interface GameCard {
  key: string;
  route: GameRoute;
  icon: IconName;
  name: TranslationKey;
  /** one line, what you do in it */
  line: TranslationKey;
  mode: Mode;
}

/**
 * The games, in the order they are offered: Stories first (it is the one that
 * is most like learning), then each game alone and then its version against a
 * friend, then the race.
 */
export const GAME_CARDS: readonly GameCard[] = [
  { key: 'stories', route: 'Stories', icon: 'story', name: 'stories.title', line: 'games.card.stories', mode: 'both' },
  { key: 'wordle', route: 'Wordle', icon: 'grid', name: 'games.wordle.name', line: 'games.card.wordle', mode: 'solo' },
  { key: 'battle', route: 'WordleBattle', icon: 'people', name: 'games.battle.name', line: 'games.card.battle', mode: 'friends' },
  { key: 'rhyme', route: 'Rhyme', icon: 'speaker', name: 'games.rhyme.name', line: 'games.card.rhyme', mode: 'solo' },
  { key: 'rhymeMatch', route: 'RhymeMatch', icon: 'people', name: 'games.rhymeMatch.name', line: 'games.card.rhymeMatch', mode: 'friends' },
  { key: 'race', route: 'Race', icon: 'bolt', name: 'games.race.name', line: 'games.card.race', mode: 'solo' },
];

const MODE_LABEL: Record<Mode, TranslationKey> = {
  solo: 'games.mode.solo',
  friends: 'games.mode.friends',
  both: 'games.mode.both',
};

/**
 * Learn's second half: the games.
 *
 * At the top, small, the way into the rankings and the league — there for the
 * people who look for them, out of the way of the people who only came to
 * play. Then any game a friend has asked you into, because an invite runs out
 * and the games will still be here. Then the games themselves, as a grid of
 * cards that each say what the game is and whether it is played alone or with
 * friends; a game is one tap from here, two from anywhere.
 */
export function GamesView({ scrollRef }: { scrollRef?: Ref<ScrollView> }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  /**
   * Whether any story is published yet. Until one is, the card says "Coming
   * soon" and opens nothing — a hub with an empty list is a promise the screen
   * cannot keep. Asked again on each visit; the list is cached on the server.
   */
  const [hasStories, setHasStories] = useState<boolean | null>(null);
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  // the season's line under Ranks is held in grey until its answer, so the word above it does not jump
  const [ranksSettled, setRanksSettled] = useState(false);
  const [invites, setInvites] = useState<IncomingInvite[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listStories(client).then((res) => {
        if (live && res.ok) setHasStories(res.data.stories.length > 0);
      });
      void getMyRanks(client).then((res) => {
        if (!live) return;
        if (res.ok) setRanks(res.data);
        setRanksSettled(true);
      });
      void listInvites(client).then((res) => {
        if (live && res.ok) setInvites(res.data.incoming);
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  // an invite that arrives, or is answered somewhere else, while this is open
  useUserEvents(
    useCallback((ev) => {
      if (ev.type === 'play_invite' || ev.type === 'play_invite_update') setInvites((list) => applyInviteEvent(list, ev));
    }, []),
  );

  const join = useCallback(
    async (invite: IncomingInvite) => {
      setInvites((list) => list.filter((i) => i.id !== invite.id));
      const res = await acceptInvite(client, invite.id);
      // one that can no longer be accepted still opens the game, which says why
      const route = res.ok ? lobbyRoute(res.data.game, res.data.lobbyId) : lobbyRoute(invite.game, invite.lobbyId);
      navigation.navigate(route.name, route.params as never);
    },
    [client, navigation],
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
                  onPress={() => void join(invite)}
                  accessibilityRole="button"
                  accessibilityLabel={t('play.banner.joinLabel', { name: invite.from.name, game })}
                  style={[styles.joinButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.joinText, { color: colors.textOnPrimary }]}>{t('play.banner.join')}</Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('nav.games')}
        </Text>
        <View style={[styles.grid, { flexDirection: dir.row }]}>
          {GAME_CARDS.map((card) => {
            const soon = card.key === 'stories' && hasStories === false;
            const name = t(card.name);
            const mode = soon ? t('stories.card.soon') : t(MODE_LABEL[card.mode]);
            return (
              <PressableScale
                key={card.key}
                disabled={soon}
                onPress={() => navigation.navigate(card.route)}
                accessibilityRole="button"
                accessibilityState={{ disabled: soon }}
                accessibilityLabel={`${name}, ${mode}. ${t(card.line)}`}
                testID={`game-${card.key}`}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    opacity: soon ? 0.55 : 1,
                    alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start',
                  },
                ]}
              >
                <View style={[styles.cardIcon, { backgroundColor: colors.controlTrack }]}>
                  <Icon name={card.icon} size={22} color={colors.textPrimary} />
                </View>
                <Text style={[styles.cardName, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={[styles.cardLine, dir.text, { color: colors.textSecondary }]} numberOfLines={3}>
                  {t(card.line)}
                </Text>
                <View style={[styles.cardFoot, { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.mode, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
                    <Icon
                      name={card.mode === 'solo' ? 'person' : 'people'}
                      size={12}
                      color={colors.textSecondary}
                    />
                    <Text style={[styles.modeText, { color: colors.textSecondary }]} numberOfLines={2}>
                      {mode}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

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
  joinButton: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },

  grid: { flexWrap: 'wrap', gap: layout.rowGap },
  card: {
    // two to a row, with the gap between them
    width: '48%',
    flexGrow: 1,
    minHeight: 172,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  cardName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  cardLine: { fontSize: typography.sizes.xs, lineHeight: 18 },
  cardFoot: { flex: 1, alignSelf: 'stretch', justifyContent: 'flex-end', paddingTop: spacing.xs },
  mode: {
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  // a long "Solo or with friends" wraps inside its chip rather than running off the card
  modeText: { flexShrink: 1, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
});
