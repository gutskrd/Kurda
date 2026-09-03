import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';

function resetError(err: ApiError): string {
  switch (err.code) {
    case 'INVALID_TOKEN':
      return 'This reset link is invalid or has expired. Request a new one below.';
    case 'WEAK_PASSWORD':
      return err.message;
    default:
      return describeError(err);
  }
}

/**
 * Where the emailed reset link lands: set a new password using the one-time
 * token from the URL. The token is single-use and short-lived server-side, so a
 * stale or reused link fails closed and the user is pointed at a fresh request.
 */
export function ResetPassword(): React.JSX.Element {
  const { client } = useAuth();
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
      setError('Those passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await client.post('/auth/reset-password', { token, password });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(resetError(res.error));
  }

  // A link without a token can't do anything — say so instead of showing a form
  // that is guaranteed to fail.
  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <h1>Reset password</h1>
            <p>This link is missing its reset code, so it can’t be used.</p>
          </div>
          <Link to="/forgot-password" className="btn btn-primary btn-block">
            Request a new link
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
            <h1>Password updated</h1>
            <p>You can now sign in with your new password.</p>
          </div>
          <Button block onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Choose a new password</h1>
          <p>Pick something you haven’t used before.</p>
        </div>

        {error && <div className="msg msg-error">{error}</div>}

        <form onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="new-password">
              New password
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
              Confirm new password
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
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>

        <div className="auth-alt">
          Link expired? <Link to="/forgot-password">Request a new one</Link>.
        </div>
      </div>
    </div>
  );
}
