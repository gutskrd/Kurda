import { useState } from 'react';
import { useAuth } from '../auth';
import { api, ApiError } from '../api';

/* Inline SVG icons — no external resources, so they're fine under the strict CSP. */
function PersonIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  );
}
function LockIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function EyeIcon({ off }: { off: boolean }): React.JSX.Element {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7-.5 1-1.4 2.2-2.7 3.2M6.5 6.5C4.6 7.7 3.4 9.4 3 12c.7 1.6 3.4 5 9 5 1 0 1.9-.1 2.7-.4" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Login({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await login(email, password, remember);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function forgot(): Promise<void> {
    setError(null);
    setNote(null);
    if (!email) {
      setError('Enter your email first, then choose “Forgot password”.');
      return;
    }
    try {
      await api('/auth/request-password-reset', { method: 'POST', body: { email } });
      setNote('If that account exists, a password-reset link has been sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a reset link.');
    }
  }

  return (
    <div className="login">
      <video className="login-bg" autoPlay loop muted playsInline>
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="login-scrim" />

      <form className="card" onSubmit={submit}>
        <div className="brand">MyKurda Admin</div>
        <p className="login-sub subtle">Sign in to the administration console.</p>

        <div className="field">
          <span className="field-icon"><PersonIcon /></span>
          <input
            className="with-icon"
            type="email"
            placeholder="Email address"
            aria-label="Email address"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <span className="field-icon"><LockIcon /></span>
          <input
            className="with-icon has-toggle"
            type={showPw ? 'text' : 'password'}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="field-toggle"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            aria-pressed={showPw}
            onClick={() => setShowPw((v) => !v)}
          >
            <EyeIcon off={showPw} />
          </button>
        </div>

        <div className="login-row">
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="link-btn" onClick={forgot}>
            Forgot password?
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {note && <div className="note">{note}</div>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
