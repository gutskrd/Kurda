import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';

export function ForgotPassword(): React.JSX.Element {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    // The endpoint intentionally doesn't reveal whether an account exists, so we
    // always show the same confirmation — no account enumeration from the client.
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Reset password</h1>
          <p>Enter your email and we’ll send a reset link.</p>
        </div>

        {sent ? (
          <>
            <div className="msg msg-success" role="status">
              If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
            </div>
            <Link to="/login" className="btn btn-secondary btn-block">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
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
                autoComplete="email"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <Button type="submit" block disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="auth-alt" style={{ border: 0, paddingTop: 16 }}>
              Remembered it? <Link to="/login">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
