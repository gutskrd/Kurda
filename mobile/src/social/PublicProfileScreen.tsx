import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, ScrollView, Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { haptic } from '../feedback/haptics';
import type { ApiError } from '../api/types';
import { useIntents, useSayNotSaved } from '../api/optimistic';
import { useUnread } from '../messages/unread';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Fire } from '../theme/Fire';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { showActions } from '../theme/actionSheet';
import { SITE_ORIGIN } from '../feed/api';
import { friendActionLabel, isActionable, isUndo, undoAction, type FriendStatus } from './format';
import { knownTier, leagueName } from '../leagues/format';
import { Framed, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { badgesInOrder, countryName, fireLevel, type ProfileBadge, type ProfileLeague, type ProfileWordTag, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { Flag } from '../profile/cosmetic-parts';
import { Avatar } from '../profile/Avatar';
import { ActivityGrid, ActivityTabs, ProfileActivitySkeleton, nearEnd, useProfileActivity } from '../profile/ProfileActivity';
import type { FavoriteRef } from '../profile/types';
import { ProfileFriends, ProfileFriendsSkeleton } from '../profile/ProfileFriends';
import { ProfileFacts, type ProfileFact } from '../profile/ProfileFacts';
import { FACE, FRAMED, ProfileHead, ProfileHeadSkeleton } from '../profile/ProfileHead';
import { BadgePill, BadgePillSkeleton } from '../profile/BadgeRow';
import { CollectionSheet } from '../profile/CollectionSheet';
import { Favourites } from '../profile/Favourites';
import type { LevelInfo } from '../profile/types';
import type { ProfileSections } from '../profile/sections';
import { ReportSheet } from '../reports/ReportSheet';
import { useBlock } from './blocks';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact, formatNumber } from '../i18n/format';
import { PlayWithButton } from '../play/PlayWithButton';
import { useAnnouncer } from '../stories/ui';
import { useDirection } from '../reports/direction';
import { TicketSlip } from './FriendTicket';
import { usePageWidth } from '../theme/pageWidth';
import { Icon } from '../theme/Icon';
import { ParentalNote } from '../parental/ParentalNote';
import { useParentalOff } from '../parental/supervision';

interface Profile {
  userId: string;
  username: string;
  displayName: string | null;
  /** What they say about themselves, and where they are from: sent with a profile you may see. */
  bio?: string | null;
  country?: string | null;
  /** The server resolves this (uploaded photo, else chosen avatar). */
  avatarUrl?: string | null;
  friendStatus: FriendStatus;
  private: boolean;
  /** Their XP as older servers sent it; current ones send it inside `level`. */
  xp?: number;
  /** Their level and the XP behind it: where their XP is, on a profile you may see. */
  level?: LevelInfo | null;
  streak?: number;
  /** Their league tier, or null for someone not in the leagues (never a made-up "bronze"). */
  tier?: string | null;
  league?: ProfileLeague | null;
  /** The season frame they wear round their avatar. */
  frameSku?: string | null;
  /** The picture of a frame from the shop; a season frame is drawn from its SKU. */
  frameUrl?: string | null;
  /** The word tag worn by the name, while it is owned. */
  tag?: ProfileWordTag | null;
  /** Badges earned (and the legacy tournament win). */
  achievements?: number;
  /** The three badges they chose to show. */
  badges?: ShowcaseBadge[];
  /** Every badge they earned, newest first; absent on an older server. */
  earnedBadges?: ProfileBadge[];
  /** Which activity sections they let people see; null when private. */
  sections?: ProfileSections | null;
  /** Their tree as it stands today; null before they plant one or when private, absent on a server without trees. */
  tree?: TreeGlimpse | null;
  /*
   * What they pinned to their profile. The API sends these only while the post is still published, so an unpublished
   * one arrives as null and simply does not draw.
   */
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
}

/**
 * Somebody else's profile: who they are first (their sky and face, the name they chose, where they are from, their
 * bio), then the one thing most people came to do as the filled button (write to a friend, ask to be friends, answer a
 * request), then their numbers and what they made. Ending something or telling a moderator is behind the ⋯ in the top
 * bar: share their profile, unfriend, report, block, each one tap from the menu.
 */
export function PublicProfileScreen({ userId, onExit }: { userId: string; onExit: () => void }) {
  const { client } = useAuth();
  // Anyone's profile is open to a guest; writing to or befriending them needs an account (auth/AccountGate).
  const { require } = useAccountGate();
  // A supervised teen whose parent turned friend requests off is told so where the request would be.
  const friendsOff = useParentalOff('friends');
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const facts = useFacts();
  // In right-to-left languages the numbers start on the right, as reading does.
  const dir = useDirection();
  const windowWidth = usePageWidth();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Gone or hidden from you, or an account that is suspended or banned, which is said as that.
  const [notFound, setNotFound] = useState<false | 'profile' | 'account'>(false);
  const [reporting, setReporting] = useState(false);
  // Their collection: badges, icons and gifts, opened from the row beside the handle.
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const { announce, region } = useAnnouncer();
  const { report } = useUnread();
  const say = useSayNotSaved();
  const blockNow = useBlock();

  const load = useCallback(() => {
    void client.get<Profile>(`/users/${encodeURIComponent(userId)}`).then((res) => {
      if (res.ok) {
        setProfile(res.data);
        setError(null);
      } else if (res.error.kind === 'client' && res.error.status === 404) {
        // Genuinely unavailable, as distinct from offline or a server error.
        setNotFound(res.error.code === 'ACCOUNT_UNAVAILABLE' ? 'account' : 'profile');
      } else {
        setError(res.error);
      }
    });
  }, [client, userId]);

  useFocusEffect(useCallback(() => load(), [load]));

  /*
   * Asking, accepting, withdrawing and, once confirmed, unfriending show at once and are sent after, the last tap
   * winning; the answer's status is kept and the profile read again. A refusal (a full friend list, too many outgoing:
   * limits/limitCopy.ts) goes back and says why.
   */
  const befriending = useIntents<string, FriendStatus, { outcome?: string } | null>(
    async (id, wanted, confirmed) => {
      const at = encodeURIComponent(id);
      const res =
        wanted === 'pending_out'
          ? await client.post<{ outcome?: string }>('/friends/requests', { userId: id })
          : wanted === 'friends'
            ? await client.post<null>(`/friends/requests/${at}/accept`)
            : await client.delete<null>(confirmed === 'pending_out' ? `/friends/requests/${at}` : `/friends/${at}`);
      if (res.ok) {
        const now = friendStatusAfter(res.data, wanted);
        setProfile((p) => p && { ...p, friendStatus: now });
        load();
      }
      return res;
    },
    {
      answered: friendStatusAfter,
      failed: (error, _id, confirmed) => {
        // An accept that did not take leaves their request waiting, and counted.
        if (confirmed === 'pending_in') report((now) => ({ requests: now.requests + 1 }));
        say(error);
      },
    },
  );
  const status = profile ? befriending.shown(profile.userId, profile.friendStatus) : null;

  /*
   * A sent request is announced as the button hands its ticket over (TicketSlip), not on arriving at a profile already
   * requested.
   */
  const lastStatus = useRef(status);
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = status;
    if (before === 'none' && status === 'pending_out') announce(t('friends.requestSent'));
  }, [status, announce, t]);

  const perform = useCallback(
    (from: FriendStatus) => {
      if (!profile) return;
      // An offer made (a request sent, or accepted) is felt; taking one back is quiet.
      if (from === 'none' || from === 'pending_in') haptic('tap');
      if (from === 'pending_in') report((now) => ({ requests: Math.max(0, now.requests - 1) }));
      befriending.want(profile.userId, from === 'none' ? 'pending_out' : from === 'pending_in' ? 'friends' : 'none', profile.friendStatus);
    },
    [profile, befriending, report],
  );

  /**
   * The button, and the confirmation the two destructive states ask first. Sending or accepting a request happens on
   * tap. Cancelling a request and ending a friendship throw away something shared that only the other person could
   * restore, so both name the person and wait for a yes.
   */
  const act = useCallback(
    (status: FriendStatus) => {
      const undo = undoAction(status);
      if (!undo) {
        perform(status);
        return;
      }
      const name = profile?.displayName ?? profile?.username ?? '';
      Alert.alert(t(undo.label), t(undo.prompt, { name }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t(undo.label), style: 'destructive', onPress: () => perform(status) },
      ]);
    },
    [perform, profile, t],
  );

  const block = useCallback(() => {
    // Named as the menu names them: the name they chose, else their handle.
    Alert.alert(t('moderation.blockWhoTitle', { name: profile?.displayName ?? profile?.username ?? '' }), t('moderation.blockNote'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () => {
          // Blocked: their profile is gone for you at once; a refusal (at the block limit) is said wherever you are.
          blockNow(userId);
          onExit();
        },
      },
    ]);
  }, [blockNow, userId, onExit, t]);

  const name = profile?.displayName ?? profile?.username ?? '';
  /** Their profile's address, as anybody can open it: the same link the website shares. */
  const share = useCallback(() => {
    if (!profile) return;
    void Share.share({ message: t('profile.shareMessage', { name, url: `${SITE_ORIGIN}/app/users/${profile.userId}` }) });
  }, [profile, name, t]);

  /** The menu about them: everything but the one thing most people came to do. */
  const more = useCallback(() => {
    if (!profile) return;
    showActions({
      title: name,
      cancel: t('common.cancel'),
      actions: [
        { label: t('profile.share'), onPress: share },
        // A friendship is ended from here, confirmed first (act), not by a button beside "Message".
        ...(status === 'friends' ? [{ label: t('friends.removeFriend'), destructive: true, onPress: () => act('friends') }] : []),
        { label: t('moderation.report'), onPress: () => setReporting(true) },
        { label: t('moderation.block'), destructive: true, onPress: block },
      ],
    });
  }, [profile, name, share, act, block, t]);
  // Nothing to end, report or block about yourself.
  const menu = profile && profile.friendStatus !== 'self' ? <HeaderButton icon="more" label={t('moderation.moreAbout', { name })} onPress={more} testID="profile-more" /> : null;

  // What they posted and played, for a profile you may see; the tabs stay under the top bar while the grid scrolls.
  const activity = useProfileActivity({ userId: profile && !profile.private ? profile.userId : null, sections: profile?.sections });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (nearEnd(e)) activity.more();
  };

  if (notFound) {
    return (
      <GradientBackground>
        <View style={styles.screen}>
          <Header onExit={onExit} />
          <View style={styles.centered}><Text style={[styles.dim, { color: colors.textSecondary }]}>{t(notFound === 'account' ? 'account.unavailable' : 'profile.unavailable')}</Text></View>
        </View>
      </GradientBackground>
    );
  }
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <Header onExit={onExit} right={menu} />
        <ScrollView
          contentContainerStyle={styles.scroll}
          // Runs to the screen's edges, so the banner, the tabs and the grid can; the words keep the page's gutter.
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={64}
          stickyHeaderIndices={[1]}
        >
          <View>
            <AsyncBoundary loading={!profile} error={!profile ? error : null} onRetry={load} skeleton={<PublicProfileSkeleton width={windowWidth} />}>
              {() => {
                if (!profile) return null;
                // A friend's button would only say so: ending it is in the menu, and what you do with a friend is write and play.
                const shown = status ?? profile.friendStatus;
                const labelKey = shown === 'friends' ? null : friendActionLabel(shown);
                const shownName = profile.displayName ?? profile.username;
                const level = profile.level && typeof profile.level.progress === 'number' && typeof profile.level.nextLevelXp === 'number' ? profile.level : null;
                const league = profile.league ?? (knownTier(profile.tier) ? { tier: knownTier(profile.tier)! } : null);
                return (
                  <>
                    <ProfileHead
                      seed={profile.userId}
                      width={windowWidth}
                      face={
                        <Framed sku={profile.frameSku} url={profile.frameUrl} size={FRAMED} label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
                          <Avatar name={shownName} size={FACE} photoUrl={profile.avatarUrl} />
                        </Framed>
                      }
                      framed={!!frameTierOf(profile.frameSku) || !!(profile.frameSku && profile.frameUrl)}
                      // The figures as on their own profile and the website, in the reader's own digits.
                      stats={profile.private ? undefined : <ProfileFacts facts={facts(profile)} head />}
                      name={shownName}
                      level={profile.private ? null : level}
                      tag={profile.private ? null : profile.tag}
                      handle={`@${profile.username}`}
                      handleAside={
                        profile.private ? null : (
                          <BadgePill
                            league={knownTier(league?.tier)}
                            tree={profile.tree}
                            badges={badgesInOrder(profile.badges, profile.earnedBadges)}
                            own={profile.friendStatus === 'self'}
                            title={profile.friendStatus === 'self' ? t('collection.title.own') : t('collection.title.other', { name: shownName })}
                            onOpen={() => setCollecting(true)}
                          />
                        )
                      }
                      actions={
                        profile.friendStatus !== 'self' ? (
                          <View style={[styles.actions, { flexDirection: dir.row }]}>
                            {shown === 'friends' ? (
                              <>
                                <View style={styles.action}>
                                  <ClayButton
                                    label={t('profile.message')}
                                    icon="send"
                                    tone="primary"
                                    size="large"
                                    onPress={() => require('message') && navigation.navigate('Chat', { userId: profile.userId, username: profile.username })}
                                  />
                                </View>
                                {/* A challenge is any game, through the invite sheet. */}
                                <View style={styles.action}>
                                  <PlayWithButton friendId={profile.userId} name={shownName} />
                                </View>
                              </>
                            ) : null}
                            {labelKey && friendsOff && (shown === 'none' || shown === 'pending_in') ? (
                              // A parent turned friend requests off: a calm line where the request would be made or taken.
                              <View style={styles.action}>
                                <ParentalNote />
                              </View>
                            ) : labelKey ? (
                              // A request is a ticket handed over: it slips away from the button, and home again when taken back.
                              <View style={styles.action}>
                                <TicketSlip sent={shown === 'pending_out'}>
                                  <ClayButton
                                    label={t(labelKey)}
                                    icon={shown === 'pending_out' ? 'ticket' : shown === 'none' ? 'user-plus' : undefined}
                                    // An undo is pressable but not an invitation, so it stays neutral.
                                    tone={isActionable(shown) && !isUndo(shown) ? 'primary' : 'neutral'}
                                    size="large"
                                    disabled={!isActionable(shown)}
                                    onPress={() => require('friends') && act(shown)}
                                  />
                                </TicketSlip>
                              </View>
                            ) : null}
                          </View>
                        ) : null
                      }
                    >
                      {!profile.private && profile.country ? (
                        <View style={[styles.country, { flexDirection: dir.row }]}>
                          <Flag code={profile.country} />
                          <Text style={[styles.countryName, { color: colors.textSecondary }]}>{countryName(profile.country, locale) ?? profile.country}</Text>
                        </View>
                      ) : null}
                      {/* Their own words: the one part of a profile that is not a number. */}
                      {!profile.private && profile.bio ? <Text style={[styles.bio, dir.text, { color: colors.textPrimary }]}>{profile.bio}</Text> : null}
                      {profile.private ? null : <Favourites poem={profile.favoritePoem} story={profile.favoriteStory} />}
                      {profile.private ? (
                        <View style={[styles.private, { flexDirection: dir.row }]}>
                          <Icon name="lock" size={15} tone="secondary" />
                          <Text style={[styles.dim, dir.text, { color: colors.textSecondary }]}>{t('profile.private')}</Text>
                        </View>
                      ) : null}
                      {profile.private ? null : <ProfileFriends userId={profile.userId} />}
                    </ProfileHead>

                    {profile.private ? null : (
                      <CollectionSheet
                        visible={collecting}
                        onClose={() => setCollecting(false)}
                        owner={{
                          userId: profile.userId,
                          name: shownName,
                          own: profile.friendStatus === 'self',
                          league,
                          tree: profile.tree,
                          showcase: profile.badges,
                          earned: profile.earnedBadges,
                        }}
                      />
                    )}

                    {/* The same report sheet as everywhere, opened from the top menu. */}
                    <ReportSheet
                      visible={reporting}
                      target={{ type: 'user', userId: profile.userId }}
                      name={shownName}
                      blockable={{ userId: profile.userId, name: shownName }}
                      onClose={() => setReporting(false)}
                      // Blocked from the report: the profile is gone to you now.
                      onBlocked={() => {
                        setReporting(false);
                        onExit();
                      }}
                    />
                  </>
                );
              }}
            </AsyncBoundary>
          </View>
          <View style={styles.bleed}>{profile ? <ActivityTabs activity={activity} width={windowWidth} /> : null}</View>
          <View style={styles.bleed}>{profile ? <ActivityGrid activity={activity} width={windowWidth} /> : <ProfileActivitySkeleton width={windowWidth} />}</View>
        </ScrollView>
      </View>
      {region}
    </GradientBackground>
  );
}

/**
 * The profile while it loads, in the shape it arrives in. Its figures include the league, as for anyone taking part,
 * which weekly leagues make most people.
 */
function PublicProfileSkeleton({ width }: { width: number }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const figures: ProfileFact[] = [
    { key: 'streak', label: t('profile.stat.streak'), value: null },
    { key: 'xp', label: t('profile.stat.xp'), value: null },
    { key: 'league', label: t('profile.league'), value: null },
  ];
  return (
    <View accessibilityLabel={t('common.loading')}>
      <ProfileHeadSkeleton
        width={width}
        stats={<ProfileFacts facts={figures} head />}
        handleAside={<BadgePillSkeleton />}
        actions={
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            <Skeleton height={LARGE_BUTTON} radius={radii.pill} style={styles.action} />
            <Skeleton height={LARGE_BUTTON} radius={radii.pill} style={styles.action} />
          </View>
        }
      >
        <SkeletonText size={typography.sizes.text} width={112} />
        <View>
          <SkeletonText size={typography.sizes.text} lineHeight={styles.bio.lineHeight} />
          <SkeletonText size={typography.sizes.text} lineHeight={styles.bio.lineHeight} width="58%" />
        </View>
        <ProfileFriendsSkeleton />
      </ProfileHeadSkeleton>
    </View>
  );
}

/** ClayButton's large size. */
const LARGE_BUTTON = 50;

/** No title: on a profile the person is the title, and their name is on the card below. */
function Header({ onExit, right }: { onExit: () => void; right?: React.ReactNode }) {
  return <ScreenHeader onBack={onExit} right={right} />;
}
/** Their streak, XP, and league while they take part (nothing for somebody never in one); badges are in the row by the handle. */
function useFacts(): (profile: Profile) => ProfileFact[] {
  const { t, locale } = useI18n();
  return (profile) => {
    const streak = profile.streak ?? 0;
    const tier = knownTier(profile.league?.tier ?? profile.tier);
    // Shortened (128450 → 128K) so the figures fit beside the face; a screen reader hears the whole number.
    const short = (n: number): string => formatCompact(n, locale);
    const whole = (n: number): string | undefined => (short(n) === formatNumber(n, locale) ? undefined : formatNumber(n, locale));
    const xp = profile.level?.xp ?? profile.xp ?? 0;
    return [
      {
        key: 'streak',
        label: t('profile.stat.streak'),
        value: short(streak),
        // The fire as big as their streak has grown it; cold logs with none.
        art: <Fire size={18} level={fireLevel(streak)} />,
        spoken: t(streak === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: formatNumber(streak, locale) }),
      },
      { key: 'xp', label: t('profile.stat.xp'), value: short(xp), whole: whole(xp) },
      ...(tier ? [{ key: 'league', label: t('profile.league'), value: leagueName(t, tier) }] : []),
    ];
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl },
  // The tabs and the grid run to the screen's edges.
  bleed: { marginHorizontal: -layout.gutter },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The flag and the name of where they are from, as your own profile draws them.
  country: { alignItems: 'center', gap: spacing.xs },
  countryName: { fontSize: typography.sizes.text },
  bio: { fontSize: typography.sizes.text, lineHeight: 21 },
  private: { alignItems: 'center', gap: spacing.xs },
  dim: { fontSize: typography.sizes.text, textAlign: 'center' },
  // Two buttons share the row evenly, as a social app's do.
  actions: { gap: spacing.sm },
  action: { flex: 1, minWidth: 0 },
});

/** Where the two of you stand once the server has answered: a request to someone who had asked you makes you friends. */
function friendStatusAfter(answer: { outcome?: string } | null, sent: FriendStatus): FriendStatus {
  if (sent !== 'pending_out') return sent;
  return answer?.outcome === 'accepted' || answer?.outcome === 'already_friends' ? 'friends' : 'pending_out';
}
