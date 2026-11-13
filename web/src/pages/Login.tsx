import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CompanionStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { AuthCard } from '../auth/AuthCard';
import { arrivalPause, holdArrival } from '../auth/arrival';
import { useFieldProblem, type AuthField } from '../auth/fieldProblem';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useT } from '../i18n/I18nProvider';
import { challengeSiteKey } from '../auth/challenge';

/** The codes that are not a mistake in the form: sign-in is paused, or asks for a challenge. */
const NOT_THE_FORM = new Set(['LOCKED', 'CAPTCHA_REQUIRED']);

/**
 * Sign in (/login).
 *
 * A refusal is said where it is: a wrong pair under the password, which is
 * marked, shaken once and given the caret (auth/fieldProblem.ts); an address
 * that is not one under the address. What is not about a field — no
 * connection, a paused sign-in — is said above the form.
 */
export function Login(): React.JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const problems = useFieldProblem<AuthField>({ email: 'email', password: 'password' });
  const [busy, setBusy] = useState(false);
  const [inside, setInside] = useState(false);
  const held = useRef<(() => void) | null>(null);
  useEffect(() => () => held.current?.(), []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorCode(null);
    problems.clear();
    // signed in, the page stays a moment for Hevalo to be pleased, then leaves by itself
    const release = holdArrival();
    held.current = release;
    const err = await login(email, password, remember);
    if (err) {
      release?.();
      setBusy(false);
      if (err.field && !NOT_THE_FORM.has(err.code ?? '')) {
        problems.show(err.field, err.message);
        return;
      }
      setError(err.message);
      setErrorCode(err.code ?? null);
      return;
    }
    setInside(true);
    if (release) await arrivalPause();
    release?.();
    navigate(from, { replace: true });
  }

  // Sign-in paused after failed attempts, or asking for a challenge this build
  // has no way to show: not a mistake in the form, so said calmly, with the
  // other way in beside it.
  const paused = errorCode === 'LOCKED' || (errorCode === 'CAPTCHA_REQUIRED' && challengeSiteKey() === null);
  // paused, he naps until it is time to try again
  const companion: CompanionStatus = inside ? 'success' : busy ? 'busy' : error ? (paused ? 'waiting' : 'error') : problems.any ? 'error' : 'idle';
  const emailProblem = problems.of('email');
  const passwordProblem = problems.of('password');

  return (
    <div className="auth-wrap">
      <AuthCard status={companion} word="welcome">
        <div className="auth-head">
          <h1>{t('auth.login.title')}</h1>
          <p>{t('auth.login.subtitle')}</p>
        </div>

        <form onSubmit={submit} noValidate>
          {error && paused ? (
            <div className="msg" role="alert">
              {error}
              <span className="msg-actions">
                <Link to="/forgot-password" className="btn btn-secondary btn-sm">
                  {t('auth.reset.title')}
                </Link>
              </span>
            </div>
          ) : (
            error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )
          )}

          <div className={problems.fieldClass('email')}>
            <label className="field-label" htmlFor="email">
              {t('auth.email')}
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // a wrong pair is either of the two: mending either takes the mark off
                problems.clear();
              }}
              autoComplete="username"
              placeholder="you@example.com"
              required
              autoFocus
              aria-invalid={emailProblem ? true : undefined}
              aria-describedby={emailProblem ? 'email-error' : undefined}
            />
            {emailProblem && (
              <span className="field-problem" id="email-error" role="alert">
                {emailProblem}
              </span>
            )}
          </div>

          <div className={problems.fieldClass('password')}>
            <label className="field-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(next) => {
                setPassword(next);
                problems.clear();
              }}
              invalid={Boolean(passwordProblem)}
              describedBy={passwordProblem ? 'password-error' : undefined}
            />
            {passwordProblem && (
              <span className="field-problem" id="password-error" role="alert">
                {passwordProblem}
              </span>
            )}
          </div>

          <div className="auth-row">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>{t('auth.login.rememberMe')}</span>
            </label>
            <Link to="/forgot-password" className="link-btn" style={{ textDecoration: 'none' }}>
              {t('auth.login.forgot')}
            </Link>
          </div>

          <Button type="submit" block disabled={busy}>
            {busy ? t('auth.login.submitting') : t('auth.login.submit')}
          </Button>
        </form>

        <p className="auth-alt">
          {t('auth.login.noAccount')}{' '}
          {/* where they were going goes with them, if they make an account instead */}
          <Link to="/register" state={location.state}>
            {t('auth.login.createAccount')}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
