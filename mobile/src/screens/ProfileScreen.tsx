import { useCallback, useRef, useState } from 'react';
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
import { ClayButton, ErrorRetry, GlassCard, GradientBackground } from '../theme/glass';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Icon } from '../theme/Icon';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { TabHeader } from '../navigation/TopBar';
import { useOpenMenu } from '../navigation/SideMenu';
import { HeaderButton } from '../navigation/HeaderButton';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { SITE_ORIGIN } from '../feed/api';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { Horizon } from '../profile/Horizon';
import { CosmeticBackground, FavoriteRow, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { SEASON_FRAME_INNER, countryName, fireLevel, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { LevelBar, OnlyYou, ProfileFacts, type ProfileFact } from '../profile/ProfileFacts';
import { ProgressShowcase } from '../profile/ProgressShowcase';
import { ProfileTree } from '../tree/ProfileTree';
import { Framed } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { VISIBILITY_LABEL } from '../social/format';
import { useFreshBadges } from '../badges/BadgeCelebrationHost';
import { ProfileActivity } from '../profile/ProfileActivity';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { useSendErrorAlert } from '../reports/SendError';
import { useI18n } from '../i18n/I18nContext';
import { learningStats, type Streak } from '../streak/format';
import { freezeSlots } from '../streak/kept';
import { StreakSheet } from '../streak/StreakSheet';
import { formatNumber } from '../i18n/format';
import { Fire } from '../theme/Fire';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';
import type { Visibility } from '../social/format';

/** The avatar's size: the largest thing on the screen. */
const AVATAR = 96;
/** The avatar with a season frame: the ring sits outside the avatar, which keeps its size. */
const FRAMED = Math.round(AVATAR / SEASON_FRAME_INNER);
/** The ring of page colour that lifts the avatar off the banner it overlaps. */
const RING = 4;
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
  /** Who may open the profile; absent on an older server. */
  profileVisibility?: Visibility;
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
              <Avatar name={user?.username ?? ''} size={AVATAR} />
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
 * Your own profile, laid out as the website's: identity (banner, avatar, name, handle, year joined, who can see it,
 * bio), actions (Edit, Share, find friends), the level and four figures, then the tree, badges, league and writing,
 * the numbers only you see, and activity. Nothing is written over the banner, since text on someone's artwork is only
 * as readable as the artwork allows. Places rather than profile actions (shop, settings, saved, badges, tags,
 * library) live in the menu.
 */
function AccountProfile() {
  const { user, client, refreshUser } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
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
  /** League, showcase and frame. */
  const [progress, setProgress] = useState<{
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

        // League, showcase and frame come from your own public profile, which already computes them, as the website does.
        const id = m.ok ? m.data.user.id : null;
        if (id) {
          const p = await client.get<{
            league?: ProfileLeague | null;
            badges?: ShowcaseBadge[];
            frameSku?: string | null;
            frameUrl?: string | null;
            tree?: TreeGlimpse | null;
            achievements?: number;
          }>(`/users/${id}`);
          if (active && p.ok) {
            setProgress({
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
    if (res.ok) {
      setPhotoUrl(res.url);
      // The tab bar and everywhere else wearing your face read it from the session.
      void refreshUser();
    } else showSendError(t('profile.photoFailed'), { message: res.error, limited: res.limited });
  }, [client, uploading, showSendError, t, locale, refreshUser]);

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

  const number = (n: number | null | undefined): string | null => (n == null ? null : formatNumber(n, locale));
  const streakDays = streak?.current ?? 0;
  // The four figures the website shows. The streak opens its sheet; friends and badges open their pages.
  const facts: ProfileFact[] = [
    {
      key: 'streak',
      label: t('profile.stat.streak'),
      value: settled ? number(streakDays) : null,
      art: <Fire size={18} level={fireLevel(streakDays)} />,
      spoken: t(streakDays === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: formatNumber(streakDays, locale) }),
      onPress: streak ? () => setStreakOpen(true) : undefined,
    },
    { key: 'xp', label: t('profile.stat.xp'), value: settled ? number(me?.level?.xp ?? me?.xp ?? 0) : null },
    { key: 'friends', label: t('nav.friends'), value: settled ? (number(friends) ?? '—') : null, onPress: () => navigation.navigate('Friends') },
    // The count arrives with the public profile, after the first answers.
    { key: 'badges', label: t('profile.badges'), value: progressSettled ? (number(progress?.achievements) ?? '—') : null, onPress: () => navigation.navigate('Badges') },
  ];
  const stats = streak ? learningStats(streak) : null;
  // A Hevalo+ member has room for a second freeze, and the hint says how many rather than "one".
  const freezeRoom = streak ? freezeSlots(streak).max : 1;
  // The numbers only you see, as the website's own card has them; Zêr leads to where it is spent.
  const yours: ProfileFact[] = [
    { key: 'longest', label: t('profile.stat.longestStreak'), value: stats ? number(stats.longest) : null },
    { key: 'days', label: t('profile.stat.daysLearned'), value: stats ? number(stats.daysLearned) : null },
  ];
  const yoursMore: ProfileFact[] = [
    { key: 'freezes', label: t('profile.stat.freezes'), value: stats ? number(stats.freezes) : null },
    { key: 'zer', label: 'Zêr', value: settled ? (number(zer) ?? '—') : null, onPress: () => navigation.navigate('Shop') },
  ];
  const visibility = me?.profileVisibility ? VISIBILITY_LABEL[me.profileVisibility] : null;

  const face = (
    <>
      <Avatar name={user?.displayName ?? user?.username ?? ''} size={AVATAR} photoUrl={photoUrl ?? me?.avatarUrl ?? ownAvatarUrl(user)} />
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
          <Pressable
            onPress={changePhoto}
            accessibilityRole="button"
            accessibilityLabel={t('profile.changePhoto')}
            style={({ pressed }) => [styles.face, { borderColor: colors.background, backgroundColor: colors.background }, pressed && heldDim]}
          >
            {/* The frame rings the avatar; the avatar and its icon keep their size inside it. */}
            <Framed sku={progress?.frameSku} url={progress?.frameUrl} size={FRAMED} label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
              {face}
            </Framed>
            {uploading ? (
              <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
                <ActivityIndicator color={colors.textOnScrim} />
              </View>
            ) : null}
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
          {/* Who can open this page, said on the page itself, and one tap from where it is changed. */}
          {visibility ? (
            <Pressable
              onPress={() => navigation.navigate('SettingsPage', { page: 'visibility' })}
              accessibilityRole="link"
              style={({ pressed }) => [styles.seen, { flexDirection: dir.row }, pressed && heldDim]}
              testID="profile-seen-by"
            >
              <Icon name="eye" size={15} tone="secondary" />
              <Text style={[styles.seenText, { color: colors.textSecondary }]}>{t('profile.seenBy', { who: t(visibility) })}</Text>
            </Pressable>
          ) : null}
          {me?.bio ? (
            <Text style={[styles.bio, dir.text, { color: colors.textPrimary }]}>{me.bio}</Text>
          ) : me ? (
            <Pressable onPress={() => navigation.navigate('EditProfile')} accessibilityRole="link" style={({ pressed }) => pressed && heldDim} testID="profile-add-bio">
              <Text style={[styles.addBio, { color: colors.primary }]}>{t('profile.addBio')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/*
          Edit and Share side by side, and the find-friends button. The buttons are text only, each label on one line:
          where the three do not fit (Soranî, German), a button moves to a second row and both rows fill the width,
          rather than a label wrapping inside its pill. Each reaches at most half the gap toward the next, so a tap
          between goes to the nearer one.
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
              <Text style={[styles.actionText, { color: colors.textPrimary }]} numberOfLines={1}>
                {t('profile.edit')}
              </Text>
            </Pressable>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={t('profile.share')}
              testID="profile-share"
              style={({ pressed }) => [styles.action, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]} numberOfLines={1}>
                {t('profile.share')}
              </Text>
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

        {me?.level ? (
          <View style={styles.level}>
            <LevelBar level={me.level} />
          </View>
        ) : null}
        <ProfileFacts facts={facts} testID="profile-facts" />
        {settled && !me ? <ErrorRetry onRetry={() => setReloadKey((k) => k + 1)} /> : null}

        <GiftedNote background={me?.background} icon={me?.icon} />

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
            league={progress.league}
            badges={progress.badges}
            fresh={fresh}
            onBadges={() => navigation.navigate('Badges')}
            onLeague={() => navigation.navigate('League')}
          />
        ) : null}

        {/* Only where there is one. */}
        {me?.favoritePoem ? <FavoriteRow label={t('profile.favoritePoem')} title={me.favoritePoem.title} /> : null}
        {me?.favoriteStory ? <FavoriteRow label={t('profile.favoriteStory')} title={me.favoriteStory.title} /> : null}

        {me ? (
          <OnlyYou title={t('profile.yourProgress')}>
            <ProfileFacts facts={yours} />
            <ProfileFacts facts={yoursMore} />
            {stats ? (
              <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>
                {freezeRoom > 1
                  ? t('profile.freezeHintPlus', { count: stats.sessionsPerFreeze, max: formatNumber(freezeRoom, locale) })
                  : t('profile.freezeHint', { count: stats.sessionsPerFreeze })}
              </Text>
            ) : null}
            {iconsOwned ? (
              <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{`${t('profile.stat.icons')} · ${formatNumber(iconsOwned, locale)}`}</Text>
            ) : null}
          </OnlyYou>
        ) : null}

        {user?.id ? <ProfileActivity key={reloadKey} userId={user.id} own /> : null}
      </ScrollView>
      <StreakSheet streak={streakOpen ? streak : null} onClose={() => setStreakOpen(false)} onRestored={setStreak} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  // Clipped to its own corners.
  banner: { alignSelf: 'stretch', height: BANNER, borderRadius: radii.lg, overflow: 'hidden' },


  // The avatar centred, with everything about who this is under it.
  hero: { alignSelf: 'stretch', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  // Half the avatar overlaps the banner's lower edge, less the column's gap.
  heroOverBanner: { marginTop: -(FRAMED / 2 + RING + spacing.sm) },
  // Ringed in the page's colour, so the avatar stands off the banner.
  face: { borderRadius: radii.pill, borderWidth: RING },
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


  nameRow: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  name: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  handle: { fontSize: typography.sizes.sm, textAlign: 'center' },
  country: { alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  // A plain 22x16 image, as on the website; a radius this small would be a rounding error.
  flag: { width: 22, height: 16 },
  countryName: { fontSize: typography.sizes.sm },
  bio: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
  level: { alignSelf: 'stretch', marginTop: spacing.sm },
  seen: { alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  seenText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  addBio: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.xs },
  hint: { fontSize: typography.sizes.sm, lineHeight: 20 },
  showcaseSkeleton: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  // The buttons wrap to a second row where they do not fit, and each row's buttons share its width.
  actions: { alignSelf: 'stretch', alignItems: 'stretch', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  // Drawn a full fingertip tall: a 36pt button with hit slop looked smaller than its target. As wide as its label to
  // begin with, then a share of what its row leaves.
  action: {
    flexGrow: 1,
    flexBasis: 'auto',
    maxWidth: '100%',
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
