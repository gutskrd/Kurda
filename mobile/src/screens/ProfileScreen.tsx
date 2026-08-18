import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { uploadProfilePhoto } from '../profile/photoUpload';
import { StreakBadge } from '../streak/StreakBadge';
import { useI18n } from '../i18n/I18nContext';
import { NotificationBell } from '../notifications/NotificationBell';
import type { Streak } from '../streak/format';

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
  const [uploading, setUploading] = useState(false);
  const { t } = useI18n();

  // Streak + photo live on /me (the auth session user only carries identity).
  useEffect(() => {
    let active = true;
    void client.get<{ user: { streak: Streak; profilePhotoUrl?: string | null } }>('/me').then((res) => {
      if (active && res.ok) {
        setStreak(res.data.user.streak);
        setPhotoUrl(res.data.user.profilePhotoUrl ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [client]);

  const changePhoto = useCallback(async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to set a profile picture.');
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
    const res = await uploadProfilePhoto(client, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' });
    setUploading(false);
    if (res.ok) setPhotoUrl(res.url);
    else Alert.alert('Couldn’t update photo', res.error);
  }, [client, uploading]);

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={changePhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
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
        <Pressable onPress={changePhoto} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.changePhoto, { color: colors.primary }]}>{photoUrl ? 'Change photo' : 'Add photo'}</Text>
        </Pressable>

        <Text style={[styles.username, { color: colors.textPrimary }]}>{user?.username}</Text>
        {user?.displayName ? <Text style={[styles.displayName, { color: colors.textSecondary }]}>{user.displayName}</Text> : null}

        {streak ? <StreakBadge streak={streak} /> : null}

        <View style={styles.actions}>
          <ClayButton label={t('profile.league')} icon="trophy" tone="primary" onPress={() => navigation.navigate('League')} />
          <ClayButton label={t('profile.shop')} icon="cart" tone="primary" onPress={() => navigation.navigate('Shop')} />
          <NotificationBell />
          <ClayButton label="Settings" icon="gear" tone="neutral" onPress={() => navigation.navigate('Settings')} />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  avatarWrap: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 60 },
  changePhoto: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.xs, marginBottom: spacing.sm },
  username: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  displayName: { fontSize: typography.sizes.md },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
