import { useState } from 'react';
import { useAuth } from '../auth';
import { api, ApiError } from '../api';

// Whether this browser has signed in to the admin before — drives the greeting
// ("Welcome back" for returning admins vs. a first-time prompt).
const RETURNING_KEY = 'kurda_admin_returning';

/* Inline SVG — no external resources, so it's fine under the strict CSP. */
function EyeIcon({ off }: { off: boolean }): React.JSX.Element {
  return off ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7-.5 1-1.4 2.2-2.7 3.2M6.5 6.5C4.6 7.7 3.4 9.4 3 12c.7 1.6 3.4 5 9 5 1 0 1.9-.1 2.7-.4" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  // Read once on first render — a returning admin has a flag from a prior sign-in.
  const [returning] = useState(() => localStorage.getItem(RETURNING_KEY) === '1');

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await login(email, password, remember);
      localStorage.setItem(RETURNING_KEY, '1');
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
      setError('Enter your e-mail first, then choose “Forgot password”.');
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
      <img className="login-bg" src="/background.jpg" alt="" aria-hidden="true" />
      <div className="login-scrim" />

      {/* Liquid-glass rim refraction: an SVG displacement map bends the backdrop.
          It's applied (via CSS) only to a ring at the card's edge, so the shapes
          warp around the rim while the centre stays clear — like a real lens.
          Inline SVG is a same-document fragment, so it's CSP-safe. */}
      <svg className="liquid-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.007 0.01" numOctaves="2" seed="9" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="1.1" result="softNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="48" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <form className="login-card" onSubmit={submit}>
        <div className="login-top">
          <span>MyKurda</span>
          <span>Admin console</span>
        </div>

        <h1 className="login-title">Log In</h1>
        <p className="login-welcome">
          {returning
            ? 'Welcome back. Sign in to continue.'
            : 'Sign in to the MyKurda admin console.'}
        </p>

        <div className="login-input">
          <input
            type="email"
            placeholder="E-mail address"
            aria-label="E-mail address"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="login-input">
          <input
            className="has-eye"
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
            className="login-eye"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            aria-pressed={showPw}
            onClick={() => setShowPw((v) => !v)}
          >
            <EyeIcon off={showPw} />
          </button>
        </div>

        <div className="login-actions">
          <label className="login-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="login-forgot" onClick={forgot}>
            Forgot password
          </button>
        </div>

        {error && <div className="login-msg error">{error}</div>}
        {note && <div className="login-msg">{note}</div>}

        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
