import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useT } from '../i18n/I18nProvider';
import { challengeSiteKey } from '../auth/challenge';

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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorCode(null);
    const err = await login(email, password, remember);
    setBusy(false);
    if (err) {
      setError(err.message);
      setErrorCode(err.code ?? null);
    } else navigate(from, { replace: true });
  }

  // Sign-in paused after failed attempts, or asking for a challenge this build
  // has no way to show: not a mistake in the form, so said calmly, with the
  // other way in beside it.
  const paused = errorCode === 'LOCKED' || (errorCode === 'CAPTCHA_REQUIRED' && challengeSiteKey() === null);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
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

          <div className="field">
            <label className="field-label" htmlFor="email">
              {t('auth.email')}
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <PasswordInput id="password" value={password} onChange={setPassword} />
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
      </div>
    </div>
  );
}
