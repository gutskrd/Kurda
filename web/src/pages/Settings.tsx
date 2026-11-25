import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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
  AtIcon,
  BlockIcon,
  GiftIcon,
  BookIcon,
  CalendarIcon,
  ChatsIcon,
  CopyrightIcon,
  DeviceIcon,
  EyeIcon,
  FlagIcon,
  HelpIcon,
  KeyIcon,
  KeyboardIcon,
  LanguageIcon,
  LockIcon,
  MailIcon,
  ProfileIcon,
  RulesIcon,
  SignOutIcon,
  StandingIcon,
  StarIcon,
  ThemeIcon,
  TrashIcon,
  TrophyIcon,
} from '../components/icons';
import { MONTH_KEY } from '../auth/BirthMonthFields';
import { BlockedUsers } from '../settings/BlockedUsers';
import { ChangePassword } from '../settings/ChangePassword';
import { ChangeUsername } from '../settings/ChangeUsername';
import { SignedInDevices } from '../settings/SignedInDevices';
import { SettingsChoices, SettingsFrame, SettingsRow, SettingsSection, SettingsSwitch, searchable } from '../settings/SettingsList';
import { SettingsHome, THEME_LABEL, useLimited } from '../settings/SettingsHome';
import { StorageData } from '../settings/StorageData';
import {
  LEAF_CATEGORY,
  MOVED,
  PAGE_TITLE,
  SETTINGS_HOME,
  SUPPORT_EMAIL,
  categoryOf,
  isLeaf,
  isSettingsPage,
  readSettingsPath,
  settingsPath,
  type MeState,
  type SettingsPage,
} from '../settings/catalogue';
import { GiftSoundSetting } from '../gifts/GiftSoundSetting';
import { GiftLimitSetting } from '../gifts/GiftLimitSetting';
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
import { THEME_PREFERENCES, useThemePreference } from '../theme/theme';
import { PARENTAL_PATH, type ParentalOverview } from '../parental/api';
import { ParentalSettings } from '../parental/ParentalSettings';

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

/** The page shown beside the list on a wide screen before one is picked: the one most often looked for. */
const FIRST_PAGE: SettingsPage = 'notifications';

/** From this width the list and its page sit side by side. */
const WIDE = '(min-width: 960px)';

/**
 * Settings: a home of quick tiles and ten categories (settings/SettingsHome.tsx), each category a page of the rows it
 * holds, and each row its own page, at /app/settings/<page>; on a wide screen the open page sits beside the home.
 * Parental controls keep their own pages under theirs. Old addresses still land.
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
  // Read once for the home's line under Parental controls and for the page itself, so both say the same.
  const parental = useApiGet<ParentalOverview>(PARENTAL_PATH);

  const { page: named, rest } = readSettingsPath(location.pathname);
  const page = isSettingsPage(named) ? named : undefined;
  // What is on screen now; a page opened from the list takes the reader to its title, as a new screen would.
  const showing = wide ? `${page ?? FIRST_PAGE}/${rest}` : page ? `${page}/${rest}` : 'home';
  const before = useRef<string | null>(null);
  const moved = before.current !== null && before.current !== showing;
  useEffect(() => {
    before.current = showing;
  });

  // The notification settings' old address, from links already sent.
  if (!named && location.hash === '#notifications') return <Navigate to={settingsPath('notifications')} replace />;
  if (named && MOVED[named]) return <Navigate to={{ pathname: settingsPath(MOVED[named]), search: location.search }} replace />;
  if (named !== undefined && !page) return <Navigate to={SETTINGS_HOME} replace />;
  // Only parental controls have pages of their own below them.
  if (page && rest && page !== 'parental') return <Navigate to={settingsPath(page)} replace />;

  if (wide) {
    const shown = page ?? FIRST_PAGE;
    return (
      <div className="container settings settings-wide">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <SettingsHome me={me} parental={parental.data} current={categoryOf(shown)} />
        </nav>
        <div className="settings-pane">
          <SettingsPageView key={shown} page={shown} rest={rest} me={me} parental={parental} heading="h2" single={false} focus={moved} />
        </div>
      </div>
    );
  }

  if (page) {
    return (
      <div className="container container-narrow settings">
        <SettingsPageView key={page} page={page} rest={rest} me={me} parental={parental} heading="h1" single focus={moved} />
      </div>
    );
  }

  return (
    <div className="container container-narrow settings">
      <SettingsHome me={me} parental={parental.data} />
    </div>
  );
}

/**
 * One page: a category's rows or a setting's controls, under its title. On a phone a category goes back to the home and
 * a setting to its category; beside the list only a setting needs a way back, to its category.
 */
function SettingsPageView({
  page,
  rest,
  me,
  parental,
  heading,
  single,
  focus,
}: {
  page: SettingsPage;
  rest: string;
  me: MeState;
  parental: ReturnType<typeof useApiGet<ParentalOverview>>;
  heading: 'h1' | 'h2';
  /** A phone, where the list is not beside the page. */
  single: boolean;
  /** Opened from the list rather than landed on, so focus goes to its title. */
  focus: boolean;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();

  if (page === 'parental') return <ParentalSettings rest={rest} overview={parental} heading={heading} single={single} focus={focus} />;

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
    case 'account':
      body = <AccountRows me={me} />;
      break;
    case 'display':
      body = <DisplayRows current={me.user?.locale} />;
      break;
    case 'privacy':
      body = <PrivacyRows me={me} />;
      break;
    case 'sounds':
      body = (
        <>
          <GiftSoundSetting />
          <VibrationSetting />
        </>
      );
      break;
    case 'notifications':
      body = <NotificationPrefsCard />;
      break;
    case 'safety':
      body = <SafetyRows />;
      break;
    case 'storage':
      body = <StorageData onCleared={me.reload} />;
      break;
    case 'help':
      body = <HelpRows />;
      break;
    case 'about':
      body = <AboutRows />;
      break;
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
    case 'language':
      body = <Language current={me.user?.locale} />;
      break;
    case 'theme':
      body = <Appearance />;
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
    case 'gift-limit':
      body = <GiftLimitSetting />;
      break;
    case 'feedback':
      body = <SendFeedbackCard />;
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

  const parent = isLeaf(page) ? LEAF_CATEGORY[page] : null;
  const back = parent ? { to: settingsPath(parent), label: t(PAGE_TITLE[parent]) } : single ? { to: SETTINGS_HOME, label: t('standing.backToSettings') } : undefined;
  return (
    <SettingsFrame title={t(PAGE_TITLE[page])} heading={heading} back={back} focus={focus} className={`settings-page-${page}`}>
      {/* The sounds page keeps its parts' headings, since it holds both sounds and vibration. */}
      <div className="settings-page-body" data-keep-headings={page === 'sounds' ? '' : undefined}>
        {body}
      </div>
    </SettingsFrame>
  );
}

/** A value from the account: a short grey bar until it answers, nothing if it failed. */
function fromAccount(me: MeState, value: string | undefined): React.ReactNode {
  return me.user ? value : me.loading ? <Skeleton line w={64} className="settings-row-value-skeleton" /> : undefined;
}

/** Account: who you are here and where you are signed in, then, apart and last, deleting it. */
function AccountRows({ me }: { me: MeState }): React.JSX.Element {
  const t = useT();
  const user = me.user;
  return (
    <>
      <SettingsSection>
        <SettingsRow icon={<ProfileIcon />} title={t('profile.edit')} to="/app/profile/edit" />
        <SettingsRow
          icon={<AtIcon />}
          title={t('settings.username.title')}
          // A handle reads left to right in every language, @ first.
          value={user ? <span dir="ltr">@{user.username}</span> : fromAccount(me, undefined)}
          to={settingsPath('username')}
        />
        <SettingsRow icon={<CalendarIcon />} title={t('age.label')} value={fromAccount(me, user ? birthMonthText(t, user) : undefined)} to={settingsPath('birth-month')} />
        <SettingsRow icon={<KeyIcon />} title={t('settings.password.title')} to={settingsPath('password')} />
        <SettingsRow icon={<DeviceIcon />} title={t('settings.devices.title')} to={settingsPath('devices')} />
        <SignOutEverywhere />
      </SettingsSection>
      <ul className="settings-rows settings-apart">
        <SettingsRow icon={<TrashIcon />} title={t('settings.delete.title')} destructive to={settingsPath('delete')} />
      </ul>
    </>
  );
}

/** How long "Sure?" waits for the second press, as the app's other two-step buttons do. */
const ARMED_MS = 4_000;

/** Signing out of every device, this one included: the first press asks, the second does it. */
function SignOutEverywhere(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client, logout } = useAuth();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), ARMED_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  async function press(): Promise<void> {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    await client.delete('/me/sessions');
    await logout();
    navigate('/');
  }

  return (
    <SettingsRow
      icon={<SignOutIcon />}
      title={t('settings.sessions.signOutEverywhere')}
      value={busy ? t('settings.devices.signingOut') : armed ? t('common.sure') : undefined}
      attention={armed}
      onClick={() => void press()}
    />
  );
}

/** Content and display: the interface's language, its look, and the keyboard for Kurdish letters. */
function DisplayRows({ current }: { current?: string | null }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const [theme] = useThemePreference();
  const [keyboard] = useKeyboardPrefs();
  const language = APP_LOCALES.find((l) => l.code === (isAppLocale(current) ? current : locale))?.nativeName ?? locale;
  return (
    <SettingsSection>
      <SettingsRow icon={<LanguageIcon />} title={t('language.settingsTitle')} value={language} to={settingsPath('language')} />
      <SettingsRow icon={<ThemeIcon />} title={t('settings.appearance.title')} value={t(THEME_LABEL[theme])} to={settingsPath('theme')} />
      <SettingsRow icon={<KeyboardIcon />} title={t('keyboard.settings.title')} value={t(ACCENT_LABEL[keyboard.accentMode])} to={settingsPath('keyboard')} />
    </SettingsSection>
  );
}

/** Privacy and social: who sees your profile, who you have blocked, and the weekly leagues. */
function PrivacyRows({ me }: { me: MeState }): React.JSX.Element {
  const t = useT();
  const user = me.user;
  return (
    <SettingsSection>
      <SettingsRow icon={<EyeIcon size={22} />} title={t('settings.privacy.title')} value={fromAccount(me, user ? t(VIS_LABEL_KEY[user.profileVisibility]) : undefined)} to={settingsPath('visibility')} />
      <SettingsRow icon={<BlockIcon />} title={t('settings.blocked.title')} to={settingsPath('blocked')} />
      <SettingsRow icon={<GiftIcon />} title={t('settings.giftLimit.title')} to={settingsPath('gift-limit')} />
      <SettingsRow
        icon={<TrophyIcon />}
        title={t('settings.leagues.title')}
        value={fromAccount(me, user ? t(user.leaguesEnabled !== false ? 'settings.on' : 'settings.off') : undefined)}
        to={settingsPath('leagues')}
      />
    </SettingsSection>
  );
}

/** Safety: the reports you made and how each went, and whether anything is limited on the account. */
function SafetyRows(): React.JSX.Element {
  const t = useT();
  const limited = useLimited();
  return (
    <SettingsSection>
      <SettingsRow icon={<FlagIcon />} title={t('reports.mine.title')} to={MY_REPORTS_PATH} />
      <SettingsRow icon={<StandingIcon />} title={t('standing.title')} value={limited ? t('settings.safety.limited') : undefined} attention={limited} to={STANDING_PATH} />
    </SettingsSection>
  );
}

/** Help and feedback: telling us what you think, the common questions, and a person to write to. */
function HelpRows(): React.JSX.Element {
  const t = useT();
  return (
    <SettingsSection>
      <SettingsRow icon={<ChatsIcon />} title={t('appFeedback.settingsTitle')} to={settingsPath('feedback')} />
      <SettingsRow icon={<HelpIcon />} title={t('footer.faq')} to="/faq" />
      <SettingsRow icon={<MailIcon />} title={t('settings.support')} subtitle={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
    </SettingsSection>
  );
}

/** About: how Hevalo teaches and who makes it, the terms and policies, and whose work it uses. */
function AboutRows(): React.JSX.Element {
  const t = useT();
  return (
    <SettingsSection>
      <SettingsRow icon={<BookIcon />} title={t('footer.teach')} to="/how-hevalo-teaches" />
      <SettingsRow icon={<HelpIcon />} title={t('settings.group.about')} to="/about" />
      <SettingsRow icon={<RulesIcon />} title={t('settings.terms')} to="/terms" />
      <SettingsRow icon={<LockIcon />} title={t('settings.privacyPolicy')} to="/privacy" />
      <SettingsRow icon={<CopyrightIcon />} title={t('footer.copyright')} to="/copyright" />
      <SettingsRow icon={<StarIcon size={22} />} title={t('about.creditsTitle')} to="/about#credits" />
    </SettingsSection>
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
        options={THEME_PREFERENCES.map((p) => ({ value: p, title: t(THEME_LABEL[p]), subtitle: p === 'system' ? t('settings.appearance.systemHint') : undefined }))}
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
