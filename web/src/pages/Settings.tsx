import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { failureText, useOptimistic } from '../lib/optimistic';
import { useApiGet } from '../lib/useApi';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { MeProfile } from '../lib/types';
import { ErrorState } from '../components/states';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { Button } from '../components/Button';
import {
  ArrowIcon,
  AtIcon,
  BellIcon,
  BlockIcon,
  BookIcon,
  CalendarIcon,
  ChatsIcon,
  CopyrightIcon,
  DeviceIcon,
  DownloadIcon,
  EyeIcon,
  FlagIcon,
  HelpIcon,
  KeyIcon,
  KeyboardIcon,
  LanguageIcon,
  MailIcon,
  ProfileIcon,
  RulesIcon,
  SignOutIcon,
  SpeakerIcon,
  StandingIcon,
  ThemeIcon,
  TrashIcon,
  TrophyIcon,
  LockIcon,
} from '../components/icons';
import { MONTH_KEY } from '../auth/BirthMonthFields';
import { BlockedUsers } from '../settings/BlockedUsers';
import { ChangePassword } from '../settings/ChangePassword';
import { ChangeUsername } from '../settings/ChangeUsername';
import { SignedInDevices } from '../settings/SignedInDevices';
import { SettingsChoices, SettingsRow, SettingsSearch, SettingsSection, SettingsSwitch, searchable } from '../settings/SettingsList';
import { GiftSoundSetting } from '../gifts/GiftSoundSetting';
import { VibrationSetting } from '../settings/VibrationSetting';
import { NotificationPrefsCard } from '../notifications/NotificationPrefsCard';
import { APP_LOCALES, isAppLocale, type AppLocale } from '@kurda/shared';
import { useI18n, useT, type Translate } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { KeyboardCard } from '../keyboard/KeyboardCard';
import { ACCENT_LABEL } from '../keyboard/KeyboardSettings';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { SendFeedbackCard } from '../feedback/SendFeedbackCard';
import { MY_REPORTS_PATH, STANDING_PATH } from '../reports/restriction';
import { THEME_PREFERENCES, useThemePreference, type ThemePreference } from '../theme/theme';

const VISIBILITIES = ['everyone', 'members', 'friends', 'nobody'] as const;
type Visibility = (typeof VISIBILITIES)[number];

/**
 * The visibility labels. The widest setting really is the public web, readable without an account, so it says so;
 * "Everyone" alone would read as "everyone here", which is what Members means.
 */
const VIS_LABEL_KEY: Record<Visibility, MessageKey> = {
  everyone: 'settings.visibility.everyone',
  members: 'settings.visibility.members',
  friends: 'settings.visibility.friends',
  nobody: 'settings.visibility.nobody',
};

const VIS_HINT_KEY: Record<Visibility, MessageKey> = {
  everyone: 'settings.visibility.everyoneHint',
  members: 'settings.visibility.membersHint',
  friends: 'settings.visibility.friendsHint',
  nobody: 'settings.visibility.nobodyHint',
};

const THEME_LABEL: Record<ThemePreference, MessageKey> = {
  dark: 'settings.appearance.dark',
  light: 'settings.appearance.light',
  system: 'settings.appearance.system',
};

/** Where to write to a person about anything. */
const SUPPORT_EMAIL = 'support@hevalo.app';

/** Every page Settings opens, each at /app/settings/<page>. */
const PAGES = [
  'username',
  'birth-month',
  'password',
  'devices',
  'notifications',
  'language',
  'theme',
  'sounds',
  'keyboard',
  'leagues',
  'visibility',
  'blocked',
  'feedback',
  'data',
  'delete',
] as const;
export type SettingsPage = (typeof PAGES)[number];

const isPage = (value: string | undefined): value is SettingsPage => (PAGES as readonly string[]).includes(value ?? '');

const PAGE_TITLE: Record<SettingsPage, MessageKey> = {
  username: 'settings.username.title',
  'birth-month': 'age.label',
  password: 'settings.password.title',
  devices: 'settings.devices.title',
  notifications: 'notifications.title',
  language: 'language.settingsTitle',
  theme: 'settings.appearance.title',
  sounds: 'settings.soundsVibration',
  keyboard: 'keyboard.settings.title',
  leagues: 'settings.leagues.title',
  visibility: 'settings.privacy.title',
  blocked: 'settings.blocked.title',
  feedback: 'appFeedback.settingsTitle',
  data: 'settings.data.title',
  delete: 'settings.delete.title',
};

/** The page shown beside the list on a wide screen before one is picked: the one most often looked for. */
const FIRST_PAGE: SettingsPage = 'notifications';

/** From this width the list and its page sit side by side. */
const WIDE = '(min-width: 960px)';

const settingsPath = (page: SettingsPage): string => `/app/settings/${page}`;

/** The page the address names (/app/settings/<page>), or none for the list. */
function pageOf(pathname: string): string | undefined {
  return /^\/app\/settings\/([^/]+)\/?$/.exec(pathname)?.[1];
}

/**
 * Settings as a short list in five groups (account, behaviour, visibility, about, leaving), each row showing its value
 * and opening its own page; on a wide screen the page opens beside the list. Signing out and deleting the account come
 * last and apart, deleting in red behind a second step.
 */
export function Settings(): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  const wide = useMediaQuery(WIDE);
  // Fetched fresh: each page's controls start from this answer, so a stale one would show wrong values.
  const { data, loading, error, reload } = useApiGet<{ user: MeProfile }>('/me', { fresh: true });
  // Changes made here since /me answered, so the list shows them at once.
  const [changed, setChanged] = useState<Partial<MeProfile>>({});
  const user = data ? { ...data.user, ...changed } : null;
  const me: MeState = { user, loading, error, reload, onChanged: (patch) => setChanged((c) => ({ ...c, ...patch })) };

  const named = pageOf(location.pathname);
  const page = isPage(named) ? named : undefined;
  // What is on screen now; a page opened from the list takes the reader to its title, as a new screen would.
  const showing = wide ? (page ?? FIRST_PAGE) : (page ?? 'list');
  const before = useRef<string | null>(null);
  const moved = before.current !== null && before.current !== showing;
  useEffect(() => {
    before.current = showing;
  });

  // The notification settings' old address, from links already sent.
  if (!named && location.hash === '#notifications') return <Navigate to={settingsPath('notifications')} replace />;
  if (named !== undefined && !page) return <Navigate to="/app/settings" replace />;

  if (wide) {
    const shown = page ?? FIRST_PAGE;
    return (
      <div className="container settings settings-wide">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <h1 className="settings-nav-title">{t('settings.title')}</h1>
          <SettingsIndex me={me} current={shown} />
        </nav>
        <div className="settings-pane">
          <SettingsPageView key={shown} page={shown} me={me} heading="h2" focus={moved} />
        </div>
      </div>
    );
  }

  if (page) {
    return (
      <div className="container container-narrow settings">
        <SettingsPageView key={page} page={page} me={me} heading="h1" back focus={moved} />
      </div>
    );
  }

  return (
    <div className="container container-narrow settings">
      <div className="page-header settings-head">
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>
      <SettingsIndex me={me} />
    </div>
  );
}

/** The account as Settings knows it, and how a page tells the list it changed something. */
interface MeState {
  user: MeProfile | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  onChanged: (patch: Partial<MeProfile>) => void;
}

interface Row {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: React.ReactNode;
  /** The value in words, for the search. */
  valueText?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  /** Names of what its page holds, so a search finds the row by them. */
  terms?: string[];
  page?: SettingsPage;
}

/** The list: a search, then the groups; while searching only matching rows remain, and empty groups go. */
function SettingsIndex({ me, current }: { me: MeState; current?: SettingsPage }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [theme] = useThemePreference();
  const [keyboard] = useKeyboardPrefs();
  const [query, setQuery] = useState('');

  const user = me.user;
  /** A value from the account: a short grey bar until it answers, nothing if it failed. */
  const fromAccount = (value: string | undefined): React.ReactNode =>
    user ? value : me.loading ? <Skeleton line w={64} className="settings-row-value-skeleton" /> : undefined;
  const username = user ? (
    // A handle reads left to right in every language, @ first.
    <span dir="ltr">@{user.username}</span>
  ) : undefined;

  const birth = user ? birthMonthText(t, user) : undefined;
  const language = APP_LOCALES.find((l) => l.code === locale)?.nativeName ?? locale;
  const visibility = user ? t(VIS_LABEL_KEY[user.profileVisibility]) : undefined;
  const leagues = user ? t(user.leaguesEnabled !== false ? 'settings.on' : 'settings.off') : undefined;

  const go = (page: SettingsPage): Pick<Row, 'to' | 'page'> => ({ to: settingsPath(page), page });

  const sections: Array<{ key: string; title?: string; rows: Row[] }> = [
    {
      key: 'account',
      title: t('settings.eyebrow'),
      rows: [
        {
          key: 'profile',
          icon: <ProfileIcon />,
          title: t('profile.edit'),
          to: '/app/profile/edit',
        },
        {
          key: 'username',
          icon: <AtIcon />,
          title: t('settings.username.title'),
          value: user ? username : fromAccount(undefined),
          valueText: user?.username,
          terms: [t('settings.username.change')],
          ...go('username'),
        },
        { key: 'birthMonth', icon: <CalendarIcon />, title: t('age.label'), value: fromAccount(birth), valueText: birth, ...go('birth-month') },
        { key: 'password', icon: <KeyIcon />, title: t('settings.password.title'), terms: [t('settings.password.change')], ...go('password') },
        {
          key: 'devices',
          icon: <DeviceIcon />,
          title: t('settings.devices.title'),
          terms: [t('settings.sessions.signOut'), t('settings.sessions.signOutEverywhere')],
          ...go('devices'),
        },
      ],
    },
    {
      key: 'preferences',
      title: t('settings.group.preferences'),
      rows: [
        { key: 'notifications', icon: <BellIcon />, title: t('notifications.title'), terms: [t('notifications.enableQuietHours')], ...go('notifications') },
        {
          key: 'language',
          icon: <LanguageIcon />,
          title: t('language.settingsTitle'),
          value: language,
          valueText: language,
          terms: APP_LOCALES.flatMap((l) => [l.nativeName, l.englishName]),
          ...go('language'),
        },
        {
          key: 'theme',
          icon: <ThemeIcon />,
          title: t('settings.appearance.title'),
          value: t(THEME_LABEL[theme]),
          valueText: t(THEME_LABEL[theme]),
          terms: THEME_PREFERENCES.map((p) => t(THEME_LABEL[p])),
          ...go('theme'),
        },
        {
          key: 'sounds',
          icon: <SpeakerIcon />,
          title: t('settings.soundsVibration'),
          terms: [t('settings.sounds.title'), t('settings.sounds.giftChime'), t('settings.sounds.lesson'), t('settings.sounds.characterVoices'), t('settings.vibration.title')],
          ...go('sounds'),
        },
        {
          key: 'keyboard',
          icon: <KeyboardIcon />,
          title: t('keyboard.settings.title'),
          value: t(ACCENT_LABEL[keyboard.accentMode]),
          valueText: t(ACCENT_LABEL[keyboard.accentMode]),
          terms: [t('keyboard.accent.title'), t('keyboard.keyBar.title'), t('keyboard.backtick.title'), t('keyboard.wordle.title'), t('keyboard.help')],
          ...go('keyboard'),
        },
        {
          key: 'leagues',
          icon: <TrophyIcon />,
          title: t('settings.leagues.title'),
          value: fromAccount(leagues),
          valueText: leagues,
          terms: [t('settings.leagues.toggle')],
          ...go('leagues'),
        },
      ],
    },
    {
      key: 'privacy',
      title: t('settings.group.privacy'),
      rows: [
        {
          key: 'visibility',
          icon: <EyeIcon size={22} />,
          title: t('settings.privacy.title'),
          value: fromAccount(visibility),
          valueText: visibility,
          terms: [t('settings.privacy.help'), ...VISIBILITIES.map((v) => t(VIS_LABEL_KEY[v]))],
          ...go('visibility'),
        },
        { key: 'blocked', icon: <BlockIcon />, title: t('settings.blocked.title'), ...go('blocked') },
        { key: 'reports', icon: <FlagIcon />, title: t('reports.mine.title'), to: MY_REPORTS_PATH },
        { key: 'standing', icon: <StandingIcon />, title: t('standing.title'), to: STANDING_PATH },
      ],
    },
    {
      key: 'about',
      title: t('settings.group.about'),
      rows: [
        { key: 'feedback', icon: <ChatsIcon />, title: t('appFeedback.settingsTitle'), ...go('feedback') },
        { key: 'faq', icon: <HelpIcon />, title: t('footer.faq'), to: '/faq' },
        { key: 'support', icon: <MailIcon />, title: t('settings.support'), subtitle: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
        { key: 'teaching', icon: <BookIcon />, title: t('footer.teach'), to: '/how-hevalo-teaches' },
        { key: 'terms', icon: <RulesIcon />, title: t('settings.terms'), to: '/terms' },
        { key: 'privacyPolicy', icon: <LockIcon />, title: t('settings.privacyPolicy'), to: '/privacy' },
        { key: 'copyright', icon: <CopyrightIcon />, title: t('footer.copyright'), to: '/copyright' },
      ],
    },
    {
      key: 'leave',
      rows: [
        { key: 'data', icon: <DownloadIcon />, title: t('settings.data.title'), terms: [t('settings.data.request')], ...go('data') },
        {
          key: 'signOut',
          icon: <SignOutIcon />,
          title: t('settings.sessions.signOut'),
          onClick: () => void logout().then(() => navigate('/')),
        },
        { key: 'delete', icon: <TrashIcon />, title: t('settings.delete.title'), destructive: true, ...go('delete') },
      ],
    },
  ];

  const q = searchable(query);
  const matches = (row: Row): boolean =>
    !q || [row.title, row.subtitle, row.valueText, ...(row.terms ?? [])].some((text) => text !== undefined && searchable(text).includes(q));
  const shown = sections.map((s) => ({ ...s, rows: s.rows.filter(matches) })).filter((s) => s.rows.length > 0);

  return (
    <div className="settings-list">
      <SettingsSearch value={query} onChange={setQuery} />
      {shown.length === 0 ? (
        <p className="settings-empty" role="status">
          {t('settings.search.none', { query: query.trim() })}
        </p>
      ) : (
        shown.map((s) => (
          <SettingsSection key={s.key} title={s.title}>
            {s.rows.map((row) => (
              <SettingsRow
                key={row.key}
                icon={row.icon}
                title={row.title}
                subtitle={row.subtitle}
                value={row.value}
                to={row.to}
                href={row.href}
                onClick={row.onClick}
                destructive={row.destructive}
                current={row.page !== undefined && row.page === current}
              />
            ))}
          </SettingsSection>
        ))
      )}
    </div>
  );
}

/** One page: its title and contents, with the way back to the list above the title on a phone. */
function SettingsPageView({
  page,
  me,
  heading,
  back = false,
  focus = false,
}: {
  page: SettingsPage;
  me: MeState;
  heading: 'h1' | 'h2';
  back?: boolean;
  /** Opened from the list rather than landed on, so focus goes to its title. */
  focus?: boolean;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const Heading = heading;
  const title = useRef<HTMLHeadingElement>(null);

  // Only on opening: the page is keyed by name, so this runs once per page.
  const focusOnOpen = useRef(focus);
  useEffect(() => {
    if (focusOnOpen.current) title.current?.focus({ preventScroll: true });
  }, []);

  /** A page needing the account waits for it in its own shape, and says so if it failed. */
  const needsAccount = (render: (user: MeProfile) => React.ReactNode): React.ReactNode =>
    me.user ? (
      render(me.user)
    ) : me.loading ? (
      <SkeletonRegion label={t('settings.loading')}>
        <div className="settings-page-skeleton">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} line w={['70%', '56%', '64%'][i]} />
          ))}
        </div>
      </SkeletonRegion>
    ) : (
      <ErrorState message={me.error ?? t('settings.unavailable')} onRetry={me.reload} />
    );

  let body: React.ReactNode;
  switch (page) {
    case 'username':
      body = <ChangeUsername onChanged={(name) => me.onChanged({ username: name })} />;
      break;
    case 'birth-month':
      body = needsAccount((user) => <BirthMonth user={user} />);
      break;
    case 'password':
      body = <ChangePassword />;
      break;
    case 'devices':
      body = <SignedInDevices />;
      break;
    case 'notifications':
      body = <NotificationPrefsCard />;
      break;
    case 'language':
      body = <Language current={me.user?.locale} />;
      break;
    case 'theme':
      body = <Appearance />;
      break;
    case 'sounds':
      body = (
        <>
          <GiftSoundSetting />
          <VibrationSetting />
        </>
      );
      break;
    case 'keyboard':
      body = <KeyboardCard />;
      break;
    case 'leagues':
      body = needsAccount((user) => (
        <Leagues enabled={user.leaguesEnabled !== false} minor={user.minor === true} onChanged={(on) => me.onChanged({ leaguesEnabled: on })} />
      ));
      break;
    case 'visibility':
      body = needsAccount((user) => (
        <Privacy current={user.profileVisibility} minor={user.minor === true} onChanged={(v) => me.onChanged({ profileVisibility: v })} />
      ));
      break;
    case 'blocked':
      body = <BlockedUsers />;
      break;
    case 'feedback':
      body = <SendFeedbackCard />;
      break;
    case 'data':
      body = <ExportData />;
      break;
    case 'delete':
      body = (
        <DangerZone
          onDeleted={() => {
            void logout().then(() => navigate('/'));
          }}
        />
      );
      break;
  }

  return (
    <section className={`settings-page settings-page-${page}`} aria-labelledby="settings-page-title">
      <div className="settings-page-head">
        {back && (
          <Link to="/app/settings" className="standing-back">
            <ArrowIcon size={16} className="standing-back-icon" /> {t('standing.backToSettings')}
          </Link>
        )}
        <Heading className={heading === 'h1' ? 'page-title' : 'settings-pane-title'} id="settings-page-title" ref={title} tabIndex={-1}>
          {t(PAGE_TITLE[page])}
        </Heading>
      </div>
      {/* The sounds page keeps its parts' headings, since it holds both sounds and vibration. */}
      <div className="settings-page-body" data-keep-headings={page === 'sounds' ? '' : undefined}>
        {body}
      </div>
    </section>
  );
}

/** The birth month on record as the reader says it ("March 2008"), or that there is none yet. */
function birthMonthText(t: Translate, user: MeProfile): string {
  const month = user.birthMonth ? MONTH_KEY[user.birthMonth - 1] : undefined;
  return month && user.birthYear ? `${t(month)} ${user.birthYear}` : t('settings.birthMonth.none');
}

/**
 * The birth month on record, given once. With none on record, the way to the one-time question, which the app shows
 * over every page once the account it holds says one is missing.
 */
function BirthMonth({ user }: { user: MeProfile }): React.JSX.Element {
  const t = useT();
  const { refreshUser } = useAuth();
  if (user.birthYear && user.birthMonth) {
    return (
      <>
        <p className="settings-birth-month">{birthMonthText(t, user)}</p>
        <p className="settings-page-intro">{t('settings.birthMonth.help', { email: SUPPORT_EMAIL })}</p>
      </>
    );
  }
  return (
    <>
      <p className="settings-page-intro">{t('age.prompt.body')}</p>
      <Button onClick={() => void refreshUser()}>{t('letters.refusal.birthMonthAction')}</Button>
    </>
  );
}

/**
 * The interface language: applied at once and saved to the account in the background, since waiting would feel broken
 * on a slow connection and a failed save is easily undone. Saved on the account so it follows you to other devices.
 * Each language is written in itself and in the current language, so someone in the wrong one can find theirs.
 */
function Language({ current }: { current?: string | null }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const { locale, setLocale } = useI18n();
  const t = useT();
  const [failed, setFailed] = useState(false);

  // Quick changes end in the last one (lib/optimistic.ts).
  const [chosen, want] = useOptimistic<AppLocale>(isAppLocale(current) ? current : locale, (next) => client.request('PATCH', '/me', { body: { locale: next } }), {
    // So /me carries the new value if this page is revisited.
    onSaved: () => void refreshUser(),
    // Revert rather than leave the interface in a language the account does not have.
    onFailed: (_, saved) => {
      setLocale(saved);
      setFailed(true);
    },
  });

  function change(next: AppLocale): void {
    setLocale(next);
    setFailed(false);
    want(next);
  }

  const name = APP_LOCALES.find((l) => l.code === locale)?.nativeName ?? locale;
  const options = useMemo(
    () =>
      APP_LOCALES.map((l) => {
        const here = locale === 'en' ? l.englishName : nameIn(locale, l.code);
        return {
          value: l.code as AppLocale,
          title: l.nativeName,
          lang: l.code,
          subtitle: here && searchable(here) !== searchable(l.nativeName) ? here : undefined,
        };
      }),
    [locale],
  );

  return (
    <>
      <p className="settings-page-intro">{t('language.settingsHelp')}</p>
      <SettingsChoices name="language" label={t('language.settingsTitle')} value={chosen} options={options} onChange={change} />
      <p className="settings-page-note" role="status">
        {failed ? <span className="settings-page-error">{t('language.failed')}</span> : t('language.savedTo', { language: name })}
      </p>
      {/* Emails still go out in English whatever the setting, so that is said plainly. */}
      {locale !== 'en' && <p className="settings-page-note">{t('language.partial')}</p>}
    </>
  );
}

/** A language's name in another language, where the browser knows it. */
function nameIn(locale: string, code: string): string | null {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Dark, light or the device's setting, applied at once and kept per device, since it is about the screen in front of you. */
function Appearance(): React.JSX.Element {
  const t = useT();
  const [preference, setPreference] = useThemePreference();
  return (
    <>
      <p className="settings-page-intro">{t('settings.appearance.help')}</p>
      <SettingsChoices
        name="theme"
        label={t('settings.appearance.title')}
        value={preference}
        options={THEME_PREFERENCES.map((p) => ({ value: p, title: t(THEME_LABEL[p]) }))}
        onChange={setPreference}
      />
    </>
  );
}

/**
 * In or out of the weekly leagues in one tap, since a leaderboard that cannot be left is pressure the app avoids.
 * Leaving takes effect at once (off this week's table) and changes nothing else earned. Minors start out and are told
 * why.
 */
function Leagues({ enabled, minor, onChanged }: { enabled: boolean; minor: boolean; onChanged: (on: boolean) => void }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const [on, want] = useOptimistic(enabled, (next) => client.request('PATCH', '/me', { body: { leaguesEnabled: next } }), {
    onSaved: (_, sent) => {
      setMsg(t('common.saved'));
      onChanged(sent);
      void refreshUser();
    },
    onFailed: (error) => setMsg(failureText(error, t)),
  });

  function change(next: boolean): void {
    setMsg(null);
    want(next);
  }

  return (
    <>
      <p className="settings-page-intro">{t('settings.leagues.help')}</p>
      <SettingsSwitch title={t('settings.leagues.toggle')} checked={on} onChange={change} />
      {minor && <p className="settings-page-note">{t('settings.leagues.minorHint')}</p>}
      {msg && (
        <p className="settings-page-note" role="status">
          {msg}
        </p>
      )}
    </>
  );
}

/** Profile visibility as four rows, each with what it means, so "everyone here" and "everyone at all" are read before choosing. */
function Privacy({ current, minor, onChanged }: { current: Visibility; minor: boolean; onChanged: (v: Visibility) => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const [vis, want] = useOptimistic<Visibility>(current, (next) => client.request('PUT', '/me/privacy', { body: { visibility: next } }), {
    onSaved: (_, sent) => {
      setMsg(t('common.saved'));
      onChanged(sent);
    },
    onFailed: (error) => setMsg(failureText(error, t)),
  });

  function change(next: Visibility): void {
    setMsg(null);
    want(next);
  }

  return (
    <>
      <p className="settings-page-intro">{t('settings.privacy.help')}</p>
      <SettingsChoices
        name="visibility"
        label={t('settings.privacy.title')}
        value={vis}
        options={VISIBILITIES.map((v) => ({
          value: v,
          title: t(VIS_LABEL_KEY[v]),
          subtitle: t(VIS_HINT_KEY[v]),
          // Under 18 a profile is never public; the server refuses it too.
          disabled: minor && v === 'everyone',
        }))}
        onChange={change}
      />
      {minor && <p className="settings-page-note">{t('settings.visibility.minorHint')}</p>}
      {msg && (
        <p className="settings-page-note" role="status">
          {msg}
        </p>
      )}
    </>
  );
}

function ExportData(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  return (
    <>
      <p className="settings-page-intro">{t('settings.data.help')}</p>
      {state === 'done' ? (
        <div className="msg msg-success">{t('settings.data.requested')}</div>
      ) : (
        <Button
          variant="secondary"
          disabled={state === 'sending'}
          onClick={() => {
            setState('sending');
            void client.post('/me/export').then((r) => setState(r.ok ? 'done' : 'error'));
          }}
        >
          {state === 'sending' ? t('settings.data.requesting') : t('settings.data.request')}
        </Button>
      )}
      {state === 'error' && <div className="msg msg-error" style={{ marginTop: 10 }}>{t('settings.data.failed')}</div>}
    </>
  );
}

function DangerZone({ onDeleted }: { onDeleted: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.delete<{ deletionScheduled: boolean; graceDays: number }>('/me');
    setBusy(false);
    if (res.ok) onDeleted();
    else setError(describeError(res.error, t));
  }

  return (
    <>
      <p className="settings-page-intro">{t('settings.delete.help')}</p>
      {error && <div className="msg msg-error">{error}</div>}
      {confirming ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          <button type="button" className="btn btn-danger btn-sm" onClick={del} disabled={busy}>
            {busy ? t('settings.delete.deleting') : t('settings.delete.confirm')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm btn-danger-text" onClick={() => setConfirming(true)}>
          {t('settings.delete.title')}
        </button>
      )}
    </>
  );
}
