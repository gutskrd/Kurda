import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { useT } from '../i18n/I18nProvider';

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
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await login(email, password, remember);
    setBusy(false);
    if (err) setError(err);
    else navigate(from, { replace: true });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('auth.login.title')}</h1>
          <p>{t('auth.login.subtitle')}</p>
        </div>

        <form onSubmit={submit} noValidate>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
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
              Password
            </label>
            <PasswordInput id="password" value={password} onChange={setPassword} />
          </div>

          <div className="auth-row">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>{t('auth.login.rememberMe')}</span>
            </label>
            <Link to="/forgot-password" className="link-btn" style={{ textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          <Button type="submit" block disabled={busy}>
            {busy ? t('auth.login.submitting') : t('auth.login.submit')}
          </Button>
        </form>

        <p className="auth-alt">
          New to MyKurda? <Link to="/register">{t('auth.login.createAccount')}</Link>
        </p>
      </div>
    </div>
  );
}
