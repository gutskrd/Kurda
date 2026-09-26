import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { GradientBackground } from '../theme/glass';
import { LinearGradient } from 'expo-linear-gradient';
import { statValue, statCaption, display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { SideMenuButton, useOpenMenu } from '../navigation/SideMenu';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { CosmeticBackground, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { countryName } from '@kurda/shared';
import { ProfileActivity } from '../profile/ProfileActivity';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { useI18n } from '../i18n/I18nContext';
import type { Streak } from '../streak/format';

/** How big the face is. TikTok's is about this, and so is Instagram's. */
const AVATAR = 96;

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
 * Your profile: a face, a name, three numbers and one button.
 *
 * Built to the shape every social app has settled on — TikTok's and
 * Instagram's are the same five bands — because it is the shape that answers
 * what somebody opening their own profile actually wants to know, in the
 * order they want it: is this me, how am I doing, and how do I change it.
 *
 * What it is not any more is a menu. It carried seven buttons across the
 * bottom — League, Shop, Edit, Saved, Tags, a notification bell and Settings —
 * and every one of them is a place rather than a thing you do to a profile.
 * Six are in the side panel, one tap from every screen in the app instead of
 * from this one, and the bell is the Inbox tab. Only Edit is about the
 * profile, so only Edit stays, as the wide button it is in every other app.
 *
 * The numbers are split in two. Three get the big centred row, because
 * friends, level and streak are the three that answer "how am I doing". The
 * other four — XP, Zêr, rank, icons — are one quiet line underneath: still
 * there, still yours, no longer shouting over the face. Seven equal
 * statistics is a dashboard, and this is a profile.
 */
export function ProfileScreen() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const openMenu = useOpenMenu();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [friends, setFriends] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [iconsOwned, setIconsOwned] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const { t, locale } = useI18n();

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
       * Your own ranked place.
       *
       * `/me` does not carry it, and the public profile endpoint already
       * works it out the same way it does for everybody else — so this asks
       * for your own public profile rather than adding a second way to
       * compute one number. The browser does exactly this.
       */
      const id = m.ok ? m.data.user.id : null;
      if (id) {
        const p = await client.get<{ rank?: number | null }>(`/users/${id}`);
        if (active && p.ok) setRank(p.data.rank ?? null);
      }
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
    const res = await uploadProfilePhoto(client, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' }, t);
    setUploading(false);
    if (res.ok) setPhotoUrl(res.url);
    else Alert.alert(t('profile.photoFailed'), res.error);
  }, [client, uploading]);

  const country = me?.country ? countryName(me.country, locale) ?? me.country : null;

  /*
   * The quiet line, assembled from whatever there is.
   *
   * Rank is absent until a ranked game has been played and the icon count is
   * zero for most people, so this is built rather than written out: an
   * interpunct between the parts that exist, and no line at all when none do.
   */
  const aside = [
    `${(me?.level?.xp ?? me?.xp ?? 0).toLocaleString()} XP`,
    zer === null ? null : `${zer.toLocaleString()} Zêr`,
    rank == null ? null : `#${rank.toLocaleString()}`,
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
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* the panel opens from the left on every other tab, so it does here */}
        <View style={styles.topBar}>
          <SideMenuButton onPress={openMenu} />
        </View>

        <Pressable
          onPress={changePhoto}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          style={styles.avatarWrap}
        >
          <InitialsAvatar
            name={user?.displayName ?? user?.username ?? ''}
            id={user?.id ?? ''}
            size={AVATAR}
            photoUrl={photoUrl}
          />
          {me?.icon ? <IconOverlay icon={me.icon} size={AVATAR} /> : null}
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
        <Text style={[styles.handle, { color: colors.textSecondary }]}>@{me?.username ?? user?.username}</Text>

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
            onPress={() => navigation.navigate('Friends')}
          />
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <Stat label={t('profile.stat.level')} value={String(me?.level?.level ?? 1)} />
          <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
          <Stat label={t('profile.stat.streak')} value={String(streak?.current ?? 0)} />
        </View>

        {aside.length > 0 ? (
          <Text style={[styles.aside, { color: colors.textSecondary }]} numberOfLines={1}>
            {aside.join('  ·  ')}
          </Text>
        ) : null}

        {/*
          One wide button and one square one, which is the arrangement every
          app with a profile has arrived at: the thing you came to do, and the
          one shortcut worth a tap beside it.
        */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.edit')}
            style={({ pressed }) => [styles.edit, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.editText, { color: colors.textPrimary }]}>{t('profile.edit')}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Saved')}
            accessibilityRole="button"
            accessibilityLabel={t('saved.title')}
            style={({ pressed }) => [
              styles.squareAction,
              { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="bookmark" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {me?.bio ? <Text style={[styles.bio, { color: colors.textPrimary }]}>{me.bio}</Text> : null}

        <GiftedNote background={me?.background} icon={me?.icon} />

        {/* only where there is one; an empty frame saying so is not a showcase */}
        {me?.favoritePoem ? <Favorite label={t('profile.favoritePoem')} title={me.favoritePoem.title} /> : null}
        {me?.favoriteStory ? <Favorite label={t('profile.favoriteStory')} title={me.favoriteStory.title} /> : null}

        {user?.id ? <ProfileActivity userId={user.id} own /> : null}
      </ScrollView>
    </GradientBackground>
  );
}

/** One of the three: the number, then what it counts. */
function Stat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const body = (
    <>
      <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
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

/** A poem or a story somebody put on their profile on purpose. */
function Favorite({ label, title }: { label: string; title: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.favorite}>
      <Text style={[styles.favoriteLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.favoriteTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
  // full-bleed behind the header; the scrim sits on top of it at the same size
  cosmeticBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  cosmeticScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  topBar: { alignSelf: 'stretch', alignItems: 'flex-start' },

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
  handle: { fontSize: typography.sizes.md },
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

  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  edit: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  squareAction: {
    width: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bio: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },

  favorite: { alignSelf: 'stretch', gap: 2, marginTop: spacing.md },
  favoriteLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  favoriteTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
});
