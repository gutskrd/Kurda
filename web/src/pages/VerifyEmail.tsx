import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const CODE_LENGTH = 6;
/** Matches the server's per-IP resend limit (4/hour) — don't invite a 429. */
const RESEND_COOLDOWN_SEC = 60;

function verifyError(err: ApiError, t: Translate): string {
  switch (err.code) {
    case 'INVALID_CODE':
      return t('auth.verify.badCode');
    case 'CODE_EXPIRED':
      return t('auth.verify.codeExpired');
    case 'TOO_MANY_ATTEMPTS':
      return t('auth.verify.tooManyAttempts');
    default:
      return describeError(err, t);
  }
}

/**
 * Confirm ownership of the email address with the 6-digit code sent at signup.
 * Reachable only while signed in but unverified — ProtectedRoute sends people
 * here and won't let them into the app until this succeeds.
 */
export function VerifyEmail(): React.JSX.Element {
  const { client, user, logout, refreshUser } = useAuth();
  const t = useT();
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
        setError(t('auth.verify.badLink'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkToken, client, refreshUser, navigate, t]);

  // already verified (e.g. confirmed elsewhere) → don't strand them here
  useEffect(() => {
    if (user?.emailVerified) navigate('/app', { replace: true });
  }, [user?.emailVerified, navigate]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const digits = code.replace(/\D/g, '');
      if (digits.length !== CODE_LENGTH) {
        setError(t('auth.verify.enterCode', { digits: CODE_LENGTH }));
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
      setError(verifyError(res.error, t));
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
      setNotice(t('auth.verify.sentNew'));
      setCooldown(RESEND_COOLDOWN_SEC);
    } else {
      setError(describeError(res.error, t));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>{t('auth.verify.title')}</h1>
          <p>{t('auth.verify.sentTo', { digits: CODE_LENGTH, email: user?.email ?? '' })}</p>
        </div>

        {error && <div className="msg msg-error">{error}</div>}
        {notice && <div className="msg">{notice}</div>}

        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="verify-code">
              {t('auth.verify.codeLabel')}
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
            <span className="field-hint">{t('auth.verify.expiresIn15')}</span>
          </div>

          <Button type="submit" block disabled={busy || code.replace(/\D/g, '').length !== CODE_LENGTH}>
            {busy ? t('auth.verify.submitting') : t('auth.verify.submit')}
          </Button>
        </form>

        <div className="auth-alt">
          {t('auth.verify.didntGetIt')}{' '}
          <button type="button" className="link-btn" onClick={() => void resend()} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
          </button>
          .
          <div style={{ marginTop: 12 }}>
            {t('auth.verify.wrongAddress')}{' '}
            <button type="button" className="link-btn" onClick={() => void logout().then(() => navigate('/register'))}>
              {t('auth.verify.startOver')}
            </button>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
