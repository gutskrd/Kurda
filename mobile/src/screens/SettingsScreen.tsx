import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { GlassCard, GlassRow, GlassSelect, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { THEME_PREFERENCES, PREFERENCE_LABEL } from '../theme/appearance';
import { useEventTheme } from '../theme/EventThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale } from '../i18n/translations';
import { VISIBILITY_LABEL, type Visibility } from '../social/format';

/**
 * Settings hub (KUR-270). One place for preferences, notifications, privacy and
 * account actions — pulled off the Profile identity screen so each does one job.
 * Grouped into labelled glass sections following the iOS Settings pattern.
 */
export function SettingsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, logout, deleteAccount } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, preference, setPreference } = useTheme();
  const topInset = useScreenTopInset();
  const { optedOut, setOptedOut } = useEventTheme();
  const { t, locale, setLocale } = useI18n();
  const [visibility, setVisibility] = useState<Visibility>('everyone');

  // Profile visibility lives server-side on /me; load it so the picker reflects
  // the saved choice rather than defaulting every time the hub opens.
  useEffect(() => {
    let active = true;
    void client.get<{ user: { profileVisibility: Visibility } }>('/me').then((res) => {
      if (active && res.ok) setVisibility(res.data.user.profileVisibility);
    });
    return () => {
      active = false;
    };
  }, [client]);

  const changeVisibility = (v: Visibility) => {
    setVisibility(v);
    void client.put('/me/privacy', { visibility: v });
  };

  // Apple-required in-app account deletion (KUR-275). Server keeps a 14-day
  // grace window — signing back in cancels it — so we warn, then sign out.
  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'Your account and all your data will be permanently deleted after 14 days. Sign in again before then to cancel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteAccount().then((err) => {
              if (err) Alert.alert('Could not delete account', err);
            });
          },
        },
      ],
    );
  };

  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
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
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={onExit} accessibilityRole="button" hitSlop={10} style={styles.backBtn}>
            <Icon name="chevron-left" size={22} color={colors.textSecondary} />
            <Text style={[styles.back, { color: colors.textSecondary }]}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
          <View style={{ width: 64 }} />
        </View>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Preferences</Text>
        <GlassCard padding="tight">
          <GlassSelect
            first
            label={t('settings.language')}
            icon="book"
            value={locale}
            options={LOCALES}
            labelOf={(l) => LOCALE_LABEL[l as Locale]}
            onChange={(l) => setLocale(l as Locale)}
          />
          <GlassSelect
            label="Theme"
            icon="palette"
            value={preference}
            options={THEME_PREFERENCES}
            labelOf={(p) => PREFERENCE_LABEL[p]}
            onChange={setPreference}
          />
          <GlassRow icon="sparkle" title="Appearance & preview" onPress={() => navigation.navigate('Appearance')} />
          <GlassRow
            icon="star"
            title={t('settings.eventThemes')}
            trailing={<Switch value={!optedOut} onValueChange={(on) => setOptedOut(!on)} trackColor={{ true: colors.primary, false: colors.controlTrack }} />}
          />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Notifications</Text>
        <GlassCard padding="tight">
          <GlassRow first icon="gear" title="Notification settings" onPress={() => navigation.navigate('Notifications')} />
          <GlassRow icon="bell" title="Notification center" onPress={() => navigation.navigate('NotificationCenter')} />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Privacy</Text>
        <GlassCard>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>Who can see my profile</Text>
          <View style={styles.pillRow}>
            {(['everyone', 'friends', 'nobody'] as Visibility[]).map((v) => (
              <Pill key={v} label={VISIBILITY_LABEL[v]} active={visibility === v} onPress={() => changeVisibility(v)} />
            ))}
          </View>
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>Account</Text>
        <GlassCard padding="tight">
          <GlassRow first icon="person" title={t('profile.logout')} onPress={logout} destructive />
          <GlassRow icon="close" iconColor={colors.textSecondary} title="Delete account" destructive onPress={confirmDelete} />
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  back: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  section: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
    marginBottom: spacing.xs,
  },
  groupLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  pillRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  pill: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontSize: typography.sizes.sm },
  pillTextActive: { fontWeight: typography.weights.bold },
});
