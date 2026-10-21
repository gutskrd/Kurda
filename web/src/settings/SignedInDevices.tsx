import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { agoInWords } from '../lib/timeWords';
import { Button } from '../components/Button';
import { ConfirmButton } from '../components/ConfirmButton';
import { DeviceListSkeleton } from '../components/skeletons';
import { ComputerIcon, DeviceIcon, PhoneIcon, TabletIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';

/** One session, as GET /me/sessions lists it: a sign-in on one device. */
export interface DeviceSession {
  id: string;
  deviceName: string | null;
  startedAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** A picture for a device, from what its name says it is. */
function DevicePicture({ name }: { name: string | null }): React.JSX.Element {
  if (!name) return <DeviceIcon />;
  if (/\b(iPad|tablet)\b/i.test(name)) return <TabletIcon />;
  if (/\b(iPhone|Android|phone|Pixel|Galaxy)\b/i.test(name)) return <PhoneIcon />;
  if (/\b(Windows|Mac|macOS|Linux|ChromeOS)\b/i.test(name)) return <ComputerIcon />;
  return <DeviceIcon />;
}

/** This device first, then the others as the server orders them: most recently used first. */
function inOrder(sessions: DeviceSession[]): DeviceSession[] {
  return [...sessions.filter((s) => s.current), ...sessions.filter((s) => !s.current)];
}

/**
 * Every device signed in to the account, and the ways to sign them out.
 *
 * One you do not recognise is the clearest sign that somebody else has the
 * password, so each row can be signed out on its own and every other device
 * at once, without signing out here. Signing out here, or everywhere at once,
 * sits at the foot of the card, where it has always been.
 *
 * `refreshKey` changes when something elsewhere on the page has ended sessions
 * (changing the password), and the list is fetched again quietly.
 */
export function SignedInDevices({ refreshKey = 0 }: { refreshKey?: number }): React.JSX.Element {
  const { client, logout } = useAuth();
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** False once unmounted, so an answer that lands late does not set state. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Fetch the list. `quiet` keeps the rows on screen until the new ones arrive. */
  const load = useCallback(
    async (quiet = false): Promise<void> => {
      if (!quiet) setState('loading');
      const res = await client.get<{ sessions?: DeviceSession[] }>('/me/sessions');
      if (!alive.current) return;
      if (!res.ok) {
        setError(describeError(res.error, t));
        if (!quiet) setState('error');
        return;
      }
      setError(null);
      setSessions(inOrder(Array.isArray(res.data.sessions) ? res.data.sessions : []));
      setState('ready');
    },
    [client, t],
  );

  useEffect(() => {
    void load(refreshKey > 0);
  }, [load, refreshKey]);

  function signedOutHere(): void {
    void logout().then(() => navigate('/'));
  }

  async function signOutOne(session: DeviceSession): Promise<void> {
    setNotice(null);
    const res = await client.delete<{ revoked: boolean; current: boolean }>(`/me/sessions/${encodeURIComponent(session.id)}`);
    if (!alive.current) return;
    if (!res.ok && res.error.code !== 'SESSION_NOT_FOUND') {
      setError(describeError(res.error, t));
      return;
    }
    // ended now, or already ended: either way the row has nothing left to sign out
    setError(null);
    if (!res.ok) setNotice(describeError(res.error, t));
    if (res.ok && res.data.current) {
      signedOutHere();
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
  }

  async function signOutOthers(): Promise<void> {
    setNotice(null);
    const res = await client.delete<{ sessionsEnded?: number }>('/me/sessions?except=current');
    if (!alive.current) return;
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setError(null);
    const ended = res.data.sessionsEnded ?? 0;
    setNotice(
      new Intl.PluralRules(locale).select(ended) === 'one'
        ? t('settings.devices.endedOne')
        : t('settings.devices.endedMany', { count: ended }),
    );
    await load(true);
  }

  async function signOutEverywhere(): Promise<void> {
    await client.delete('/me/sessions');
    signedOutHere();
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('settings.devices.title')}
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('settings.devices.help')}
      </p>

      {error && state !== 'error' && <div className="msg msg-error" role="alert">{error}</div>}
      {notice && <div className="msg msg-success" role="status">{notice}</div>}

      {state === 'loading' ? (
        <DeviceListSkeleton label="settings.devices.loading" />
      ) : state === 'error' ? (
        <div className="msg msg-error" role="alert">
          {error}
          <span className="msg-actions">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </span>
        </div>
      ) : (
        <>
          {sessions.length > 0 && (
            <ul className="device-list">
              {sessions.map((s) => {
                const name = s.deviceName?.trim() || t('settings.devices.unknown');
                return (
                  <li key={s.id} className={`device-row${s.current ? '' : ' has-action'}`}>
                    <span className="device-icon">
                      <DevicePicture name={s.deviceName} />
                    </span>
                    <span className="device-who">
                      <span className="device-name">{name}</span>
                      <span className="device-meta">
                        {s.current ? (
                          <>
                            <span className="device-here">{t('settings.devices.thisDevice')}</span>
                            {' · '}
                            {t('settings.devices.activeNow')}
                          </>
                        ) : (
                          t('settings.devices.lastActive', { when: agoInWords(s.lastSeenAt, t, locale) })
                        )}
                      </span>
                    </span>
                    {!s.current && (
                      <ConfirmButton
                        className="btn btn-secondary btn-sm"
                        label={t('settings.sessions.signOut')}
                        busyLabel={t('settings.devices.signingOut')}
                        title={t('settings.devices.signOutWho', { name })}
                        onConfirm={() => signOutOne(s)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {others.length > 0 ? (
            <div className="settings-actions device-others">
              <ConfirmButton
                className="btn btn-secondary"
                label={t('settings.devices.signOutOthers')}
                busyLabel={t('settings.devices.signingOut')}
                title={t('settings.devices.signOutOthers')}
                onConfirm={signOutOthers}
              />
            </div>
          ) : (
            <p className="field-hint device-others" style={{ marginBottom: 0 }}>
              {t('settings.devices.onlyThis')}
            </p>
          )}
        </>
      )}

      {/*
        Signing out lives here rather than in the nav, where it sat one slip
        away from ending your session every time you reached for your profile.
        It belongs with the other things you do to your account.
      */}
      <div className="device-here-actions">
        <p className="field-hint" style={{ marginTop: 0 }}>{t('settings.sessions.help')}</p>
        <div className="settings-actions">
          <Button onClick={signedOutHere}>{t('settings.sessions.signOut')}</Button>
          <ConfirmButton
            className="btn btn-secondary"
            label={t('settings.sessions.signOutEverywhere')}
            busyLabel={t('settings.devices.signingOut')}
            title={t('settings.sessions.signOutEverywhere')}
            onConfirm={signOutEverywhere}
          />
        </div>
      </div>
    </section>
  );
}
