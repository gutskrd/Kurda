import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { api, ApiError } from '../api';
import { clockTime, describeError, errorLine, useCountdown } from '../ui';

// Whether this browser has signed in to the admin before — drives the greeting
// ("Welcome back" for returning admins vs. a first-time prompt).
const RETURNING_KEY = 'kurda_admin_returning';

/** What is wrong with the email as typed, or null. */
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter the email address of your admin account.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter the whole email address, like name@hevalo.app.';
}

/**
 * Why a sign-in did not go through, in words that say what to do next. The
 * server's own ("invalid email or password", "too many failed attempts — try
 * again later") were shown as they came, in lower case and without the wait.
 */
export function signInProblem(err: unknown): string {
  if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') return 'That email and password don’t match. Check both and try again.';
  if (err instanceof ApiError && err.code === 'LOGIN_VERIFICATION_REQUIRED') {
    return 'This sign-in was held back for a safety check. Try again later, or from the network you usually use. If it keeps happening, ask whoever runs Hevalo.';
  }
  // a lockout's own words already say signing in is paused, and for how long
  if (err instanceof ApiError && err.status === 429) return describeError(err).message;
  return errorLine(err, 'signing in');
}

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
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  // a field's own problem: said when it is left, cleared as soon as it is right
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // signing in is paused by the server (too many tries) until this moment
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const left = useCountdown(pausedUntil);
  const paused = left > 0;
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  // Read once on first render — a returning admin has a flag from a prior sign-in.
  const [returning] = useState(() => localStorage.getItem(RETURNING_KEY) === '1');

  // the pause is over: the message that said to wait would now be wrong
  useEffect(() => {
    if (pausedUntil === null || paused) return;
    setPausedUntil(null);
    setError(null);
    setNote('You can sign in again.');
  }, [paused, pausedUntil]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (paused) return;
    const emailWrong = emailProblem(email);
    const passwordWrong = password ? null : 'Enter your password.';
    setEmailError(emailWrong);
    setPasswordError(passwordWrong);
    if (emailWrong || passwordWrong) {
      (emailWrong ? emailInput : passwordInput).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await login(email.trim(), password, remember);
      localStorage.setItem(RETURNING_KEY, '1');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setPausedUntil(Date.now() + (err.retryAfterSec ?? 60) * 1000);
      setError(signInProblem(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgot(): Promise<void> {
    setError(null);
    setNote(null);
    if (emailProblem(email)) {
      setEmailError('Enter your email address first, then choose “Forgot password”.');
      emailInput.current?.focus();
      return;
    }
    try {
      await api('/auth/request-password-reset', { method: 'POST', body: { email: email.trim() } });
      setNote('If that account exists, a password-reset link has been sent.');
    } catch (err) {
      setError(errorLine(err, 'the reset link'));
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={(e) => void submit(e)} noValidate aria-labelledby={`${id}-title`}>
        <div className="login-top">
          <span>Hevalo</span>
          <span>Admin console</span>
        </div>

        <h1 className="login-title" id={`${id}-title`}>
          Sign in
        </h1>
        <p className="login-welcome">{returning ? 'Welcome back. Sign in to continue.' : 'Use the Hevalo account that has admin access.'}</p>

        <div className="login-field">
          <label className="login-label" htmlFor={`${id}-email`}>
            Email
          </label>
          <div className="login-input">
            <input
              ref={emailInput}
              id={`${id}-email`}
              type="email"
              inputMode="email"
              placeholder="name@hevalo.app"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? `${id}-email-error` : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(emailProblem(e.target.value));
              }}
              // an empty box is not wrong yet: it is said on "Sign in", not on the way past
              onBlur={() => setEmailError(email.trim() ? emailProblem(email) : null)}
              autoFocus
            />
          </div>
          {emailError && (
            <div id={`${id}-email-error`} className="login-field-error">
              {emailError}
            </div>
          )}
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor={`${id}-password`}>
            Password
          </label>
          <div className="login-input">
            <input
              ref={passwordInput}
              id={`${id}-password`}
              className="has-eye"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? `${id}-password-error` : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                if (e.target.value) setPasswordError(null);
              }}
            />
            {/* one name, and pressed or not: a name that also flipped said "Hide password, pressed" */}
            <button
              type="button"
              className="login-eye"
              aria-label="Show password"
              title={showPw ? 'Hide password' : 'Show password'}
              aria-pressed={showPw}
              onClick={() => setShowPw((v) => !v)}
            >
              <EyeIcon off={showPw} />
            </button>
          </div>
          {passwordError && (
            <div id={`${id}-password-error`} className="login-field-error">
              {passwordError}
            </div>
          )}
        </div>

        <div className="login-actions">
          <label className="login-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="login-forgot" onClick={() => void forgot()}>
            Forgot password
          </button>
        </div>

        {error && (
          <div className="login-msg error" role="alert">
            {error}
          </div>
        )}
        {note && (
          <div className="login-msg" role="status">
            {note}
          </div>
        )}

        <button className="login-submit" type="submit" disabled={busy || paused}>
          {paused ? `Try again in ${clockTime(left)}` : busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
