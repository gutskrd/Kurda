import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { StreakBadge } from '../streak/StreakBadge';
import { useEventTheme } from '../theme/EventThemeContext';
import type { Streak } from '../streak/format';
import { VISIBILITY_LABEL, type Visibility } from '../social/format';

/** First letter of the display name / username, NFC-normalised. */
function initial(name: string | null | undefined): string {
  const s = (name ?? '?').normalize('NFC').trim();
  return s ? s[0]!.toUpperCase() : '?';
}

export function ProfileScreen() {
  const { user, client, logout } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const { optedOut, setOptedOut } = useEventTheme();

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

  // Placeholder monogram until the profile-picture system (#177–#181)
  // lands (photo upload + a proper initials fallback).
  return (
    <View style={styles.screen}>
      <View style={styles.monogram}>
        <Text style={styles.monogramText}>{initial(user?.displayName ?? user?.username)}</Text>
      </View>
      <Text style={styles.username}>{user?.username}</Text>
      {user?.displayName ? <Text style={styles.displayName}>{user.displayName}</Text> : null}

      {streak ? <StreakBadge streak={streak} /> : null}

      <Pressable style={styles.shop} onPress={() => navigation.navigate('League')}>
        <Text style={styles.shopText}>🏆 League</Text>
      </Pressable>
      <Pressable style={styles.shop} onPress={() => navigation.navigate('Shop')}>
        <Text style={styles.shopText}>🛒 Shop</Text>
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

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Event themes</Text>
        <Switch
          value={!optedOut}
          onValueChange={(on) => setOptedOut(!on)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
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
  monogram: {
    width: 120,
    height: 120,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  monogramText: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textOnPrimary,
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
