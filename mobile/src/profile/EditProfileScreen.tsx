import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { countriesIn } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { describeError } from '../api/errors';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from './InitialsAvatar';
import { CosmeticPicker } from './CosmeticPicker';
import { avatarAssetUrl } from './cosmetics';

interface Me {
  username: string;
  displayName: string | null;
  bio: string | null;
  country: string | null;
  premium?: boolean;
  selectedAvatarKey?: string | null;
  profilePhotoUrl?: string | null;
  equippedBackgroundSku?: string | null;
  equippedIconSku?: string | null;
  premiumIconEnabled?: boolean;
}

interface AvatarOption {
  key: string;
  requiresPremium: boolean;
}

const MAX_BIO = 1000;

/**
 * Everything about you that you can change, on the phone.
 *
 * The browser has had this since the profile work; the phone could change a
 * username and a photo and nothing else — no display name, no bio, and no
 * country, which mattered more than it looks: the country leaderboard shipped
 * in #722 is unusable to somebody who has no way to say where they are.
 */
export function EditProfileScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const topInset = useScreenTopInset();

  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mine, registry] = await Promise.all([
      client.get<{ user: Me }>('/me'),
      client.get<{ avatars: AvatarOption[] }>('/cosmetics/avatars'),
    ]);
    if (mine.ok) {
      setMe(mine.data.user);
      setDisplayName(mine.data.user.displayName ?? '');
      setBio(mine.data.user.bio ?? '');
      setCountry(mine.data.user.country ?? '');
      setSelected(mine.data.user.selectedAvatarKey ?? null);
      setError(null);
    } else {
      setError(mine.error);
    }
    if (registry.ok) setAvatars(registry.data.avatars ?? []);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const countries = useMemo(() => countriesIn(locale), [locale]);

  const dirty =
    me !== null &&
    (displayName !== (me.displayName ?? '') || bio !== (me.bio ?? '') || country !== (me.country ?? ''));

  const save = useCallback(async () => {
    if (!me || busy || !dirty) return;
    setBusy(true);
    setNotice(null);
    // empty means "unset", which the API takes as null rather than as ''
    const res = await client.patch<{ user: Me }>('/me', {
      displayName: displayName.trim() || null,
      bio: bio.trim() || null,
      country: country || null,
    });
    setBusy(false);
    if (res.ok) {
      setMe(res.data.user);
      setNotice({ ok: true, text: t('edit.profileUpdated') });
    } else {
      setNotice({ ok: false, text: describeError(res.error, t) });
    }
  }, [me, busy, dirty, client, displayName, bio, country, t]);

  /**
   * Choose one of the built-in avatars.
   *
   * An uploaded photo always wins over a chosen avatar, so picking one while a
   * photo is set would appear to do nothing at all. The photo goes first — and
   * if that fails, the choice is put back rather than left looking applied.
   */
  const pick = useCallback(
    async (key: string | null) => {
      if (!me || busy) return;
      const previous = selected;
      setBusy(true);
      setNotice(null);
      setSelected(key);
      if (me.profilePhotoUrl) {
        const removed = await client.delete('/me/profile-picture');
        if (!removed.ok) {
          setBusy(false);
          setSelected(previous);
          setNotice({ ok: false, text: describeError(removed.error, t) });
          return;
        }
      }
      const res = await client.put<{ avatarKey: string | null }>('/me/cosmetics/avatar', { key });
      setBusy(false);
      if (res.ok) {
        setMe((prev) => (prev ? { ...prev, selectedAvatarKey: key, profilePhotoUrl: null } : prev));
        setNotice({ ok: true, text: key ? t('edit.photoUpdated') : t('edit.avatarCleared') });
      } else {
        setSelected(previous);
        setNotice({ ok: false, text: describeError(res.error, t) });
      }
    },
    [me, busy, selected, client, t],
  );

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Icon name="chevron-left" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>{t('profile.edit')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <AsyncBoundary loading={me === null && error === null} error={me === null ? error : null} onRetry={() => void load()}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {notice ? (
              <Text style={[styles.notice, { color: notice.ok ? colors.success : colors.danger }]}>{notice.text}</Text>
            ) : null}

            <Text style={[styles.section, { color: colors.textPrimary }]}>{t('edit.details')}</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('edit.displayName')}</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={60}
              accessibilityLabel={t('edit.displayName')}
              style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('edit.bio')}</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={MAX_BIO}
              multiline
              placeholder={t('edit.bioPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('edit.bio')}
              style={[
                styles.input,
                styles.bio,
                { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary },
              ]}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('edit.country')}</Text>
            <View style={styles.countries}>
              <CountryChip
                label={t('edit.noCountry')}
                on={country === ''}
                onPress={() => setCountry('')}
              />
              {countries.map((c) => (
                <CountryChip key={c.code} label={c.name} on={country === c.code} onPress={() => setCountry(c.code)} />
              ))}
            </View>

            {/* ClayButton has no disabled state, so a save that cannot do
                anything simply is not offered */}
            {dirty || busy ? (
              <ClayButton
                label={busy ? t('edit.saving') : t('edit.saveChanges')}
                tone="primary"
                onPress={() => void save()}
                style={styles.save}
              />
            ) : null}

            <Text style={[styles.section, { color: colors.textPrimary }]}>{t('edit.avatar')}</Text>
            <View style={styles.avatars} accessibilityLabel={t('edit.chooseAvatar')}>
              <Pressable
                onPress={() => void pick(null)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === null }}
                accessibilityLabel={t('edit.noAvatar')}
                style={[
                  styles.avatarTile,
                  { borderColor: selected === null ? colors.primary : colors.glassBorder },
                ]}
              >
                <Icon name="close" size={22} color={colors.textSecondary} />
              </Pressable>
              {avatars.map((a) => {
                const locked = a.requiresPremium && !me?.premium;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() =>
                      locked ? setNotice({ ok: false, text: t('edit.premiumAvatar') }) : void pick(a.key)
                    }
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === a.key, disabled: locked }}
                    accessibilityLabel={a.key}
                    style={[
                      styles.avatarTile,
                      { borderColor: selected === a.key ? colors.textPrimary : colors.glassBorder },
                      locked && styles.locked,
                    ]}
                  >
                    <InitialsAvatar name={a.key} id={a.key} size={44} photoUrl={avatarAssetUrl(a.key)} />
                  </Pressable>
                );
              })}
            </View>

            <CosmeticPicker
              equippedBackground={me?.equippedBackgroundSku ?? null}
              equippedIcon={me?.equippedIconSku ?? null}
              iconVisible={me?.premiumIconEnabled ?? true}
              onChanged={load}
            />
          </ScrollView>
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

function CountryChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[
        styles.chip,
        { backgroundColor: colors.controlTrack, borderColor: on ? colors.textPrimary : colors.glassBorder },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...display(typography.sizes.xl) },
  body: { paddingBottom: 140, gap: spacing.sm },
  notice: { fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  section: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginTop: spacing.lg },
  label: { fontSize: typography.sizes.sm, marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  bio: { minHeight: 96, textAlignVertical: 'top' },
  countries: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipText: { fontSize: typography.sizes.sm },
  save: { marginTop: spacing.md },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  avatarTile: { width: 56, height: 56, borderRadius: radii.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  locked: { opacity: 0.4 },
});
