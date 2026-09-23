import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { ClayButton, GradientBackground } from '../theme/glass';
import { statValue, statCaption, sectionLabel, display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { ProfileActivity } from '../profile/ProfileActivity';
import { ProfileFriends } from '../profile/ProfileFriends';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { StreakBadge } from '../streak/StreakBadge';
import { useI18n } from '../i18n/I18nContext';
import { NotificationBell } from '../notifications/NotificationBell';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { unreadBadge } from '../notifications/inbox';
import type { Streak } from '../streak/format';

/** The parts of /me a profile puts on screen. */
interface Me {
  username: string;
  displayName: string | null;
  bio: string | null;
  xp: number;
  streak: Streak;
  profilePhotoUrl: string | null;
  /** the server does the levelling, so the two apps cannot disagree about it */
  level?: { level: number; xp: number } | null;
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
  const [uploading, setUploading] = useState(false);
  const { t } = useI18n();
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
      const [m, w, f] = await Promise.all([
        client.get<{ user: Me }>('/me'),
        client.get<{ balances: { zer: number } }>('/me/wallet'),
        client.get<{ friends: unknown[]; total?: number }>('/friends?limit=1'),
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

  return (
    <GradientBackground>
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
        <Text style={[styles.name, { color: colors.textPrimary }]}>{me?.displayName ?? user?.displayName ?? user?.username}</Text>
        <Text style={[styles.handle, { color: colors.textSecondary }]}>@{me?.username ?? user?.username}</Text>

        {streak ? <StreakBadge streak={streak} /> : null}

        <View style={[styles.stats, { backgroundColor: colors.glassFill }]}>
          <Stat label={t('profile.stat.level')} value={String(me?.level?.level ?? 1)} />
          <Stat label="XP" value={(me?.level?.xp ?? me?.xp ?? 0).toLocaleString()} />
          <Stat label={t('profile.stat.streak')} value={String(streak?.current ?? 0)} />
          {/* Zêr is what the currency is called, in every one of the nine */}
          <Stat label="Zêr" value={zer === null ? '—' : zer.toLocaleString()} />
          <Stat label={t('nav.friends')} value={friends === null ? '—' : String(friends)} />
        </View>

        <View style={styles.about}>
          <Text style={[styles.aboutTitle, { color: colors.textSecondary }]}>{t('profile.about')}</Text>
          <Text style={[styles.bio, { color: me?.bio ? colors.textPrimary : colors.textSecondary }]}>
            {me?.bio || t('profile.noBio')}
          </Text>
        </View>

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
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  statValue,
  statLabel: statCaption,
  about: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.xs },
  aboutTitle: { ...sectionLabel },
  bio: { fontSize: typography.sizes.md, lineHeight: 22 },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
