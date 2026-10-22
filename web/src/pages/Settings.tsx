import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { MeProfile } from '../lib/types';
import { ErrorState } from '../components/states';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { Button } from '../components/Button';
import {
  ArrowIcon,
  BellIcon,
  BlockIcon,
  BookIcon,
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
import { BlockedUsers } from '../settings/BlockedUsers';
import { ChangePassword } from '../settings/ChangePassword';
import { SignedInDevices } from '../settings/SignedInDevices';
import { SettingsChoices, SettingsRow, SettingsSearch, SettingsSection, SettingsSwitch, searchable } from '../settings/SettingsList';
import { GiftSoundSetting } from '../gifts/GiftSoundSetting';
import { VibrationSetting } from '../settings/VibrationSetting';
import { NotificationPrefsCard } from '../notifications/NotificationPrefsCard';
import { APP_LOCALES, isAppLocale, type AppLocale } from '@kurda/shared';
import { useI18n, useT } from '../i18n/I18nProvider';
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
 * 'Everyone' has to say *the web*, out loud.
 *
 * Hevalo can be read without an account, so the widest setting is genuinely
 * public — findable, linkable, readable by someone who never signed up. A chip
 * labelled "Everyone" reads like "everyone here", which is what 'Members' is,
 * and nobody should learn the difference after the fact.
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

/** Where to write to a person about anything at all. */
export const SUPPORT_EMAIL = 'support@hevalo.app';

/** Every page Settings opens, each at /app/settings/<page>. */
const PAGES = [
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

/** What a wide screen shows beside the list before anything is picked: the page most often looked for. */
const FIRST_PAGE: SettingsPage = 'notifications';

/** At this width the list and the page open from it sit side by side. */
const WIDE = '(min-width: 960px)';

export const settingsPath = (page: SettingsPage): string => `/app/settings/${page}`;

/** Which page the address names: /app/settings/<page>, or none for the list itself. */
function pageOf(pathname: string): string | undefined {
  return /^\/app\/settings\/([^/]+)\/?$/.exec(pathname)?.[1];
}

/**
 * Settings, as a list.
 *
 * It used to be every setting at once: fifteen boxes down one page, each with
 * its controls open, so finding one meant reading past all the others. Now it
 * is a short list in five groups — your account, how Hevalo behaves for you,
 * who can see you, about Hevalo, and leaving — each row saying what it is set
 * to, and one tap from its own page. On a wide screen the list stays on the
 * start side and the page opens beside it.
 *
 * Signing out and deleting the account are the last rows, apart from the
 * rest, deleting in red and behind a second step: what cannot be undone
 * should be found when looked for, not met on the way to something else.
 */
export function Settings(): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  const wide = useMediaQuery(WIDE);
  const { data, loading, error, reload } = useApiGet<{ user: MeProfile }>('/me');
  // what has been changed here since /me answered, so the list says it at once
  const [changed, setChanged] = useState<Partial<MeProfile>>({});
  const user = data ? { ...data.user, ...changed } : null;
  const me: MeState = { user, loading, error, reload, onChanged: (patch) => setChanged((c) => ({ ...c, ...patch })) };

  const named = pageOf(location.pathname);
  const page = isPage(named) ? named : undefined;
  // what is on screen now, and whether it is not what was there a moment ago: a
  // page opened from the list puts the reader at its title, as a new screen would
  const showing = wide ? (page ?? FIRST_PAGE) : (page ?? 'list');
  const before = useRef<string | null>(null);
  const moved = before.current !== null && before.current !== showing;
  useEffect(() => {
    before.current = showing;
  });

  // the old address of the notification settings, from links already sent
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

/** The account as Settings knows it, and how to tell the list a page has changed it. */
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
  /** the value as words, for the search */
  valueText?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  /** the names of what its page holds, so a search finds the row by them */
  terms?: string[];
  page?: SettingsPage;
}

/**
 * The list: a search, then the groups. While something is typed only the
 * rows that match are left, in their groups, and a group with none is gone.
 */
function SettingsIndex({ me, current }: { me: MeState; current?: SettingsPage }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [theme] = useThemePreference();
  const [keyboard] = useKeyboardPrefs();
  const [query, setQuery] = useState('');

  const user = me.user;
  /** a value that needs the account: a short grey bar until it has answered, nothing if it could not */
  const fromAccount = (value: string | undefined): React.ReactNode =>
    user ? value : me.loading ? <Skeleton line w={64} className="settings-row-value-skeleton" /> : undefined;
  const username = user ? (
    // a handle reads left to right in every language, @ first
    <span dir="ltr">@{user.username}</span>
  ) : undefined;

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
          value: user ? username : fromAccount(undefined),
          valueText: user?.username,
          to: '/app/profile/edit',
        },
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
          terms: [t('settings.sounds.title'), t('settings.sounds.giftChime'), t('settings.sounds.lesson'), t('settings.vibration.title')],
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

/**
 * One page: its title, and what it holds. On a phone it has the way back
 * to the list above its title; on a wide screen the list is beside it.
 */
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
  /** opened from the list rather than landed on: the reader is taken to its title */
  focus?: boolean;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const Heading = heading;
  const title = useRef<HTMLHeadingElement>(null);

  // only when it opens: the page is keyed on its name, so this is once per page
  const focusOnOpen = useRef(focus);
  useEffect(() => {
    if (focusOnOpen.current) title.current?.focus({ preventScroll: true });
  }, []);

  /** a page that needs the account waits for it, in its own shape, and says so if it could not have it */
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
      {/* the sounds page keeps its parts' own headings: it holds two things, sounds and vibration */}
      <div className="settings-page-body" data-keep-headings={page === 'sounds' ? '' : undefined}>
        {body}
      </div>
    </section>
  );
}

/**
 * The language Hevalo speaks to you in.
 *
 * Applied the moment it is chosen and saved to the account in the background,
 * rather than the other way round: waiting for a round trip before the list
 * changes would make choosing a language feel broken on a slow connection, and
 * the change is trivially reversible if the save fails.
 *
 * It is stored on the account rather than only in this browser so that it
 * follows you — signing in on a borrowed laptop should not mean choosing again.
 * Each language is written in itself, and under it in the language now on
 * screen, so someone who landed in the wrong one can still find their own.
 */
function Language({ current }: { current?: string | null }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const { locale, setLocale } = useI18n();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const chosen = isAppLocale(current) && !busy && !failed ? current : locale;

  async function change(next: AppLocale): Promise<void> {
    const previous = locale;
    setLocale(next);
    setBusy(true);
    setFailed(false);
    const res = await client.request('PATCH', '/me', { body: { locale: next } });
    setBusy(false);
    if (res.ok) {
      // so /me carries the new value if this page is revisited
      await refreshUser();
      return;
    }
    // put it back rather than leaving the interface in a language the account
    // does not actually have — the next reload would undo it anyway
    setLocale(previous);
    setFailed(true);
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
      <SettingsChoices name="language" label={t('language.settingsTitle')} value={chosen} options={options} onChange={(next) => void change(next)} disabled={busy} />
      <p className="settings-page-note" role="status">
        {failed ? <span className="settings-page-error">{t('language.failed')}</span> : busy ? null : t('language.savedTo', { language: name })}
      </p>
      {/*
        Said plainly rather than discovered. The screens are translated now, so
        this no longer warns about them — but emails still render in English
        whatever the account is set to, and somebody who picks Kurdish and then
        gets an English email should know that is a gap being filled, not a bug.
      */}
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

/**
 * Dark, light, or whatever this device is set to.
 *
 * Applied the moment it is chosen and kept on this device rather than the
 * account: it is about the screen in front of you, and the same person may
 * want light on a laptop by day and dark on a phone at night.
 */
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
 * In or out of the weekly leagues, in one tap.
 *
 * A league ranks you against strangers by XP every week. That suits some
 * people and puts others off learning, and a leaderboard that cannot be left is
 * the kind of pressure the rest of the app tries not to apply. Leaving takes
 * effect at once — you drop out of this week's table — and nothing else you
 * have earned changes. A minor starts out of them and is told why.
 */
function Leagues({ enabled, minor, onChanged }: { enabled: boolean; minor: boolean; onChanged: (on: boolean) => void }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const t = useT();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function change(next: boolean): Promise<void> {
    setOn(next);
    setBusy(true);
    setMsg(null);
    const res = await client.request('PATCH', '/me', { body: { leaguesEnabled: next } });
    setBusy(false);
    if (res.ok) {
      setMsg(t('common.saved'));
      onChanged(next);
      await refreshUser();
    } else {
      setOn(!next);
      setMsg(describeError(res.error, t));
    }
  }

  return (
    <>
      <p className="settings-page-intro">{t('settings.leagues.help')}</p>
      <SettingsSwitch title={t('settings.leagues.toggle')} checked={on} disabled={busy} onChange={(next) => void change(next)} />
      {minor && <p className="settings-page-note">{t('settings.leagues.minorHint')}</p>}
      {msg && (
        <p className="settings-page-note" role="status">
          {msg}
        </p>
      )}
    </>
  );
}

/**
 * Who can see your profile, as four rows with what each one means written
 * under it: the difference between "everyone here" and "everyone at all" is
 * read before the choice, not learned after it.
 */
function Privacy({ current, minor, onChanged }: { current: Visibility; minor: boolean; onChanged: (v: Visibility) => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [vis, setVis] = useState<Visibility>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function change(next: Visibility): Promise<void> {
    const before = vis;
    setVis(next);
    setBusy(true);
    setMsg(null);
    const res = await client.request('PUT', '/me/privacy', { body: { visibility: next } });
    setBusy(false);
    if (res.ok) {
      setMsg(t('common.saved'));
      onChanged(next);
    } else {
      setVis(before);
      setMsg(describeError(res.error, t));
    }
  }

  return (
    <>
      <p className="settings-page-intro">{t('settings.privacy.help')}</p>
      <SettingsChoices
        name="visibility"
        label={t('settings.privacy.title')}
        value={vis}
        disabled={busy}
        options={VISIBILITIES.map((v) => ({
          value: v,
          title: t(VIS_LABEL_KEY[v]),
          subtitle: t(VIS_HINT_KEY[v]),
          // under 18 a profile is never on the open web; the server refuses
          // it too, this just does not offer it
          disabled: minor && v === 'everyone',
        }))}
        onChange={(v) => void change(v)}
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
