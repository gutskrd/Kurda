import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function resetError(err: ApiError, t: Translate): string {
  switch (err.code) {
    case 'INVALID_TOKEN':
      return t('auth.reset.invalidLink');
    case 'WEAK_PASSWORD':
      return err.message;
    default:
      return describeError(err, t);
  }
}

/**
 * Where the emailed reset link lands: set a new password using the one-time
 * token from the URL. The token is single-use and short-lived server-side, so a
 * stale or reused link fails closed and the user is pointed at a fresh request.
 */
export function ResetPassword(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await client.post('/auth/reset-password', { token, password });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(resetError(res.error, t));
  }

  // A link without a token can't do anything — say so instead of showing a form
  // that is guaranteed to fail.
  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <h1>{t('auth.reset.title')}</h1>
            <p>{t('auth.reset.missingCode')}</p>
          </div>
          <Link to="/forgot-password" className="btn btn-primary btn-block">
            {t('auth.reset.requestNewLink')}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <h1>{t('auth.reset.updated')}</h1>
            <p>{t('auth.reset.updatedBody')}</p>
          </div>
          <Button block onClick={() => navigate('/login', { replace: true })}>
            {t('auth.reset.goToSignIn')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('auth.reset.choose')}</h1>
          <p>{t('auth.reset.chooseHelp')}</p>
        </div>

        {error && <div className="msg msg-error">{error}</div>}

        <form onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="new-password">
              {t('auth.newPassword')}
            </label>
            <input
              id="new-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="confirm-password">
              {t('auth.reset.confirmNew')}
            </label>
            <input
              id="confirm-password"
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Button type="submit" block disabled={busy || password.length === 0 || confirm.length === 0}>
            {busy ? t('auth.reset.submitting') : t('auth.reset.submit')}
          </Button>
        </form>

        <div className="auth-alt">
          {t('auth.reset.linkExpired')} <Link to="/forgot-password">{t('auth.reset.requestNew')}</Link>.
        </div>
      </div>
    </div>
  );
}
