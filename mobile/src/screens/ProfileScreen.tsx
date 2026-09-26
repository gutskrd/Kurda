import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { ClayButton, GradientBackground } from '../theme/glass';
import { LinearGradient } from 'expo-linear-gradient';
import { statValue, statCaption, sectionLabel, display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { CosmeticBackground, GiftedNote, IconOverlay, PremiumPill, flagUrl } from '../profile/cosmetic-parts';
import type { ProfileCosmetics } from '../profile/types';
import { countryName } from '@kurda/shared';
import { ProfileActivity } from '../profile/ProfileActivity';
import { ProfileFriends } from '../profile/ProfileFriends';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { StreakBadge } from '../streak/StreakBadge';
import { useI18n } from '../i18n/I18nContext';
import { NotificationBell } from '../notifications/NotificationBell';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { unreadBadge } from '../notifications/inbox';
import type { Streak } from '../streak/format';

/**
 * The parts of `/me` a profile puts on screen.
 *
 * `ProfileCosmetics` is the half the browser was drawing and this was not:
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
 * Profile tab (KUR-082): the player's identity + streak and quick links into
 * League, Shop and the Settings hub (KUR-270). The avatar is tappable to pick,
 * crop and upload a profile photo (KUR-180).
 */
export function ProfileScreen() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [friends, setFriends] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [iconsOwned, setIconsOwned] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const { t, locale } = useI18n();
  const gifts = useUnseenGifts();

  /*
   * Who you are, in the three places the server keeps it.
   *
   * The session user carries identity and nothing else, so everything a
   * profile actually shows — the bio, the level, the streak, the photo —
   * comes from /me, the purse from /me/wallet and the friend count from
   * /friends. The browser loads exactly these, which is why its profile is a
   * profile and this one was a menu.
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

  return (
    <GradientBackground>
      {/*
        What they are wearing, behind everything, with a scrim over it.
        
        The scrim is not decoration: a background is somebody else’s picture
        and the name and the numbers have to stay readable on any of them.
      */}
      {me?.background ? (
        <>
          <CosmeticBackground background={me.background} style={styles.cosmeticBg} />
          {/*
            The scrim is a gradient, not a flat wash.

            Flat, it darkened the picture and then stopped — a hard horizontal
            line 320 points down the screen where the background ended and the
            page began. Running it from a dim top to the page's own colour does
            both jobs at once: it keeps white text readable over whatever
            somebody is wearing, and the picture dissolves into the screen
            instead of being cut off.
          */}
          <LinearGradient
            colors={[colors.scrim, colors.background]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cosmeticScrim}
            pointerEvents="none"
          />
        </>
      ) : null}
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={changePhoto}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          style={styles.avatarWrap}
        >
          <InitialsAvatar
            name={user?.displayName ?? user?.username ?? ''}
            id={user?.id ?? ''}
            size={120}
            photoUrl={photoUrl}
          />
          {me?.icon ? <IconOverlay icon={me.icon} size={120} /> : null}
          {uploading ? (
            <View style={[styles.avatarOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={changePhoto} accessibilityRole="button" hitSlop={hitSlopFor(MIN_TOUCH_TARGET, 30)}>
          <Text style={[styles.changePhoto, { color: colors.primary }]}>{photoUrl ? t('profile.editPhoto') : t('profile.addPhoto')}</Text>
        </Pressable>

        {/*
         * The name people chose, then the handle underneath — the way the
         * browser does it. This showed the username twice over: once as the
         * title and again, smaller, as the display name, and never said
         * which of the two anybody should type to find you.
         */}
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {me?.displayName ?? user?.displayName ?? user?.username}
          </Text>
          {me?.premium ? <PremiumPill /> : null}
        </View>
        <Text style={[styles.handle, { color: colors.textSecondary }]}>@{me?.username ?? user?.username}</Text>

        {country ? (
          <View style={styles.country}>
            <Image source={{ uri: flagUrl(me!.country!) }} style={styles.flag} resizeMode="contain" accessibilityElementsHidden />
            <Text style={[styles.countryName, { color: colors.textSecondary }]}>{country}</Text>
          </View>
        ) : null}

        <GiftedNote background={me?.background} icon={me?.icon} />

        {streak ? <StreakBadge streak={streak} /> : null}

        <View style={[styles.stats, { backgroundColor: colors.glassFill }]}>
          <Stat label={t('profile.stat.level')} value={String(me?.level?.level ?? 1)} />
          <Stat label="XP" value={(me?.level?.xp ?? me?.xp ?? 0).toLocaleString()} />
          <Stat label={t('profile.stat.streak')} value={String(streak?.current ?? 0)} />
          {/* Zêr is what the currency is called, in every one of the nine */}
          <Stat label="Zêr" value={zer === null ? '—' : zer.toLocaleString()} />
          <Stat label={t('nav.friends')} value={friends === null ? '—' : String(friends)} />
          {/* only once ranked games have been played, the way the browser has it */}
          {rank != null ? <Stat label={t('profile.stat.rank')} value={'#' + rank.toLocaleString()} /> : null}
          {iconsOwned ? <Stat label={t('profile.stat.icons')} value={String(iconsOwned)} /> : null}
        </View>

        <View style={styles.about}>
          <Text style={[styles.aboutTitle, { color: colors.textSecondary }]}>{t('profile.about')}</Text>
          <Text style={[styles.bio, { color: me?.bio ? colors.textPrimary : colors.textSecondary }]}>
            {me?.bio || t('profile.noBio')}
          </Text>
        </View>

        {/*
          Two showcases, and each one is only there if it has something in it.
          
          The browser shows a block per favourite and nothing where there is
          none, rather than an empty frame saying so.
        */}
        {me?.favoritePoem ? (
          <View style={styles.about}>
            <Text style={[styles.aboutTitle, { color: colors.textSecondary }]}>{t('profile.favoritePoem')}</Text>
            <Text style={[styles.favorite, { color: colors.textPrimary }]}>{me.favoritePoem.title}</Text>
          </View>
        ) : null}

        {me?.favoriteStory ? (
          <View style={styles.about}>
            <Text style={[styles.aboutTitle, { color: colors.textSecondary }]}>{t('profile.favoriteStory')}</Text>
            <Text style={[styles.favorite, { color: colors.textPrimary }]}>{me.favoriteStory.title}</Text>
          </View>
        ) : null}

        {user?.id ? <ProfileFriends userId={user.id} /> : null}

        {user?.id ? <ProfileActivity userId={user.id} own /> : null}

        <View style={styles.actions}>
          <ClayButton label={t('profile.league')} icon="trophy" tone="neutral" onPress={() => navigation.navigate('League')} />
          {/* a gift that arrives silently may as well not have arrived */}
          <ClayButton
            label={t('profile.shop')}
            icon="cart"
            tone="neutral"
            badge={unreadBadge(gifts) ?? undefined}
            onPress={() => navigation.navigate('Shop')}
          />
          <ClayButton label={t('profile.edit')} icon="person" tone="neutral" onPress={() => navigation.navigate('EditProfile')} />
          <ClayButton label={t('saved.title')} icon="bookmark" tone="neutral" onPress={() => navigation.navigate('Saved')} />
          <ClayButton label={t('tags.title')} icon="star" tone="neutral" onPress={() => navigation.navigate('Tags')} />
          <NotificationBell />
          <ClayButton label={t('settings.title')} icon="gear" tone="neutral" onPress={() => navigation.navigate('Settings')} />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

/** One number and what it counts, five across under the name. */
function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  avatarWrap: { width: 120, height: 120, borderRadius: radii.pill, overflow: 'hidden' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  changePhoto: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.xs, marginBottom: spacing.sm },
  name: { ...display(typography.sizes.xl) },
  handle: { fontSize: typography.sizes.md, marginTop: 2 },
  /*
   * Four across, and a second row when there are more than four.
   *
   * These shared the width equally while there were five of them. Rank and the
   * icon count make seven, and at 375pt "FRIENDS" wanted 49 points of the 43
   * that left it, so it arrived as "FRIEN…" — a statistic nobody can read. A
   * quarter each is 78, which is more than the longest of the seven needs in
   * any of the nine languages.
   */
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  stat: { width: '25%', alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  statValue,
  statLabel: statCaption,
  // full-bleed behind the header; the scrim sits on top of it at the same size
  cosmeticBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  cosmeticScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  country: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  // the browser draws a plain 22x16 image and so does this; a corner radius
  // on something this small is a rounding error rather than a shape
  flag: { width: 22, height: 16 },
  countryName: { fontSize: typography.sizes.sm },
  about: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.xs },
  favorite: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  aboutTitle: { ...sectionLabel },
  bio: { fontSize: typography.sizes.md, lineHeight: 22 },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
