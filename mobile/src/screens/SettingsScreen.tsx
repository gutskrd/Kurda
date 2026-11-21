import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { PROVIDER, foldForSearch } from '@kurda/shared';
import { useNavigation } from '@react-navigation/native';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { birthMonthLabel } from '../auth/birthMonth';
import { describeError, isMaintenance } from '../api/errors';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton } from '../theme/glass';
import { layout, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { PREFERENCE_LABEL } from '../theme/appearance';
import { useI18n } from '../i18n/I18nContext';
import { LOCALE_LABEL } from '../i18n/translations';
import { formatDay } from '../i18n/format';
import { VISIBILITY_LABEL } from '../social/format';
import { ACCENT_LABEL } from '../keyboard/KeyboardSettings';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { FeedbackSettingsRows } from '../feedback/FeedbackSettings';
import { SearchField } from '../theme/SearchField';
import { useConfirmDelete } from '../auth/useConfirmDelete';
import { SUPPORT_EMAIL, contactSupport, openLegal } from '../legal/links';
import { useMyAccount } from '../settings/account';
import { useSettingsAttention } from '../settings/attention';
import type { SettingsPageKey } from '../settings/SettingsPageScreen';
import { SettingsNote, SettingsPage, SettingsRow, SettingsSection, useOnOff } from '../settings/list';
import { VersionLine } from '../settings/VersionLine';

/** The data export's state (GET /me/export); the download link is fresh and short-lived. */
interface ExportStatus {
  status: 'none' | 'pending' | 'ready';
  downloadUrl?: string;
  requestedAt?: string;
}

/** One row of the list, and the words search finds it by. */
interface Entry {
  key: string;
  /** Its name and value, and the names of what is on the page behind it. */
  terms: Array<string | undefined>;
  row: ReactNode;
}

/**
 * Settings: one list in short sections, each row showing its current value. Ordered by how often each is wanted:
 * account, app behaviour, privacy, help and legal, then sign-out and deletion apart at the end so nobody reaches
 * them by accident. A choice with several answers gets its own page. The version and build sit at the foot,
 * since support asks for them first.
 *
 * Search matches a row's name, value, or anything on the page behind it ("accent" finds Keyboard and accents).
 */
export function SettingsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, logout, isGuest } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { preference, colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [keyboard] = useKeyboardPrefs();
  const account = useMyAccount();
  const attention = useSettingsAttention();
  const limited = attention.standing !== null && attention.standing !== 'good';
  const onOff = useOnOff();
  const [query, setQuery] = useState('');

  /**
   * Signs out every device, this one included. The server bumps the token version, which invalidates every refresh
   * token, so this device signs out locally too, but only after the server agreed: otherwise the person would
   * believe the other devices were signed out when none were.
   */
  const endEverySession = async () => {
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
  const signOutEverywhere = () => {
    Alert.alert(t('settings.sessions.signOutEverywhere'), t('settings.sessions.help'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.sessions.signOutEverywhere'),
        style: 'destructive',
        onPress: () => void endEverySession(),
      },
    ]);
  };

  /**
   * A copy of the account's data, requested and then fetched here. The server prepares it in the background and hands
   * it only to the account as a short-lived link (GET /me/export), so the row shows its state: none, preparing, or
   * ready, when it offers a download (with a fresh link each time) or a newer copy. Nothing is emailed.
   */
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<ExportStatus | null>(null);
  const readExport = useCallback(async (): Promise<ExportStatus | null> => {
    const res = await client.get<ExportStatus>('/me/export');
    if (!res.ok) return null;
    setExported(res.data);
    return res.data;
  }, [client]);
  useEffect(() => {
    void readExport();
  }, [readExport]);
  const requestExport = () => {
    if (exporting) return;
    setExporting(true);
    void client.post('/me/export').then((res) => {
      setExporting(false);
      if (res.ok) {
        setExported({ status: 'pending' });
        Alert.alert(t('settings.data.title'), t('settings.data.requested'));
      } else Alert.alert(t('settings.data.failed'), describeError(res.error, t));
    });
  };
  const exportReadyText = (status: ExportStatus): string =>
    t('settings.data.ready', { date: status.requestedAt ? formatDay(new Date(status.requestedAt), locale) : '' });
  const openExport = () => {
    void readExport().then((status) => {
      if (status?.status === 'ready' && status.downloadUrl) {
        Alert.alert(t('settings.data.title'), exportReadyText(status), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('settings.data.again'), onPress: requestExport },
          { text: t('settings.data.download'), onPress: () => void Linking.openURL(status.downloadUrl!) },
        ]);
      } else if (status?.status === 'pending') Alert.alert(t('settings.data.title'), t('settings.data.requested'));
      else requestExport();
    });
  };

  /*
   * In-app account deletion, which Apple requires. The server keeps the account for a grace period and signing back
   * in cancels it, so the app warns, signs out, and repeats how to undo it over the welcome screen
   * (auth/useConfirmDelete, shared with the screens a new account waits at).
   */
  const confirmDelete = useConfirmDelete();

  /*
   * Logging a guest out loses the account and its progress, since a guest has no email or password. It asks first,
   * and the first answer offered is the one that keeps the progress: creating an account.
   */
  const [guestLeaving, setGuestLeaving] = useState(false);
  /*
   * An account is asked too, in the same sheet: the row sits between "Sign out everywhere" and "Delete account", so
   * a mistaken tap must not sign out immediately.
   */
  const [leaving, setLeaving] = useState(false);
  const askedLogout = () => {
    haptic('select');
    if (isGuest) setGuestLeaving(true);
    else setLeaving(true);
  };

  const page = (key: SettingsPageKey) => () => navigation.navigate('SettingsPage', { page: key });

  const language = LOCALE_LABEL[locale];
  const theme = t(PREFERENCE_LABEL[preference]);
  const accents = t(ACCENT_LABEL[keyboard.accentMode]);
  const leagues = account.leagues === null ? undefined : onOff(account.leagues);
  const visibility = account.visibility ? t(VISIBILITY_LABEL[account.visibility]) : undefined;
  const username = account.username ? `@${account.username}` : undefined;
  const birth = account.birth
    ? account.birth.year && account.birth.month
      ? birthMonthLabel(t, account.birth.year, account.birth.month)
      : t('settings.birthMonth.none')
    : undefined;

  // A guest's account section is one row, the way to an account: there is no name, password or device list to change.
  const accountEntries: Entry[] = isGuest
    ? [
        {
          key: 'claim',
          terms: [t('guest.settings.create'), t('guest.settings.createHint')],
          row: (
            <SettingsRow
              icon="user-plus"
              title={t('guest.settings.create')}
              subtitle={t('guest.settings.createHint')}
              onPress={() => navigation.navigate('ClaimAccount')}
              testID="settings-claim"
            />
          ),
        },
      ]
    : [
        {
          key: 'username',
          terms: [t('auth.username'), username],
          row: <SettingsRow icon="person" title={t('auth.username')} value={username} onPress={() => navigation.navigate('ChangeUsername')} />,
        },
        {
          key: 'birthMonth',
          terms: [t('age.label'), birth],
          row: <SettingsRow icon="calendar" title={t('age.label')} value={birth} onPress={page('birthMonth')} testID="settings-birth-month" />,
        },
        {
          key: 'password',
          terms: [t('auth.password'), t('security.password.title'), t('settings.group.security')],
          row: <SettingsRow icon="lock" title={t('auth.password')} onPress={() => navigation.navigate('ChangePassword')} />,
        },
        {
          key: 'devices',
          terms: [t('security.devices.title'), t('settings.group.security')],
          row: <SettingsRow icon="devices" title={t('security.devices.title')} onPress={() => navigation.navigate('Devices')} />,
        },
      ];

  const sections: Array<{ key: string; title?: string; entries: Entry[] }> = [
    {
      key: 'account',
      title: t('settings.group.account'),
      entries: accountEntries,
    },
    {
      key: 'preferences',
      title: t('settings.group.preferences'),
      entries: [
        {
          key: 'notifications',
          terms: [t('settings.notifications'), t('notifications.title'), t('notifications.categories'), t('notifications.quietHours')],
          row: (
            <SettingsRow
              icon="bell"
              title={t('notifications.title')}
              // Notifications blocked by the phone is the one thing in this section to act on.
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
          terms: [t('appearance.theme'), theme, t('settings.eventThemes')],
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
          // The only way to undo a block: a blocked person is a 404 to you, so no other screen can offer it.
          key: 'blocked',
          terms: [t('settings.blocked.title')],
          row: <SettingsRow icon="block" title={t('settings.blocked.title')} onPress={() => navigation.navigate('BlockedUsers')} />,
        },
        {
          // Your reports and their outcomes, and any limits on your account and why.
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
              // Said in words, not only in colour, before it is opened.
              subtitle={limited ? t(`standing.status.${attention.standing!}` as const) : undefined}
              attention={limited}
              onPress={() => navigation.navigate('AccountStanding')}
            />
          ),
        },
      ],
    },
    {
      // Help first, then what the app is and answers to.
      key: 'help',
      title: t('settings.group.help'),
      entries: [
        {
          // Feedback, and a store rating once the app is listed.
          key: 'feedback',
          terms: [t('appFeedback.sendRow'), t('appFeedback.rateRow')],
          row: <FeedbackSettingsRows />,
        },
        {
          // The FAQ first: most questions have been asked before.
          key: 'faq',
          terms: [t('settings.faq')],
          row: <SettingsRow icon="question" title={t('settings.faq')} onPress={() => openLegal('faq')} />,
        },
        {
          // Opens the mail app, or copies the address when there is none.
          key: 'support',
          terms: [t('settings.support'), SUPPORT_EMAIL],
          row: <SettingsRow icon="mail" title={t('settings.support')} subtitle={SUPPORT_EMAIL} onPress={() => void contactSupport(t)} />,
        },
      ],
    },
    {
      key: 'about',
      title: t('settings.group.about'),
      entries: [
        {
          // Each legal and about page opens on hevalo.app, so there is one copy of each.
          key: 'teaching',
          terms: [t('settings.teaching')],
          row: <SettingsRow icon="book" title={t('settings.teaching')} onPress={() => openLegal('teaching')} />,
        },
        {
          key: 'aboutPage',
          terms: [t('settings.about')],
          row: <SettingsRow icon="globe" title={t('settings.about')} onPress={() => openLegal('about')} />,
        },
        {
          key: 'terms',
          terms: [t('auth.legal.terms')],
          row: <SettingsRow icon="rules" title={t('auth.legal.terms')} onPress={() => openLegal('terms')} />,
        },
        {
          key: 'privacyPolicy',
          terms: [t('auth.legal.privacy')],
          row: <SettingsRow icon="lock" title={t('auth.legal.privacy')} onPress={() => openLegal('privacy')} />,
        },
        {
          key: 'copyright',
          terms: [t('settings.copyright.title'), t('settings.copyright.hint')],
          row: (
            <SettingsRow
              icon="quotes"
              title={t('settings.copyright.title')}
              subtitle={t('settings.copyright.hint')}
              onPress={() => openLegal('copyright')}
            />
          ),
        },
        {
          key: 'credits',
          terms: [t('settings.credits.title')],
          row: <SettingsRow icon="heart" title={t('settings.credits.title')} onPress={page('credits')} />,
        },
        {
          // The business registration, shown as text at the foot of the legal rows; the full imprint is on the About page.
          key: 'kvk',
          terms: [t('settings.kvk'), PROVIDER.kvk],
          row: <SettingsRow icon="place-work" title={t('settings.kvk')} value={PROVIDER.kvk} />,
        },
      ],
    },
    {
      // Kept apart at the end so nobody looking for something else reaches these by accident.
      key: 'leave',
      entries: [
        {
          key: 'export',
          terms: [t('settings.data.request'), t('settings.data.download'), t('settings.data.title'), t('settings.data.help')],
          row: (
            <SettingsRow
              icon="download"
              title={exported?.status === 'ready' ? t('settings.data.download') : t('settings.data.request')}
              subtitle={exported?.status === 'ready' ? exportReadyText(exported) : t('settings.data.help')}
              value={exporting ? t('settings.data.requesting') : exported?.status === 'pending' ? t('settings.data.preparing') : undefined}
              opens={false}
              onPress={exported && exported.status !== 'none' ? openExport : requestExport}
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
          row: <SettingsRow icon="sign-out" title={t('profile.logout')} opens={false} onPress={askedLogout} />,
        },
        {
          key: 'delete',
          terms: [t('settings.delete.title')],
          row: <SettingsRow icon="trash" title={t('settings.delete.title')} destructive opens={false} onPress={confirmDelete} />,
        },
        // A guest has no other devices and no data to export, but can always sign out or delete the account.
      ].filter((entry) => !isGuest || entry.key === 'logout' || entry.key === 'delete'),
    },
  ];

  // A guest has no league, profile visibility, blocks, reports or standing, so those rows would only meet refusals.
  const offered = isGuest
    ? sections.filter((s) => s.key !== 'privacy').map((s) => ({ ...s, entries: s.entries.filter((e) => e.key !== 'leagues') }))
    : sections;

  // Every typed word must appear somewhere in the row's terms; accents are folded, so "e" finds "ê".
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  const finds = (e: Entry): boolean => {
    const said = foldForSearch(e.terms.filter(Boolean).join(' '));
    return words.every((w) => said.includes(w));
  };
  const shown = words.length
    ? offered.map((s) => ({ ...s, entries: s.entries.filter(finds) })).filter((s) => s.entries.length > 0)
    : offered;

  return (
    <>
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
        <VersionLine />
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

const styles = StyleSheet.create({
  search: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  sheetBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  sheetActions: { gap: spacing.sm, marginTop: spacing.sm },
});
