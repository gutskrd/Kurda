import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { PROVIDER } from '@kurda/shared';
import { describeError, isMaintenance } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { birthMonthLabel } from '../auth/birthMonth';
import { useConfirmDelete } from '../auth/useConfirmDelete';
import { FeedbackSettingsRows } from '../feedback/FeedbackSettings';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { LOCALE_LABEL } from '../i18n/translations';
import { ACCENT_LABEL } from '../keyboard/KeyboardSettings';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { SUPPORT_EMAIL, contactSupport, openLegal } from '../legal/links';
import type { RootNavigation } from '../navigation/rootStack';
import { VISIBILITY_LABEL } from '../social/format';
import { PREFERENCE_LABEL } from '../theme/appearance';
import { useTheme } from '../theme/ThemeProvider';
import { useMyAccount } from './account';
import { useSettingsAttention } from './attention';
import { SettingsRow, SettingsSection, useOnOff } from './list';
import type { SettingsPageKey } from './SettingsPageScreen';

/**
 * The pages behind the Settings home's categories. Each is today's rows for that kind of setting, unchanged, with its
 * current value on the row; a choice with several answers opens a page of its own.
 */

function usePage(): (key: SettingsPageKey) => () => void {
  const navigation = useNavigation<RootNavigation>();
  return (key) => () => navigation.navigate('SettingsPage', { page: key });
}

/**
 * Who you are here and how you sign in, then signing out every device, then, apart and last, deleting the account, so
 * nobody looking for something else reaches it by accident.
 */
export function AccountPage(): React.JSX.Element {
  const { client, logout } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const page = usePage();
  const account = useMyAccount();
  const confirmDelete = useConfirmDelete();
  const username = account.username ? `@${account.username}` : undefined;
  const birth = account.birth
    ? account.birth.year && account.birth.month
      ? birthMonthLabel(t, account.birth.year, account.birth.month)
      : t('settings.birthMonth.none')
    : undefined;

  /**
   * Signs out every device, this one included. The server bumps the token version, which invalidates every refresh
   * token, so this device signs out locally too, but only after the server agreed: otherwise the person would
   * believe the other devices were signed out when none were.
   */
  const endEverySession = async (): Promise<void> => {
    const res = await client.delete('/me/sessions');
    if (res.ok) {
      await logout();
      return;
    }
    // Maintenance is shown by the screen over the app, not by an alert.
    if (isMaintenance(res.error)) return;
    haptic('error');
    Alert.alert(t('settings.sessions.signOutFailed'), describeError(res.error, t));
  };
  const signOutEverywhere = (): void => {
    Alert.alert(t('settings.sessions.signOutEverywhere'), t('settings.sessions.help'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.sessions.signOutEverywhere'), style: 'destructive', onPress: () => void endEverySession() },
    ]);
  };

  return (
    <>
      <SettingsSection first>
        <SettingsRow icon="person" title={t('auth.username')} value={username} onPress={() => navigation.navigate('ChangeUsername')} />
        <SettingsRow icon="calendar" title={t('age.label')} value={birth} onPress={page('birthMonth')} testID="settings-birth-month" />
        <SettingsRow icon="lock" title={t('auth.password')} onPress={() => navigation.navigate('ChangePassword')} />
        <SettingsRow icon="devices" title={t('security.devices.title')} onPress={() => navigation.navigate('Devices')} />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="sign-out" title={t('settings.sessions.signOutEverywhere')} opens={false} onPress={signOutEverywhere} />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="trash" title={t('settings.delete.title')} destructive opens={false} onPress={confirmDelete} />
      </SettingsSection>
    </>
  );
}

/** The language the app is in, how it looks, and the keyboard for Kurdish letters. */
export function DisplayPage(): React.JSX.Element {
  const { t, locale } = useI18n();
  const { preference } = useTheme();
  const [keyboard] = useKeyboardPrefs();
  const page = usePage();
  return (
    <SettingsSection first>
      <SettingsRow icon="translate" title={t('settings.language')} value={LOCALE_LABEL[locale]} onPress={page('language')} />
      <SettingsRow icon="palette" title={t('appearance.theme')} value={t(PREFERENCE_LABEL[preference])} onPress={page('theme')} />
      <SettingsRow icon="keyboard" title={t('keyboard.settings.title')} value={t(ACCENT_LABEL[keyboard.accentMode])} onPress={page('keyboard')} />
    </SettingsSection>
  );
}

/** Who can see your profile, who you have blocked, and whether you are ranked in the weekly leagues. */
export function PrivacyPage(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const onOff = useOnOff();
  const page = usePage();
  const account = useMyAccount();
  return (
    <SettingsSection first>
      <SettingsRow
        icon="eye"
        title={t('settings.privacy.title')}
        value={account.visibility ? t(VISIBILITY_LABEL[account.visibility]) : undefined}
        onPress={page('visibility')}
      />
      {/* The only way to undo a block: a blocked person is a 404 to you, so no other screen can offer it. */}
      <SettingsRow icon="block" title={t('settings.blocked.title')} onPress={() => navigation.navigate('BlockedUsers')} />
      <SettingsRow
        icon="trophy"
        title={t('settings.leagues.title')}
        value={account.leagues === null ? undefined : onOff(account.leagues)}
        onPress={page('leagues')}
      />
    </SettingsSection>
  );
}

/** Your reports and what became of them, and any limits on your account and why. */
export function SafetyPage(): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const attention = useSettingsAttention();
  const limited = attention.standing !== null && attention.standing !== 'good';
  return (
    <SettingsSection first>
      <SettingsRow icon="flag" title={t('reports.title')} onPress={() => navigation.navigate('MyReports')} />
      <SettingsRow
        icon={limited ? 'alert' : 'shield'}
        title={t('standing.title')}
        // Said in words, not only in colour, before it is opened.
        subtitle={limited ? t(`standing.status.${attention.standing!}` as const) : undefined}
        attention={limited}
        onPress={() => navigation.navigate('AccountStanding')}
      />
    </SettingsSection>
  );
}

/** Feedback first (and a store rating once the app is listed), then the answers already written, then a person. */
export function HelpPage(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <SettingsSection first>
      <FeedbackSettingsRows />
      <SettingsRow icon="question" title={t('settings.faq')} onPress={() => openLegal('faq')} />
      {/* Opens the mail app, or copies the address when there is none. */}
      <SettingsRow icon="mail" title={t('settings.support')} subtitle={SUPPORT_EMAIL} onPress={() => void contactSupport(t)} />
    </SettingsSection>
  );
}

/** What Hevalo is and what it answers to, each page on hevalo.app so there is one copy; the business registration last. */
export function AboutPage(): React.JSX.Element {
  const { t } = useI18n();
  const page = usePage();
  return (
    <SettingsSection first>
      <SettingsRow icon="book" title={t('settings.teaching')} onPress={() => openLegal('teaching')} />
      <SettingsRow icon="globe" title={t('settings.about')} onPress={() => openLegal('about')} />
      <SettingsRow icon="rules" title={t('auth.legal.terms')} onPress={() => openLegal('terms')} />
      <SettingsRow icon="lock" title={t('auth.legal.privacy')} onPress={() => openLegal('privacy')} />
      <SettingsRow icon="quotes" title={t('settings.copyright.title')} subtitle={t('settings.copyright.hint')} onPress={() => openLegal('copyright')} />
      <SettingsRow icon="heart" title={t('settings.credits.title')} onPress={page('credits')} />
      {/* Shown as text: the full imprint is on the About page. */}
      <SettingsRow icon="place-work" title={t('settings.kvk')} value={PROVIDER.kvk} />
    </SettingsSection>
  );
}
