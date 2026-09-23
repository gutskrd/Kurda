import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { PROFILE_SECTIONS, type ProfileSection, type ProfileSections } from './sections';

const COPY: Record<ProfileSection, { label: TranslationKey; hint: TranslationKey }> = {
  posts: { label: 'profile.tab.posts', hint: 'edit.sections.posts' },
  games: { label: 'nav.games', hint: 'edit.sections.games' },
  likes: { label: 'profile.tab.likes', hint: 'edit.sections.likes' },
  reposts: { label: 'repost.tab', hint: 'repost.sectionHint' },
  saved: { label: 'saved.title', hint: 'edit.sections.saved' },
};

/**
 * Which activity sections your profile shows other people (KUR-089).
 *
 * The phone grew the activity tabs before it grew any way to turn one off, so
 * everything you had ever liked was on your profile whether you wanted it there
 * or not.
 *
 * The current values come from your own public profile rather than /me, because
 * that is the endpoint visitors read — so what this shows is literally what
 * they would see, not a second copy that could disagree with it.
 *
 * Each toggle saves on its own: no Save button to forget, and the API merges
 * one key at a time so two quick toggles cannot overwrite each other.
 */
export function SectionToggles({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [sections, setSections] = useState<ProfileSections | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void client.get<{ sections: ProfileSections | null }>(`/users/${userId}`).then((res) => {
      if (alive && res.ok) setSections(res.data.sections ?? null);
    });
    return () => {
      alive = false;
    };
  }, [client, userId]);

  const toggle = (key: ProfileSection, next: boolean): void => {
    // optimistic: the switch has already moved under the thumb, and putting it
    // back on failure is less confusing than a switch that lags a round trip
    setSections((prev) => (prev ? { ...prev, [key]: next } : prev));
    void client.patch<{ sections: ProfileSections }>('/me/profile/sections', { [key]: next }).then((res) => {
      if (res.ok) {
        setSections(res.data.sections);
        setError(null);
      } else {
        setSections((prev) => (prev ? { ...prev, [key]: !next } : prev));
        setError(describeError(res.error, t));
      }
    });
  };

  if (sections === null) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('edit.sections.title')}</Text>
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>{t('edit.sections.title')}</Text>
      <Text style={[styles.help, { color: colors.textSecondary }]}>{t('edit.sections.help')}</Text>

      {PROFILE_SECTIONS.map((key) => (
        <View key={key} style={styles.row}>
          <View style={styles.main}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{t(COPY[key].label)}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t(COPY[key].hint)}</Text>
          </View>
          <Switch
            value={sections[key] !== false}
            onValueChange={(next) => toggle(key, next)}
            trackColor={{ true: colors.primary, false: colors.controlTrack }}
          />
        </View>
      ))}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.xs },
  heading: { ...sectionLabel },
  help: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, gap: 2 },
  label: { fontSize: typography.ios.row },
  hint: { fontSize: typography.sizes.sm },
  error: { fontSize: typography.sizes.sm, marginTop: spacing.xs },
});
