import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { Icon } from '../theme/Icon';
import { SkeletonText } from '../theme/Skeleton';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { useTabBarScroll } from '../navigation/tabBarScroll';
import { TabHeader } from '../navigation/TopBar';
import { useOpenMenu } from '../navigation/SideMenu';
import { HeaderButton } from '../navigation/HeaderButton';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { SITE_ORIGIN } from '../feed/api';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { Flag, IconOverlay } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import {
  badgesInOrder,
  countryName,
  fireLevel,
  type PendingPicture,
  type PictureRejection,
  type ProfileBadge,
  type ProfileLeague,
  type ShowcaseBadge,
  type TreeGlimpse,
} from '@kurda/shared';
import { OnlyYou, ProfileFacts, type ProfileFact } from '../profile/ProfileFacts';
import { FACE, FRAMED, ProfileHead } from '../profile/ProfileHead';
import { BadgePill, BadgePillSkeleton } from '../profile/BadgeRow';
import { CollectionSheet } from '../profile/CollectionSheet';
import { Favourites } from '../profile/Favourites';
import { Framed, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { useFreshBadges } from '../badges/BadgeCelebrationHost';
import { ActivityGrid, ActivityTabs, nearEnd, useProfileActivity } from '../profile/ProfileActivity';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { PendingPhoto, PictureRefusal } from '../pictures/PictureReview';
import { pendingOf } from '../pictures/review';
import { useSendErrorAlert } from '../reports/SendError';
import { useAccountHeld } from '../reports/HeldNotice';
import { useI18n } from '../i18n/I18nContext';
import { learningStats, type Streak } from '../streak/format';
import { freezeSlots } from '../streak/kept';
import { DailySheet } from '../daily/DailySheet';
import { useToday } from '../daily/today';
import { formatCompact, formatNumber } from '../i18n/format';
import { Fire } from '../theme/Fire';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';
import type { Visibility } from '../social/format';
import type { ProfileSections } from '../profile/sections';
import { usePageWidth } from '../theme/pageWidth';

/** A guest's avatar, the size of an account's. */
const AVATAR = FACE;

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
  /** A new photo waiting for a person: only you see it, everyone else the one before. */
  profilePhotoPending?: PendingPicture | null;
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
 * Your own profile, laid out as the website's: identity (banner, avatar, name, handle, year joined, bio), actions
 * (Edit, Share, find friends), the level and four figures, then the tree, badges, league and writing, the numbers only
 * you see, and activity. Nothing is written over the banner, since text on someone's artwork is only as readable as
 * the artwork allows. Places rather than profile actions (shop, settings, saved, badges, tags, library) live in the
 * menu; who can see it is set from Edit profile.
 */
function AccountProfile() {
  const { user, client, refreshUser } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const windowWidth = usePageWidth();
  const tabBarInset = useTabBarInset();
  const openMenu = useOpenMenu();
  const { counts } = useUnread();
  const dir = useDirection();
  const scrollRef = useRef<ScrollView>(null);
  const tabScroll = useTabBarScroll();
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
    /** Every badge earned, newest first; absent on an older server, which sends only the three. */
    earned: ProfileBadge[] | undefined;
    /** Which activity sections others see, so the ones you hid are marked on your own tabs. */
    sections: ProfileSections | null;
  } | null>(null);
  const [iconsOwned, setIconsOwned] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  // A new photo waiting for a person, and one the check refused, said under the avatar.
  const [pending, setPending] = useState<{ photo: PendingPicture | null } | null>(null);
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);
  const today = useToday(streakOpen);
  // Pull to refresh asks for everything below again.
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { t, locale } = useI18n();
  const showSendError = useSendErrorAlert();
  // A held account cannot put up a new picture until it is checked; the tap says so instead of opening the picker.
  const held = useAccountHeld();
  // Badges earned since the app opened wear a "New" chip in the collection.
  const fresh = useFreshBadges();
  // The collection: badges, icons and gifts, opened from the row beside the handle.
  const [collecting, setCollecting] = useState(false);

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
          const waiting = pendingOf(m.data.user.profilePhotoPending);
          setPending(waiting ? { photo: waiting } : null);
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
            earnedBadges?: ProfileBadge[];
            sections?: ProfileSections | null;
          }>(`/users/${id}`);
          if (active && p.ok) {
            setProgress({
              league: p.data.league ?? null,
              badges: p.data.badges ?? [],
              frameSku: p.data.frameSku ?? null,
              frameUrl: p.data.frameUrl ?? null,
              tree: p.data.tree,
              earned: p.data.earnedBadges,
              sections: p.data.sections ?? null,
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
    if (held) {
      showSendError(t('profile.changePhoto'), { message: t('hold.title'), limited: true });
      return;
    }
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
    setRefusal(null);
    const res = await uploadProfilePhoto(client, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' }, t, locale);
    setUploading(false);
    if (res.ok && res.review === 'held') {
      // Everyone else keeps seeing the photo before; the new one shows small, waiting.
      if (res.url) setPhotoUrl(res.url);
      setPending({ photo: res.pending });
    } else if (res.ok) {
      setPhotoUrl(res.url);
      setPending(null);
      // The tab bar and everywhere else wearing your face read it from the session.
      void refreshUser();
    } else if (res.rejection) setRefusal(res.rejection);
    else showSendError(t('profile.photoFailed'), { message: res.error, limited: res.limited });
  }, [client, uploading, held, showSendError, t, locale, refreshUser]);

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
  const handleLine = `@${username}`;

  const number = (n: number | null | undefined): string | null => (n == null ? null : formatNumber(n, locale));
  // The figures beside the face are shortened (5230 → 5.2K) so all three fit; a screen reader hears the whole number.
  const short = (n: number | null | undefined): string | null => (n == null ? null : formatCompact(n, locale));
  const whole = (n: number | null | undefined): string | undefined => (n == null || short(n) === number(n) ? undefined : (number(n) ?? undefined));
  const streakDays = streak?.current ?? 0;
  const xp = me?.level?.xp ?? me?.xp ?? 0;
  // The three figures the website shows; badges are in the row beside the handle. The streak opens its sheet and friends
  // their page.
  const facts: ProfileFact[] = [
    {
      key: 'streak',
      label: t('profile.stat.streak'),
      value: settled ? short(streakDays) : null,
      art: <Fire size={18} level={fireLevel(streakDays)} />,
      spoken: t(streakDays === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: formatNumber(streakDays, locale) }),
      onPress: streak ? () => setStreakOpen(true) : undefined,
    },
    { key: 'xp', label: t('profile.stat.xp'), value: settled ? short(xp) : null, whole: whole(xp) },
    { key: 'friends', label: t('nav.friends'), value: settled ? (short(friends) ?? '—') : null, whole: whole(friends), onPress: () => navigation.navigate('Friends') },
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

  // What you posted, played, liked, reposted and saved; a pull asks for it again.
  const activity = useProfileActivity({ userId: me?.id ?? user?.id, sections: progress?.sections, own: true, reload: reloadKey });

  const face = (
    <Pressable
      onPress={changePhoto}
      accessibilityRole="button"
      accessibilityLabel={t('profile.changePhoto')}
      style={({ pressed }) => pressed && heldDim}
    >
      {/* The frame rings the avatar; the avatar and its icon keep their size inside it. */}
      <Framed sku={progress?.frameSku} url={progress?.frameUrl} size={FRAMED} label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
        <Avatar name={user?.displayName ?? user?.username ?? ''} size={FACE} photoUrl={photoUrl ?? me?.avatarUrl ?? ownAvatarUrl(user)} />
        {me?.icon ? <IconOverlay icon={me.icon} size={FACE} /> : null}
      </Framed>
      {uploading ? (
        <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
          <ActivityIndicator color={colors.textOnScrim} />
        </View>
      ) : null}
    </Pressable>
  );
  const seed = me?.id ?? user?.id ?? '';
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    tabScroll(e);
    if (nearEnd(e)) activity.more();
  };

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
        onScroll={onScroll}
        scrollEventThrottle={64}
        // The tabs over your posts stay under the top bar while the grid scrolls.
        stickyHeaderIndices={[1]}
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
        <View style={styles.top}>
          <ProfileHead
            seed={seed}
            width={windowWidth}
            background={me?.background}
            face={face}
            framed={!!frameTierOf(progress?.frameSku) || !!(progress?.frameSku && progress.frameUrl)}
            stats={<ProfileFacts facts={facts} head testID="profile-facts" />}
            name={me?.displayName ?? user?.displayName ?? user?.username ?? ''}
            level={me?.level}
            premium={me?.premium}
            handle={handleLine}
            handleAside={
              progress ? (
                <BadgePill
                  league={progress.league?.tier ?? null}
                  tree={progress.tree}
                  badges={badgesInOrder(progress.badges, progress.earned)}
                  own
                  title={t('collection.title.own')}
                  onOpen={() => setCollecting(true)}
                />
              ) : !progressSettled ? (
                <BadgePillSkeleton />
              ) : null
            }
            actions={
              /*
                Edit and Share side by side, and the find-friends button. The buttons are text only, each label on one
                line: where the three do not fit (Soranî, German), a button moves to a second row and both rows fill the
                width, rather than a label wrapping inside its pill. Each reaches at most half the gap toward the next.
              */
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
                    style={({ pressed }) => [styles.actionIcon, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
                  >
                    <Icon name="user-plus" size={20} />
                  </Pressable>
                </ReachGroup>
              </View>
            }
          >
            {!settled ? <AboutSkeleton /> : null}
            {/* Where they are from and since when, on one row that wraps, as on the website. */}
            {country || joinedYear ? (
              <View style={[styles.aboutRow, { flexDirection: dir.row }]}>
                {country ? (
                  <View style={[styles.about, { flexDirection: dir.row }]} testID="profile-country">
                    <Flag code={me!.country!} />
                    <Text style={[styles.aboutText, { color: colors.textSecondary }]}>{country}</Text>
                  </View>
                ) : null}
                {joinedYear ? (
                  <View style={[styles.about, { flexDirection: dir.row }]}>
                    <Icon name="calendar" size={15} tone="secondary" />
                    <Text style={[styles.aboutText, { color: colors.textSecondary }]}>{t('profile.joined', { year: joinedYear })}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {me?.bio ? (
              <Text style={[styles.bio, dir.text, { color: colors.textPrimary }]}>{me.bio}</Text>
            ) : me ? (
              <Pressable
                onPress={() => navigation.navigate('EditProfile')}
                accessibilityRole="link"
                reachSize={{ height: 24 }}
                style={({ pressed }) => [styles.addBioWrap, { alignSelf: dir.row === 'row' ? 'flex-start' : 'flex-end' }, pressed && heldDim]}
                testID="profile-add-bio"
              >
                <Text style={[styles.addBio, { color: colors.textPrimary }]}>{t('profile.addBio')}</Text>
              </Pressable>
            ) : null}
            <Favourites poem={me?.favoritePoem} story={me?.favoriteStory} />
            {pending ? <PendingPhoto pending={pending.photo} body="picture.held.profile" testID="profile-photo-pending" /> : null}
            {refusal ? <PictureRefusal rejection={refusal} testID="profile-photo-refused" /> : null}
            {settled && !me ? <ErrorRetry onRetry={() => setReloadKey((k) => k + 1)} /> : null}

            {/* Its row is the same whatever loads, so it stands from the start; the figures inside wait for their numbers. */}
            {me || !settled ? (
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
          </ProfileHead>

        </View>

        <View style={styles.bleed}>
          <ActivityTabs activity={activity} width={windowWidth} />
        </View>
        <View style={styles.bleed}>
          <ActivityGrid activity={activity} width={windowWidth} />
        </View>
      </ScrollView>
      <DailySheet visible={streakOpen} onClose={() => setStreakOpen(false)} today={today} onStreak={setStreak} />
      {progress && seed ? (
        <CollectionSheet
          visible={collecting}
          onClose={() => setCollecting(false)}
          owner={{ userId: seed, name: '', own: true, league: progress.league, tree: progress.tree, showcase: progress.badges, earned: progress.earned }}
          fresh={fresh}
          // The three chosen again lead the row beside your handle from now on.
          onShowcase={(keys) =>
            setProgress((p) => p && { ...p, badges: keys.flatMap((k) => (p.earned ?? p.badges).filter((b) => b.key === k)) })
          }
          // An icon worn from the collection is read back with the rest, so your face shows it.
          onWorn={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </GradientBackground>
  );
}

/** The lines under your handle while your profile loads: where you are from and since when, then the bio. */
function AboutSkeleton(): React.JSX.Element {
  const dir = useDirection();
  return (
    <>
      <View style={[styles.aboutRow, { flexDirection: dir.row }]}>
        <SkeletonText size={typography.sizes.text} width={96} />
        <SkeletonText size={typography.sizes.text} width={104} />
      </View>
      <View style={styles.addBioWrap}>
        <SkeletonText size={typography.sizes.text} width={212} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter },
  top: { gap: spacing.sm },
  // The tabs and the grid run to the screen's edges.
  bleed: { marginHorizontal: -layout.gutter },
  // The upload spinner covers the avatar alone.
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  aboutRow: { flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs },
  about: { alignItems: 'center', gap: spacing.xs },
  aboutText: { fontSize: typography.sizes.text },
  bio: { fontSize: typography.sizes.text, lineHeight: 21 },
  addBioWrap: { paddingVertical: 2 },
  addBio: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  hint: { fontSize: typography.sizes.text, lineHeight: 20 },

  // The buttons wrap to a second row where they do not fit, and each row's buttons share its width.
  actions: { alignSelf: 'stretch', alignItems: 'stretch', flexWrap: 'wrap', gap: spacing.sm },
  // Drawn a full fingertip tall; as wide as its label to begin with, then a share of what its row leaves.
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
  actionText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  // Find friends: a circle the height of its neighbours.
  actionIcon: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignSelf: 'center', borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },

  // A guest's card: their avatar, the offer, and what an account keeps.
  guestCard: { marginTop: spacing.md },
  guestInner: { gap: spacing.md },
  guestHead: { alignItems: 'center', gap: spacing.sm },
  guestName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  guestTitle: { ...display(typography.sizes.text), textAlign: 'center', marginTop: spacing.xs },
  guestBody: { fontSize: typography.sizes.text, lineHeight: 21, textAlign: 'center' },
  guestActions: { gap: spacing.sm },
});
