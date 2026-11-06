import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import { GuestBenefits, useAccountGate } from '../auth/AccountGate';
import { refreshFelt } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { LinearGradient } from 'expo-linear-gradient';
import { display, statValue, statCaption } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Icon } from '../theme/Icon';
import { useCountUp } from '../theme/animate';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { useOpenMenu } from '../navigation/SideMenu';
import { HeaderButton } from '../navigation/HeaderButton';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { SITE_ORIGIN } from '../feed/api';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { CosmeticBackground, FavoriteRow, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { SEASON_FRAME_INNER, countryName, fireLevel, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { ProgressShowcase } from '../profile/ProgressShowcase';
import { AvatarStage } from '../profile/AvatarStage';
import { OverviewGrid, OverviewSkeleton, type OverviewTile } from '../profile/OverviewGrid';
import { LeagueEmblem, SeasonFramed, frameTierOf } from '../ranks/art';
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

/** How big the face is: the largest thing on the screen, in the middle, over the numbers. */
const AVATAR = 96;
/** The face with a season frame round it: the frame's ring sits outside the face, which stays the same size. */
const FRAMED = Math.round(AVATAR / SEASON_FRAME_INNER);
/** The tinted stage the face springs in onto: room round the frame for its two soft discs. */
const STAGE = FRAMED + 36;

/**
 * The parts of `/me` a profile puts on screen.
 *
 * `ProfileCosmetics` is the half the browser draws and this one draws too:
 * the background, the worn icon, premium, the country, the favourites. Both
 * apps declare it from the same endpoint, so it is declared the same way.
 */
interface Me extends ProfileCosmetics {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  xp: number;
  streak: Streak;
  profilePhotoUrl: string | null;
  /** when the account was made; the year is shown under the handle */
  createdAt?: string | null;
  /** badges earned (and the legacy tournament win), as the public profile counts them */
  achievements?: number;
}

/**
 * The Profile tab: your profile, or, as a guest, the offer of one.
 *
 * A guest has a generated name and nothing of their own to show — no face, no
 * bio, no friends, no profile anyone else can open — and most of what the
 * account's profile loads is refused to them. So the tab is not that profile
 * with its numbers greyed out; it is a card that says they are learning as a
 * guest, what an account keeps for them, and the two ways to one. The menu
 * stays, because the places behind it that are open to anyone (the badges, the
 * library, settings) are reached through it.
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
  const topInset = useScreenTopInset();
  const openMenu = useOpenMenu();
  const dir = useDirection();
  const { t } = useI18n();
  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        {/* the given name at the top and the menu at the end, as on the account's profile */}
        <View style={[styles.topBar, { flexDirection: dir.row }]}>
          <Text style={[styles.topName, dir.text, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
            {user?.username}
          </Text>
          <HeaderButton icon="menu" label={t('nav.menu')} onPress={openMenu} edge="end" testID="profile-menu" />
        </View>

        <GlassCard style={styles.guestCard}>
          <View style={styles.guestInner}>
            <View style={styles.guestHead}>
              <InitialsAvatar name={user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={null} />
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
 * Your profile: your face on its stage, who you are, how you are doing, and
 * what you have made.
 *
 * In the order somebody opening their own profile wants it answered: is this
 * me (the face, the name, the handle and the year you joined), how am I
 * doing (three numbers that count up, then the four tiles of the overview —
 * the streak with its fire, the course, the league with its emblem, the XP),
 * how do I change it and who do I know (Add friends, then Edit and Share) —
 * and then the badges and the ranks, and what you have written.
 *
 * What it is not is a menu. Everything that is a place rather than a thing
 * you do to a profile — the shop, settings, what you saved, badges, tags, the
 * library — is behind the menu at the top, one tap away.
 */
function AccountProfile() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const openMenu = useOpenMenu();
  const { counts } = useUnread();
  const dir = useDirection();
  const scrollRef = useRef<ScrollView>(null);
  // tapping Profile while on Profile goes back to the top
  useScrollToTop(scrollRef);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  // the first answers are in: until then the numbers and the lines under them are held in grey, not shown as zeros
  const [settled, setSettled] = useState(false);
  // and the showcase's, which comes after them
  const [progressSettled, setProgressSettled] = useState(false);
  const [zer, setZer] = useState<number | null>(null);
  const [friends, setFriends] = useState<number | null>(null);
  /** what the profile shows of the climb: ranks, the league, the showcase, the season frame */
  const [progress, setProgress] = useState<{
    ranks: ProfileRank[];
    league: ProfileLeague | null;
    badges: ShowcaseBadge[];
    frameSku: string | null;
  } | null>(null);
  const [iconsOwned, setIconsOwned] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  // a pull down the page: everything below is asked for again
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { t, locale } = useI18n();
  const showSendError = useSendErrorAlert();
  // badges earned since the app opened wear a "New" chip in the showcase
  const fresh = useFreshBadges();
  // which Kurdish the lesson path is teaching, for the course tile
  const course = useCourseDialect();

  /*
   * Who you are, in the four places the server keeps it.
   *
   * The session user carries identity and nothing else, so everything a
   * profile actually shows — the bio, the level, the streak, the photo, what
   * you are wearing — comes from /me, the purse from /me/wallet, the friend
   * count from /friends and what you own from /me/inventory. The browser
   * loads exactly these.
   */
  /*
   * Asked for again each time the tab comes back into view, and on a pull:
   * a new name or picture saved in Edit Profile, Zêr spent in the shop or XP
   * from a lesson shows the moment you return, not the next time the app
   * starts. What is on the screen stays there while the new answers come in.
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
        // an API that predates paging sends no total — it sent the whole list
        if (f.ok) setFriends(f.data.total ?? f.data.friends.length);
        if (inv.ok) setIconsOwned((inv.data.items ?? []).filter((i) => i.category === 'icon').length);

        /*
         * Your ranks, league, showcase and season frame.
         *
         * `/me` does not carry them, and the public profile endpoint already
         * works them out the same way it does for everybody else — so this asks
         * for your own public profile rather than adding a second way to
         * compute them. The browser does exactly this. (It used to ask for a
         * frozen all-time "#rank", which Game Ranks replaced.)
         */
        const id = m.ok ? m.data.user.id : null;
        if (id) {
          const p = await client.get<{
            ranks?: ProfileRank[];
            league?: ProfileLeague | null;
            badges?: ShowcaseBadge[];
            frameSku?: string | null;
          }>(`/users/${id}`);
          if (active && p.ok) {
            setProgress({ ranks: p.data.ranks ?? [], league: p.data.league ?? null, badges: p.data.badges ?? [], frameSku: p.data.frameSku ?? null });
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
    // the system picker hands back only the chosen picture, so there is no permission to ask for
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
   * Your profile's address, to send to somebody. A tapped link opens the
   * profile on the website, even on a phone with the app: the app does not
   * claim hevalo.app links until the association files exist (see `linking`
   * in App.tsx), so the message promises a page, not the app.
   */
  const share = useCallback(() => {
    const id = me?.id ?? user?.id;
    if (!id) return;
    const url = `${SITE_ORIGIN}/app/users/${id}`;
    void Share.share({ message: t('profile.shareMessage', { name: me?.displayName ?? user?.username ?? '', url }) });
  }, [me, user, t]);

  const country = me?.country ? countryName(me.country, locale) ?? me.country : null;
  const frameTier = frameTierOf(progress?.frameSku);
  const leagueTier = knownTier(progress?.league?.tier);
  // the stage under the face is the league's water, or the brand before there is a league
  const stageTint = leagueTier ? leagueTint(leagueTier, scheme)[1] : colors.primary;
  const joined = me?.createdAt ? new Date(me.createdAt) : null;
  const joinedYear = joined && !Number.isNaN(joined.getTime()) ? joined.getFullYear() : null;
  const username = me?.username ?? user?.username ?? '';

  /*
   * The quiet line, assembled from whatever there is.
   *
   * The icon count is zero for most people, so this is built rather than
   * written out: an interpunct between the parts that exist, and no line at
   * all when none do. The XP has its own tile in the overview now.
   */
  const aside = [zer === null ? null : `${formatNumber(zer, locale)} Zêr`, iconsOwned ? `${iconsOwned} ${t('profile.stat.icons')}` : null].filter(
    (part): part is string => part !== null,
  );

  /*
   * The four tiles of the overview. The streak opens its whole story, with
   * the numbers a missed day never takes away; the course opens the lesson
   * path; the league opens the league. XP is a number about you with nothing
   * behind it, so it is not pressable.
   */
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
      {/*
        What they are wearing, behind everything, with a scrim over it.

        The scrim is a gradient rather than a flat wash. Flat, it darkened the
        picture and then stopped, leaving a hard horizontal line where the
        background ended and the page began; running it to the page's own
        colour keeps white text readable over whatever somebody is wearing and
        lets the picture dissolve into the screen instead.
      */}
      {me?.background ? (
        <>
          <CosmeticBackground background={me.background} style={styles.cosmeticBg} />
          <LinearGradient
            colors={[colors.scrim, colors.background]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cosmeticScrim}
            pointerEvents="none"
          />
        </>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]}
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
        {/*
          Who this is, at the top, and the menu at the end: the shop, settings,
          what you saved and the rest. A gift waiting to be unwrapped puts a
          dot on it, the same dot that is on the tab.
        */}
        <View style={[styles.topBar, { flexDirection: dir.row }]}>
          <Text style={[styles.topName, dir.text, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
            {username}
          </Text>
          <HeaderButton
            icon="menu"
            label={counts.gifts > 0 ? t('nav.menuWaiting') : t('nav.menu')}
            dot={counts.gifts > 0}
            onPress={openMenu}
            edge="end"
            testID="profile-menu"
          />
        </View>

        {/*
          The face in the middle on its stage, springing in as the profile
          opens; under it the name, the handle and the year, where they are
          from, and who they are in their own words.
        */}
        <View style={styles.hero}>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel={t('profile.changePhoto')}>
            <AvatarStage tint={stageTint} size={STAGE}>
              {frameTier ? (
                // the season frame rings the face; the face and its icon stay their own size inside it
                <SeasonFramed tier={frameTier} size={FRAMED} label={t('season.frameOf', { tier: t(TIER_NAME_KEY[frameTier]) })}>
                  {face}
                </SeasonFramed>
              ) : (
                face
              )}
              {uploading ? (
                <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
                  <ActivityIndicator color={colors.textOnScrim} />
                </View>
              ) : null}
            </AvatarStage>
          </Pressable>
          <View style={[styles.nameRow, { flexDirection: dir.row }]}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {me?.displayName ?? user?.displayName ?? user?.username}
            </Text>
            {me?.premium ? <PremiumPill /> : null}
          </View>
          <Text style={[styles.handle, { color: colors.textSecondary }]} numberOfLines={1}>
            {[`@${username}`, joinedYear ? t('profile.joined', { year: joinedYear }) : null].filter(Boolean).join('  ·  ')}
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
          Three numbers that answer "how am I doing", counting up as they
          arrive. The friend count opens the friends, the badge count the
          badges, the way such counts do everywhere; the level is a number
          about you with nothing behind it, so it is not pressable.
        */}
        <View style={[styles.stats, { flexDirection: dir.row }]}>
          <Stat label={t('nav.friends')} value={friends} loading={!settled} onPress={() => navigation.navigate('Friends')} />
          <Stat label={t('profile.badges')} value={me?.achievements ?? null} loading={!settled} onPress={() => navigation.navigate('Badges')} />
          <Stat label={t('profile.stat.level')} value={me?.level?.level ?? 1} loading={!settled} />
        </View>
        {!settled ? (
          <SkeletonText size={typography.sizes.xs} width={120} align="center" />
        ) : aside.length > 0 ? (
          <Text style={[styles.aside, { color: colors.textSecondary }]} numberOfLines={1}>
            {aside.join('  ·  ')}
          </Text>
        ) : null}

        {/*
          What people do with their own profile: find the people who make the
          rest of it worth having, first and in the brand's colour; then
          change it, and send it to somebody, side by side and the same size.
        */}
        <ClayButton label={t('profile.addFriends')} icon="user-plus" tone="primary" onPress={() => navigation.navigate('Friends')} style={styles.addFriends} />
        <View style={[styles.actions, { flexDirection: dir.row }]}>
          <Pressable
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.edit')}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionText, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('profile.edit')}
            </Text>
          </Pressable>
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={t('profile.share')}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionText, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('profile.share')}
            </Text>
          </Pressable>
        </View>

        <GiftedNote background={me?.background} icon={me?.icon} />

        {/* the four at a glance, once the first answers are in; the league's tile fills in as the showcase arrives */}
        {settled && me ? <OverviewGrid tiles={tiles} /> : <OverviewSkeleton />}

        {/* the three badges chosen for the profile, each game's rank and the league */}
        {!progress && !progressSettled ? (
          // your own profile always has the badges' row, chosen or still to choose
          <View style={styles.showcaseSkeleton}>
            <SkeletonText size={typography.sizes.xs} width={64} />
            <Skeleton height={MIN_TOUCH_TARGET} radius={radii.md} />
          </View>
        ) : null}
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

        {/* only where there is one; an empty frame saying so is not a showcase */}
        {me?.favoritePoem ? <FavoriteRow label={t('profile.favoritePoem')} title={me.favoritePoem.title} /> : null}
        {me?.favoriteStory ? <FavoriteRow label={t('profile.favoriteStory')} title={me.favoriteStory.title} /> : null}

        {user?.id ? <ProfileActivity key={reloadKey} userId={user.id} own /> : null}
      </ScrollView>
      <StreakSheet streak={streakOpen ? streak : null} onClose={() => setStreakOpen(false)} />
    </GradientBackground>
  );
}

/**
 * One of the three: the number, counting up to where it is as it arrives,
 * then what it counts. A number not known is a dash, never a zero that reads
 * as the real one.
 */
/**
 * The course tile's picture: the flag Hevalo serves for its own Kurdish, or,
 * until it loads or where it will not, the book the Learn tab wears — never
 * an empty box beside the course's name.
 */
function CourseFlag(): React.JSX.Element {
  const { colors } = useTheme();
  const [broken, setBroken] = useState(false);
  const uri = flagUrl('KU');
  if (!uri || broken) return <Icon name="book" size={24} color={colors.textSecondary} />;
  return <Image source={{ uri }} style={styles.courseFlag} resizeMode="contain" accessibilityElementsHidden onError={() => setBroken(true)} />;
}

function Stat({ label, value, onPress, loading = false }: { label: string; value: number | null; onPress?: () => void; loading?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const count = useCountUp(value ?? 0);
  const shown = value === null ? '—' : formatNumber(count, locale);
  const settled = value === null ? '—' : formatNumber(value, locale);
  const body = (
    <>
      {loading ? (
        // the number's own line, held: a 0 or a 1 shown before the real one arrives reads as the real one
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
  // the number as it will be, not as it is mid-count, is what a screen reader is told
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
      style={({ pressed }) => [styles.stat, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  // full-bleed behind the header; the scrim sits on top of it at the same size
  cosmeticBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  cosmeticScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  topBar: { alignSelf: 'stretch', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  topName: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },

  // the face in the middle, and everything about who this is under it
  hero: { alignSelf: 'stretch', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  // the working picture sits over the face alone, not over the stage round it
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

  // the three numbers share the width, evenly
  stats: { alignSelf: 'stretch', justifyContent: 'space-around', marginTop: spacing.sm },
  stat: { alignItems: 'center', gap: 2, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  statValue: { ...statValue, fontVariant: ['tabular-nums'] },
  statLabel: statCaption,

  nameRow: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  name: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  handle: { fontSize: typography.sizes.sm, textAlign: 'center' },
  country: { alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  // the browser draws a plain 22x16 image and so does this; a corner radius on
  // something this small is a rounding error rather than a shape
  flag: { width: 22, height: 16 },
  courseFlag: { width: 30, height: 22 },
  countryName: { fontSize: typography.sizes.sm },
  bio: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
  aside: { fontSize: typography.sizes.xs, textAlign: 'center' },
  showcaseSkeleton: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  addFriends: { alignSelf: 'stretch', marginTop: spacing.md },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
  // 36 tall, as a profile's buttons are, and 44 to the finger with the slop above and below
  action: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  // a guest's card: the face they were given, the offer, and the four things an account keeps
  guestCard: { marginTop: spacing.md },
  guestInner: { gap: spacing.md },
  guestHead: { alignItems: 'center', gap: spacing.sm },
  guestTitle: { ...display(typography.sizes.lg), textAlign: 'center', marginTop: spacing.xs },
  guestBody: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  guestActions: { gap: spacing.sm },
});
