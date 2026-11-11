import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { ErrorState, Loading } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';

/** GET /me/username's answer (api/src/users/username-change.ts `UsernameStatus`). */
interface UsernameStatus {
  username: string;
  /** false for an account that signs in through another service and has no password to give */
  needsPassword: boolean;
  canChange: boolean;
  /** when the wait since the last change ends; null when there is none */
  availableAt: string | null;
  cooldownDays: number;
  holdDays: number;
  /** earlier names nobody else can take yet */
  held: Array<{ username: string; heldUntil: string }>;
}

type Availability = { available: true; username: string } | { available: false; reason: string };

/** How a name being typed stands: not asked about, being asked, free, or why not. */
type Check = { kind: 'idle' } | { kind: 'checking' } | { kind: 'free' } | { kind: 'problem'; text: string };

const NAME_ID = 'username-new';
const PASSWORD_ID = 'username-password';

/** Long enough that a name is asked about when the typing stops, not at every letter. */
const CHECK_AFTER_MS = 450;

const LETTERS = 'A-Za-zêîûçşÊÎÛÇŞ';

/**
 * The rules of a username's shape (api/src/users/username.ts), checked here
 * first: the server allows thirty questions a minute and five changes in
 * fifteen, and a name it would refuse for its shape should not spend one. The
 * server still decides, and knows the names nobody may have.
 */
function shapeReason(name: string): string | null {
  if (name.length < 3) return 'too-short';
  if (name.length > 30) return 'too-long';
  if (!new RegExp(`^[${LETTERS}0-9_]+$`).test(name)) return 'invalid-chars';
  if (name.startsWith('_') || name.endsWith('_')) return 'edge-underscore';
  if (name.includes('__')) return 'consecutive-underscore';
  if (/^[0-9]+$/.test(name)) return 'numbers-only';
  if (!new RegExp(`[${LETTERS}]`).test(name)) return 'no-letter';
  return null;
}

/**
 * Change the username: the new name, and the password to show it is you.
 *
 * The card says the limits before anything is typed: how often a name may be
 * changed, and that the old one is kept for its owner for a while, so nobody
 * can pass themselves off as them the day after. While the wait runs there is
 * no form, only the day it ends. A name is asked about as it is typed, and a
 * refusal is said under the field it is about.
 */
export function ChangeUsername({ onChanged }: { onChanged?: (username: string) => void }): React.JSX.Element {
  const { client, refreshUser } = useAuth();
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState<UsernameStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [check, setCheck] = useState<Check>({ kind: 'idle' });
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [passwordProblem, setPasswordProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /** the latest question asked: an answer to an earlier one is about a name no longer in the field */
  const asked = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    const res = await client.get<UsernameStatus>('/me/username');
    if (res.ok) setStatus(res.data);
    else setLoadError(describeError(res.error, t));
  }, [client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const day = (iso: string): string => new Date(iso).toLocaleDateString(locale, { dateStyle: 'long' });
  const shapeProblem = (reason: string): string => describeError({ kind: 'client', code: 'INVALID_USERNAME', message: '', details: { reason } }, t);

  const typed = name.trim();
  const current = status?.username ?? '';

  // ask about the name once the typing has stopped, and only about one the server would look at
  useEffect(() => {
    const ticket = ++asked.current;
    if (!open || typed === '') {
      setCheck({ kind: 'idle' });
      return;
    }
    if (typed === current) {
      setCheck({ kind: 'problem', text: t('settings.username.same') });
      return;
    }
    const reason = shapeReason(typed.normalize('NFC'));
    if (reason) {
      setCheck({ kind: 'problem', text: shapeProblem(reason) });
      return;
    }
    setCheck({ kind: 'checking' });
    const timer = window.setTimeout(() => {
      void client.get<Availability>(`/me/username/available?username=${encodeURIComponent(typed)}`).then((res) => {
        if (ticket !== asked.current) return;
        // a question that could not be answered is no verdict: the change itself is still checked
        if (!res.ok) setCheck({ kind: 'idle' });
        else if (res.data.available) setCheck({ kind: 'free' });
        else if (res.data.reason === 'taken') setCheck({ kind: 'problem', text: t('error.code.usernameTaken') });
        else if (res.data.reason === 'same') setCheck({ kind: 'problem', text: t('settings.username.same') });
        else setCheck({ kind: 'problem', text: shapeProblem(res.data.reason) });
      });
    }, CHECK_AFTER_MS);
    return () => window.clearTimeout(timer);
    // `shapeProblem` and `t` change with the language only, and the wording is redrawn with the next letter
  }, [client, current, open, typed]);

  function close(): void {
    setOpen(false);
    setName('');
    setPassword('');
    setNameProblem(null);
    setPasswordProblem(null);
    setError(null);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!status) return;
    setError(null);
    setNameProblem(null);
    setPasswordProblem(null);
    const reason = shapeReason(typed.normalize('NFC'));
    if (reason) {
      setNameProblem(shapeProblem(reason));
      document.getElementById(NAME_ID)?.focus();
      return;
    }

    setBusy(true);
    const res = await client.post<{ user: { username: string }; changed: boolean; status: UsernameStatus }>('/me/username', {
      username: typed,
      ...(status.needsPassword ? { currentPassword: password } : {}),
    });
    setBusy(false);
    if (res.ok) {
      const now = res.data.user.username;
      setStatus(res.data.status);
      close();
      setDone(now);
      onChanged?.(now);
      // the name shown around the app is the session's copy of the account
      void refreshUser();
      return;
    }
    switch (res.error.code) {
      case 'INVALID_USERNAME':
      case 'USERNAME_TAKEN':
        setNameProblem(describeError(res.error, t));
        document.getElementById(NAME_ID)?.focus();
        break;
      case 'WRONG_PASSWORD':
      case 'PASSWORD_REQUIRED':
        setPasswordProblem(t('error.code.wrongPassword'));
        document.getElementById(PASSWORD_ID)?.focus();
        break;
      case 'USERNAME_CHANGE_COOLDOWN':
        // changed somewhere else since this page was opened: show the wait as it now stands
        close();
        void load();
        break;
      default:
        setError(describeError(res.error, t));
    }
  }

  if (!status) {
    return loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : <Loading />;
  }

  const problem = nameProblem ?? (check.kind === 'problem' ? check.text : null);
  const nameDescribedBy = [`${NAME_ID}-hint`, problem ? `${NAME_ID}-error` : '', check.kind === 'free' && !problem ? `${NAME_ID}-ok` : ''].filter(Boolean).join(' ');

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.username.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('settings.username.help', { cooldown: status.cooldownDays, hold: status.holdDays })}
      </p>

      <dl className="username-now">
        <dt>{t('settings.username.current')}</dt>
        {/* a handle reads left to right in every language, @ first */}
        <dd dir="ltr">@{status.username}</dd>
      </dl>

      {done && (
        <div className="msg msg-success" role="status">
          {t('settings.username.changed', { name: done })}
        </div>
      )}

      {status.held.length > 0 && (
        <ul className="username-held">
          {status.held.map((h) => (
            <li key={h.username}>{t('settings.username.held', { name: h.username, date: day(h.heldUntil) })}</li>
          ))}
        </ul>
      )}

      {!status.canChange && status.availableAt ? (
        <p className="username-wait" role="note">
          {t('settings.username.wait', { date: day(status.availableAt) })}
        </p>
      ) : !open ? (
        <Button
          variant="secondary"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          {t('settings.username.change')}
        </Button>
      ) : (
        <form className="password-form" onSubmit={(e) => void submit(e)} noValidate>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}
          <div className={`field${problem ? ' has-problem' : ''}`}>
            <label className="field-label" htmlFor={NAME_ID}>
              {t('settings.username.new')}
            </label>
            <input
              id={NAME_ID}
              className="input"
              dir="ltr"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // the moment it is touched, the old complaint no longer applies
                setNameProblem(null);
              }}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={problem ? true : undefined}
              aria-describedby={nameDescribedBy}
              autoFocus
            />
            <span className="field-hint" id={`${NAME_ID}-hint`}>
              {t('error.code.usernameChars')}
            </span>
            {problem ? (
              <span className="field-problem" id={`${NAME_ID}-error`} role="status">
                {problem}
              </span>
            ) : check.kind === 'free' ? (
              <span className="field-ok" id={`${NAME_ID}-ok`} role="status">
                {t('settings.username.available')}
              </span>
            ) : null}
          </div>
          {status.needsPassword && (
            <div className={`field${passwordProblem ? ' has-problem' : ''}`}>
              <label className="field-label" htmlFor={PASSWORD_ID}>
                {t('settings.username.password')}
              </label>
              <PasswordInput
                id={PASSWORD_ID}
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  setPasswordProblem(null);
                }}
                autoComplete="current-password"
                placeholder=""
                invalid={Boolean(passwordProblem)}
                describedBy={passwordProblem ? `${PASSWORD_ID}-error` : undefined}
              />
              {passwordProblem && (
                <span className="field-problem" id={`${PASSWORD_ID}-error`}>
                  {passwordProblem}
                </span>
              )}
            </div>
          )}
          <div className="settings-actions">
            <Button type="submit" disabled={busy || typed === '' || typed === current || (status.needsPassword && password === '')}>
              {t('settings.username.change')}
            </Button>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
