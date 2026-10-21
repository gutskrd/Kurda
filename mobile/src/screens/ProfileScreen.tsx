import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { LinearGradient } from 'expo-linear-gradient';
import { statValue, statCaption } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { useOpenMenu } from '../navigation/SideMenu';
import { HeaderButton } from '../navigation/HeaderButton';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { SITE_ORIGIN } from '../feed/api';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { CosmeticBackground, FavoriteRow, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { SEASON_FRAME_INNER, countryName, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { ProgressShowcase } from '../profile/ProgressShowcase';
import { SeasonFramed, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { ProfileActivity } from '../profile/ProfileActivity';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { useSendErrorAlert } from '../reports/SendError';
import { useI18n } from '../i18n/I18nContext';
import type { Streak } from '../streak/format';
import { StreakSheet } from '../streak/StreakSheet';
import { formatNumber } from '../i18n/format';
import { Icon } from '../theme/Icon';

/** How big the face is: the largest thing on the screen, beside the numbers, with room for three of them on the smallest phone. */
const AVATAR = 86;
/** The face with a season frame round it: the frame's ring sits outside the face, which stays the same size. */
const FRAMED = Math.round(AVATAR / SEASON_FRAME_INNER);

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
}

/**
 * Your profile: your name at the top, a face, three numbers, and two buttons.
 *
 * In the order somebody opening their own profile wants it answered: is this
 * me, how am I doing, and how do I change it — then what I have made.
 *
 * What it is not is a menu. Everything that is a place rather than a thing
 * you do to a profile — the shop, settings, what you saved, badges, tags, the
 * library — is behind the menu at the top, one tap away. The two buttons are
 * the two things people do with their own profile: change it, and share it.
 *
 * The numbers are split in two. Three get the big centred row, because
 * friends, level and streak are the three that answer "how am I doing". The
 * other ones — XP, Zêr, icons — are one quiet line underneath: still there,
 * still yours, no longer shouting over the face.
 */
export function ProfileScreen() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
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
   * Your profile's address, to send to somebody. The website opens it for
   * anyone; the app opens it for anyone who has the app.
   */
  const share = useCallback(() => {
    const id = me?.id ?? user?.id;
    if (!id) return;
    const url = `${SITE_ORIGIN}/app/users/${id}`;
    void Share.share({ message: t('profile.shareMessage', { name: me?.displayName ?? user?.username ?? '', url }) });
  }, [me, user, t]);

  const country = me?.country ? countryName(me.country, locale) ?? me.country : null;
  const frameTier = frameTierOf(progress?.frameSku);

  /*
   * The quiet line, assembled from whatever there is.
   *
   * The icon count is zero for most people, so this is built rather than
   * written out: an
   * interpunct between the parts that exist, and no line at all when none do.
   */
  const aside = [
    `${(me?.level?.xp ?? me?.xp ?? 0).toLocaleString()} XP`,
    zer === null ? null : `${zer.toLocaleString()} Zêr`,
    iconsOwned ? `${iconsOwned} ${t('profile.stat.icons')}` : null,
  ].filter((part): part is string => part !== null);

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
            onRefresh={() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
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
            {me?.username ?? user?.username}
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
          The face, and beside it the three numbers that answer "how am I
          doing": the arrangement a profile is read in everywhere, the eye
          going from the face straight to the numbers.
        */}
        <View style={[styles.head, { flexDirection: dir.row }]}>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel={t('profile.changePhoto')}>
            {frameTier ? (
              // the season frame rings the face; the face and its icon stay their own size inside it
              <SeasonFramed tier={frameTier} size={FRAMED} label={t('season.frameOf', { tier: t(TIER_NAME_KEY[frameTier]) })}>
                <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={photoUrl} />
                {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
              </SeasonFramed>
            ) : (
              <>
                <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={photoUrl} />
                {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
              </>
            )}
            {uploading ? (
              <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>

          {/*
            The friend count opens the friends, the way a friend count does
            everywhere; the streak opens its whole story, with the numbers a
            missed day never takes away. The level is a number about you with
            nothing behind it, so it is not pressable — a control that looks
            tappable and is not is worse than one that never did.
          */}
          <View style={[styles.stats, { flexDirection: dir.row }]}>
            <Stat
              label={t('nav.friends')}
              value={friends === null ? '—' : formatNumber(friends, locale)}
              loading={!settled}
              onPress={() => navigation.navigate('Friends')}
            />
            <Stat label={t('profile.stat.level')} value={formatNumber(me?.level?.level ?? 1, locale)} loading={!settled} />
            <Stat
              label={t('profile.stat.streak')}
              value={formatNumber(streak?.current ?? 0, locale)}
              loading={!settled}
              onPress={streak ? () => setStreakOpen(true) : undefined}
              icon={streak && streak.current > 0 ? 'flame' : undefined}
            />
          </View>
        </View>

        {/* the name, where they are from and who they are, in their own words, under the face */}
        <View style={styles.about}>
          <View style={[styles.nameRow, { flexDirection: dir.row }]}>
            <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {me?.displayName ?? user?.displayName ?? user?.username}
            </Text>
            {me?.premium ? <PremiumPill /> : null}
          </View>
          {country ? (
            <View style={[styles.country, { flexDirection: dir.row }]}>
              <Image source={{ uri: flagUrl(me!.country!) }} style={styles.flag} resizeMode="contain" accessibilityElementsHidden />
              <Text style={[styles.countryName, { color: colors.textSecondary }]}>{country}</Text>
            </View>
          ) : null}
          {me?.bio ? <Text style={[styles.bio, dir.text, { color: colors.textPrimary }]}>{me.bio}</Text> : null}
          {!settled ? (
            <SkeletonText size={typography.sizes.xs} width={160} />
          ) : aside.length > 0 ? (
            <Text style={[styles.aside, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
              {aside.join('  ·  ')}
            </Text>
          ) : null}
        </View>

        {/*
          The two things people do with their own profile, side by side and
          the same size: change it, and send it to somebody.
        */}
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

/** One of the three: the number, then what it counts. */
function Stat({
  label,
  value,
  onPress,
  loading = false,
  icon,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  loading?: boolean;
  /** a glyph before the number: the lit flame beside a streak */
  icon?: 'flame';
}): React.JSX.Element {
  const { colors } = useTheme();
  const body = (
    <>
      {loading ? (
        // the number's own line, held: a 0 or a 1 shown before the real one arrives reads as the real one
        <SkeletonText size={typography.sizes.lg} width={28} align="center" />
      ) : (
        <View style={styles.statLine}>
          {icon ? <Icon name={icon} size={16} color={colors.goldText} /> : null}
          <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      )}
      <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.stat}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
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

  head: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
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

  // the three numbers share what is left beside the face, evenly
  stats: { flex: 1, justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  statLine: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statValue,
  statLabel: statCaption,

  about: { alignSelf: 'stretch', gap: 4, marginTop: spacing.sm + 4 },
  nameRow: { alignItems: 'center', gap: spacing.sm },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, flexShrink: 1 },
  country: { alignItems: 'center', gap: spacing.xs },
  // the browser draws a plain 22x16 image and so does this; a corner radius on
  // something this small is a rounding error rather than a shape
  flag: { width: 22, height: 16 },
  countryName: { fontSize: typography.sizes.sm },
  bio: { fontSize: typography.sizes.sm, lineHeight: 20 },
  aside: { fontSize: typography.sizes.xs },
  showcaseSkeleton: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
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
});
