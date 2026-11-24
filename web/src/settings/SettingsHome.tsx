import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_LOCALES } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  BellIcon,
  BlockIcon,
  BookIcon,
  CalendarIcon,
  ChatsIcon,
  ChevronIcon,
  CopyrightIcon,
  DeviceIcon,
  DownloadIcon,
  EyeIcon,
  FlagIcon,
  HelpIcon,
  KeyIcon,
  KeyboardIcon,
  LanguageIcon,
  LockIcon,
  MailIcon,
  ParentalIcon,
  ProfileIcon,
  RulesIcon,
  SafetyIcon,
  SearchIcon,
  SignOutIcon,
  SpeakerIcon,
  StandingIcon,
  TextIcon,
  ThemeIcon,
  TrashIcon,
  TrophyIcon,
  AtIcon,
  WaveformIcon,
  StarIcon,
} from '../components/icons';
import { useT, type Translate } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { useApiGet } from '../lib/useApi';
import { useMediaQuery } from '../lib/useMediaQuery';
import { lessonSoundsOn, playLessonSound, setLessonSounds, subscribeLessonSounds } from '../lib/sounds';
import { PHONE_CHROME } from '../layouts/roots';
import { stepsBackOutOf } from '../layouts/trail';
import { useAsksBeforeLeaving } from '../layouts/BackButton';
import { MY_REPORTS_PATH, STANDING_PATH } from '../reports/restriction';
import { THEME_PREFERENCES, useThemePreference, type ThemePreference } from '../theme/theme';
import { ACCENT_LABEL } from '../keyboard/KeyboardSettings';
import { useKeyboardPrefs } from '../keyboard/prefs';
import { personName, roleOf, type ParentalOverview } from '../parental/api';
import { CrossFade } from './CrossFade';
import { SettingsRow, SettingsSearch, searchable } from './SettingsList';
import { PAGE_TITLE, SETTINGS_HOME, SUPPORT_EMAIL, settingsPath, type MeState, type SettingsCategory, type SettingsPage } from './catalogue';

/**
 * Settings' home: the way back, the title and a search over every setting at the top; two quick tiles for what is
 * changed most (sounds on or off, and light or dark); then the ten categories as one flat list, each naming what is
 * inside it, and signing out at the foot. On a wide screen it stays beside whichever page is open.
 */

export const THEME_LABEL: Record<ThemePreference, MessageKey> = {
  dark: 'settings.appearance.dark',
  light: 'settings.appearance.light',
  system: 'settings.appearance.system',
};

/** The Appearance tile's turn: Automatic, then Light, then Dark, and round again. */
const THEME_CYCLE: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

/** The account's standing, as far as the list needs it: anything but good wants a look. */
interface StandingGlance {
  status?: string;
}

/** Whether the account has a limit on it, read from the memory of the standing page's answer. */
export function useLimited(): boolean {
  const { data } = useApiGet<StandingGlance>('/me/standing');
  return typeof data?.status === 'string' && data.status !== 'good';
}

/** The web build, when the deploy names one. */
const BUILD = (import.meta.env.VITE_APP_VERSION ?? '').trim();

export function SettingsHome({
  me,
  parental,
  current,
}: {
  me: MeState;
  /** Who is connected, for the parental row's line; null until known. */
  parental: ParentalOverview | null;
  /** The category open beside the list on a wide screen. */
  current?: SettingsCategory;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const phone = useMediaQuery(PHONE_CHROME);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const limited = useLimited();

  // Closing the search hands focus back to the button that opened it.
  const searchButton = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  const closeSearch = (): void => {
    closed.current = true;
    setSearching(false);
    setQuery('');
  };
  useEffect(() => {
    if (searching || !closed.current) return;
    closed.current = false;
    searchButton.current?.focus();
  }, [searching]);
  // The phone bar's back closes the search before it leaves the page.
  useAsksBeforeLeaving(searching ? closeSearch : null);

  function leave(): void {
    const steps = stepsBackOutOf(SETTINGS_HOME);
    if (steps !== null) navigate(steps);
    else navigate('/app/profile', { replace: true });
  }

  const categories = categoryRows(t, parental, limited);
  const q = searchable(query);

  return (
    <div className="settings-home">
      <div className={`settings-bar${searching ? ' is-searching' : ''}`}>
        {searching ? (
          <>
            <SettingsSearch value={query} onChange={setQuery} onEscape={closeSearch} />
            <button type="button" className="btn btn-ghost settings-bar-cancel" onClick={closeSearch}>
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            {/* On a phone the bar above already has the way back, in the same place. */}
            {phone ? (
              <span className="settings-circle-room" aria-hidden="true" />
            ) : (
              <button type="button" className="icon-btn settings-circle" aria-label={t('report.back')} onClick={leave}>
                <ChevronIcon size={20} className="back-chevron" />
              </button>
            )}
            <h1 className="settings-bar-title">{t('settings.title')}</h1>
            <button ref={searchButton} type="button" className="icon-btn settings-circle" aria-label={t('settings.search')} onClick={() => setSearching(true)}>
              <SearchIcon size={20} />
            </button>
          </>
        )}
      </div>

      {q ? (
        <SearchResults query={q} me={me} raw={query.trim()} />
      ) : (
        <div className="settings-home-body">
          <QuickTiles />
          <ul className="settings-rows settings-cats">
            {categories.map((c) => (
              <SettingsRow
                key={c.key}
                className="settings-cat"
                icon={c.icon}
                title={t(PAGE_TITLE[c.key])}
                subtitle={c.subtitle}
                value={c.value}
                attention={c.attention}
                to={settingsPath(c.key)}
                current={current === c.key}
              />
            ))}
          </ul>
          <ul className="settings-rows settings-leave">
            <SettingsRow icon={<SignOutIcon size={24} />} title={t('settings.sessions.signOut')} onClick={() => void logout().then(() => navigate('/'))} />
          </ul>
          <p className="settings-version">{BUILD ? `${t('settings.versionLine')} · ${BUILD}` : t('settings.versionLine')}</p>
        </div>
      )}
    </div>
  );
}

interface CategoryRow {
  key: SettingsCategory;
  icon: React.ReactNode;
  subtitle: string;
  value?: string;
  attention?: boolean;
}

/** The ten categories, each with what is inside it; parental controls say who is connected once that is known. */
function categoryRows(t: Translate, overview: ParentalOverview | null, limited: boolean): CategoryRow[] {
  const role = roleOf(overview);
  const parents = role === 'teen' ? (overview?.parents ?? []) : [];
  const teens = role === 'parent' ? (overview?.teens ?? []) : [];
  const parental =
    parents.length >= 2
      ? t('parental.sub.connectedTwo', { name: personName(parents[0]!), other: personName(parents[1]!) })
      : parents.length === 1
        ? t('parental.sub.connected', { name: personName(parents[0]!) })
        : teens.length === 1
          ? t('parental.sub.teenOne')
          : teens.length > 1
            ? t('parental.sub.teens', { count: teens.length })
            : t('parental.sub');
  return [
    { key: 'account', icon: <ProfileIcon size={24} />, subtitle: t('settings.account.sub') },
    { key: 'parental', icon: <ParentalIcon size={24} />, subtitle: parental },
    { key: 'display', icon: <TextIcon size={24} />, subtitle: t('settings.display.sub') },
    { key: 'privacy', icon: <LockIcon size={24} />, subtitle: t('settings.social.sub') },
    { key: 'sounds', icon: <WaveformIcon size={24} />, subtitle: t('settings.sounds.sub') },
    { key: 'notifications', icon: <BellIcon size={24} />, subtitle: t('notifications.sub') },
    {
      key: 'safety',
      icon: <SafetyIcon size={24} />,
      subtitle: t('settings.safety.sub'),
      value: limited ? t('settings.safety.limited') : undefined,
      attention: limited,
    },
    { key: 'storage', icon: <DownloadIcon size={24} />, subtitle: t('settings.storage.sub') },
    { key: 'help', icon: <HelpIcon size={24} />, subtitle: t('settings.help.sub') },
    { key: 'about', icon: <BookIcon size={24} />, subtitle: t('settings.about.sub') },
  ];
}

/**
 * Sounds on or off, and Automatic, Light or Dark, each a tap away. Turning sounds on plays the chime they are about; a
 * new value fades in over the old one.
 */
function QuickTiles(): React.JSX.Element {
  const t = useT();
  const sounds = useSyncExternalStore(subscribeLessonSounds, lessonSoundsOn);
  const [theme, setTheme] = useThemePreference();
  return (
    <div className="settings-tiles">
      <button
        type="button"
        role="switch"
        aria-checked={sounds}
        // Named by what it switches; on or off is its state, not its name.
        aria-label={t('settings.sounds.title')}
        className={`settings-tile${sounds ? ' is-on' : ''}`}
        onClick={() => {
          setLessonSounds(!sounds);
          if (!sounds) playLessonSound('correct');
        }}
      >
        <SpeakerIcon size={26} className="settings-tile-icon" />
        <span className="settings-tile-name">{t('settings.sounds.title')}</span>
        <CrossFade className="settings-tile-value" value={t(sounds ? 'settings.on' : 'settings.off')} />
      </button>
      <button type="button" className="settings-tile" onClick={() => setTheme(THEME_CYCLE[theme])}>
        <ThemeIcon size={26} className="settings-tile-icon" />
        <span className="settings-tile-name">{t('settings.appearance.title')}</span>
        <CrossFade className="settings-tile-value" value={t(THEME_LABEL[theme])} />
      </button>
    </div>
  );
}

interface Found {
  key: string;
  icon: React.ReactNode;
  title: string;
  /** The page it is on. */
  page: SettingsPage;
  to?: string;
  href?: string;
  /** Names of what it holds, so a search finds it by them. */
  terms?: string[];
}

/** Every setting there is, each under the page it lives on. */
function everySetting(t: Translate, me: MeState, theme: ThemePreference, accent: MessageKey): Found[] {
  const go = (page: SettingsPage): Pick<Found, 'to'> => ({ to: settingsPath(page) });
  return [
    { key: 'profile', icon: <ProfileIcon />, title: t('profile.edit'), page: 'account', to: '/app/profile/edit' },
    { key: 'username', icon: <AtIcon />, title: t('settings.username.title'), page: 'account', terms: [t('settings.username.change'), me.user?.username ?? ''], ...go('username') },
    { key: 'birth', icon: <CalendarIcon />, title: t('age.label'), page: 'account', ...go('birth-month') },
    { key: 'password', icon: <KeyIcon />, title: t('settings.password.title'), page: 'account', terms: [t('settings.password.change')], ...go('password') },
    {
      key: 'devices',
      icon: <DeviceIcon />,
      title: t('settings.devices.title'),
      page: 'account',
      terms: [t('settings.sessions.signOut'), t('settings.sessions.signOutEverywhere')],
      ...go('devices'),
    },
    { key: 'delete', icon: <TrashIcon />, title: t('settings.delete.title'), page: 'account', ...go('delete') },
    {
      key: 'parental',
      icon: <ParentalIcon />,
      title: t('parental.title'),
      page: 'parental',
      terms: [t('parental.limit.title'), t('parental.bedtime.title'), t('parental.connect'), t('parental.addTeen')],
      ...go('parental'),
    },
    {
      key: 'language',
      icon: <LanguageIcon />,
      title: t('language.settingsTitle'),
      page: 'display',
      terms: APP_LOCALES.flatMap((l) => [l.nativeName, l.englishName]),
      ...go('language'),
    },
    {
      key: 'theme',
      icon: <ThemeIcon />,
      title: t('settings.appearance.title'),
      page: 'display',
      terms: [t(THEME_LABEL[theme]), ...THEME_PREFERENCES.map((p) => t(THEME_LABEL[p]))],
      ...go('theme'),
    },
    {
      key: 'keyboard',
      icon: <KeyboardIcon />,
      title: t('keyboard.settings.title'),
      page: 'display',
      terms: [t(accent), t('keyboard.accent.title'), t('keyboard.keyBar.title'), t('keyboard.backtick.title'), t('keyboard.wordle.title'), t('keyboard.help')],
      ...go('keyboard'),
    },
    {
      key: 'visibility',
      icon: <EyeIcon size={22} />,
      title: t('settings.privacy.title'),
      page: 'privacy',
      terms: [t('settings.privacy.help'), t('settings.visibility.everyone'), t('settings.visibility.members'), t('settings.visibility.friends'), t('settings.visibility.nobody')],
      ...go('visibility'),
    },
    { key: 'blocked', icon: <BlockIcon />, title: t('settings.blocked.title'), page: 'privacy', ...go('blocked') },
    { key: 'leagues', icon: <TrophyIcon />, title: t('settings.leagues.title'), page: 'privacy', terms: [t('settings.leagues.toggle')], ...go('leagues') },
    {
      key: 'sounds',
      icon: <SpeakerIcon />,
      title: t('settings.sounds.title'),
      page: 'sounds',
      terms: [t('settings.sounds.giftChime'), t('settings.sounds.lesson'), t('settings.sounds.autoplay'), t('settings.sounds.characterVoices')],
      ...go('sounds'),
    },
    { key: 'vibration', icon: <WaveformIcon />, title: t('settings.vibration.title'), page: 'sounds', terms: [t('settings.vibration.toggle')], ...go('sounds') },
    {
      key: 'notifications',
      icon: <BellIcon />,
      title: t('notifications.title'),
      page: 'notifications',
      terms: [t('notifications.quietHours'), t('notifications.enableQuietHours'), t('notifications.pref.streak'), t('notifications.pref.letters')],
      ...go('notifications'),
    },
    { key: 'reports', icon: <FlagIcon />, title: t('reports.mine.title'), page: 'safety', to: MY_REPORTS_PATH },
    { key: 'standing', icon: <StandingIcon />, title: t('standing.title'), page: 'safety', to: STANDING_PATH },
    { key: 'cache', icon: <DeviceIcon />, title: t('settings.cache.clear'), page: 'storage', terms: [t('settings.cache.title')], ...go('storage') },
    { key: 'data', icon: <DownloadIcon />, title: t('settings.data.request'), page: 'storage', terms: [t('settings.data.title')], ...go('storage') },
    { key: 'feedback', icon: <ChatsIcon />, title: t('appFeedback.settingsTitle'), page: 'help', ...go('feedback') },
    { key: 'faq', icon: <HelpIcon />, title: t('footer.faq'), page: 'help', to: '/faq' },
    { key: 'support', icon: <MailIcon />, title: t('settings.support'), page: 'help', href: `mailto:${SUPPORT_EMAIL}`, terms: [SUPPORT_EMAIL] },
    { key: 'teaching', icon: <BookIcon />, title: t('footer.teach'), page: 'about', to: '/how-hevalo-teaches' },
    { key: 'aboutHevalo', icon: <BookIcon />, title: t('settings.group.about'), page: 'about', to: '/about' },
    { key: 'terms', icon: <RulesIcon />, title: t('settings.terms'), page: 'about', to: '/terms' },
    { key: 'privacyPolicy', icon: <LockIcon />, title: t('settings.privacyPolicy'), page: 'about', to: '/privacy' },
    { key: 'copyright', icon: <CopyrightIcon />, title: t('footer.copyright'), page: 'about', to: '/copyright' },
    { key: 'credits', icon: <StarIcon size={22} />, title: t('about.creditsTitle'), page: 'about', to: '/about#credits' },
  ];
}

/** The settings whose names, values or contents hold the query, each with the page it is on under it. */
function SearchResults({ query, raw, me }: { query: string; raw: string; me: MeState }): React.JSX.Element {
  const t = useT();
  const [theme] = useThemePreference();
  const [keyboard] = useKeyboardPrefs();
  const found = everySetting(t, me, theme, ACCENT_LABEL[keyboard.accentMode]).filter((f) =>
    [f.title, t(PAGE_TITLE[f.page]), ...(f.terms ?? [])].some((text) => text && searchable(text).includes(query)),
  );
  if (found.length === 0) {
    return (
      <p className="settings-empty" role="status">
        {t('settings.search.none', { query: raw })}
      </p>
    );
  }
  return (
    <ul className="settings-rows settings-results" aria-label={t('settings.search')}>
      {found.map((f) => (
        <SettingsRow key={f.key} icon={f.icon} title={f.title} subtitle={t(PAGE_TITLE[f.page])} to={f.to} href={f.href} />
      ))}
    </ul>
  );
}
