import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { StreakBadge } from '../streak/StreakBadge';
import { useEventTheme } from '../theme/EventThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL } from '../i18n/translations';
import { NotificationBell } from '../notifications/NotificationBell';
import type { Streak } from '../streak/format';
import { VISIBILITY_LABEL, type Visibility } from '../social/format';


export function ProfileScreen() {
  const { user, client, logout } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const { optedOut, setOptedOut } = useEventTheme();
  const { t, locale, setLocale } = useI18n();

  // The streak + privacy live on /me (streak settled server-side); the auth
  // session user only carries identity, so fetch them here on mount.
  useEffect(() => {
    let active = true;
    void client.get<{ user: { streak: Streak; profileVisibility: Visibility } }>('/me').then((res) => {
      if (active && res.ok) {
        setStreak(res.data.user.streak);
        setVisibility(res.data.user.profileVisibility);
      }
    });
    return () => {
      active = false;
    };
  }, [client]);

  const changeVisibility = (v: Visibility) => {
    setVisibility(v);
    void client.put('/me/privacy', { visibility: v });
  };

  return (
    <View style={styles.screen}>
      <InitialsAvatar
        name={user?.displayName ?? user?.username ?? ''}
        id={user?.id ?? ''}
        size={120}
        style={{ marginBottom: spacing.md }}
      />
      <Text style={styles.username}>{user?.username}</Text>
      {user?.displayName ? <Text style={styles.displayName}>{user.displayName}</Text> : null}

      {streak ? <StreakBadge streak={streak} /> : null}

      <Pressable style={styles.shop} onPress={() => navigation.navigate('League')}>
        <Text style={styles.shopText}>🏆 {t('profile.league')}</Text>
      </Pressable>
      <Pressable style={styles.shop} onPress={() => navigation.navigate('Shop')}>
        <Text style={styles.shopText}>🛒 {t('profile.shop')}</Text>
      </Pressable>
      <NotificationBell />
      <Pressable style={styles.shop} onPress={() => navigation.navigate('Notifications')}>
        <Text style={styles.shopText}>⚙️ Notification settings</Text>
      </Pressable>
      <Pressable style={styles.shop} onPress={() => navigation.navigate('Appearance')}>
        <Text style={styles.shopText}>🎨 Appearance</Text>
      </Pressable>

      <View style={styles.privacy}>
        <Text style={styles.privacyLabel}>Who can see my profile</Text>
        <View style={styles.privacyOptions}>
          {(['everyone', 'friends', 'nobody'] as Visibility[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => changeVisibility(v)}
              style={[styles.privacyOption, visibility === v && styles.privacyOptionActive]}
            >
              <Text style={[styles.privacyOptionText, visibility === v && styles.privacyOptionTextActive]}>
                {VISIBILITY_LABEL[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.privacy}>
        <Text style={styles.privacyLabel}>{t('settings.language')}</Text>
        <View style={styles.privacyOptions}>
          {LOCALES.map((l) => (
            <Pressable
              key={l}
              onPress={() => setLocale(l)}
              style={[styles.privacyOption, locale === l && styles.privacyOptionActive]}
            >
              <Text style={[styles.privacyOptionText, locale === l && styles.privacyOptionTextActive]}>
                {LOCALE_LABEL[l]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t('settings.eventThemes')}</Text>
        <Switch
          value={!optedOut}
          onValueChange={(on) => setOptedOut(!on)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  username: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  displayName: { fontSize: typography.sizes.md, color: colors.textSecondary },
  shop: { marginTop: spacing.lg, backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  shopText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  privacy: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
  privacyLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.bold },
  privacyOptions: { flexDirection: 'row', gap: spacing.xs },
  privacyOption: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  privacyOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  privacyOptionText: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  privacyOptionTextActive: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
  settingRow: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.bold },
  logout: { marginTop: spacing.xl },
  logoutText: { color: colors.danger, fontSize: typography.sizes.sm },
});
