import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { useSoundPref } from '../feedback/soundPref';
import { useAutoplayPref } from '../feedback/autoplayPref';
import { useVibrationPref } from '../feedback/vibrationPref';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale } from '../i18n/translations';
import { KeyboardSettingsList } from '../keyboard/KeyboardSettings';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { CREDIT_LINES } from '../screens/credits';
import { VISIBILITIES, VISIBILITY_HINT, VISIBILITY_LABEL, visibilityOffered, type Visibility } from '../social/format';
import { PREFERENCE_LABEL, THEME_PREFERENCES, type ThemePreference } from '../theme/appearance';
import { useEventTheme } from '../theme/EventThemeContext';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { useMyAccount } from './account';
import { SettingsChoice, SettingsNote, SettingsPage, SettingsRow, SettingsSection, SettingsSwitch } from './list';

/** The pages behind Settings' rows that are not screens of their own elsewhere. */
export const SETTINGS_PAGES = ['language', 'theme', 'sounds', 'keyboard', 'leagues', 'visibility', 'credits'] as const;
export type SettingsPageKey = (typeof SETTINGS_PAGES)[number];

/**
 * One page of Settings: a short list of one kind of thing, with what each
 * choice means said beside it, saved the moment it is changed. There is no
 * Save button to forget, and nothing on a page belongs to another.
 */
export function SettingsPageScreen({ page, onExit }: { page: SettingsPageKey; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  switch (page) {
    case 'language':
      return (
        <SettingsPage title={t('settings.language')} onExit={onExit}>
          <LanguageList />
        </SettingsPage>
      );
    case 'theme':
      return (
        <SettingsPage title={t('appearance.theme')} onExit={onExit}>
          <ThemeList />
        </SettingsPage>
      );
    case 'sounds':
      return (
        <SettingsPage title={t('settings.soundsVibration')} onExit={onExit}>
          <SoundsList />
        </SettingsPage>
      );
    case 'keyboard':
      return (
        <SettingsPage title={t('keyboard.settings.title')} onExit={onExit}>
          <KeyboardSettingsList />
        </SettingsPage>
      );
    case 'leagues':
      return (
        <SettingsPage title={t('settings.leagues.title')} onExit={onExit}>
          <LeaguesList />
        </SettingsPage>
      );
    case 'visibility':
      return (
        <SettingsPage title={t('settings.privacy.title')} onExit={onExit}>
          <VisibilityList />
        </SettingsPage>
      );
    case 'credits':
      return (
        <SettingsPage title={t('settings.credits.title')} onExit={onExit}>
          <Credits />
        </SettingsPage>
      );
  }
}

/** Every language the app is written in, each named in itself, so it can be found by someone who reads no other. */
function LanguageList(): React.JSX.Element {
  const { t, locale, setLocale } = useI18n();
  return (
    <SettingsSection first>
      <SettingsChoice<Locale> label={t('settings.language')} options={LOCALES} value={locale} labelOf={(l) => LOCALE_LABEL[l]} onChange={setLocale} />
    </SettingsSection>
  );
}

/** Light, dark or the phone's own; the seasonal themes; and the page that shows them all off. */
function ThemeList(): React.JSX.Element {
  const { t } = useI18n();
  const { scheme, preference, setPreference } = useTheme();
  const { optedOut, setOptedOut } = useEventTheme();
  const navigation = useNavigation<RootNavigation>();
  return (
    <>
      <SettingsSection first footer={t('appearance.currentlyScheme', { scheme: t(scheme === 'dark' ? 'appearance.scheme.dark' : 'appearance.scheme.light') })}>
        <SettingsChoice<ThemePreference>
          label={t('appearance.theme')}
          options={THEME_PREFERENCES}
          value={preference}
          labelOf={(p) => t(PREFERENCE_LABEL[p])}
          onChange={setPreference}
        />
      </SettingsSection>
      <SettingsSection>
        <SettingsSwitch icon="star" title={t('settings.eventThemes')} value={!optedOut} onValueChange={(on) => setOptedOut(!on)} />
        <SettingsRow icon="palette" title={t('settings.appearance')} onPress={() => navigation.navigate('Appearance')} />
      </SettingsSection>
    </>
  );
}

/**
 * The app's own chimes and its buzz. Turning either on plays it once, so the
 * switch shows what it does; turning it off is not felt. The lesson's spoken
 * Kurdish is neither: it always plays when asked, and the third switch says
 * whether it is also said by itself after each answer.
 */
function SoundsList(): React.JSX.Element {
  const { t } = useI18n();
  const [vibration, setVibration] = useVibrationPref();
  const [sounds, setSounds] = useSoundPref();
  const [autoplay, setAutoplay] = useAutoplayPref();
  return (
    <SettingsSection first>
      <SettingsSwitch
        icon="speaker"
        title={t('settings.sounds')}
        subtitle={t('settings.sounds.hint')}
        value={sounds}
        onValueChange={(on) => {
          setSounds(on);
          if (on) setTimeout(() => playSound('correct'), 0);
        }}
      />
      <SettingsSwitch
        icon="vibrate"
        title={t('settings.vibration')}
        subtitle={t('settings.vibration.hint')}
        value={vibration}
        onValueChange={(on) => {
          setVibration(on);
          if (on) haptic('select');
        }}
      />
      <SettingsSwitch
        icon="audio-play"
        title={t('settings.sounds.autoplay')}
        subtitle={t('settings.sounds.autoplayHint')}
        value={autoplay}
        onValueChange={setAutoplay}
      />
    </SettingsSection>
  );
}

/** In or out of the weekly leagues, and what a league is, said before it is chosen. */
function LeaguesList(): React.JSX.Element {
  const { t } = useI18n();
  const { leagues, minor, changeLeagues } = useMyAccount();
  return (
    <SettingsSection first footer={t('settings.leagues.help')}>
      <SettingsSwitch icon="trophy" title={t('settings.leagues.toggle')} value={leagues === true} disabled={leagues === null} onValueChange={changeLeagues} />
      {minor ? <SettingsNote>{t('settings.leagues.minorHint')}</SettingsNote> : null}
    </SettingsSection>
  );
}

/**
 * Who can see your profile: each of the four with what it means under it, so
 * the difference between "anyone on the web" and "Hevalo members" is read
 * before choosing, not found out after. Under 18 the open web is not offered.
 */
function VisibilityList(): React.JSX.Element {
  const { t } = useI18n();
  const { visibility, minor, changeVisibility } = useMyAccount();
  return (
    <SettingsSection first>
      <SettingsChoice<Visibility>
        label={t('settings.privacy.title')}
        options={VISIBILITIES}
        value={visibility}
        labelOf={(v) => t(VISIBILITY_LABEL[v])}
        hintOf={(v) => t(VISIBILITY_HINT[v])}
        isDisabled={(v) => !visibilityOffered(v, minor)}
        onChange={changeVisibility}
      />
      {minor ? <SettingsNote>{t('settings.visibility.minorHint')}</SettingsNote> : null}
    </SettingsSection>
  );
}

/** Whose work the app uses, and under which licence (see ../screens/credits). */
function Credits(): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <SettingsSection first>
      <View style={styles.credits}>
        <Text style={[styles.credit, dir.text, { color: colors.textSecondary }]}>{t('settings.credits.lead')}</Text>
        {CREDIT_LINES.map((key) => (
          <Text key={key} style={[styles.credit, dir.text, { color: colors.textPrimary }]}>
            {t(key)}
          </Text>
        ))}
        <Text style={[styles.credit, dir.text, { color: colors.textSecondary }]}>{t('settings.credits.art')}</Text>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  credits: { paddingHorizontal: layout.gutter, gap: spacing.sm, paddingTop: spacing.xs },
  credit: { fontSize: typography.sizes.sm, lineHeight: 21 },
});
