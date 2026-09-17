import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
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
  const [username, setUsername] = useState<string | null>(null);

  // Profile visibility + username live server-side on /me; load them so the hub
  // reflects the saved values rather than defaulting every time it opens.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client.get<{ user: { profileVisibility: Visibility; username: string } }>('/me').then((res) => {
        if (active && res.ok) {
          setVisibility(res.data.user.profileVisibility);
          setUsername(res.data.user.username);
        }
      });
      return () => {
        active = false;
      };
    }, [client]),
  );

  const changeVisibility = (v: Visibility) => {
    setVisibility(v);
    void client.put('/me/privacy', { visibility: v });
  };

  // Apple-required in-app account deletion (KUR-275). Server keeps a 14-day
  // grace window — signing back in cancels it — so we warn, then sign out.
  const confirmDelete = () => {
    Alert.alert(
      t('settings.delete.confirmTitle'),
      t('settings.delete.warning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.delete.confirm'),
          style: 'destructive',
          onPress: () => {
            void deleteAccount().then((err) => {
              if (err) Alert.alert(t('settings.delete.failed'), err);
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
            <Text style={[styles.back, { color: colors.textSecondary }]}>{t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('settings.title')}</Text>
          <View style={{ width: 64 }} />
        </View>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.preferences')}</Text>
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
            label={t('appearance.theme')}
            icon="palette"
            value={preference}
            options={THEME_PREFERENCES}
            labelOf={(p) => t(PREFERENCE_LABEL[p])}
            onChange={setPreference}
          />
          <GlassRow icon="sparkle" title={t('settings.appearance')} onPress={() => navigation.navigate('Appearance')} />
          <GlassRow
            icon="star"
            title={t('settings.eventThemes')}
            trailing={<Switch value={!optedOut} onValueChange={(on) => setOptedOut(!on)} trackColor={{ true: colors.primary, false: colors.controlTrack }} />}
          />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.notifications')}</Text>
        <GlassCard padding="tight">
          <GlassRow first icon="gear" title={t('settings.notifications')} onPress={() => navigation.navigate('Notifications')} />
          <GlassRow icon="bell" title={t('settings.notificationCenter')} onPress={() => navigation.navigate('NotificationCenter')} />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.privacy')}</Text>
        <GlassCard>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('settings.privacy.title')}</Text>
          <View style={styles.pillRow}>
            {(['everyone', 'friends', 'nobody'] as Visibility[]).map((v) => (
              <Pill key={v} label={t(VISIBILITY_LABEL[v])} active={visibility === v} onPress={() => changeVisibility(v)} />
            ))}
          </View>
        </GlassCard>

        {/*
          With privacy rather than among the social screens: a blocklist is
          account state, like the setting above it. It is also the only way
          back from a block — the person is a 404 to you afterwards, so no
          other screen can offer to undo it.
        */}
        <GlassCard padding="tight">
          <GlassRow
            first
            icon="close"
            iconColor={colors.textSecondary}
            title={t('settings.blocked.title')}
            onPress={() => navigation.navigate('BlockedUsers')}
          />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.account')}</Text>
        <GlassCard padding="tight">
          <GlassRow first icon="person" title={t('auth.username')} value={username ? `@${username}` : undefined} onPress={() => navigation.navigate('ChangeUsername')} />
          <GlassRow icon="person" title={t('profile.logout')} onPress={logout} destructive />
          <GlassRow icon="close" iconColor={colors.textSecondary} title={t('settings.delete.title')} destructive onPress={confirmDelete} />
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
  title: { ...display(typography.sizes.xl) },
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
