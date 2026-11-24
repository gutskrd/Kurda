import { useEffect, useRef, useState } from 'react';
import { foldForSearch } from '@kurda/shared';
import { useNavigation } from '@react-navigation/native';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { useConfirmDelete } from '../auth/useConfirmDelete';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { useSoundPref } from '../feedback/soundPref';
import { useI18n } from '../i18n/I18nContext';
import { HeaderButton } from '../navigation/HeaderButton';
import { useHardwareBack } from '../navigation/hardwareBack';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { useSettingsCatalog, type Leaf } from '../settings/catalog';
import { QuickTile, SettingsCategory, SettingsNote, SettingsPage, useOnOff } from '../settings/list';
import { VersionLine } from '../settings/VersionLine';
import { timing } from '../theme/animate';
import { PREFERENCE_LABEL, THEME_PREFERENCES, type ThemePreference } from '../theme/appearance';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { duration } from '../theme/motion';
import { SearchField } from '../theme/SearchField';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';

/** The appearance tile's word for each choice: "Automatic" fits a tile where "Match this device" does not. */
const TILE_LABEL: Record<ThemePreference, 'settings.quick.auto' | (typeof PREFERENCE_LABEL)[ThemePreference]> = {
  system: 'settings.quick.auto',
  light: PREFERENCE_LABEL.light,
  dark: PREFERENCE_LABEL.dark,
};

/**
 * Settings' home: the two things changed most often as tiles that change in place, then a flat list of every kind of
 * setting, each saying what is inside it, then signing out and the version. Everything else is a page behind a
 * category (settings/SettingsPageScreen), so the home stays one screen long.
 *
 * The search button in the header opens a field over the list that finds any single setting on any page by its name or
 * what is behind it, each result naming the page it is on. Back, Escape or the ✕ close it.
 */
export function SettingsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { logout, isGuest } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, preference, setPreference } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const onOff = useOnOff();
  const [sounds, setSounds] = useSoundPref();
  const { categories, leaves } = useSettingsCatalog();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const closeSearch = (): void => {
    setSearching(false);
    setQuery('');
  };
  useHardwareBack(searching ? closeSearch : null);

  const toggleSounds = (): void => {
    haptic('select');
    setSounds(!sounds);
    // After the switch is stored, so the chime is allowed to play.
    if (!sounds) setTimeout(() => playSound('correct'), 0);
  };
  const cycleAppearance = (): void => {
    haptic('select');
    setPreference(THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length]!);
  };

  /*
   * Signing out is asked first, in a sheet: a full account is told nothing is lost, and a guest, who would lose
   * everything, is offered the account that keeps it.
   */
  const [leaving, setLeaving] = useState(false);
  const [guestLeaving, setGuestLeaving] = useState(false);
  const askedLogout = (): void => {
    haptic('select');
    if (isGuest) setGuestLeaving(true);
    else setLeaving(true);
  };
  // A guest's account page would be only the way to an account, so deleting a guest stays here, beside signing out.
  const confirmDelete = useConfirmDelete();

  return (
    <>
      <SettingsPage
        title={t('settings.title')}
        onExit={searching ? closeSearch : onExit}
        right={
          <HeaderButton
            icon={searching ? 'close' : 'search'}
            label={searching ? t('common.close') : t('settings.search')}
            onPress={() => (searching ? closeSearch() : setSearching(true))}
            testID="settings-search"
          />
        }
      >
        {searching ? (
          <SearchResults query={query} onQuery={setQuery} leaves={leaves} onClose={closeSearch} />
        ) : (
          <>
            <View style={[styles.tiles, { flexDirection: dir.row }]}>
              <QuickTile
                icon={sounds ? 'speaker-high' : 'speaker'}
                name={t('settings.sounds')}
                value={onOff(sounds)}
                role="switch"
                checked={sounds}
                onPress={toggleSounds}
                testID="quick-sounds"
              />
              <QuickTile icon="palette" name={t('appearance.theme')} value={t(TILE_LABEL[preference])} onPress={cycleAppearance} testID="quick-appearance" />
            </View>
            <View style={styles.list}>
              {categories.map((c) => (
                <SettingsCategory
                  key={c.key}
                  icon={c.icon}
                  title={c.title}
                  subtitle={c.subtitle}
                  attention={c.attention}
                  onPress={c.open}
                  testID={`settings-${c.key}`}
                />
              ))}
              <View style={[styles.rule, { backgroundColor: colors.separator }]} />
              <SettingsCategory icon="sign-out" title={t('profile.logout')} opens={false} onPress={askedLogout} testID="settings-logout" />
              {isGuest ? <SettingsCategory icon="trash" title={t('settings.delete.title')} destructive opens={false} onPress={confirmDelete} /> : null}
            </View>
            <VersionLine />
          </>
        )}
      </SettingsPage>

      <BottomSheet visible={leaving} onClose={() => setLeaving(false)} title={t('settings.logout.title')} testID="logout-ask">
        <Text style={[styles.sheetBody, dir.text, { color: colors.textSecondary }]}>{t('settings.logout.body')}</Text>
        <View style={styles.sheetActions}>
          <ClayButton
            label={t('profile.logout')}
            tone="primary"
            size="large"
            onPress={() => {
              setLeaving(false);
              void logout();
            }}
          />
          <ClayButton label={t('common.cancel')} variant="outline" onPress={() => setLeaving(false)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={guestLeaving} onClose={() => setGuestLeaving(false)} title={t('guest.logout.title')} testID="guest-logout">
        <Text style={[styles.sheetBody, dir.text, { color: colors.textSecondary }]}>{t('guest.logout.body')}</Text>
        <View style={styles.sheetActions}>
          <ClayButton
            label={t('guest.createAccount')}
            tone="primary"
            size="large"
            onPress={() => {
              setGuestLeaving(false);
              navigation.navigate('ClaimAccount');
            }}
          />
          <ClayButton
            label={t('guest.logout.anyway')}
            tone="danger"
            variant="outline"
            onPress={() => {
              setGuestLeaving(false);
              void logout();
            }}
          />
        </View>
      </BottomSheet>
    </>
  );
}

/**
 * The search field and what it finds. Every typed word must appear in a setting's name, its page or what is behind it;
 * accents are folded, so "e" finds "ê". With nothing typed yet the field waits over an empty page.
 */
function SearchResults({
  query,
  onQuery,
  leaves,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  leaves: Leaf[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const enter = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!reduce) timing(enter, 1, duration.base).start();
  }, [enter, reduce]);
  const drop = enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  const found = words.length
    ? leaves.filter((leaf) => {
        const said = foldForSearch([leaf.title, leaf.page, ...leaf.terms].join(' '));
        return words.every((w) => said.includes(w));
      })
    : [];
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: drop }] }}>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={onQuery} label={t('settings.search')} autoFocus onEscape={onClose} />
      </View>
      <View style={styles.list}>
        {found.map((leaf) => (
          <SettingsCategory key={leaf.key} icon={leaf.icon} title={leaf.title} subtitle={leaf.page} onPress={leaf.open} testID={`found-${leaf.key}`} />
        ))}
      </View>
      {words.length > 0 && found.length === 0 ? <SettingsNote>{t('settings.search.none', { query: query.trim() })}</SettingsNote> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: spacing.sm + 4, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  list: { paddingTop: spacing.md },
  search: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  // The one line on the home: what changes settings above it, leaving below.
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: layout.gutter, marginVertical: spacing.sm },
  sheetBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  sheetActions: { gap: spacing.sm, marginTop: spacing.sm },
});
