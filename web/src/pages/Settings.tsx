import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import type { MeProfile } from '../lib/types';
import { ErrorState } from '../components/states';
import { CardStackSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { BlockedUsers } from '../settings/BlockedUsers';
import { NotificationPrefsCard } from '../notifications/NotificationPrefsCard';
import { APP_LOCALES, isAppLocale, type AppLocale } from '@kurda/shared';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { LanguagePicker } from '../i18n/LanguagePicker';

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

export function Settings(): React.JSX.Element {
  const { client, logout } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApiGet<{ user: MeProfile }>('/me');

  if (loading)
    return (
      <div className="container container-narrow">
        <CardStackSkeleton count={4} label="settings.loading" />
      </div>
    );
  if (error || !data) return <ErrorState message={error ?? t('settings.unavailable')} onRetry={reload} />;

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">{t('settings.eyebrow')}</span>
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>

      {/* first, because it is the setting that decides how everything else on
          this page reads */}
      <Language current={data.user.locale} />

      <Privacy current={data.user.profileVisibility} minor={data.user.minor === true} />

      {/*
        Directly under privacy, because it is the same question asked the other
        way round: that setting says who may see you at all, this one says who
        may not. It is also the only screen in the app that can undo a block —
        everywhere else, a blocked person is already invisible to you.
      */}
      <BlockedUsers />

      {/* the other half of "who reaches me": privacy above says who may see
          you, this says what the app is allowed to interrupt you about */}
      <NotificationPrefsCard />

      <Leagues enabled={data.user.leaguesEnabled !== false} minor={data.user.minor === true} />

      <section className="card" style={{ marginTop: 20 }}>
        <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.sessions.title')}</h2>
        <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
          {t('settings.sessions.help')}
        </p>
        {/*
          Signing out lives here now rather than in the nav, where it sat one slip
          away from ending your session every time you reached for your profile.
          It belongs with the other things you do to your account.
        */}
        <div className="settings-actions">
          <Button
            onClick={() => {
              void logout().then(() => navigate('/'));
            }}
          >
            {t('settings.sessions.signOut')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void client.delete('/me/sessions').then(() => logout()).then(() => navigate('/'));
            }}
          >
            {t('settings.sessions.signOutEverywhere')}
          </Button>
        </div>
      </section>

      <ExportData />

      <DangerZone
        onDeleted={() => {
          void logout().then(() => navigate('/'));
        }}
      />
    </div>
  );
}

/**
 * The language Hevalo speaks to you in.
 *
 * Applied the moment it is chosen and saved to the account in the background,
 * rather than the other way round: waiting for a round trip before the buttons
 * change would make choosing a language feel broken on a slow connection, and
 * the change is trivially reversible if the save fails.
 *
 * It is stored on the account rather than only in this browser so that it
 * follows you — signing in on a borrowed laptop should not mean choosing again.
 */
function Language({ current }: { current?: string | null }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const { locale, setLocale } = useI18n();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const chosen = isAppLocale(current) ? current : locale;

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

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('language.settingsTitle')}
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('language.settingsHelp')}
      </p>
      <LanguagePicker value={chosen} onChange={(next) => void change(next)} busy={busy} />
      {failed ? (
        <div className="msg msg-error" style={{ marginTop: 10 }}>
          {t('language.failed')}
        </div>
      ) : (
        !busy && <p className="field-hint">{t('language.savedTo', { language: name })}</p>
      )}
      {/*
        Said plainly rather than discovered. The screens are translated now, so
        this no longer warns about them — but emails still render in English
        whatever the account is set to, and somebody who picks Kurdish and then
        gets an English email should know that is a gap being filled, not a bug.
      */}
      {locale !== 'en' && <p className="field-hint">{t('language.partial')}</p>}
    </section>
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
function Leagues({ enabled, minor }: { enabled: boolean; minor: boolean }): React.JSX.Element {
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
      await refreshUser();
    } else {
      setOn(!next);
      setMsg(describeError(res.error, t));
    }
  }

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.leagues.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>{t('settings.leagues.help')}</p>
      <label className="section-toggle" style={{ paddingTop: 0 }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void change(e.target.checked)} />
        <span className="section-toggle-text">
          <span className="section-toggle-label">{t('settings.leagues.toggle')}</span>
        </span>
      </label>
      {minor && <p className="field-hint" style={{ marginBottom: 0 }}>{t('settings.leagues.minorHint')}</p>}
      {msg && <span className="field-hint">{msg}</span>}
    </section>
  );
}

function Privacy({ current, minor }: { current: Visibility; minor: boolean }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [vis, setVis] = useState<Visibility>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function change(next: Visibility): Promise<void> {
    setVis(next);
    setBusy(true);
    setMsg(null);
    const res = await client.request('PUT', '/me/privacy', { body: { visibility: next } });
    setBusy(false);
    if (res.ok) setMsg(t('common.saved'));
    else {
      setVis(current);
      setMsg(describeError(res.error, t));
    }
  }

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.privacy.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>{t('settings.privacy.help')}</p>
      <div className="toolbar" style={{ marginBottom: 8 }} role="group" aria-label={t('settings.privacy.title')}>
        {VISIBILITIES.map((v) => (
          <button
            key={v}
            type="button"
            className={`chip${vis === v ? ' active' : ''}`}
            // under 18 a profile is never on the open web; the server refuses
            // it too, this just does not offer it
            disabled={busy || (minor && v === 'everyone')}
            aria-pressed={vis === v}
            onClick={() => change(v)}
          >
            {t(VIS_LABEL_KEY[v])}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginBottom: 0 }}>{t(VIS_HINT_KEY[vis])}</p>
      {minor && <p className="field-hint" style={{ marginBottom: 0 }}>{t('settings.visibility.minorHint')}</p>}
      {msg && <span className="field-hint">{msg}</span>}
    </section>
  );
}

function ExportData(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.data.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('settings.data.help')}
      </p>
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
    </section>
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
    <section className="card danger-card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0, color: 'var(--danger)' }}>{t('settings.delete.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('settings.delete.help')}
      </p>
      {error && <div className="msg msg-error">{error}</div>}
      {confirming ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          <button type="button" className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }} onClick={del} disabled={busy}>
            {busy ? t('settings.delete.deleting') : t('settings.delete.confirm')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 45%, var(--border-strong))' }} onClick={() => setConfirming(true)}>
          {t('settings.delete.title')}
        </button>
      )}
    </section>
  );
}
