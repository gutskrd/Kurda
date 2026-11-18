import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CompanionStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { AuthCard } from '../auth/AuthCard';
import { inAppPath } from '../auth/afterSignup';
import { arrivalPause, holdArrival } from '../auth/arrival';
import { useFieldProblem, type AuthField } from '../auth/fieldProblem';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useT } from '../i18n/I18nProvider';
import { challengeSiteKey } from '../auth/challenge';

/** Codes that are not a form mistake: sign-in is paused, or asks for a challenge. */
const NOT_THE_FORM = new Set(['LOCKED', 'CAPTCHA_REQUIRED']);

/**
 * Sign in (/login). A wrong pair is said under the password, which is marked, shaken and focused
 * (auth/fieldProblem.ts); an invalid address under the address; anything else (no connection, a paused sign-in) above
 * the form.
 */
export function Login(): React.JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const location = useLocation();
  // Only a page on this site, whatever the navigation state holds.
  const from = inAppPath((location.state as { from?: unknown } | null)?.from) ?? '/app';

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
    // Signed in, the page stays a moment for Hevalo, then leaves by itself.
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

  // A paused sign-in, or a challenge this build cannot show, is not a form mistake, so it is said calmly with the other
  // way in.
  const paused = errorCode === 'LOCKED' || (errorCode === 'CAPTCHA_REQUIRED' && challengeSiteKey() === null);
  // Paused, he naps until it is time to try again.
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
                // A wrong pair is either field, so mending either clears the mark.
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
          {/* Where they were going comes along if they make an account instead. */}
          <Link to="/register" state={location.state}>
            {t('auth.login.createAccount')}
          </Link>
        </p>
      </AuthCard>
    </div>
  );
}
