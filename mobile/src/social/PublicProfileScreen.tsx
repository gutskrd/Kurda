import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Image, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { Horizon } from '../profile/Horizon';
import { friendActionLabel, isActionable, isUndo, undoAction, type FriendStatus } from './format';
import { knownTier, leagueName } from '../leagues/format';
import { ProfileTree } from '../tree/ProfileTree';
import { ProgressShowcase } from '../profile/ProgressShowcase';
import { Framed } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { SEASON_FRAME_INNER, countryName, fireLevel, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { FavoriteRow, flagUrl } from '../profile/cosmetic-parts';
import { Avatar } from '../profile/Avatar';
import { ProfileActivity, ProfileActivitySkeleton } from '../profile/ProfileActivity';
import type { FavoriteRef } from '../profile/types';
import { ProfileFriends } from '../profile/ProfileFriends';
import { LevelBar, ProfileFacts, type ProfileFact } from '../profile/ProfileFacts';
import type { LevelInfo } from '../profile/types';
import type { ProfileSections } from '../profile/sections';
import { ReportSheet } from '../reports/ReportSheet';
import { useBlock } from './blocks';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { PlayWithButton } from '../play/PlayWithButton';
import { useAnnouncer } from '../stories/ui';
import { useDirection } from '../reports/direction';
import { TicketSlip } from './FriendTicket';

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
  /** Badges earned (and the legacy tournament win). */
  achievements?: number;
  /** The three badges they chose to show. */
  badges?: ShowcaseBadge[];
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

/** How tall the band of sky behind their face is. */
const BANNER = 104;
/** How big their face is, and so how far it stands over the band's lower edge. */
const FACE = 96;

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
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const facts = useFacts();
  // In right-to-left languages the numbers start on the right, as reading does.
  const dir = useDirection();
  const { width: windowWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Gone or hidden from you, or an account that is suspended or banned, which is said as that.
  const [notFound, setNotFound] = useState<false | 'profile' | 'account'>(false);
  const [reporting, setReporting] = useState(false);
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
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AsyncBoundary
          loading={!profile}
          error={!profile ? error : null}
          onRetry={load}
          skeleton={
            <>
              <ProfileCardSkeleton />
              <ProfileActivitySkeleton />
            </>
          }
        >
          {() => {
            if (!profile) return null;
            // A friend's button would only say so: ending it is in the menu, and what you do with a friend is write and
            // play.
            const shown = status ?? profile.friendStatus;
            const labelKey = shown === 'friends' ? null : friendActionLabel(shown);
            const cardWidth = windowWidth - layout.gutter * 2;
            return (
        <View style={[styles.card, { backgroundColor: colors.controlTrack }]}>
          {/* Their own sky behind their face: the picture the website draws in their banner. */}
          <Horizon seed={profile.userId} width={cardWidth} height={BANNER} style={styles.banner} />
          <View style={[styles.face, { borderColor: colors.background, backgroundColor: colors.background }]}>
          <Framed
            sku={profile.frameSku}
            url={profile.frameUrl}
            size={Math.round(96 / SEASON_FRAME_INNER)}
            label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}
          >
            <Avatar name={profile.displayName ?? profile.username} size={FACE} photoUrl={profile.avatarUrl} />
          </Framed>
          </View>
          {/* The name they chose leads and the handle follows, as on your own profile and the website. */}
          <Text style={[styles.username, { color: colors.textPrimary }]} accessibilityRole="header">
            {profile.displayName ?? profile.username}
          </Text>
          <Text style={[styles.display, { color: colors.textSecondary }]}>{`@${profile.username}`}</Text>
          {!profile.private && profile.country ? (
            <View style={[styles.country, { flexDirection: dir.row }]}>
              <Image source={{ uri: flagUrl(profile.country) }} style={styles.flag} resizeMode="contain" accessibilityElementsHidden />
              <Text style={[styles.countryName, { color: colors.textSecondary }]}>{countryName(profile.country, locale) ?? profile.country}</Text>
            </View>
          ) : null}
          {/* Their own words: the one part of a profile that is not a number. */}
          {!profile.private && profile.bio ? <Text style={[styles.bio, { color: colors.textPrimary }]}>{profile.bio}</Text> : null}
          {profile.private ? <Text style={[styles.dim, { color: colors.textSecondary }]}>{t('profile.private')}</Text> : null}

          {/* What you can do sits with who they are, above the numbers, within thumb reach without scrolling. */}
          {profile.friendStatus !== 'self' ? (
            <View style={styles.actions}>
              {shown === 'friends' ? (
                <>
                  <ClayButton
                    label={t('profile.message')}
                    tone="primary"
                    size="large"
                    onPress={() => require('message') && navigation.navigate('Chat', { userId: profile.userId, username: profile.username })}
                  />
                  {/* A challenge is any game, through the invite sheet. */}
                  <PlayWithButton friendId={profile.userId} name={profile.displayName ?? profile.username} />
                </>
              ) : null}
              {labelKey ? (
                // A request is a ticket handed over: it slips away from the button, and home again when taken back.
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
              ) : null}
            </View>
          ) : null}

          {profile.private ? null : (
            <>
              {/* The level and the figures as on their own profile and the website, in the reader's own digits. */}
              <View style={styles.stats}>
                {profile.level ? <LevelBar level={profile.level} /> : null}
                <ProfileFacts facts={facts(profile)} />
              </View>

              <ProfileTree tree={profile.tree} />
              <ProgressShowcase
                own={false}
                league={profile.league ?? (knownTier(profile.tier) ? { tier: knownTier(profile.tier)! } : null)}
                badges={profile.badges ?? []}
              />

              {/* Behind the same privacy check as the stats: a pinned poem is for people who can see the profile. */}
              {profile.favoritePoem ? (
                <FavoriteRow label={t('profile.favoritePoem')} title={profile.favoritePoem.title} />
              ) : null}
              {profile.favoriteStory ? (
                <FavoriteRow label={t('profile.favoriteStory')} title={profile.favoriteStory.title} />
              ) : null}
            </>
          )}

          {/* The same report sheet as everywhere, opened from the top menu. */}
          <ReportSheet
            visible={reporting}
            target={{ type: 'user', userId: profile.userId }}
            name={profile.displayName ?? profile.username}
            blockable={{ userId: profile.userId, name: profile.displayName ?? profile.username }}
            onClose={() => setReporting(false)}
            // Blocked from the report: the profile is gone to you now.
            onBlocked={() => {
              setReporting(false);
              onExit();
            }}
          />
        </View>
            );
          }}
        </AsyncBoundary>
        {profile && !profile.private ? <ProfileFriends userId={profile.userId} /> : null}
        {profile && !profile.private ? <ProfileActivity userId={profile.userId} sections={profile.sections} /> : null}
        </ScrollView>
      </View>
      {region}
    </GradientBackground>
  );
}

/** The card while it loads, in its own shape, so the card that arrives is the one that was standing there. */
function ProfileCardSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.card, { backgroundColor: colors.controlTrack }]} accessibilityLabel={t('common.loading')}>
      <View style={styles.banner} />
      <View style={[styles.face, { borderColor: colors.background, backgroundColor: colors.background }]}>
        <Skeleton width={FACE} height={FACE} radius={radii.pill} raised />
      </View>
      <SkeletonText size={typography.sizes.title} width={120} align="center" raised />
      <SkeletonText size={typography.sizes.text} width={72} align="center" raised />
      <View style={[styles.stats, styles.statsSkeleton]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.statSkeleton}>
            <SkeletonText size={typography.sizes.text} width={36} align="center" raised />
            <SkeletonText size={typography.sizes.text} width={48} align="center" raised />
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Skeleton height={LARGE_BUTTON} radius={radii.pill} raised />
        <Skeleton height={LARGE_BUTTON} radius={radii.pill} raised />
      </View>
    </View>
  );
}

/** ClayButton's large size. */
const LARGE_BUTTON = 50;

/** No title: on a profile the person is the title, and their name is on the card below. */
function Header({ onExit, right }: { onExit: () => void; right?: React.ReactNode }) {
  return <ScreenHeader onBack={onExit} right={right} />;
}
/** Their streak, XP, league while they take part (nothing for somebody never in one), and badges. */
function useFacts(): (profile: Profile) => ProfileFact[] {
  const { t, locale } = useI18n();
  return (profile) => {
    const streak = profile.streak ?? 0;
    const tier = knownTier(profile.league?.tier ?? profile.tier);
    return [
      {
        key: 'streak',
        label: t('profile.stat.streak'),
        value: formatNumber(streak, locale),
        // The fire as big as their streak has grown it; cold logs with none.
        art: <Fire size={18} level={fireLevel(streak)} />,
        spoken: t(streak === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: formatNumber(streak, locale) }),
      },
      { key: 'xp', label: t('profile.stat.xp'), value: formatNumber(profile.level?.xp ?? profile.xp ?? 0, locale) },
      ...(tier ? [{ key: 'league', label: t('profile.league'), value: leagueName(t, tier) }] : []),
      { key: 'badges', label: t('profile.badges'), value: formatNumber(profile.achievements ?? 0, locale) },
    ];
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  scroll: { paddingBottom: spacing.xxl },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The band of sky runs to the card's edges, so the card clips it to its corners.
  card: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, overflow: 'hidden' },
  banner: { height: BANNER, alignSelf: 'stretch', marginHorizontal: -spacing.xl },
  // Their face stands half over the band's lower edge, ringed in the page's colour.
  face: { marginTop: -(FACE / 2 + 4 + spacing.sm), borderRadius: radii.pill, borderWidth: 4 },
  username: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
  display: { fontSize: typography.sizes.text },
  // The flag and the name of where they are from, as your own profile draws them.
  country: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  flag: { width: 22, height: 16 },
  countryName: { fontSize: typography.sizes.text },
  bio: { fontSize: typography.sizes.text, lineHeight: 20, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
  stats: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.md },
  statsSkeleton: { flexDirection: 'row', justifyContent: 'space-around' },
  statSkeleton: { alignItems: 'center', gap: 2 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  dim: { textAlign: 'center', marginTop: spacing.md },
});

/** Where the two of you stand once the server has answered: a request to someone who had asked you makes you friends. */
function friendStatusAfter(answer: { outcome?: string } | null, sent: FriendStatus): FriendStatus {
  if (sent !== 'pending_out') return sent;
  return answer?.outcome === 'accepted' || answer?.outcome === 'already_friends' ? 'friends' : 'pending_out';
}
