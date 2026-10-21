import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { LinearGradient } from 'expo-linear-gradient';
import { statValue, statCaption, display } from '../theme/fonts';
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
import { learningStats, type Streak } from '../streak/format';

/** How big the face is: the largest thing on the screen, and no larger. */
const AVATAR = 96;
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
  useEffect(() => {
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
      if (active) setProgressSettled(true);
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const changePhoto = useCallback(async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('photo.accessNeeded'), t('photo.helpProfile'));
      return;
    }
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
      >
        {/*
          Who this is, at the top, and the menu at the end: the shop, settings,
          what you saved and the rest. A gift waiting to be unwrapped puts a
          dot on it, the same dot that is on the tab.
        */}
        <View style={[styles.topBar, { flexDirection: dir.row }]}>
          <View style={styles.topSide} />
          <Text style={[styles.topName, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
            @{me?.username ?? user?.username}
          </Text>
          <View style={[styles.topSide, { alignItems: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]}>
            <HeaderButton
              icon="menu"
              label={counts.gifts > 0 ? t('nav.menuWaiting') : t('nav.menu')}
              dot={counts.gifts > 0}
              onPress={openMenu}
              edge="end"
              testID="profile-menu"
            />
          </View>
        </View>

        <Pressable
          onPress={changePhoto}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          style={styles.avatarWrap}
        >
          {frameTier ? (
            // the season frame rings the face; the face and its icon stay their own size inside it
            <SeasonFramed tier={frameTier} size={FRAMED} label={t('season.frameOf', { tier: t(TIER_NAME_KEY[frameTier]) })}>
              <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} size={AVATAR} photoUrl={photoUrl} />
              {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
            </SeasonFramed>
          ) : (
            <>
              <InitialsAvatar
                name={user?.displayName ?? user?.username ?? ''}
                id={user?.id ?? ''}
                size={AVATAR}
                photoUrl={photoUrl}
              />
              {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
            </>
          )}
          {uploading ? (
            <View style={[styles.avatarOverlay, { backgroundColor: colors.scrim }]}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {me?.displayName ?? user?.displayName ?? user?.username}
          </Text>
          {me?.premium ? <PremiumPill /> : null}
        </View>

        {country ? (
          <View style={styles.country}>
            <Image
              source={{ uri: flagUrl(me!.country!) }}
              style={styles.flag}
              resizeMode="contain"
              accessibilityElementsHidden
            />
            <Text style={[styles.countryName, { color: colors.textSecondary }]}>{country}</Text>
          </View>
        ) : null}

        {/*
          Three numbers with a hairline between them.

          That divider is one of the few lines left in this app and it earns
          its place: three numbers side by side with only space between them
          read as one number in three parts. It is drawn in `separator`, which
          is what a boundary between two regions is drawn in everywhere else.
        */}
        <View style={styles.stats}>
          {/*
            The friend count opens the friends, the way a follower count does
            everywhere else. The other two are numbers about you and there is
            nothing behind them to open, so they are not pressable — a control
            that looks tappable and is not is worse than one that never did.
          */}
          <Stat
            label={t('nav.friends')}
            value={friends === null ? '—' : String(friends)}
            loading={!settled}
            onPress={() => navigation.navigate('Friends')}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <Stat label={t('profile.stat.level')} value={String(me?.level?.level ?? 1)} loading={!settled} />
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <Stat label={t('profile.stat.streak')} value={String(streak?.current ?? 0)} loading={!settled} />
        </View>

        {!settled ? (
          <SkeletonText size={typography.sizes.sm} width={180} align="center" style={styles.asideSkeleton} />
        ) : aside.length > 0 ? (
          <Text style={[styles.aside, { color: colors.textSecondary }]} numberOfLines={1}>
            {aside.join('  ·  ')}
          </Text>
        ) : null}

        {/*
          Beside the streak, which one missed day takes to zero: the two
          numbers a missed day never takes away, and the freezes learning has
          earned. Smaller than the three above — they answer "how far have I
          come", which is the question to ask after a lapse, not the first one.
        */}
        {streak ? <LearningRow streak={streak} /> : !settled ? <LearningRowSkeleton /> : null}

        {/* who they are, in their own words, before what can be done with the page */}
        {me?.bio ? <Text style={[styles.bio, { color: colors.textPrimary }]}>{me.bio}</Text> : null}

        {/*
          The two things people do with their own profile, side by side and
          the same size: change it, and send it to somebody.
        */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.edit')}
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

        {user?.id ? <ProfileActivity userId={user.id} own /> : null}
      </ScrollView>
    </GradientBackground>
  );
}

/** The longest run, the days learned and the freezes, with how a freeze is earned. */
function LearningRow({ streak }: { streak: Streak }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const stats = learningStats(streak);
  const cells = [
    { label: t('profile.stat.longestStreak'), value: stats.longest },
    { label: t('profile.stat.daysLearned'), value: stats.daysLearned },
    { label: t('profile.stat.freezes'), value: stats.freezes },
  ];
  return (
    <View style={styles.learning}>
      <View style={styles.learningRow}>
        {cells.map((cell) => (
          <View
            key={cell.label}
            style={styles.learningCell}
            accessible
            accessibilityLabel={`${cell.value} ${cell.label}`}
          >
            <Text style={[styles.learningValue, { color: colors.textPrimary }]}>{cell.value.toLocaleString()}</Text>
            <Text style={[styles.learningLabel, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.learningHint, { color: colors.textSecondary }]}>
        {t('profile.freezeHint', { count: stats.sessionsPerFreeze })}
      </Text>
    </View>
  );
}

/** The three cells and the line under them, in grey, at their own sizes. */
function LearningRowSkeleton(): React.JSX.Element {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.learning}>
      <View style={styles.learningRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.learningCell}>
            <SkeletonText size={typography.sizes.md} width={28} align="center" />
            <SkeletonText size={typography.sizes.xs} width={64} align="center" />
          </View>
        ))}
      </View>
      {/* the hint runs to three lines across a phone and two across a tablet */}
      <View>
        {(width >= 600 ? (['84%', '50%'] as const) : (['94%', '92%', '56%'] as const)).map((w) => (
          <SkeletonText key={w} size={typography.sizes.xs} lineHeight={16} width={w} align="center" />
        ))}
      </View>
    </View>
  );
}

/** One of the three: the number, then what it counts. */
function Stat({ label, value, onPress, loading = false }: { label: string; value: string; onPress?: () => void; loading?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const body = (
    <>
      {loading ? (
        // the number's own line, held: a 0 or a 1 shown before the real one arrives reads as the real one
        <SkeletonText size={typography.sizes.lg} width={28} align="center" />
      ) : (
        <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
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
  content: { alignItems: 'center', paddingHorizontal: layout.gutter, gap: spacing.sm },
  // full-bleed behind the header; the scrim sits on top of it at the same size
  cosmeticBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  cosmeticScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  // equal sides, so the name between them is centred whatever is at the end
  topBar: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  topSide: { width: MIN_TOUCH_TARGET },
  topName: { flex: 1, textAlign: 'center', fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },

  avatarWrap: { marginTop: spacing.sm },
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

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  name: { ...display(typography.sizes.xl) },
  country: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // the browser draws a plain 22x16 image and so does this; a corner radius on
  // something this small is a rounding error rather than a shape
  flag: { width: 22, height: 16 },
  countryName: { fontSize: typography.sizes.sm },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  stat: { alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg },
  statValue,
  statLabel: statCaption,
  statDivider: { width: StyleSheet.hairlineWidth, height: 28 },

  aside: { fontSize: typography.sizes.sm, marginTop: spacing.xs },
  asideSkeleton: { marginTop: spacing.xs },
  showcaseSkeleton: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },

  learning: { alignSelf: 'stretch', marginTop: spacing.sm, gap: spacing.sm },
  learningRow: { flexDirection: 'row', justifyContent: 'center' },
  learningCell: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs },
  learningValue: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  learningLabel: { fontSize: typography.sizes.xs, textAlign: 'center' },
  learningHint: { fontSize: typography.sizes.xs, textAlign: 'center', lineHeight: 16 },

  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },

  bio: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
});
