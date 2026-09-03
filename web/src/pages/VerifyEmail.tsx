import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';

const CODE_LENGTH = 6;
/** Matches the server's per-IP resend limit (4/hour) — don't invite a 429. */
const RESEND_COOLDOWN_SEC = 60;

function verifyError(err: ApiError): string {
  switch (err.code) {
    case 'INVALID_CODE':
      return 'That code isn’t correct. Check the digits and try again.';
    case 'CODE_EXPIRED':
      return 'That code has expired. Send yourself a new one below.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many attempts. Request a new code to continue.';
    default:
      return describeError(err);
  }
}

/**
 * Confirm ownership of the email address with the 6-digit code sent at signup.
 * Reachable only while signed in but unverified — ProtectedRoute sends people
 * here and won't let them into the app until this succeeds.
 */
export function VerifyEmail(): React.JSX.Element {
  const { client, user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The emailed link carries a one-time token instead of a code; redeem it on
  // arrival so following the link just works (that endpoint needs no session).
  const [params] = useSearchParams();
  const linkToken = params.get('token');
  useEffect(() => {
    if (!linkToken) return;
    let cancelled = false;
    void (async () => {
      const res = await client.post('/auth/verify-email', { token: linkToken });
      if (cancelled) return;
      if (res.ok) {
        await refreshUser();
        navigate('/app', { replace: true });
      } else {
        setError('That confirmation link is invalid or has expired — enter the code below instead.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkToken, client, refreshUser, navigate]);

  // already verified (e.g. confirmed elsewhere) → don't strand them here
  useEffect(() => {
    if (user?.emailVerified) navigate('/app', { replace: true });
  }, [user?.emailVerified, navigate]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const digits = code.replace(/\D/g, '');
      if (digits.length !== CODE_LENGTH) {
        setError(`Enter the ${CODE_LENGTH}-digit code from your email.`);
        return;
      }
      setBusy(true);
      setError(null);
      setNotice(null);
      const res = await client.post<{ verified: boolean }>('/auth/verify-email-code', { code: digits });
      if (res.ok) {
        // pull the fresh profile so emailVerified flips before we route onward
        await refreshUser();
        setBusy(false);
        navigate('/app', { replace: true });
        return;
      }
      setBusy(false);
      setError(verifyError(res.error));
    },
    [client, code, refreshUser, navigate],
  );

  async function resend(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await client.post('/auth/resend-verification-code');
    setBusy(false);
    if (res.ok) {
      setNotice('We sent a new code. It can take a minute to arrive.');
      setCooldown(RESEND_COOLDOWN_SEC);
    } else {
      setError(describeError(res.error));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Confirm your email</h1>
          <p>
            We sent a {CODE_LENGTH}-digit code to <strong>{user?.email}</strong>. Enter it below to finish
            setting up your account.
          </p>
        </div>

        {error && <div className="msg msg-error">{error}</div>}
        {notice && <div className="msg">{notice}</div>}

        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="verify-code">
              Verification code
            </label>
            <input
              id="verify-code"
              className="input verify-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={CODE_LENGTH}
              autoFocus
            />
            <span className="field-hint">The code expires 15 minutes after it was sent.</span>
          </div>

          <Button type="submit" block disabled={busy || code.replace(/\D/g, '').length !== CODE_LENGTH}>
            {busy ? 'Confirming…' : 'Confirm email'}
          </Button>
        </form>

        <div className="auth-alt">
          Didn’t get it? Check your spam folder, then{' '}
          <button type="button" className="link-btn" onClick={() => void resend()} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `send a new code (${cooldown}s)` : 'send a new code'}
          </button>
          .
          <div style={{ marginTop: 12 }}>
            Wrong address?{' '}
            <button type="button" className="link-btn" onClick={() => void logout().then(() => navigate('/register'))}>
              Sign out and start over
            </button>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
