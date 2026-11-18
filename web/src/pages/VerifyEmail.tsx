import { UNCONFIRMED_SIGNUP_DAYS, VERIFICATION_CODE_LENGTH, codeDigits } from '@kurda/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AuthCard } from '../auth/AuthCard';
import { prefersReducedMotion } from '../lib/motion';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';
import { EditIcon } from '../components/icons';
import { CodeBoxes } from '../components/CodeBoxes';
import { useT, type Translate } from '../i18n/I18nProvider';
import { takeAfterSignup } from '../auth/afterSignup';

/** Where a newly confirmed account goes: its first lesson (pages/NextLesson.tsx finds it). */
const AFTER_VERIFY = '/app/learn/next';

/** Matches the server's per-IP resend limit (4 an hour). */
const RESEND_COOLDOWN_SEC = 60;

/** How long a confirmed code shows before moving on: the boxes turning green, Hevalo pleased. */
const CONFIRMED_MS = 950;
/** The same under reduced motion: long enough to see the boxes turn. */
const CONFIRMED_STILL_MS = 450;

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
 * Confirms the email with the 6-digit code sent at sign-up; ProtectedRoute keeps an unverified account here. The code is
 * typed into the same boxes as a game code (components/CodeBoxes.tsx): sent as the last digit lands, a wave while
 * checking, green when right, a red shake and a sentence when not. The address is shown as typed, with a way to correct
 * it, since a typo is only caught by seeing it. Below: another code, how long things last, and the way out.
 */
export function VerifyEmail(): React.JSX.Element {
  const { client, user, logout, refreshUser } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed emailed link, shown above the form, since what it says to do is in the form.
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Correcting a mistyped address; the field appears only when asked for.
  const [changing, setChanging] = useState(false);
  const [address, setAddress] = useState('');
  // What the boxes show: a code being checked, a wrong one (until another digit is typed), and which digits are new.
  const [checking, setChecking] = useState(false);
  const [refused, setRefused] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [focused, setFocused] = useState(false);
  const [still] = useState(prefersReducedMotion);
  // Confirmed here; the page leaves when its moment is over, not the instant the account says so.
  const confirming = useRef(false);
  const codeField = useRef<HTMLInputElement>(null);
  /**
   * Where to go once confirmed: where the account was made for (a friend's game, a story quiz; auth/afterSignup), else
   * the first lesson, whose gate asks a missing birth month. Taken once and kept, since confirming changes the state
   * this screen depends on twice.
   */
  const destination = useRef<string | null>(null);
  const afterVerify = useCallback((): string => (destination.current ??= takeAfterSignup() ?? AFTER_VERIFY), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // An emailed link carries a one-time token instead of a code, redeemed on arrival (no session needed).
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
        navigate(afterVerify(), { replace: true });
      } else {
        setLinkError(t('auth.verify.badLink'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkToken, client, refreshUser, navigate, t, afterVerify]);

  // Already verified (in another tab, say): do not strand them here.
  useEffect(() => {
    if (user?.emailVerified && !confirming.current) navigate(afterVerify(), { replace: true });
  }, [user?.emailVerified, navigate, afterVerify]);

  const send = useCallback(
    async (digits: string) => {
      if (confirming.current) return;
      if (digits.length !== VERIFICATION_CODE_LENGTH) {
        // The button pressed on an incomplete code: say so, and typing goes on where it was.
        setNotice(null);
        setError(t('auth.verify.enterCode', { digits: VERIFICATION_CODE_LENGTH }));
        codeField.current?.focus();
        return;
      }
      confirming.current = true;
      setBusy(true);
      setChecking(true);
      setError(null);
      setNotice(null);
      const res = await client.post<{ verified: boolean }>('/auth/verify-email-code', { code: digits });
      setChecking(false);
      if (res.ok) {
        // The boxes turn and Hevalo is pleased while the fresh profile loads, so the wait is the moment itself.
        setConfirmed(true);
        setFresh(VERIFICATION_CODE_LENGTH);
        const moment = new Promise<void>((done) => window.setTimeout(done, still ? CONFIRMED_STILL_MS : CONFIRMED_MS));
        // Fetch the fresh profile so emailVerified flips before routing on.
        await Promise.all([refreshUser(), moment]);
        navigate(afterVerify(), { replace: true });
        return;
      }
      confirming.current = false;
      setBusy(false);
      setError(verifyError(res.error, t));
      // A wrong code is retyped from the first box.
      setCode('');
      setRefused(true);
      setRefusals((n) => n + 1);
    },
    [client, refreshUser, navigate, afterVerify, t, still],
  );

  /** What the field holds after a keystroke or paste; the last digit sends the code. */
  function typeCode(raw: string): void {
    if (confirming.current) return;
    const next = codeDigits(raw);
    if (next === code) return;
    setFresh(next.startsWith(code) ? code.length : 0);
    setCode(next);
    // Anything said about the last code or a link is over once another digit is typed.
    setRefused(false);
    setError(null);
    setLinkError(null);
    if (next.length === VERIFICATION_CODE_LENGTH) void send(next);
  }

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

  /** The one line that speaks under the typing: an error, or that a code is on its way; its room is kept so nothing moves. */
  const said = error ?? notice;
  const saidLine = (
    <p className={`verify-said${error ? ' is-error' : ''}`}>
      {said && (
        <span id="verify-said" role={error ? 'alert' : 'status'}>
          {said}
        </span>
      )}
    </p>
  );

  /**
   * Corrects a mistyped address, the commonest reason a code never comes: the account stays, the code goes to the new
   * address, and the old address's code stops working.
   */
  async function changeAddress(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const next = address.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await client.post<{ sent: boolean }>('/auth/change-pending-email', { email: next });
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    await refreshUser();
    setCode('');
    setAddress('');
    setChanging(false);
    // Changed, but the day's email limit is reached, so no code is promised.
    if (res.data.sent) setNotice(t('auth.verify.changed'));
    else setError(t('error.code.verificationEmailLimit'));
    setCooldown(RESEND_COOLDOWN_SEC);
  }

  const phase = confirmed ? 'joined' : checking ? 'joining' : refused ? 'error' : 'idle';

  return (
    <div className="auth-wrap">
      <AuthCard status={confirmed ? 'success' : busy ? 'busy' : error || linkError ? 'error' : 'idle'} word="bravo" compact>
        <div className="auth-head">
          <h1>{t('auth.verify.title')}</h1>
          <p>{t('auth.verify.enterCode', { digits: VERIFICATION_CODE_LENGTH })}</p>
          {/* The address as typed, with the way to correct it where it is seen. */}
          {user?.email && (
            <button
              type="button"
              className="verify-address"
              onClick={() => {
                setError(null);
                setNotice(null);
                setChanging((on) => !on);
              }}
              aria-expanded={changing}
              aria-label={`${user.email}. ${t('auth.verify.wrongAddress')} ${t('auth.verify.change')}`}
            >
              <bdi>{user.email}</bdi>
              <EditIcon size={15} />
            </button>
          )}
        </div>

        {linkError && (
          <div className="msg msg-error" role="alert">
            {linkError}
          </div>
        )}

        {changing ? (
          /* One thing at a time: while correcting the address, no code for the old one is asked for. */
          <form onSubmit={(e) => void changeAddress(e)}>
            <div className="field">
              <label className="field-label" htmlFor="verify-new-address">
                {t('auth.verify.newAddress')}
              </label>
              <input
                id="verify-new-address"
                className="input"
                type="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={said ? 'verify-said' : undefined}
                autoFocus
                required
              />
            </div>
            {saidLine}
            <Button type="submit" block disabled={busy || address.trim() === ''}>
              {t('auth.verify.sendThere')}
            </Button>
            <button type="button" className="link-btn verify-cancel" onClick={() => setChanging(false)}>
              {t('common.cancel')}
            </button>
          </form>
        ) : (
          <form
            className={`code-entry verify-code is-${phase}${still ? ' is-still' : ''}${focused ? ' is-focused' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              void send(code);
            }}
            noValidate
          >
            <CodeBoxes
              inputRef={codeField}
              id="verify-code"
              value={code}
              length={VERIFICATION_CODE_LENGTH}
              fresh={fresh}
              shakes={refusals}
              onChange={(e) => typeCode(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              // Read-only, not disabled, while checking, so focus stays for retyping a wrong code.
              readOnly={checking || confirmed}
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="go"
              aria-label={t('auth.verify.codeLabel')}
              aria-invalid={refused ? true : undefined}
              aria-describedby={said ? 'verify-said' : undefined}
              autoFocus
            />
            {saidLine}
            <Button type="submit" block disabled={busy}>
              {confirmed ? t('auth.verify.confirmed') : checking ? t('auth.verify.submitting') : t('auth.verify.submit')}
            </Button>
            {/* The same news as the boxes turning green, for screen readers. */}
            <p className="sr-only" role="status">
              {confirmed ? t('auth.verify.confirmed') : ''}
            </p>
          </form>
        )}

        <div className="verify-foot">
          <p>
            {t('auth.verify.didntGetIt')}{' '}
            <button type="button" className="link-btn" onClick={() => void resend()} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? t('auth.verify.sendNewIn', { seconds: cooldown }) : t('auth.verify.sendNew')}
            </button>
            .
          </p>
          {/* How long each thing lasts, said once and small. */}
          <p className="verify-small">
            {t('auth.verify.expiresIn15')} {t('auth.verify.keptFor', { days: UNCONFIRMED_SIGNUP_DAYS })}
          </p>
          <button type="button" className="link-btn verify-leave" onClick={() => void logout().then(() => navigate('/register'))}>
            {t('auth.verify.startOver')}
          </button>
        </div>
      </AuthCard>
    </div>
  );
}
