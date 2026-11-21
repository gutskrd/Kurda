import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { useNavigation, usePreventRemove, type NavigationAction } from '@react-navigation/native';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { countriesIn, foldDiacritics, type PendingPicture } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useKeyboardShown, useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { BottomSheet } from '../theme/BottomSheet';
import type { ApiError } from '../api/types';
import { describeError } from '../api/errors';
import { restrictionOf } from '../reports/sendErrors';
import { SendErrorNotice } from '../reports/SendError';
import { useDirection } from '../reports/direction';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { SearchField } from '../theme/SearchField';
import { Avatar } from './Avatar';
import { CosmeticPicker } from './CosmeticPicker';
import { FavoritesPicker } from './FavoritesPicker';
import type { FavoriteRef } from './types';
import { SectionToggles } from './SectionToggles';
import { avatarAssetUrl } from './cosmetics';
import { PendingPhoto } from '../pictures/PictureReview';
import { pendingOf } from '../pictures/review';

interface Me {
  username: string;
  displayName: string | null;
  bio: string | null;
  country: string | null;
  premium?: boolean;
  selectedAvatarKey?: string | null;
  profilePhotoUrl?: string | null;
  /** A new photo waiting for a person: only you see it, everyone else the one before. */
  profilePhotoPending?: PendingPicture | null;
  equippedBackgroundSku?: string | null;
  equippedIconSku?: string | null;
  premiumIconEnabled?: boolean;
  /* `/me` sends these two. */
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
}

interface AvatarOption {
  key: string;
  requiresPremium: boolean;
}

const MAX_BIO = 1000;

/**
 * Everything about you that you can change: display name, bio, country, username, photo and avatar. What a save or a
 * choice did is said where it was done (under Save, or under the avatars) and read out, not at the top of a page
 * scrolled away from.
 */
export function EditProfileScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const topInset = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.xl);

  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  /** What the last save or choice did, and which part of the page it belongs under. */
  const [notice, setNotice] = useState<{ ok: boolean; text: string; at: 'details' | 'avatar' } | null>(null);
  useEffect(() => {
    // A screen reader hears it at once (Android reads it from the live region below).
    if (notice && Platform.OS !== 'android') AccessibilityInfo.announceForAccessibility?.(notice.text);
  }, [notice]);
  // A limit on the account (a name and a bio are shown to others): said with a way to Account standing.
  const [limit, setLimit] = useState<ApiError | null>(null);
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
  /*
   * The country is found by typing rather than scrolling two hundred chips: the field shows the chosen one and those a
   * few letters match.
   */
  const [countryQuery, setCountryQuery] = useState('');
  const countryMatches = useMemo(() => {
    const q = foldDiacritics(countryQuery).toLowerCase().trim();
    if (!q) return [];
    return countries.filter((c) => foldDiacritics(c.name).toLowerCase().includes(q) && c.code !== country).slice(0, 12);
  }, [countries, countryQuery, country]);
  const chosenCountry = countries.find((c) => c.code === country) ?? null;

  /*
   * The matches open under the field, near the keyboard; once something is typed the page scrolls the field near the
   * top, so the matches sit above the keys.
   */
  const scroller = useRef<ScrollView>(null);
  const countryY = useRef(0);
  const keyboard = useKeyboardShown();
  const searching = countryQuery.trim() !== '';
  useEffect(() => {
    if (searching && keyboard) scroller.current?.scrollTo({ y: Math.max(0, countryY.current - spacing.md), animated: true });
  }, [searching, keyboard]);

  const dirty =
    me !== null &&
    (displayName !== (me.displayName ?? '') || bio !== (me.bio ?? '') || country !== (me.country ?? ''));

  /*
   * A name, bio or country typed and not saved: leaving asks first, whichever way (header back, swipe, Android's back),
   * with keeping on editing the first answer, as in the composer. The avatar and what is below save as chosen, so they
   * never ask.
   */
  const navigation = useNavigation<RootNavigation>();
  const [leaving, setLeaving] = useState<NavigationAction | null>(null);
  usePreventRemove(dirty, ({ data }) => setLeaving(data.action));
  const discard = () => {
    const action = leaving;
    setLeaving(null);
    if (action) navigation.dispatch(action);
  };

  const save = useCallback(async () => {
    if (!me || busy || !dirty) return;
    setBusy(true);
    setNotice(null);
    setLimit(null);
    // Empty means unset, which the API takes as null rather than ''.
    const res = await client.patch<{ user: Me }>('/me', {
      displayName: displayName.trim() || null,
      bio: bio.trim() || null,
      country: country || null,
    });
    setBusy(false);
    if (res.ok) {
      setMe(res.data.user);
      setNotice({ ok: true, text: t('edit.profileUpdated'), at: 'details' });
    } else if (restrictionOf(res.error)) {
      setLimit(res.error);
    } else {
      setNotice({ ok: false, text: describeError(res.error, t), at: 'details' });
    }
  }, [me, busy, dirty, client, displayName, bio, country, t]);

  /**
   * Choose a built-in avatar. An uploaded photo always wins over an avatar, so the photo is removed first; if that
   * fails, the choice is put back.
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
          setNotice({ ok: false, text: describeError(removed.error, t), at: 'avatar' });
          return;
        }
      }
      const res = await client.put<{ avatarKey: string | null }>('/me/cosmetics/avatar', { key });
      setBusy(false);
      if (res.ok) {
        setMe((prev) => (prev ? { ...prev, selectedAvatarKey: key, profilePhotoUrl: null } : prev));
        void refreshUser();
        setNotice({ ok: true, text: key ? t('edit.photoUpdated') : t('edit.avatarCleared'), at: 'avatar' });
      } else {
        setSelected(previous);
        setNotice({ ok: false, text: describeError(res.error, t), at: 'avatar' });
      }
    },
    [me, busy, selected, client, t, refreshUser],
  );

  /** What the last save or choice did, under the part of the page it was done in. */
  const said = (at: 'details' | 'avatar') =>
    notice?.at === at ? (
      <Text style={[styles.notice, dir.text, { color: notice.ok ? colors.success : colors.danger }]} accessibilityLiveRegion="polite">
        {notice.text}
      </Text>
    ) : null;
  /** A field typed in again: what the last save said about it no longer stands. */
  const typed = (set: (next: string) => void) => (next: string) => {
    set(next);
    if (notice?.at === 'details') setNotice(null);
  };
  const input = [styles.input, mirrored && styles.inputMirrored, { backgroundColor: colors.controlTrack, color: colors.textPrimary }];
  // Under each field: whether it is optional and who sees it.
  const hint = [styles.hint, dir.text, { color: colors.textSecondary }];
  const shownAvatars = avatars.filter((a) => !a.requiresPremium || me?.premium);

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
      <ScreenHeader title={t('profile.edit')} onBack={onExit} />
      <View style={styles.screen}>

        <AsyncBoundary loading={me === null && error === null} error={me === null ? error : null} onRetry={() => void load()}>
          <ScrollView ref={scroller} contentContainerStyle={[styles.body, { paddingBottom: bottom }]} keyboardShouldPersistTaps="handled">
            {/* The page's sections share one heading style, the small one the rest of the profile uses. */}
            <Text style={[sectionLabel, styles.firstSection, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('edit.details')}
            </Text>

            <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('edit.displayName')}</Text>
            <TextInput
              value={displayName}
              onChangeText={typed(setDisplayName)}
              maxLength={60}
              accessibilityLabel={t('edit.displayName')}
              style={input}
            />
            <Text style={hint}>{t('edit.displayNameHint')}</Text>

            <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('edit.bio')}</Text>
            <TextInput
              value={bio}
              onChangeText={typed(setBio)}
              maxLength={MAX_BIO}
              multiline
              placeholder={t('edit.bioPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('edit.bio')}
              style={[input, styles.bio]}
            />
            <Text style={hint}>{t('edit.bioHint')}</Text>

            <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{t('edit.country')}</Text>
            <View style={[styles.countries, { flexDirection: dir.row }]}>
              {/* What it is set to now: a value, not a button, since tapping it has nothing to do. */}
              <CountryChip label={chosenCountry ? chosenCountry.name : t('edit.noCountry')} on />
              {/* Taking it off is one tap, and says so. */}
              {chosenCountry ? (
                <CountryChip
                  label={t('common.remove')}
                  accessibilityLabel={`${t('common.remove')}, ${chosenCountry.name}`}
                  on={false}
                  onPress={() => typed(setCountry)('')}
                />
              ) : null}
            </View>
            <Text style={hint}>{t('edit.countryHint')}</Text>
            <View onLayout={(e) => (countryY.current = e.nativeEvent.layout.y)}>
              <SearchField value={countryQuery} onChangeText={setCountryQuery} label={t('edit.countrySearch')} returnKeyType="done" />
            </View>
            {countryMatches.length > 0 ? (
              <View style={[styles.countries, { flexDirection: dir.row }]}>
                {/* The matches wrap onto rows a gap apart, so each reaches half of it toward the rows above and
                   below. */}
                <ReachGroup gap={spacing.sm} rowGap={spacing.sm}>
                  {countryMatches.map((c) => (
                    <CountryChip
                      key={c.code}
                      label={c.name}
                      on={false}
                      onPress={() => {
                        typed(setCountry)(c.code);
                        setCountryQuery('');
                      }}
                    />
                  ))}
                </ReachGroup>
              </View>
            ) : null}

            {/* Shown once there is something to save: the avatar and everything under it save as chosen, and a greyed
               Save would suggest they need it too. */}
            {dirty || busy ? (
              <ClayButton
                label={t('edit.saveChanges')}
                // Saving: the button spins and takes no second press, and a screen reader is told what it is doing.
                accessibilityLabel={busy ? t('edit.saving') : undefined}
                busy={busy}
                tone="primary"
                onPress={() => void save()}
                style={styles.save}
              />
            ) : null}
            <SendErrorNotice error={limit} onDismiss={() => setLimit(null)} />
            {said('details')}

            <Text style={[sectionLabel, styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('edit.avatar')}
            </Text>
            {said('avatar')}
            {pendingOf(me?.profilePhotoPending) ? (
              <PendingPhoto pending={pendingOf(me?.profilePhotoPending)} body="picture.held.profile" testID="edit-photo-pending" />
            ) : null}
            {/* The chosen one is ringed in the violet every choice wears, the empty choice and a face alike. */}
            <View style={[styles.avatars, { flexDirection: dir.row }]} accessibilityLabel={t('edit.chooseAvatar')}>
              <PressableScale
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
              </PressableScale>
              {/* Only avatars this account can wear: Hevalo+ cannot be had in the app, so a members-only avatar is
                 not shown to anybody else. Each is named by its place ("Avatar 3"), since its key is not a word to
                 read out, and one that fails to load shows a person, not letters of its key. */}
              {shownAvatars.map((a, i) => {
                return (
                  <PressableScale
                    key={a.key}
                    onPress={() => void pick(a.key)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === a.key }}
                    accessibilityLabel={`${t('edit.avatar')} ${formatNumber(i + 1, locale)}`}
                    style={[
                      styles.avatarTile,
                      { borderColor: selected === a.key ? colors.primary : colors.glassBorder },
                    ]}
                  >
                    <Avatar name="" size={44} photoUrl={avatarAssetUrl(a.key)} />
                  </PressableScale>
                );
              })}
            </View>

            {user?.id ? <SectionToggles userId={user.id} /> : null}

            <CosmeticPicker
              equippedBackground={me?.equippedBackgroundSku ?? null}
              equippedIcon={me?.equippedIconSku ?? null}
              iconVisible={me?.premiumIconEnabled ?? true}
              onChanged={load}
            />

            <FavoritesPicker
              favoritePoem={me?.favoritePoem ?? null}
              favoriteStory={me?.favoriteStory ?? null}
              onChanged={load}
            />
          </ScrollView>
        </AsyncBoundary>
      </View>
      </KeyboardAvoidingView>

      <BottomSheet visible={leaving !== null} onClose={() => setLeaving(null)} title={t('composer.close.editTitle')} testID="edit-profile-leave">
        <View style={styles.leaveActions}>
          <ClayButton label={t('composer.close.stay')} tone="primary" onPress={() => setLeaving(null)} />
          <ClayButton label={t('composer.close.discard')} tone="danger" variant="outline" onPress={discard} />
        </View>
      </BottomSheet>
    </GradientBackground>
  );
}

/**
 * A country as a choice to tap, or (without `onPress`) as the one chosen, in solid violet as every chosen option
 * is. Drawn 36pt tall and answering over 48pt; where the matches wrap, their group holds each to half the
 * gap between rows.
 */
function CountryChip({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fill = on ? colors.primary : colors.controlTrack;
  const ink = on ? colors.textOnPrimary : colors.textPrimary;
  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: fill }]}>
        <Text style={[styles.chipText, { color: ink }]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.chip, { backgroundColor: fill }, pressed && heldDim]}
    >
      <Text style={[styles.chipText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: layout.gutter },

  body: { gap: spacing.sm },
  notice: { fontSize: typography.sizes.text, marginTop: spacing.xs },
  firstSection: { marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  label: { fontSize: typography.sizes.text, marginTop: spacing.sm },
  hint: { fontSize: typography.sizes.text, lineHeight: 18 },
  input: { minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.text },
  // Right to left, what is typed starts at the right.
  inputMirrored: { textAlign: 'right' },
  bio: { minHeight: 96, textAlignVertical: 'top' },
  countries: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: { minHeight: 36, justifyContent: 'center', borderRadius: radii.pill, paddingHorizontal: spacing.md - 2 },
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  save: { marginTop: spacing.md },
  avatars: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  avatarTile: { width: 56, height: 56, borderRadius: radii.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  leaveActions: { gap: spacing.sm },
});
