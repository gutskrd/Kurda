import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { birthMonthLabel } from '../auth/birthMonth';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { useSoundPref } from '../feedback/soundPref';
import { useAutoplayPref } from '../feedback/autoplayPref';
import { useCharacterVoicesPref } from '../feedback/voicesPref';
import { useVibrationPref } from '../feedback/vibrationPref';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES, LOCALE_LABEL, type Locale, type TranslationKey } from '../i18n/translations';
import { KeyboardSettingsList } from '../keyboard/KeyboardSettings';
import { SUPPORT_EMAIL } from '../legal/links';
import { useDirection } from '../reports/direction';
import { CREDIT_LINES, splitCredit } from '../screens/credits';
import { VISIBILITIES, VISIBILITY_HINT, VISIBILITY_LABEL, visibilityOffered, type Visibility } from '../social/format';
import { PREFERENCE_LABEL, THEME_PREFERENCES, type ThemePreference } from '../theme/appearance';
import { ClayButton } from '../theme/glass';
import { useEventTheme } from '../theme/EventThemeContext';
import type { IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { CodePage } from '../parental/CodePage';
import { ConnectPage } from '../parental/ConnectPage';
import { ParentalPage } from '../parental/ParentalPage';
import { BedtimePage, LimitPage, TeenPage } from '../parental/TeenPage';
import { AddChildPage } from '../family/AddChildPage';
import { ChildPage, PairingPage } from '../family/ChildPage';
import { FamilyPage } from '../family/FamilyPage';
import { useMyAccount } from './account';
import { AboutPage, AccountPage, DisplayPage, HelpPage, PrivacyPage, SafetyPage } from './CategoryPages';
import { SettingsChoice, SettingsNote, SettingsPage, SettingsRow, SettingsSection, SettingsSwitch } from './list';
import { StoragePage } from './StoragePage';

/**
 * The pages behind Settings: one per category on the home, the parental pages behind those, and the choices with
 * several answers behind a row. Opened through the one `SettingsPage` route; a page about one teen also takes its id.
 */
export const SETTINGS_PAGES = [
  'account',
  'parental',
  'parentalConnect',
  'parentalCode',
  'parentalTeen',
  'parentalLimit',
  'parentalBedtime',
  'family',
  'familyAddChild',
  'familyChild',
  'familyPairing',
  'display',
  'privacy',
  'safety',
  'storage',
  'help',
  'about',
  'birthMonth',
  'language',
  'theme',
  'sounds',
  'keyboard',
  'leagues',
  'visibility',
  'credits',
] as const;
export type SettingsPageKey = (typeof SETTINGS_PAGES)[number];

/** One Settings page: a short list of one kind of choice, each explained beside it and saved as soon as it changes. */
export function SettingsPageScreen({ page, teenId = '', onExit }: { page: SettingsPageKey; teenId?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  // The two pages with a moment over their header draw their own frame.
  if (page === 'parentalConnect') return <ConnectPage onExit={onExit} />;
  if (page === 'parentalCode') return <CodePage onExit={onExit} />;
  if (page === 'familyAddChild') return <AddChildPage onExit={onExit} />;
  if (page === 'familyPairing') return <PairingPage teenId={teenId} onExit={onExit} />;
  const { title, Body } = PAGES[page];
  return (
    <SettingsPage title={t(title)} onExit={onExit}>
      <Body key={teenId} teenId={teenId} />
    </SettingsPage>
  );
}

/** Each page's title and list; a page about one teen is drawn afresh for another. */
type Page = { title: TranslationKey; Body: (props: { teenId: string }) => React.JSX.Element };
const PAGES: Record<Exclude<SettingsPageKey, 'parentalConnect' | 'parentalCode' | 'familyAddChild' | 'familyPairing'>, Page> = {
  account: { title: 'settings.group.account', Body: AccountPage },
  parental: { title: 'parental.title', Body: ParentalPage },
  parentalTeen: { title: 'parental.title', Body: TeenPage },
  parentalLimit: { title: 'parental.dailyLimit', Body: LimitPage },
  parentalBedtime: { title: 'parental.bedtime', Body: BedtimePage },
  family: { title: 'family.title', Body: FamilyPage },
  familyChild: { title: 'family.title', Body: ChildPage },
  display: { title: 'settings.cat.display', Body: DisplayPage },
  privacy: { title: 'settings.cat.privacy', Body: PrivacyPage },
  safety: { title: 'settings.cat.safety', Body: SafetyPage },
  storage: { title: 'settings.cat.storage', Body: StoragePage },
  help: { title: 'settings.cat.help', Body: HelpPage },
  about: { title: 'settings.cat.about', Body: AboutPage },
  birthMonth: { title: 'age.label', Body: BirthMonth },
  language: { title: 'settings.language', Body: LanguageList },
  theme: { title: 'appearance.theme', Body: ThemeList },
  sounds: { title: 'settings.soundsVibration', Body: SoundsList },
  keyboard: { title: 'keyboard.settings.title', Body: KeyboardSettingsList },
  leagues: { title: 'settings.leagues.title', Body: LeaguesList },
  visibility: { title: 'settings.privacy.title', Body: VisibilityList },
  credits: { title: 'settings.credits.title', Body: Credits },
};

/**
 * The birth month on record, given once. With none on record, the way to the one-time question, which the app shows
 * over every screen once the account it holds says one is missing.
 */
function BirthMonth(): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  const { refreshUser } = useAuth();
  const { birth, failed, retry } = useMyAccount();
  if (!birth) return <SettingsSection first>{failed ? <NotRead failed={failed} retry={retry} /> : null}</SettingsSection>;
  if (birth.year && birth.month) {
    return (
      <SettingsSection first footer={t('settings.birthMonth.help', { email: SUPPORT_EMAIL })}>
        <Text style={[styles.birth, dir.text, { color: colors.textPrimary }]} testID="birth-month">
          {birthMonthLabel(t, birth.year, birth.month)}
        </Text>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection first footer={t('age.prompt.body')}>
      <View style={styles.birthAdd}>
        <ClayButton label={t('letters.refusal.birthMonthAction')} tone="primary" onPress={() => void refreshUser()} testID="birth-month-add" />
      </View>
    </SettingsSection>
  );
}

/** Every language the app is in, each named in itself so it can be found by someone who reads no other. */
function LanguageList(): React.JSX.Element {
  const { t, locale, setLocale } = useI18n();
  return (
    <SettingsSection first>
      <SettingsChoice<Locale> label={t('settings.language')} options={LOCALES} value={locale} labelOf={(l) => LOCALE_LABEL[l]} onChange={setLocale} />
    </SettingsSection>
  );
}

/** Light, dark or the system setting, plus the seasonal themes; a choice applies across the app at once. */
function ThemeList(): React.JSX.Element {
  const { t } = useI18n();
  const { scheme, preference, setPreference } = useTheme();
  const { optedOut, setOptedOut } = useEventTheme();
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
      </SettingsSection>
    </>
  );
}

/**
 * The app's sounds and haptics. Turning either on plays it once; turning it off does nothing noticeable. Spoken
 * Kurdish in lessons always plays when asked; the third switch sets whether it also plays after each answer, the
 * fourth whether Hevalo and Xezo say their short lines.
 */
function SoundsList(): React.JSX.Element {
  const { t } = useI18n();
  const [vibration, setVibration] = useVibrationPref();
  const [sounds, setSounds] = useSoundPref();
  const [autoplay, setAutoplay] = useAutoplayPref();
  const [voices, setVoices] = useCharacterVoicesPref();
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
        icon="speaker-high"
        title={t('settings.sounds.autoplay')}
        subtitle={t('settings.sounds.autoplayHint')}
        value={autoplay}
        onValueChange={setAutoplay}
      />
      <SettingsSwitch
        icon="chat"
        title={t('settings.sounds.characterVoices')}
        subtitle={t('settings.sounds.characterVoicesHint')}
        value={voices}
        onValueChange={setVoices}
      />
    </SettingsSection>
  );
}

/** The account could not be read, so show the error and a retry rather than a switch left disabled. */
function NotRead({ failed, retry }: { failed: string; retry: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <SettingsNote>{failed}</SettingsNote>
      <SettingsRow icon="history" title={t('common.retry')} opens={false} onPress={retry} />
    </>
  );
}

/** In or out of the weekly leagues, and what a league is, said before it is chosen. */
function LeaguesList(): React.JSX.Element {
  const { t } = useI18n();
  const { leagues, minor, failed, retry, changeLeagues } = useMyAccount();
  return (
    <SettingsSection first footer={t('settings.leagues.help')}>
      <SettingsSwitch icon="trophy" title={t('settings.leagues.toggle')} value={leagues === true} disabled={leagues === null} onValueChange={changeLeagues} />
      {leagues === null && failed ? <NotRead failed={failed} retry={retry} /> : null}
      {minor ? <SettingsNote>{t('settings.leagues.minorHint')}</SettingsNote> : null}
    </SettingsSection>
  );
}

/**
 * Profile visibility: each of the four options with its meaning, so the difference is clear before choosing.
 * Under 18, the open web is not offered.
 */
function VisibilityList(): React.JSX.Element {
  const { t } = useI18n();
  const { visibility, minor, failed, retry, changeVisibility } = useMyAccount();
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
      {/* None of the four ticked is a page that has not been told which one it is. */}
      {visibility === null && failed ? <NotRead failed={failed} retry={retry} /> : null}
      {minor ? <SettingsNote>{t('settings.visibility.minorHint')}</SettingsNote> : null}
    </SettingsSection>
  );
}

/** Whose work the app uses, and under which licence (see ../screens/credits): one row each, on the list's card. */
function Credits(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <SettingsNote>{t('settings.credits.lead')}</SettingsNote>
      <SettingsSection footer={t('settings.credits.art')}>
        {CREDIT_LINES.map((key, i) => {
          const { work, licence } = splitCredit(t(key));
          return <SettingsRow key={key} icon={CREDIT_ICONS[i]} title={work} subtitle={licence ?? undefined} />;
        })}
      </SettingsSection>
    </>
  );
}

/** The typeface, the icons and the emoji, in `CREDIT_LINES` order. */
const CREDIT_ICONS: readonly IconName[] = ['text', 'star', 'image'];

const styles = StyleSheet.create({
  birth: { paddingHorizontal: layout.gutter, paddingVertical: spacing.sm, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  birthAdd: { paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
});
