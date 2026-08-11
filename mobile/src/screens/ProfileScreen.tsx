import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { spacing, radii, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
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
  const { colors } = useTheme();
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

  // Reusable themed pill for the privacy / language choosers.
  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        { backgroundColor: active ? colors.primary : colors.controlTrack, borderColor: active ? colors.primary : colors.glassBorder },
      ]}
    >
      <Text style={[styles.pillText, { color: active ? colors.textOnPrimary : colors.textSecondary }, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          <ClayButton label="Notification settings" icon="gear" tone="neutral" onPress={() => navigation.navigate('Notifications')} />
          <ClayButton label="Appearance" icon="palette" tone="neutral" onPress={() => navigation.navigate('Appearance')} />
        </View>

        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>Who can see my profile</Text>
          <View style={styles.pillRow}>
            {(['everyone', 'friends', 'nobody'] as Visibility[]).map((v) => (
              <Pill key={v} label={VISIBILITY_LABEL[v]} active={visibility === v} onPress={() => changeVisibility(v)} />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('settings.language')}</Text>
          <View style={styles.pillRow}>
            {LOCALES.map((l) => (
              <Pill key={l} label={LOCALE_LABEL[l]} active={locale === l} onPress={() => setLocale(l)} />
            ))}
          </View>
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('settings.eventThemes')}</Text>
          <Switch
            value={!optedOut}
            onValueChange={(on) => setOptedOut(!on)}
            trackColor={{ true: colors.primary, false: colors.controlTrack }}
          />
        </View>

        <Pressable style={styles.logout} onPress={logout}>
          <Text style={[styles.logoutText, { color: colors.danger }]}>{t('profile.logout')}</Text>
        </Pressable>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.sm, flexGrow: 1, justifyContent: 'center' },
  username: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  displayName: { fontSize: typography.sizes.md },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  group: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
  groupLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  pillRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  pill: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontSize: typography.sizes.sm },
  pillTextActive: { fontWeight: typography.weights.bold },
  settingRow: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logout: { marginTop: spacing.xl, marginBottom: spacing.xl },
  logoutText: { fontSize: typography.sizes.sm },
});
