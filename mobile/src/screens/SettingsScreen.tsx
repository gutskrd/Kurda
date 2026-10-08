import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { GlassCard, GlassRow, GlassSelect, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { THEME_PREFERENCES, PREFERENCE_LABEL } from '../theme/appearance';
import { useEventTheme } from '../theme/EventThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale } from '../i18n/translations';
import { VISIBILITIES, VISIBILITY_HINT, VISIBILITY_LABEL, visibilityOffered, type Visibility } from '../social/format';

/**
 * Settings hub (KUR-270). One place for preferences, notifications, privacy and
 * account actions — pulled off the Profile identity screen so each does one job.
 * Grouped into labelled glass sections following the iOS Settings pattern.
 */
export function SettingsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, logout, deleteAccount } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, preference, setPreference } = useTheme();
  const { optedOut, setOptedOut } = useEventTheme();
  const { t, locale, setLocale } = useI18n();
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [username, setUsername] = useState<string | null>(null);
  // 13–17 as the server works it out today; it decides what is offered here
  const [minor, setMinor] = useState(false);
  // null until /me answers, so the switch never shows a guess
  const [leagues, setLeagues] = useState<boolean | null>(null);

  // Profile visibility, username, age and leagues live server-side on /me; load
  // them so the hub reflects the saved values rather than defaulting every
  // time it opens.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void client
        .get<{
          user: { profileVisibility: Visibility; username: string; minor?: boolean; leaguesEnabled?: boolean };
        }>('/me')
        .then((res) => {
          if (active && res.ok) {
            setVisibility(res.data.user.profileVisibility);
            setUsername(res.data.user.username);
            setMinor(res.data.user.minor === true);
            setLeagues(res.data.user.leaguesEnabled !== false);
          }
        });
      return () => {
        active = false;
      };
    }, [client]),
  );

  const changeVisibility = (v: Visibility) => {
    if (!visibilityOffered(v, minor)) return;
    const before = visibility;
    setVisibility(v);
    void client.put('/me/privacy', { visibility: v }).then((res) => {
      if (!res.ok) {
        setVisibility(before);
        Alert.alert(t('settings.privacy.title'), describeError(res.error, t));
      }
    });
  };

  /**
   * In or out of the weekly leagues, in one tap. A league ranks you against
   * strangers by XP every week, which suits some people and puts others off
   * learning; leaving takes you out of this week's table at once and changes
   * nothing else you have earned.
   */
  const changeLeagues = (on: boolean) => {
    setLeagues(on);
    void client.patch('/me', { leaguesEnabled: on }).then((res) => {
      if (!res.ok) {
        setLeagues(!on);
        Alert.alert(t('settings.leagues.title'), describeError(res.error, t));
      }
    });
  };

  /**
   * Sign out on every device, including this one.
   *
   * The server bumps the token version, which invalidates every refresh
   * token there is — so this device's session dies with the rest. Signing out
   * locally afterwards is not tidying up; it is the only way the app and the
   * server still agree about what just happened.
   */
  const signOutEverywhere = () => {
    Alert.alert(t('settings.sessions.signOutEverywhere'), t('settings.sessions.help'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.sessions.signOutEverywhere'),
        style: 'destructive',
        onPress: () => void client.delete('/me/sessions').then(() => logout()),
      },
    ]);
  };

  /**
   * Ask for a copy of everything.
   *
   * The answer is 202 and an email later, not a file now, so the only honest
   * acknowledgement is that it was asked for.
   */
  const [exporting, setExporting] = useState(false);
  const requestExport = () => {
    if (exporting) return;
    setExporting(true);
    void client.post('/me/export').then((res) => {
      setExporting(false);
      if (res.ok) Alert.alert(t('settings.data.title'), t('settings.data.requested'));
      else Alert.alert(t('settings.data.failed'), describeError(res.error, t));
    });
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

  const Pill = ({
    label,
    active,
    onPress,
    disabled = false,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={[
        styles.pill,
        {
          backgroundColor: colors.controlTrack,
          borderColor: active ? colors.textPrimary : colors.glassBorder,
        },
        disabled && styles.pillDisabled,
      ]}
    >
      <Text style={[styles.pillText, { color: active ? colors.textPrimary : colors.textSecondary }, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('settings.title')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.preferences')}</Text>
        <GlassCard padding="tight">
          <GlassSelect
            label={t('settings.language')}
            icon="translate"
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
          <GlassRow icon="palette" title={t('settings.appearance')} onPress={() => navigation.navigate('Appearance')} />
          <GlassRow
            icon="star"
            title={t('settings.eventThemes')}
            trailing={<Switch value={!optedOut} onValueChange={(on) => setOptedOut(!on)} trackColor={{ true: colors.primary, false: colors.controlTrack }} />}
          />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.notifications')}</Text>
        <GlassCard padding="tight">
          <GlassRow icon="gear" title={t('settings.notifications')} onPress={() => navigation.navigate('Notifications')} />
          <GlassRow icon="bell" title={t('settings.notificationCenter')} onPress={() => navigation.navigate('NotificationCenter')} />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.privacy')}</Text>
        <GlassCard>
          <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('settings.privacy.title')}</Text>
          <View style={styles.pillRow}>
            {VISIBILITIES.map((v) => (
              <Pill
                key={v}
                label={t(VISIBILITY_LABEL[v])}
                active={visibility === v}
                onPress={() => changeVisibility(v)}
                disabled={!visibilityOffered(v, minor)}
              />
            ))}
          </View>
          {/* a setting about who sees you is worth a sentence, not just a word */}
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t(VISIBILITY_HINT[visibility])}</Text>
          {minor ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('settings.visibility.minorHint')}</Text>
          ) : null}
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.leagues.title')}</Text>
        <GlassCard>
          <GlassRow
            icon="trophy"
            title={t('settings.leagues.toggle')}
            trailing={
              <Switch
                value={leagues === true}
                disabled={leagues === null}
                onValueChange={changeLeagues}
                accessibilityLabel={t('settings.leagues.toggle')}
                trackColor={{ true: colors.primary, false: colors.controlTrack }}
              />
            }
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('settings.leagues.help')}</Text>
          {minor ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('settings.leagues.minorHint')}</Text>
          ) : null}
        </GlassCard>

        {/*
          With privacy rather than among the social screens: a blocklist is
          account state, like the setting above it. It is also the only way
          back from a block — the person is a 404 to you afterwards, so no
          other screen can offer to undo it.
        */}
        <GlassCard padding="tight">
          <GlassRow
            icon="person"
            iconColor={colors.textSecondary}
            title={t('settings.blocked.title')}
            onPress={() => navigation.navigate('BlockedUsers')}
          />
        </GlassCard>

        <Text style={[styles.section, { color: colors.textSecondary }]}>{t('settings.group.account')}</Text>
        <GlassCard padding="tight">
          <GlassRow icon="person" title={t('auth.username')} value={username ? `@${username}` : undefined} onPress={() => navigation.navigate('ChangeUsername')} />
          <GlassRow
            icon="sign-out"
            title={t('settings.sessions.signOutEverywhere')}
            onPress={signOutEverywhere}
            destructive
          />
          <GlassRow
            icon="download"
            title={t('settings.data.request')}
            subtitle={t('settings.data.help')}
            value={exporting ? t('settings.data.requesting') : undefined}
            onPress={requestExport}
          />
          <GlassRow icon="sign-out" title={t('profile.logout')} onPress={logout} />
          <GlassRow icon="trash" title={t('settings.delete.title')} destructive onPress={confirmDelete} />
        </GlassCard>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  section: { ...sectionLabel, marginTop: spacing.md, marginLeft: spacing.xs, marginBottom: spacing.xs },
  groupLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginBottom: spacing.sm },
  pillRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  pill: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: typography.sizes.sm },
  hint: { fontSize: typography.sizes.sm, marginTop: spacing.sm, lineHeight: 19 },
  pillTextActive: { fontWeight: typography.weights.bold },
  pillDisabled: { opacity: 0.4 },
});
