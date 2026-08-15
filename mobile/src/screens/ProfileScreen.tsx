import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { StreakBadge } from '../streak/StreakBadge';
import { useI18n } from '../i18n/I18nContext';
import { NotificationBell } from '../notifications/NotificationBell';
import type { Streak } from '../streak/format';

/**
 * Profile tab (KUR-082): the player's identity + streak and quick links into
 * League, Shop and the Settings hub (KUR-270). Preferences, privacy and account
 * actions all live on the Settings screen so this screen stays about "you".
 */
export function ProfileScreen() {
  const { user, client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const tabBarInset = useTabBarInset();
  const topInset = useScreenTopInset();
  const [streak, setStreak] = useState<Streak | null>(null);
  const { t } = useI18n();

  // The streak is settled server-side; the auth session user only carries
  // identity, so fetch it here on mount.
  useEffect(() => {
    let active = true;
    void client.get<{ user: { streak: Streak } }>('/me').then((res) => {
      if (active && res.ok) setStreak(res.data.user.streak);
    });
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: tabBarInset }]} showsVerticalScrollIndicator={false}>
        <InitialsAvatar
          name={user?.displayName ?? user?.username ?? ''}
          id={user?.id ?? ''}
          size={120}
          style={{ marginBottom: spacing.md }}
        />
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
  username: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  displayName: { fontSize: typography.sizes.md },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
