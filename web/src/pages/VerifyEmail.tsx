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
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { takeAfterSignup } from '../auth/afterSignup';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Where a newly confirmed account goes: its first lesson (pages/NextLesson.tsx
 * finds it). It went to /app, the community wall, which is not what most
 * people sign up to a language app for, and nothing there led to a lesson.
 */
const AFTER_VERIFY = '/app/learn/next';

/** Matches the server's per-IP resend limit (4/hour) — don't invite a 429. */
const RESEND_COOLDOWN_SEC = 60;

/** How long a confirmed code is shown before the page moves on: the boxes turning green one after another, and Hevalo pleased. */
const CONFIRMED_MS = 950;
/** The same moment, still: long enough to see the boxes have turned. */
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
 * Confirm ownership of the email address with the 6-digit code sent at signup.
 * Reachable only while signed in but unverified — ProtectedRoute sends people
 * here and won't let them into the app until this succeeds.
 *
 * The page asks for one thing. The code is typed into the boxes a game's code
 * is typed into (components/CodeBoxes.tsx), so they move the same way: sent
 * as the last digit lands, a wave while the server looks, green when it is
 * right, and a shake in red with a sentence under them when it is not. The
 * button is there for whoever would rather press it.
 *
 * The address the code went to is shown as it was typed, because a typo is
 * only ever caught by seeing it back, and it is the button that puts it
 * right. Under the form, quietly: the way to another code, how long
 * everything lasts, and the way out.
 */
export function VerifyEmail(): React.JSX.Element {
  const { client, user, logout, refreshUser } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // an emailed link that did not work: said over the form, because what it says to do is in the form below it
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // putting a mistyped address right: the field is there only once it is asked for
  const [changing, setChanging] = useState(false);
  const [address, setAddress] = useState('');
  // what the boxes show: a code with the server, one that was not right (until another digit is typed), and which digits are new
  const [checking, setChecking] = useState(false);
  const [refused, setRefused] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [focused, setFocused] = useState(false);
  const [still] = useState(prefersReducedMotion);
  // the code is confirmed here and the page leaves when its moment is over, not the instant the account says so
  const confirming = useRef(false);
  const codeField = useRef<HTMLInputElement>(null);
  /**
   * Where to go once confirmed: where the account was being made for — a
   * friend's game, a story's quiz (auth/afterSignup) — else the first lesson.
   * A birth month still missing is asked there, by the app's own gate. Taken
   * once and kept: confirming both answers the code and flips
   * `emailVerified`, and each of those leaves this screen.
   */
  const destination = useRef<string | null>(null);
  const afterVerify = useCallback((): string => (destination.current ??= takeAfterSignup() ?? AFTER_VERIFY), []);

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
        navigate(afterVerify(), { replace: true });
      } else {
        setLinkError(t('auth.verify.badLink'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkToken, client, refreshUser, navigate, t, afterVerify]);

  // already verified (e.g. confirmed in another tab) → don't strand them here
  useEffect(() => {
    if (user?.emailVerified && !confirming.current) navigate(afterVerify(), { replace: true });
  }, [user?.emailVerified, navigate, afterVerify]);

  const send = useCallback(
    async (digits: string) => {
      if (confirming.current) return;
      if (digits.length !== VERIFICATION_CODE_LENGTH) {
        // the button pressed on a code that is not whole: said, and the typing goes on where it was
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
        // the boxes turn and Hevalo is pleased while the fresh profile is fetched, so the wait is the moment itself
        setConfirmed(true);
        setFresh(VERIFICATION_CODE_LENGTH);
        const moment = new Promise<void>((done) => window.setTimeout(done, still ? CONFIRMED_STILL_MS : CONFIRMED_MS));
        // pull the fresh profile so emailVerified flips before we route onward
        await Promise.all([refreshUser(), moment]);
        navigate(afterVerify(), { replace: true });
        return;
      }
      confirming.current = false;
      setBusy(false);
      setError(verifyError(res.error, t));
      // a code that was not right is typed again from the first box
      setCode('');
      setRefused(true);
      setRefusals((n) => n + 1);
    },
    [client, refreshUser, navigate, afterVerify, t, still],
  );

  /** What the field holds after a keystroke or a paste; the last digit sends the code. */
  function typeCode(raw: string): void {
    if (confirming.current) return;
    const next = codeDigits(raw);
    if (next === code) return;
    setFresh(next.startsWith(code) ? code.length : 0);
    setCode(next);
    // whatever was said about the last code, or about a link, is over once another digit is typed
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

  /**
   * The one line that speaks, under whatever is being typed: what went wrong,
   * or that a code is on its way. Its room is kept while it is empty, so a
   * refusal does not push the button down under the pointer.
   */
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
   * A mistyped address is the commonest reason a code never comes. It is put
   * right in place: the account, its name and its password stay, the code
   * goes to the new address, and the one sent to the old address stops
   * working. Starting over used to be the only way, and found the username
   * taken by the sign-up just left behind.
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
    // changed, but the day's ceiling of emails is reached: said rather than a code promised
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
          {/*
            The address the code went to, as it was typed, and the way to put it
            right: a typo is only ever caught by seeing it back, and the place
            it is seen is the place to fix it.
          */}
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
          /* one thing at a time: while the address is put right, the code for the old one is not asked for */
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
              // read-only, not disabled, while the server looks: the focus stays, so a wrong code is typed again without a click
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
            {/* the boxes turning green is for the eye; this is the same news for the ear */}
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
          {/* how long each thing lasts, said once and small */}
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
