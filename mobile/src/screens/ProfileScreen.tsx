import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import { GuestBenefits, useAccountGate } from '../auth/AccountGate';
import { refreshFelt } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { display, statValue, statCaption } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Icon } from '../theme/Icon';
import { useCountUp } from '../theme/animate';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { TabHeader } from '../navigation/TopBar';
import { useOpenMenu } from '../navigation/SideMenu';
import { HeaderButton } from '../navigation/HeaderButton';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { SITE_ORIGIN } from '../feed/api';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { Horizon } from '../profile/Horizon';
import { CosmeticBackground, FavoriteRow, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { SEASON_FRAME_INNER, countryName, fireLevel, type ProfileLeague, type ProfileRank, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { ProgressShowcase } from '../profile/ProgressShowcase';
import { ProfileTree } from '../tree/ProfileTree';
import { AvatarStage } from '../profile/AvatarStage';
import { OverviewGrid, OverviewSkeleton, type OverviewTile } from '../profile/OverviewGrid';
import { Framed, LeagueEmblem } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { leagueTint } from '../ranks/tint';
import { knownTier, leagueLabel, leagueName } from '../leagues/format';
import { useFreshBadges } from '../badges/BadgeCelebrationHost';
import { useCourseDialect } from '../learn/courseDialect';
import { ProfileActivity } from '../profile/ProfileActivity';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { useSendErrorAlert } from '../reports/SendError';
import { useI18n } from '../i18n/I18nContext';
import type { Streak } from '../streak/format';
import { StreakSheet } from '../streak/StreakSheet';
import { formatNumber } from '../i18n/format';
import { Fire } from '../theme/Fire';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';

/** The avatar's size: the largest thing on the screen. */
const AVATAR = 96;
/** The avatar with a season frame: the ring sits outside the avatar, which keeps its size. */
const FRAMED = Math.round(AVATAR / SEASON_FRAME_INNER);
/** The tinted stage the avatar springs onto, with room round the frame for its two soft discs. */
const STAGE = FRAMED + 36;
/** The banner behind the avatar: the worn background, or the learner's own horizon until they wear one. */
const BANNER = 124;

/** The parts of `/me` a profile shows. `ProfileCosmetics` is declared the same way as on the website, from the same endpoint. */
interface Me extends ProfileCosmetics {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  xp: number;
  streak: Streak;
  profilePhotoUrl: string | null;
  /** When the account was made; the year shows under the handle. */
  createdAt?: string | null;
}

/**
 * The Profile tab: your profile, or for a guest, an offer of one. A guest has nothing of their own to show and most
 * profile requests are refused to them, so they get a card explaining what an account keeps and how to make one.
 * The menu stays, since badges, the library and settings are open to anyone.
 */
export function ProfileScreen(): React.JSX.Element {
  const { isGuest } = useAccountGate();
  return isGuest ? <GuestProfile /> : <AccountProfile />;
}

function GuestProfile(): React.JSX.Element {
  const { user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const openMenu = useOpenMenu();
  const { t } = useI18n();
  return (
    <GradientBackground>
      {/* Tab title and menu, as on the account's profile. */}
      <TabHeader title={t('nav.profile')} action={<HeaderButton icon="menu" label={t('nav.menu')} onPress={openMenu} testID="profile-menu" />} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>

        <GlassCard style={styles.guestCard}>
          <View style={styles.guestInner}>
            <View style={styles.guestHead}>
              <InitialsAvatar name={user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={null} />
              {/* The guest's generated name. */}
              <Text style={[styles.guestName, { color: colors.textSecondary }]} numberOfLines={1}>
                {user?.username}
              </Text>
              <Text style={[styles.guestTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('guest.profile.title')}
              </Text>
              <Text style={[styles.guestBody, { color: colors.textSecondary }]}>{t('guest.profile.body')}</Text>
            </View>
            <GuestBenefits />
            <View style={styles.guestActions}>
              <ClayButton label={t('guest.createAccount')} tone="primary" size="large" onPress={() => navigation.navigate('ClaimAccount')} />
              <ClayButton label={t('welcome.haveAccount')} variant="outline" tone="primary" size="large" onPress={() => navigation.navigate('SignIn')} />
            </View>
          </View>
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

/**
 * Your own profile, in the order its owner looks for things: identity (banner, avatar, name, handle and year
 * joined), actions (Edit, Share, find friends), progress (three counters and the overview tiles), then badges,
 * ranks and writing. Nothing is written over the banner, since text on someone's artwork is only as readable as
 * the artwork allows. Places rather than profile actions (shop, settings, saved, badges, tags, library) live in
 * the menu.
 */
function AccountProfile() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const tabBarInset = useTabBarInset();
  const openMenu = useOpenMenu();
  const { counts } = useUnread();
  const dir = useDirection();
  const scrollRef = useRef<ScrollView>(null);
  // Tapping the Profile tab while on it scrolls to the top.
  useScrollToTop(scrollRef);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  // Until the first answers arrive the numbers are grey placeholders, not zeros.
  const [settled, setSettled] = useState(false);
  // And the showcase's, which arrives after them.
  const [progressSettled, setProgressSettled] = useState(false);
  const [zer, setZer] = useState<number | null>(null);
  const [friends, setFriends] = useState<number | null>(null);
  /** Ranks, league, showcase and season frame. */
  const [progress, setProgress] = useState<{
    ranks: ProfileRank[];
    league: ProfileLeague | null;
    badges: ShowcaseBadge[];
    frameSku: string | null;
    /** A shop frame's picture; a season frame is drawn from its SKU. */
    frameUrl: string | null;
    /** Their tree; null before one is planted, undefined on a server without trees. */
    tree: TreeGlimpse | null | undefined;
    /** Badges earned (and the legacy tournament win), as the public profile counts them; `/me` does not send this. */
    achievements: number | null;
  } | null>(null);
  const [iconsOwned, setIconsOwned] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  // Pull to refresh asks for everything below again.
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { t, locale } = useI18n();
  const showSendError = useSendErrorAlert();
  // Badges earned since the app opened wear a "New" chip in the showcase.
  const fresh = useFreshBadges();
  // The course's dialect, for the course tile.
  const course = useCourseDialect();

  /*
   * The session user carries identity only, so the profile comes from /me, the wallet from /me/wallet, the friend
   * count from /friends and owned items from /me/inventory, as on the website. Fetched again on every focus and pull,
   * so changes made elsewhere show on return; the old values stay on screen meanwhile.
   */
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const [m, w, f, inv] = await Promise.all([
          client.get<{ user: Me }>('/me'),
          client.get<{ balances: { zer: number } }>('/me/wallet'),
          client.get<{ friends: unknown[]; total?: number }>('/friends?limit=1'),
          client.get<{ items: { category: string }[] }>('/me/inventory'),
        ]);
        if (!active) return;
        setSettled(true);
        if (m.ok) {
          setMe(m.data.user);
          setStreak(m.data.user.streak);
          setPhotoUrl(m.data.user.profilePhotoUrl ?? null);
        }
        if (w.ok) setZer(w.data.balances.zer);
        // An older API sends no total, only the whole list.
        if (f.ok) setFriends(f.data.total ?? f.data.friends.length);
        if (inv.ok) setIconsOwned((inv.data.items ?? []).filter((i) => i.category === 'icon').length);

        // Ranks, league, showcase and season frame come from your own public profile, which already computes them, as the website does.
        const id = m.ok ? m.data.user.id : null;
        if (id) {
          const p = await client.get<{
            ranks?: ProfileRank[];
            league?: ProfileLeague | null;
            badges?: ShowcaseBadge[];
            frameSku?: string | null;
            frameUrl?: string | null;
            tree?: TreeGlimpse | null;
            achievements?: number;
          }>(`/users/${id}`);
          if (active && p.ok) {
            setProgress({
              ranks: p.data.ranks ?? [],
              league: p.data.league ?? null,
              badges: p.data.badges ?? [],
              frameSku: p.data.frameSku ?? null,
              frameUrl: p.data.frameUrl ?? null,
              tree: p.data.tree,
              achievements: p.data.achievements ?? null,
            });
          }
        }
        if (active) {
          setProgressSettled(true);
          setRefreshing(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [client, reloadKey]),
  );

  const changePhoto = useCallback(async () => {
    if (uploading) return;
    // The system picker returns only the chosen picture, so no permission is needed.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setUploading(true);
    const res = await uploadProfilePhoto(client, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' }, t, locale);
    setUploading(false);
    if (res.ok) setPhotoUrl(res.url);
    else showSendError(t('profile.photoFailed'), { message: res.error, limited: res.limited });
  }, [client, uploading, showSendError, t, locale]);

  /*
   * Shares your profile's address. The app does not claim hevalo.app links until the association files exist (see
   * `linking` in App.tsx), so the message promises a web page, not the app.
   */
  const share = useCallback(() => {
    const id = me?.id ?? user?.id;
    if (!id) return;
    const url = `${SITE_ORIGIN}/app/users/${id}`;
    void Share.share({ message: t('profile.shareMessage', { name: me?.displayName ?? user?.username ?? '', url }) });
  }, [me, user, t]);

  const country = me?.country ? countryName(me.country, locale) ?? me.country : null;
  const leagueTier = knownTier(progress?.league?.tier);
  // The stage takes the league's colour, or the brand's before there is a league.
  const stageTint = leagueTier ? leagueTint(leagueTier, scheme)[1] : colors.primary;
  const joined = me?.createdAt ? new Date(me.createdAt) : null;
  const joinedYear = joined && !Number.isNaN(joined.getTime()) ? joined.getFullYear() : null;
  const username = me?.username ?? user?.username ?? '';
  /*
   * Handle and year joined share a line where they fit; otherwise the year moves to its own line rather than being
   * cut off. The year's words stay together and the dot stays with the handle, so that is the only break.
   */
  const handleLine = joinedYear
    ? `@${username} ·  ${t('profile.joined', { year: joinedYear }).replace(/ /g, ' ')}`
    : `@${username}`;

  // Built from the parts that exist, joined by interpuncts, and absent when none do (most people own no icons).
  const aside = [zer === null ? null : `${formatNumber(zer, locale)} Zêr`, iconsOwned ? `${iconsOwned} ${t('profile.stat.icons')}` : null].filter(
    (part): part is string => part !== null,
  );

  // The overview tiles. XP has nothing behind it, so it is the only one not pressable.
  const tiles = useMemo<OverviewTile[]>(() => {
    const burning = streak && streak.current > 0 ? fireLevel(streak.current) : null;
    return [
      {
        key: 'streak',
        art: burning ? <Fire size={34} level={burning} /> : <Icon name="flame" size={26} color={colors.textSecondary} />,
        value: streak?.current ?? 0,
        label: t('profile.stat.streak'),
        onPress: streak ? () => setStreakOpen(true) : undefined,
      },
      {
        key: 'course',
        art: <CourseFlag />,
        value: t(course === 'ckb' ? 'games.race.sorani' : 'games.race.kurmanci'),
        label: t('profile.stat.course'),
        onPress: () => navigation.navigate('Tabs', { screen: 'Learn' }),
      },
      {
        key: 'league',
        art: leagueTier ? <LeagueEmblem tier={leagueTier} size={36} label={leagueLabel(t, leagueTier)} /> : <Icon name="trophy" size={24} color={colors.textSecondary} />,
        value: leagueTier ? leagueName(t, leagueTier) : null,
        label: t('profile.league'),
        onPress: () => navigation.navigate('League'),
      },
      {
        key: 'xp',
        art: <Icon name="bolt" size={26} color={colors.gold} />,
        value: me?.level?.xp ?? me?.xp ?? 0,
        label: t('profile.stat.xp'),
      },
    ];
  }, [streak, course, leagueTier, me, colors, t, navigation]);

  const face = (
    <>
      <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={photoUrl} />
      {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
    </>
  );

  return (
    <GradientBackground>
      {/* The menu holds the shop, settings, saved items and the rest; an unopened gift puts a dot on it, as on the tab. */}
      <TabHeader
        title={t('nav.profile')}
        action={
          <HeaderButton
            icon="menu"
            label={counts.gifts > 0 ? t('nav.menuWaiting') : t('nav.menu')}
            dot={counts.gifts > 0}
            onPress={openMenu}
            testID="profile-menu"
          />
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFelt(() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            })}
            tintColor={colors.textSecondary}
          />
        }
      >

        {/* The banner: the worn background, or the learner's horizon until they wear one. Nothing is written over it. */}
        <View style={[styles.banner, { backgroundColor: colors.controlTrack }]}>
          {/* The horizon stays underneath, so a background still loading, or a video the phone does not play, leaves it showing. */}
          {(me?.id ?? user?.id) ? <Horizon seed={me?.id ?? user?.id ?? ''} width={windowWidth - layout.gutter * 2} height={BANNER} /> : null}
          {me?.background ? <CosmeticBackground background={me.background} style={StyleSheet.absoluteFill} /> : null}
        </View>

        {/* The avatar on its stage over the banner's lower edge, then name, handle, year, location and bio. */}
        <View style={[styles.hero, styles.heroOverBanner]}>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel={t('profile.changePhoto')} style={({ pressed }) => pressed && heldDim}>
            <AvatarStage tint={stageTint} size={STAGE}>
              {/* The frame rings the avatar; the avatar and its icon keep their size inside it. */}
              <Framed sku={progress?.frameSku} url={progress?.frameUrl} size={FRAMED} label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
                {face}
              </Framed>
              {uploading ? (
                <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
                  <ActivityIndicator color={colors.textOnScrim} />
                </View>
              ) : null}
            </AvatarStage>
          </Pressable>
          <View style={[styles.nameRow, { flexDirection: dir.row }]}>
            {/* A long name wraps to a second line rather than being cut. */}
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
              {me?.displayName ?? user?.displayName ?? user?.username}
            </Text>
            {me?.premium ? <PremiumPill /> : null}
          </View>
          <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={2}>
            {handleLine}
          </Text>
          {country ? (
            <View style={[styles.country, { flexDirection: dir.row }]}>
              <Image source={{ uri: flagUrl(me!.country!) }} style={styles.flag} resizeMode="contain" accessibilityElementsHidden />
              <Text style={[styles.countryName, { color: colors.textSecondary }]}>{country}</Text>
            </View>
          ) : null}
          {me?.bio ? <Text style={[styles.bio, dir.text, { color: colors.textPrimary }]}>{me.bio}</Text> : null}
        </View>

        {/*
          Edit and Share, the same size side by side, and the find-friends button. The buttons are text only: icons left
          too little room at 320 points and long labels in German, Kurmancî and Soranî were cut off. A long label wraps and
          both buttons grow to match. Each reaches at most half the gap toward the next, so a tap between goes to the
          nearer one.
        */}
        <View style={[styles.actions, { flexDirection: dir.row }]}>
          <ReachGroup gap={spacing.sm}>
            <Pressable
              onPress={() => navigation.navigate('EditProfile')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.edit')}
              testID="profile-edit"
              style={({ pressed }) => [styles.action, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>{t('profile.edit')}</Text>
            </Pressable>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={t('profile.share')}
              testID="profile-share"
              style={({ pressed }) => [styles.action, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>{t('profile.share')}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Friends')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.addFriends')}
              testID="profile-add-friends"
              style={({ pressed }) => [styles.actionIcon, { backgroundColor: colors.primary, opacity: pressed ? pressedDim : 1 }]}
            >
              <Icon name="user-plus" size={20} tone="onPrimary" />
            </Pressable>
          </ReachGroup>
        </View>

        {/* Friends and badges counts open their pages; the level has nothing behind it, so it is not pressable. */}
        <View style={[styles.stats, { flexDirection: dir.row }]}>
          <Stat label={t('nav.friends')} value={friends} loading={!settled} onPress={() => navigation.navigate('Friends')} />
          {/* The count arrives with the public profile, after the first answers. */}
          <Stat label={t('profile.badges')} value={progress?.achievements ?? null} loading={!progressSettled} onPress={() => navigation.navigate('Badges')} />
          <Stat label={t('profile.stat.level')} value={me?.level?.level ?? 1} loading={!settled} />
        </View>
        {!settled ? (
          <SkeletonText size={typography.sizes.xs} width={120} align="center" />
        ) : aside.length > 0 ? (
          <Text style={[styles.aside, { color: colors.textSecondary }]} numberOfLines={1}>
            {aside.join('  ·  ')}
          </Text>
        ) : null}

        <GiftedNote background={me?.background} icon={me?.icon} />

        {/* The overview tiles once the first answers are in; the league tile fills in as the showcase arrives. */}
        {settled && me ? <OverviewGrid tiles={tiles} /> : <OverviewSkeleton />}

        {/* The three showcased badges, each game's rank, and the league. */}
        {!progress && !progressSettled ? (
          // Your own profile always has the badges row, chosen or not.
          <View style={styles.showcaseSkeleton}>
            <SkeletonText size={typography.sizes.xs} width={64} />
            <Skeleton height={MIN_TOUCH_TARGET} radius={radii.md} />
          </View>
        ) : null}
        {progress ? <ProfileTree tree={progress.tree} onOpen={() => navigation.navigate('Tree')} /> : null}
        {progress ? (
          <ProgressShowcase
            own
            ranks={progress.ranks}
            league={progress.league}
            badges={progress.badges}
            fresh={fresh}
            onBadges={() => navigation.navigate('Badges')}
            onRanks={(game) => navigation.navigate('Ranks', { game })}
            onLeague={() => navigation.navigate('League')}
          />
        ) : null}

        {/* Only where there is one. */}
        {me?.favoritePoem ? <FavoriteRow label={t('profile.favoritePoem')} title={me.favoritePoem.title} /> : null}
        {me?.favoriteStory ? <FavoriteRow label={t('profile.favoriteStory')} title={me.favoriteStory.title} /> : null}

        {user?.id ? <ProfileActivity key={reloadKey} userId={user.id} own /> : null}
      </ScrollView>
      <StreakSheet streak={streakOpen ? streak : null} onClose={() => setStreakOpen(false)} onRestored={setStreak} />
    </GradientBackground>
  );
}

/** The course tile's picture: the course's flag, or the Learn tab's book until it loads or if it fails, never an empty box. */
function CourseFlag(): React.JSX.Element {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const uri = flagUrl('KU');
  if (!uri || broken) return <Icon name="book" size={24} color={colors.textSecondary} />;
  return <Image source={{ uri }} style={styles.courseFlag} resizeMode="contain" accessibilityElementsHidden onError={() => setBroken(true)} />;
}

/** A profile counter that counts up as it arrives; an unknown value is a dash, never a zero that reads as real. */
function Stat({ label, value, onPress, loading = false }: { label: string; value: number | null; onPress?: () => void; loading?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const count = useCountUp(value ?? 0);
  const shown = value === null ? '—' : formatNumber(count, locale);
  const settled = value === null ? '—' : formatNumber(value, locale);
  const body = (
    <>
      {loading ? (
        // A placeholder, since a 0 or 1 shown before the real number reads as real.
        <SkeletonText size={typography.sizes.lg} width={28} align="center" />
      ) : (
        <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
          {shown}
        </Text>
      )}
      <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  // Screen readers hear the final number, not the one mid-count.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${settled} ${label}`} style={styles.stat}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${settled} ${label}`}
      style={({ pressed }) => [styles.stat, pressed && { opacity: pressedDim }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  // Clipped to its own corners.
  banner: { alignSelf: 'stretch', height: BANNER, borderRadius: radii.lg, overflow: 'hidden' },


  // The avatar centred, with everything about who this is under it.
  hero: { alignSelf: 'stretch', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  // Half the stage overlaps the banner's lower edge, less the column's gap.
  heroOverBanner: { marginTop: -(STAGE / 2 + spacing.sm) },
  // The upload spinner covers the avatar alone, not the stage.
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // The three numbers share the width evenly.
  stats: { alignSelf: 'stretch', justifyContent: 'space-around', marginTop: spacing.sm },
  stat: { alignItems: 'center', gap: 2, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  statValue: { ...statValue, fontVariant: ['tabular-nums'] },
  statLabel: statCaption,

  nameRow: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  name: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  handle: { fontSize: typography.sizes.sm, textAlign: 'center' },
  country: { alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  // A plain 22x16 image, as on the website; a radius this small would be a rounding error.
  flag: { width: 22, height: 16 },
  courseFlag: { width: 30, height: 22 },
  countryName: { fontSize: typography.sizes.sm },
  bio: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
  aside: { fontSize: typography.sizes.xs, textAlign: 'center' },
  showcaseSkeleton: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  // Both buttons stretch to the taller, so a two-line label keeps them the same size.
  actions: { alignSelf: 'stretch', alignItems: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  // Drawn a full fingertip tall: a 36pt button with hit slop looked smaller than its target.
  action: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold, textAlign: 'center' },
  // Find friends: the one filled control of the three, round, and at least as tall as its neighbours.
  actionIcon: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignSelf: 'center', borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },

  // A guest's card: their avatar, the offer, and what an account keeps.
  guestCard: { marginTop: spacing.md },
  guestInner: { gap: spacing.md },
  guestHead: { alignItems: 'center', gap: spacing.sm },
  guestName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  guestTitle: { ...display(typography.sizes.lg), textAlign: 'center', marginTop: spacing.xs },
  guestBody: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  guestActions: { gap: spacing.sm },
});
