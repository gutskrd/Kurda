import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ToggleRow } from '../theme/Toggle';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import { spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { PROFILE_SECTIONS, type ProfileSection, type ProfileSections } from './sections';
import { Loading } from '../theme/Loading';
import { useDirection } from '../reports/direction';

const COPY: Record<ProfileSection, { label: TranslationKey; hint: TranslationKey }> = {
  posts: { label: 'profile.tab.posts', hint: 'edit.sections.posts' },
  games: { label: 'nav.games', hint: 'edit.sections.games' },
  likes: { label: 'profile.tab.likes', hint: 'edit.sections.likes' },
  reposts: { label: 'repost.tab', hint: 'repost.sectionHint' },
  saved: { label: 'saved.title', hint: 'edit.sections.saved' },
};

/**
 * Which activity sections your profile shows other people. The current values come from your own public profile rather
 * than /me, since that is what visitors read. Each toggle saves on its own, and the API merges one key at a time, so
 * two quick toggles cannot overwrite each other.
 */
export function SectionToggles({ userId }: { userId: string }): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

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

  // The switch has already moved under the thumb; putting it back on a refusal is less confusing than one that lags.
  const saving = useIntents<ProfileSection, boolean>(
    async (key, next) => {
      const res = await client.patch<{ sections: ProfileSections }>('/me/profile/sections', { [key]: next });
      if (res.ok) setSections(res.data.sections);
      return res;
    },
    { failed: (failure) => setError(describeError(failure, t)) },
  );
  const toggle = (key: ProfileSection, next: boolean): void => {
    if (!sections) return;
    setError(null);
    saving.want(key, next, sections[key] !== false);
  };

  const heading = (
    <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
      {t('edit.sections.title')}
    </Text>
  );

  if (sections === null) {
    return (
      <View style={styles.wrap}>
        {heading}
        <Loading style={{ marginVertical: spacing.md }} />
      </View>
    );
  }

  /*
   * Each switch names its section with what it holds as the hint, so a screen reader can tell them apart; right to left
   * the words start on the right. The whole row is the switch, so the words are the target rather than a 31pt switch at
   * the edge.
   */
  return (
    <View style={styles.wrap}>
      {heading}
      <Text style={[styles.help, dir.text, { color: colors.textSecondary }]}>{t('edit.sections.help')}</Text>

      {PROFILE_SECTIONS.map((key) => (
        <ToggleRow
          key={key}
          label={t(COPY[key].label)}
          hint={t(COPY[key].hint)}
          value={saving.shown(key, sections[key] !== false)}
          onValueChange={(next) => toggle(key, next)}
          style={[styles.row, { borderBottomColor: colors.separator }]}
        >
          <View style={styles.main}>
            <Text style={[styles.label, dir.text, { color: colors.textPrimary }]}>{t(COPY[key].label)}</Text>
            <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t(COPY[key].hint)}</Text>
          </View>
        </ToggleRow>
      ))}

      {error ? (
        <Text style={[styles.error, dir.text, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.xs },
  heading: { ...sectionLabel },
  help: { fontSize: typography.sizes.text, marginBottom: spacing.xs },
  // ToggleRow lays out the words and switch across the row and makes it at least a fingertip tall.
  row: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, gap: 2 },
  label: { fontSize: typography.sizes.text },
  hint: { fontSize: typography.sizes.text },
  error: { fontSize: typography.sizes.text, marginTop: spacing.xs },
});
