import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import type { MeProfile } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { BlockedUsers } from '../settings/BlockedUsers';
import { APP_LOCALES, isAppLocale, type AppLocale } from '@kurda/shared';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { LanguagePicker } from '../i18n/LanguagePicker';

const VISIBILITIES = ['everyone', 'members', 'friends', 'nobody'] as const;
type Visibility = (typeof VISIBILITIES)[number];

/**
 * 'Everyone' has to say *the web*, out loud.
 *
 * MyKurda can be read without an account, so the widest setting is genuinely
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

  if (loading) return <Loading label={t('settings.loading')} />;
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

      <Privacy current={data.user.profileVisibility} />

      {/*
        Directly under privacy, because it is the same question asked the other
        way round: that setting says who may see you at all, this one says who
        may not. It is also the only screen in the app that can undo a block —
        everywhere else, a blocked person is already invisible to you.
      */}
      <BlockedUsers />

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
 * The language MyKurda speaks to you in.
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
        Said plainly rather than discovered. Only part of the interface is
        translated so far, and a person who picks Kurdish and then meets an
        English screen should know that is a gap being filled, not a bug.
      */}
      {locale !== 'en' && <p className="field-hint">{t('language.partial')}</p>}
    </section>
  );
}

function Privacy({ current }: { current: Visibility }): React.JSX.Element {
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
            disabled={busy}
            aria-pressed={vis === v}
            onClick={() => change(v)}
          >
            {t(VIS_LABEL_KEY[v])}
          </button>
        ))}
      </div>
      <p className="field-hint" style={{ marginBottom: 0 }}>{t(VIS_HINT_KEY[vis])}</p>
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
