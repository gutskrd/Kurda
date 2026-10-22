import { Fragment, useState, type ReactNode } from 'react';
import { foldForSearch } from '@kurda/shared';
import { useNavigation } from '@react-navigation/native';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { PREFERENCE_LABEL } from '../theme/appearance';
import { useI18n } from '../i18n/I18nContext';
import { LOCALE_LABEL } from '../i18n/translations';
import { VISIBILITY_LABEL } from '../social/format';
import { ACCENT_LABEL } from '../keyboard/KeyboardSettings';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { FeedbackSettingsRows } from '../feedback/FeedbackSettings';
import { SearchField } from '../theme/SearchField';
import { LEGAL_URLS, SUPPORT_EMAIL, openLegal } from '../legal/links';
import { useMyAccount } from '../settings/account';
import { useSettingsAttention } from '../settings/attention';
import type { SettingsPageKey } from '../settings/SettingsPageScreen';
import { SettingsNote, SettingsPage, SettingsRow, SettingsSection, useOnOff } from '../settings/list';

/** The website's copyright page: a notice, counter-notices and the repeat-infringer policy. */
export const COPYRIGHT_URL = LEGAL_URLS.copyright;

/** One row of the list, and the words it can be found by. */
interface Entry {
  key: string;
  /** its name and value, and the names of what is on the page behind it */
  terms: Array<string | undefined>;
  row: ReactNode;
}

/**
 * Settings: one list, in a few short sections, each row saying what it is set
 * to now.
 *
 * The order is how often each is wanted and how much it matters: the account
 * first, where people look for it; then how the app behaves; then who can see
 * you; then help and the fine print; and at the very end, apart from the rest,
 * the rows that sign you out or delete the account, so nobody reaches them
 * while looking for something else. Every choice with more than one answer is
 * a page of its own, where each answer says what it means.
 *
 * The search at the top finds a row by its name, its value, or the name of
 * anything on the page behind it ("accent" finds Keyboard and accents).
 */
export function SettingsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, logout, deleteAccount } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { preference } = useTheme();
  const { t, locale } = useI18n();
  const [keyboard] = useKeyboardPrefs();
  const account = useMyAccount();
  const attention = useSettingsAttention();
  const limited = attention.standing !== null && attention.standing !== 'good';
  const onOff = useOnOff();
  const [query, setQuery] = useState('');

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
    Alert.alert(t('settings.delete.confirmTitle'), t('settings.delete.warning'), [
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
    ]);
  };

  const page = (key: SettingsPageKey) => () => navigation.navigate('SettingsPage', { page: key });

  const language = LOCALE_LABEL[locale];
  const theme = t(PREFERENCE_LABEL[preference]);
  const accents = t(ACCENT_LABEL[keyboard.accentMode]);
  const leagues = account.leagues === null ? undefined : onOff(account.leagues);
  const visibility = account.visibility ? t(VISIBILITY_LABEL[account.visibility]) : undefined;
  const username = account.username ? `@${account.username}` : undefined;

  const sections: Array<{ key: string; title?: string; entries: Entry[] }> = [
    {
      key: 'account',
      title: t('settings.group.account'),
      entries: [
        {
          key: 'username',
          terms: [t('auth.username'), username],
          row: <SettingsRow icon="person" title={t('auth.username')} value={username} onPress={() => navigation.navigate('ChangeUsername')} />,
        },
        {
          key: 'password',
          terms: [t('security.password.title'), t('settings.group.security')],
          row: <SettingsRow icon="lock" title={t('security.password.title')} onPress={() => navigation.navigate('ChangePassword')} />,
        },
        {
          key: 'devices',
          terms: [t('security.devices.title'), t('settings.group.security')],
          row: <SettingsRow icon="devices" title={t('security.devices.title')} onPress={() => navigation.navigate('Devices')} />,
        },
      ],
    },
    {
      key: 'preferences',
      title: t('settings.group.preferences'),
      entries: [
        {
          key: 'notifications',
          terms: [t('notifications.title'), t('notifications.categories'), t('notifications.quietHours')],
          row: (
            <SettingsRow
              icon="bell"
              title={t('notifications.title')}
              // the phone is not letting them through: the one thing in this section to act on
              value={attention.pushOff ? t('settings.off') : undefined}
              attention={attention.pushOff}
              onPress={() => navigation.navigate('Notifications')}
            />
          ),
        },
        {
          key: 'language',
          terms: [t('settings.language'), language],
          row: <SettingsRow icon="translate" title={t('settings.language')} value={language} onPress={page('language')} />,
        },
        {
          key: 'theme',
          terms: [t('appearance.theme'), theme, t('settings.eventThemes'), t('settings.appearance')],
          row: <SettingsRow icon="palette" title={t('appearance.theme')} value={theme} onPress={page('theme')} />,
        },
        {
          key: 'sounds',
          terms: [t('settings.soundsVibration'), t('settings.sounds'), t('settings.vibration')],
          row: <SettingsRow icon="speaker" title={t('settings.soundsVibration')} onPress={page('sounds')} />,
        },
        {
          key: 'keyboard',
          terms: [t('keyboard.settings.title'), accents, t('keyboard.accent.title'), t('keyboard.keyBar.title'), t('keyboard.backtick.title'), t('keyboard.wordle.title'), t('keyboard.help')],
          row: <SettingsRow icon="keyboard" title={t('keyboard.settings.title')} value={accents} onPress={page('keyboard')} />,
        },
        {
          key: 'leagues',
          terms: [t('settings.leagues.title'), leagues],
          row: <SettingsRow icon="trophy" title={t('settings.leagues.title')} value={leagues} onPress={page('leagues')} />,
        },
      ],
    },
    {
      key: 'privacy',
      title: t('settings.group.privacy'),
      entries: [
        {
          key: 'visibility',
          terms: [t('settings.privacy.title'), visibility],
          row: <SettingsRow icon="eye" title={t('settings.privacy.title')} value={visibility} onPress={page('visibility')} />,
        },
        {
          // the only way back from a block: the person is a 404 to you afterwards, so no other screen can offer to undo it
          key: 'blocked',
          terms: [t('settings.blocked.title')],
          row: <SettingsRow icon="block" title={t('settings.blocked.title')} onPress={() => navigation.navigate('BlockedUsers')} />,
        },
        {
          // what you reported and what came of it; what is limited on your account and why
          key: 'reports',
          terms: [t('reports.title')],
          row: <SettingsRow icon="flag" title={t('reports.title')} onPress={() => navigation.navigate('MyReports')} />,
        },
        {
          key: 'standing',
          terms: [t('standing.title'), limited ? t(`standing.status.${attention.standing!}` as const) : undefined],
          row: (
            <SettingsRow
              icon={limited ? 'alert' : 'shield'}
              title={t('standing.title')}
              // said in words, not only in gold: what is wrong, before it is opened
              subtitle={limited ? t(`standing.status.${attention.standing!}` as const) : undefined}
              attention={limited}
              onPress={() => navigation.navigate('AccountStanding')}
            />
          ),
        },
      ],
    },
    {
      key: 'about',
      title: t('settings.group.about'),
      entries: [
        {
          // tell us what you think, and (once the app is in the stores) rate it there
          key: 'feedback',
          terms: [t('appFeedback.sendRow'), t('appFeedback.rateRow')],
          row: <FeedbackSettingsRows />,
        },
        {
          key: 'support',
          terms: [t('settings.support'), SUPPORT_EMAIL],
          row: <SettingsRow icon="mail" title={t('settings.support')} subtitle={SUPPORT_EMAIL} opens={false} onPress={() => openLegal('support')} />,
        },
        {
          // the website's pages the app answers to, each opened on hevalo.app so there is one copy of each
          key: 'teaching',
          terms: [t('settings.teaching')],
          row: <SettingsRow icon="book" title={t('settings.teaching')} opens={false} onPress={() => openLegal('teaching')} />,
        },
        {
          key: 'terms',
          terms: [t('auth.legal.terms')],
          row: <SettingsRow icon="text" title={t('auth.legal.terms')} opens={false} onPress={() => openLegal('terms')} />,
        },
        {
          key: 'privacyPolicy',
          terms: [t('auth.legal.privacy')],
          row: <SettingsRow icon="lock" title={t('auth.legal.privacy')} opens={false} onPress={() => openLegal('privacy')} />,
        },
        {
          key: 'copyright',
          terms: [t('settings.copyright.title'), t('settings.copyright.hint')],
          row: (
            <SettingsRow
              icon="quotes"
              title={t('settings.copyright.title')}
              subtitle={t('settings.copyright.hint')}
              opens={false}
              onPress={() => openLegal('copyright')}
            />
          ),
        },
        {
          key: 'credits',
          terms: [t('settings.credits.title')],
          row: <SettingsRow icon="heart" title={t('settings.credits.title')} onPress={page('credits')} />,
        },
      ],
    },
    {
      // apart from the rest, at the end: nobody looking for something else reaches these by accident
      key: 'leave',
      entries: [
        {
          key: 'export',
          terms: [t('settings.data.request'), t('settings.data.title'), t('settings.data.help')],
          row: (
            <SettingsRow
              icon="download"
              title={t('settings.data.request')}
              subtitle={t('settings.data.help')}
              value={exporting ? t('settings.data.requesting') : undefined}
              opens={false}
              onPress={requestExport}
            />
          ),
        },
        {
          key: 'everywhere',
          terms: [t('settings.sessions.signOutEverywhere')],
          row: <SettingsRow icon="devices" title={t('settings.sessions.signOutEverywhere')} opens={false} onPress={signOutEverywhere} />,
        },
        {
          key: 'logout',
          terms: [t('profile.logout')],
          row: <SettingsRow icon="sign-out" title={t('profile.logout')} opens={false} onPress={() => void logout()} />,
        },
        {
          key: 'delete',
          terms: [t('settings.delete.title')],
          row: <SettingsRow icon="trash" title={t('settings.delete.title')} destructive opens={false} onPress={confirmDelete} />,
        },
      ],
    },
  ];

  // every word typed, found anywhere in a row's words; accents set aside, so "e" finds "ê"
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  const finds = (e: Entry): boolean => {
    const said = foldForSearch(e.terms.filter(Boolean).join(' '));
    return words.every((w) => said.includes(w));
  };
  const shown = words.length
    ? sections.map((s) => ({ ...s, entries: s.entries.filter(finds) })).filter((s) => s.entries.length > 0)
    : sections;

  return (
    <SettingsPage title={t('settings.title')} onExit={onExit}>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={setQuery} label={t('settings.search')} />
      </View>
      {shown.map((section, i) => (
        <SettingsSection key={section.key} title={section.title} first={i === 0}>
          {section.entries.map((entry) => (
            <Fragment key={entry.key}>{entry.row}</Fragment>
          ))}
        </SettingsSection>
      ))}
      {shown.length === 0 ? <SettingsNote>{t('settings.search.none', { query: query.trim() })}</SettingsNote> : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
