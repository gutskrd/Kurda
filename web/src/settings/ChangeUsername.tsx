import { useCallback, useEffect, useRef, useState } from 'react';
import { checkUsername, usernameProblemWhileTyping } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { UsernameField } from '../auth/UsernameField';
import { describeError } from '../lib/api';
import { usernameRefusalText } from '../lib/usernameText';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { ErrorState, Loading } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';

/** GET /me/username's answer (api/src/users/username-change.ts `UsernameStatus`). */
interface UsernameStatus {
  username: string;
  /** False for an account that signs in through another service and has no password. */
  needsPassword: boolean;
  canChange: boolean;
  /** When the wait since the last change ends, or null. */
  availableAt: string | null;
  cooldownDays: number;
  holdDays: number;
  /** Earlier names nobody else can take yet. */
  held: Array<{ username: string; heldUntil: string }>;
}

type Availability = { available: true; username: string } | { available: false; reason: string; chars?: string[] };

/** The server's verdict on the typed name: not asked, asking, free, or the problem. */
type Check = { kind: 'idle' } | { kind: 'checking' } | { kind: 'free' } | { kind: 'problem'; text: string };

const NAME_ID = 'username-new';
const PASSWORD_ID = 'username-password';

/** The pause in typing before a name is checked. */
const CHECK_AFTER_MS = 450;


/**
 * Changes the username, confirmed with the password. The card states the limits first: how often a name may change,
 * and that the old one stays reserved for a while. During the wait there is only the date it ends. Names are checked
 * as typed, against the shared rules first (shared/src/username.ts) so a doomed name does not spend the server's rate
 * limit; the server still decides and knows which names are taken.
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
  /** The latest check's number, so an answer to an earlier one is ignored. */
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

  // The name the server would store: lowercase and trimmed, or a refusal from the rules.
  const checked = checkUsername(name);
  const typed = checked.ok ? checked.value : name.trim();
  const current = status?.username ?? '';

  // Check the name once typing stops, and only one the rules accept.
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
    // A name the rules refuse is the field's to explain, and the server is not asked.
    if (!checked.ok) {
      setCheck({ kind: 'idle' });
      return;
    }
    setCheck({ kind: 'checking' });
    const timer = window.setTimeout(() => {
      void client.get<Availability>(`/me/username/available?username=${encodeURIComponent(typed)}`).then((res) => {
        if (ticket !== asked.current) return;
        // A failed check is no verdict; the change itself is still checked.
        if (!res.ok) setCheck({ kind: 'idle' });
        else if (res.data.available) setCheck({ kind: 'free' });
        else if (res.data.reason === 'taken') setCheck({ kind: 'problem', text: t('error.code.usernameTaken') });
        else if (res.data.reason === 'same') setCheck({ kind: 'problem', text: t('settings.username.same') });
        else setCheck({ kind: 'problem', text: usernameRefusalText(res.data.reason, res.data.chars, t) });
      });
    }, CHECK_AFTER_MS);
    return () => window.clearTimeout(timer);
    // `t` changes only with the language, and the wording redraws with the next letter.
  }, [client, current, open, typed, checked.ok]);

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
    if (!checked.ok) {
      setNameProblem(usernameRefusalText(checked.reason, checked.reason === 'invalid-chars' ? checked.chars : undefined, t));
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
      // The name shown around the app is the session's copy of the account.
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
        // Changed elsewhere since this page opened, so show the wait as it now stands.
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
  // The field's own message about the typed name takes precedence over the server's.
  const typingProblem = usernameProblemWhileTyping(name) !== null;

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.username.title')}</h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: 14 }}>
        {t('settings.username.help', { cooldown: status.cooldownDays, hold: status.holdDays })}
      </p>

      <dl className="username-now">
        <dt>{t('settings.username.current')}</dt>
        {/* A handle reads left to right in every language, @ first. */}
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
          <UsernameField
            id={NAME_ID}
            label={t('settings.username.new')}
            value={name}
            onChange={(next) => {
              setName(next);
              // Editing the field clears its old problem.
              setNameProblem(null);
            }}
            problem={typingProblem ? null : problem}
            ok={check.kind === 'free' ? t('settings.username.available') : null}
            autoFocus
          />
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
