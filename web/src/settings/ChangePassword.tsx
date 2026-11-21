import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Field = 'current' | 'next' | 'confirm';

const FIELD_ID: Record<Field, string> = { current: 'pw-current', next: 'pw-new', confirm: 'pw-confirm' };

/** POST /me/password's answer (api/src/auth/service.ts `changePassword`). */
interface Changed {
  changed: true;
  /** This session's new access token; every older one has stopped working. */
  accessToken: string | null;
  accessExpiresInSeconds: number;
}

/**
 * The password policy (api/src/auth/password-policy.ts), checked here first so a password the server would refuse
 * does not spend one of the route's five tries in fifteen minutes. The server still decides.
 */
function policyReason(password: string): string | null {
  if (password.length < 8) return 'too-short';
  if (password.length > 128) return 'too-long';
  if (!/\p{L}/u.test(password)) return 'needs-letter';
  if (!/[0-9]/.test(password)) return 'needs-number';
  return null;
}

/**
 * Changes the password while signed in: the current one, then the new one twice. The server ends every other session,
 * which the card says before and after. A refusal shows under its field; an account made with Google or Apple has no
 * password, so it is offered a way to set one.
 */
export function ChangePassword({ onChanged }: { onChanged?: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>({ current: '', next: '', confirm: '' });
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [focus, setFocus] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noPassword, setNoPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // The first field with a problem takes focus once drawn.
  useEffect(() => {
    if (!focus) return;
    document.getElementById(FIELD_ID[focus])?.focus();
    setFocus(null);
  }, [focus]);

  function close(): void {
    setOpen(false);
    setValues({ current: '', next: '', confirm: '' });
    setProblems({});
    setError(null);
    setNoPassword(false);
  }

  function edit(field: Field): (value: string) => void {
    return (value) => {
      setValues((v) => ({ ...v, [field]: value }));
      // Editing the field clears its old problem.
      setProblems((p) => ({ ...p, [field]: undefined }));
    };
  }

  function show(found: Partial<Record<Field, string>>): void {
    setProblems(found);
    setFocus((['current', 'next', 'confirm'] as const).find((f) => found[f]) ?? null);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const found: Partial<Record<Field, string>> = {};
    const reason = policyReason(values.next);
    if (reason) found.next = describeError({ kind: 'client', code: 'WEAK_PASSWORD', message: '', details: { reason } }, t);
    if (values.next !== values.confirm) found.confirm = t('auth.reset.mismatch');
    if (found.next || found.confirm) {
      show(found);
      return;
    }

    setBusy(true);
    const res = await client.post<Changed>('/me/password', { currentPassword: values.current, newPassword: values.next });
    setBusy(false);
    if (res.ok) {
      // The old access token ended with the old password; the refresh token stays.
      if (res.data.accessToken) client.replaceAccessToken(res.data.accessToken);
      close();
      setDone(true);
      onChanged?.();
      return;
    }
    switch (res.error.code) {
      case 'WRONG_PASSWORD':
        show({ current: describeError(res.error, t) });
        break;
      case 'WEAK_PASSWORD':
      case 'PASSWORD_BREACHED':
        show({ next: describeError(res.error, t) });
        break;
      case 'NO_PASSWORD':
        setNoPassword(true);
        break;
      default:
        setError(describeError(res.error, t));
    }
  }

  function field(name: Field, label: MessageKey, autoComplete: string, hint?: MessageKey): React.JSX.Element {
    const id = FIELD_ID[name];
    const problem = problems[name];
    const describedBy = [hint ? `${id}-hint` : '', problem ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
    return (
      <div className={`field${problem ? ' has-problem' : ''}`}>
        <label className="field-label" htmlFor={id}>
          {t(label)}
        </label>
        <PasswordInput
          id={id}
          value={values[name]}
          onChange={edit(name)}
          autoComplete={autoComplete}
          placeholder=""
          invalid={Boolean(problem)}
          describedBy={describedBy}
          autoFocus={name === 'current'}
        />
        {hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {t(hint)}
          </span>
        )}
        {problem && (
          <span className="field-problem" id={`${id}-error`}>
            {problem}
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('settings.password.title')}</h2>
      <p className="muted" style={{ fontSize: 'var(--text)', marginBottom: 14 }}>{t('settings.password.help')}</p>

      {done && (
        <div className="msg msg-success" role="status">
          {t('settings.password.changed')}
        </div>
      )}

      {!open ? (
        <Button
          variant="secondary"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          {t('settings.password.change')}
        </Button>
      ) : noPassword ? (
        <div className="msg" role="alert">
          {t('error.code.noPassword')}
          <span className="msg-actions">
            <Link to="/forgot-password" className="btn btn-secondary btn-sm">
              {t('settings.password.setOne')}
            </Link>
            <Button variant="ghost" size="sm" onClick={close}>
              {t('common.cancel')}
            </Button>
          </span>
        </div>
      ) : (
        <form className="password-form" onSubmit={(e) => void submit(e)} noValidate>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}
          {field('current', 'settings.password.current', 'current-password')}
          {field('next', 'auth.newPassword', 'new-password', 'auth.passwordHint')}
          {field('confirm', 'auth.reset.confirmNew', 'new-password')}
          <div className="settings-actions">
            <Button type="submit" disabled={busy || !values.current || !values.next || !values.confirm}>
              {busy ? t('settings.password.changing') : t('settings.password.change')}
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
