import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import type { CompanionStatus } from '@kurda/shared';
import { api, ApiError } from '../api';
import { hasSession, useAuth } from '../auth';
import { SessionProvider, sessionFrom, type AdminSession } from '../session';
import { Banner, Button, Icon, clockTime, describeError, errorLine, useCountdown } from '../ui';
import { Companion, HAPPY_MS, stillWanted } from '../brand/Companion';

/**
 * Signing in to the console, one step at a time on one card, the steps
 * turning past like the faces of a wheel: the email, then the password, then
 * the two-step code (or setting it up), then the console opening. Nothing in
 * the admin renders before the last step: the API refuses every /admin route
 * without 2FA, so the workspace would only be a screen of failed requests.
 *
 * Things load while the person is busy. The console's own code is fetched in
 * the background as soon as the sign-in is on screen, and what the session
 * still needs is asked while the wheel turns to the next step, so the console
 * is there the moment the last step is done. A session restored on reload
 * goes straight to what it still needs, or straight in.
 *
 * The email is not checked with the server on its own: whether an account
 * exists is never said, so the email and the password are sent together.
 */

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
  if (err instanceof ApiError && err.status === 429) return describeError(err).message;
  return errorLine(err, 'signing in');
}

/** The steps, in order; `in` is the console itself. */
type Step = 'email' | 'password' | 'checking' | 'problem' | 'enroll' | 'code' | 'opening' | 'in';

/** The rail across the top of the card: where on it each step is. */
const RAIL = ['Email', 'Password', 'Two-step', 'Console'] as const;
const ON_RAIL: Record<Exclude<Step, 'in'>, number> = { email: 0, password: 1, checking: 2, problem: 2, enroll: 2, code: 2, opening: 3 };

/** How long the turning face takes to leave, so it can be taken away after (the stylesheet's own, a little over). */
const TURN_MS = 480;

const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));

export function SignIn({ warm, children }: { warm: () => Promise<unknown>; children: (signOut: () => void) => ReactNode }): React.JSX.Element {
  const { login, logout, me } = useAuth();
  const [step, setStep] = useState<Step>(() => (hasSession() ? 'checking' : 'email'));
  const [back, setBack] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [email, setEmail] = useState('');
  // how the face on show is going, for Hevalo: each face says it
  const [face, setFace] = useState<CompanionStatus>('idle');
  // came through the steps on this visit: the console opens with a moment for Hevalo to be pleased
  const fresh = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const out = useRef(logout);
  out.current = logout;

  const go = useCallback((next: Step, backwards = false) => {
    setBack(backwards);
    setFace('idle');
    setStep(next);
  }, []);

  // the console's own code, fetched in the background while the steps are being filled in
  useEffect(() => {
    const timer = window.setTimeout(() => void warm().catch(() => undefined), 300);
    return () => window.clearTimeout(timer);
  }, [warm]);

  /** Back to the start, signed out: for the wrong account, or one the console is not for. */
  const restart = useCallback(() => {
    setSession(null);
    setProblem(null);
    fresh.current = false;
    go('email', true);
  }, [go]);

  /** What this session still needs: a code, setting one up, or nothing, and in. */
  const check = useCallback(async () => {
    go('checking');
    try {
      const next = sessionFrom(await api<AdminSession>('/admin/session'));
      setSession(next);
      if (next.needsEnrollment) go('enroll');
      else if (next.needsVerification) go('code');
      else {
        // the console's code is nearly always here already; a moment to be pleased about it, if this was a sign-in
        if (fresh.current) {
          go('opening');
          await Promise.all([warm().catch(() => undefined), stillWanted() ? null : wait(HAPPY_MS)]);
        } else await warm().catch(() => undefined);
        setStep('in');
      }
    } catch (err) {
      // an account the console is not for is answered as if it were not there
      // (404), or refused (403): back to the start, with nothing said about why
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        out.current();
        restart();
      } else {
        setProblem(err);
        go('problem');
      }
    }
  }, [go, restart, warm]);

  // a session kept from before: straight to what it still needs
  useEffect(() => {
    if (step === 'checking') void check();
    // once, as the page opens; later checks come from the steps themselves
  }, []);

  const signOut = (): void => {
    out.current();
    restart();
  };

  if (step === 'in' && session) {
    return (
      <SessionProvider value={session}>
        <Suspense fallback={null}>{children(restart)}</Suspense>
      </SessionProvider>
    );
  }

  const companion: CompanionStatus = step === 'checking' ? 'busy' : step === 'opening' ? 'success' : step === 'problem' ? 'error' : face;

  let content: ReactNode;
  if (step === 'email') {
    content = <EmailStep email={email} onEmail={setEmail} onNext={() => go('password')} />;
  } else if (step === 'password') {
    content = (
      <PasswordStep
        email={email.trim()}
        onStatus={setFace}
        onChangeEmail={() => go('email', true)}
        onSignIn={async (password, remember) => {
          await login(email.trim(), password, remember);
          localStorage.setItem(RETURNING_KEY, '1');
          fresh.current = true;
          void check();
        }}
      />
    );
  } else if (step === 'checking' || step === 'in') {
    content = <BusyStep title="Checking your session…" />;
  } else if (step === 'opening') {
    content = <BusyStep title="Opening the console…" text={me ? `Welcome, ${me.username}.` : undefined} />;
  } else if (step === 'problem') {
    const d = describeError(problem, 'the admin');
    content = (
      <>
        <FocusedTitle>{d.title}</FocusedTitle>
        <p className="gate-text">{d.message}</p>
        <Button className="login-submit" icon="refresh" onClick={() => void check()}>
          Try again
        </Button>
        <SignOutFoot onSignOut={signOut} />
      </>
    );
  } else if (step === 'enroll') {
    content = (
      <EnrollStep
        onStatus={setFace}
        onDone={async () => {
          fresh.current = true;
          await check();
        }}
        onSignOut={signOut}
      />
    );
  } else {
    content = (
      <>
        <h1 className="login-title gate-title">Enter your 2FA code</h1>
        <p className="gate-text">Open your authenticator app and enter the current six-digit code for Hevalo Admin.</p>
        <CodeForm
          path="/admin/auth/verify"
          label="Continue"
          busyLabel="Checking…"
          ready
          autoFocus
          onStatus={setFace}
          onDone={async () => {
            fresh.current = true;
            await check();
          }}
        />
        <SignOutFoot onSignOut={signOut} />
      </>
    );
  }

  const at = ON_RAIL[step === 'in' ? 'checking' : step];
  return (
    <div className="login">
      <div className="login-stage">
        <Companion status={companion} watch={card} className="login-companion" />
        <div ref={card} className="login-card gate-card has-companion" aria-busy={step === 'checking' || step === 'opening' || undefined}>
          <div className="login-top is-centred">
            <span className="login-brand">Hevalo</span>
            <span className="login-dot" aria-hidden="true" />
            <span>Admin console</span>
          </div>
          <ol className="wheel-rail" aria-label="Signing in">
            {RAIL.map((label, i) => (
              <li key={label} className={i < at ? 'is-done' : i === at ? 'is-now' : undefined} aria-current={i === at ? 'step' : undefined}>
                <span className="wheel-dot" aria-hidden="true">
                  {i < at && <Icon name="check" />}
                </span>
                <span className="wheel-label">{label}</span>
              </li>
            ))}
          </ol>
          <Wheel face={step === 'in' ? 'checking' : step} back={back}>
            {content}
          </Wheel>
        </div>
      </div>
    </div>
  );
}

/**
 * The steps' faces on a wheel: a new face turns in from below as the last one
 * turns away over the top (the other way when going back), and the card's
 * height follows the face on show. The face leaving stays as it was, inert,
 * until it has turned away. For whoever asks for less motion, the new face
 * simply fades in.
 */
function Wheel({ face, back, children }: { face: string; back: boolean; children: ReactNode }): React.JSX.Element {
  const latest = useRef<{ key: string; node: ReactNode }>({ key: face, node: children });
  const [shown, setShown] = useState(face);
  const [gone, setGone] = useState<{ key: string; node: ReactNode; back: boolean } | null>(null);
  if (shown !== face) {
    // the face that was on show turns away, as it last was
    setShown(face);
    setGone(stillWanted() ? null : { key: latest.current.key, node: latest.current.node, back });
  }
  latest.current = { key: face, node: children };

  useEffect(() => {
    if (!gone) return undefined;
    const timer = window.setTimeout(() => setGone(null), TURN_MS);
    return () => window.clearTimeout(timer);
  }, [gone]);

  // the card's height follows the face on show, so the card grows and shrinks rather than jumps
  const wheel = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = current.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    const fit = (): void => {
      if (wheel.current) wheel.current.style.height = `${el.offsetHeight}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [face]);

  const turn = back ? ' is-back' : '';
  return (
    <div ref={wheel} className="wheel">
      {gone && (
        <div key={gone.key} className={`wheel-face is-leaving${gone.back ? ' is-back' : ''}`} inert aria-hidden="true">
          {gone.node}
        </div>
      )}
      <div key={face} ref={current} className={`wheel-face${gone ? ` is-entering${turn}` : ''}`}>
        {children}
      </div>
    </div>
  );
}

/** The first step: the email, checked here for its shape only. */
function EmailStep({ email, onEmail, onNext }: { email: string; onEmail: (v: string) => void; onNext: () => void }): React.JSX.Element {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning] = useState(() => localStorage.getItem(RETURNING_KEY) === '1');
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const wrong = emailProblem(email);
        setError(wrong);
        if (wrong) input.current?.focus();
        else onNext();
      }}
    >
      <h1 className="login-title">Sign in</h1>
      <p className="login-welcome">{returning ? 'Welcome back. Sign in to continue.' : 'Use the Hevalo account that has admin access.'}</p>
      <div className="login-field">
        <label className="login-label" htmlFor={`${id}-email`}>
          Email
        </label>
        <div className="login-input">
          <input
            ref={input}
            id={`${id}-email`}
            type="email"
            inputMode="email"
            placeholder="name@hevalo.app"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-email-error` : undefined}
            onChange={(e) => {
              onEmail(e.target.value);
              if (error) setError(emailProblem(e.target.value));
            }}
            // an empty box is not wrong yet: it is said on "Continue", not on the way past
            onBlur={() => setError(email.trim() ? emailProblem(email) : null)}
            autoFocus
          />
        </div>
        {error && (
          <div id={`${id}-email-error`} className="login-field-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <button className="login-submit" type="submit">
        Continue
      </button>
    </form>
  );
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

/**
 * The second step: the password, under the email it goes with (a tap on that
 * goes back to change it). The email is also in a hidden box, so a password
 * manager files the password under it.
 */
function PasswordStep({
  email,
  onStatus,
  onChangeEmail,
  onSignIn,
}: {
  email: string;
  onStatus: (s: CompanionStatus) => void;
  onChangeEmail: () => void;
  onSignIn: (password: string, remember: boolean) => Promise<void>;
}): React.JSX.Element {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const left = useCountdown(pausedUntil);
  const paused = left > 0;

  // paused, he naps until it is time to try again
  useEffect(() => onStatus(busy ? 'busy' : paused ? 'waiting' : error ? 'error' : 'idle'), [busy, paused, error, onStatus]);

  // the pause is over: the message that said to wait would now be wrong
  useEffect(() => {
    if (pausedUntil === null || paused) return;
    setPausedUntil(null);
    setError(null);
    setNote('You can sign in again.');
  }, [paused, pausedUntil]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (paused || busy) return;
    if (!password) {
      setPasswordError('Enter your password.');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await onSignIn(password, remember);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setPausedUntil(Date.now() + (err.retryAfterSec ?? 60) * 1000);
      setError(signInProblem(err));
      setBusy(false);
    }
  }

  async function forgot(): Promise<void> {
    setError(null);
    setNote(null);
    try {
      await api('/auth/request-password-reset', { method: 'POST', body: { email } });
      setNote('If that account exists, a password-reset link has been sent.');
    } catch (err) {
      setError(errorLine(err, 'the reset link'));
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)}>
      <h1 className="login-title">Enter your password</h1>
      <div className="wheel-who">
        <button type="button" className="wheel-chip" onClick={onChangeEmail} aria-label={`Change the email, ${email}`}>
          <span className="wheel-chip-who">{email}</span>
          <span className="wheel-chip-change" aria-hidden="true">
            Change
          </span>
        </button>
      </div>
      {/* for a password manager: the account this password belongs to */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="login-field">
        <label className="login-label" htmlFor={`${id}-password`}>
          Password
        </label>
        <div className="login-input">
          <input
            ref={input}
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
            autoFocus
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
          <div id={`${id}-password-error`} className="login-field-error" role="alert">
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
  );
}

/** A step's title that takes the focus as it comes, for a step with no box to type in: a screen reader says where it is. */
function FocusedTitle({ children }: { children: ReactNode }): React.JSX.Element {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), []);
  return (
    <h1 ref={title} className="login-title gate-title" tabIndex={-1}>
      {children}
    </h1>
  );
}

/** A step with nothing to fill in: the session being checked, or the console opening. */
function BusyStep({ title, text }: { title: string; text?: string }): React.JSX.Element {
  return (
    <>
      <FocusedTitle>
        <Icon name="refresh" className="gate-busy" />
        {title}
      </FocusedTitle>
      {text && <p className="gate-text wheel-centred">{text}</p>}
    </>
  );
}

function SignOutFoot({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  return (
    <p className="gate-foot">
      Wrong account, or no authenticator to hand?{' '}
      <button type="button" className="login-forgot" onClick={onSignOut}>
        Sign out
      </button>
    </p>
  );
}

/** Render an otpauth:// URI as an inline SVG QR, no network involved. */
function QrSvg({ text, size = 190 }: { text: string; size?: number }): React.JSX.Element {
  // type 0 = pick the smallest version that fits; 'M' is the usual level for
  // otpauth URIs, tolerant enough for a phone camera on a screen
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cells: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return (
    <svg className="qr" width={size} height={size} viewBox={`-1 -1 ${count + 2} ${count + 2}`} role="img" aria-label="Scan this with your authenticator app">
      <path d={cells.join('')} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

/** First-time setup: show the secret as a QR, confirm with a live code. */
function EnrollStep({ onStatus, onDone, onSignOut }: { onStatus: (s: CompanionStatus) => void; onDone: () => Promise<void>; onSignOut: () => void }): React.JSX.Element {
  const [secret, setSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // React's development mode runs an effect twice; two enrollments made two
  // secrets, and the QR on screen could be the one the server had replaced
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void (async () => {
      try {
        setSecret(await api<{ secret: string; otpauthUri: string }>('/admin/2fa/enroll', { method: 'POST' }));
      } catch (err) {
        setProblem(errorLine(err, 'setting up 2FA'));
      }
    })();
  }, []);

  return (
    <>
      <h1 className="login-title gate-title">Set up two-factor authentication</h1>
      <p className="gate-text">
        The admin panel requires it. Scan this with an authenticator app — Google Authenticator, 1Password, Aegis, anything that does TOTP — then enter
        the six-digit code it shows.
      </p>
      {secret ? (
        <>
          <div className="gate-qr">
            <QrSvg text={secret.otpauthUri} />
          </div>
          <div className="gate-text">Can’t scan? Enter this key by hand:</div>
          <code className="secret">{secret.secret}</code>
          <p className="gate-text">
            Keep a copy somewhere safe. Without it, your 2FA has to be reset on the server by whoever runs Hevalo — a password alone cannot open the admin,
            by design.
          </p>
        </>
      ) : problem ? (
        <div className="login-field-error" role="alert">
          {problem}
        </div>
      ) : (
        <p className="gate-text">Preparing…</p>
      )}
      <CodeForm path="/admin/2fa/confirm" label="Confirm and continue" busyLabel="Confirming…" ready={!!secret} onStatus={onStatus} onDone={onDone} />
      <SignOutFoot onSignOut={onSignOut} />
    </>
  );
}

/**
 * The code, sent to one of the two code routes as soon as the sixth digit is
 * in (or on "Continue"). A wrong code is said and the box emptied for the next
 * one. After five wrong codes the server pauses code entry (429 TOTP_LOCKED,
 * with how long) — the per-person rate limit answers 429 too — and that is
 * said calmly with the time left, the button counting it down and coming back
 * by itself when it is over: the server's "too many wrong codes — try again
 * later" said neither how long nor that it was not the admin's fault.
 */
function CodeForm({
  path,
  label,
  busyLabel,
  ready,
  onStatus,
  onDone,
  autoFocus = false,
}: {
  path: string;
  label: string;
  busyLabel: string;
  /** whether there is anything to confirm yet (the setup's secret has arrived) */
  ready: boolean;
  onStatus: (s: CompanionStatus) => void;
  onDone: () => Promise<void>;
  autoFocus?: boolean;
}): React.JSX.Element {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [passed, setPassed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pause, setPause] = useState<{ until: number; title: string; message: string } | null>(null);
  const left = useCountdown(pause?.until ?? null);
  const paused = left > 0;

  useEffect(() => onStatus(passed ? 'success' : busy ? 'busy' : paused ? 'waiting' : problem ? 'error' : 'idle'), [passed, busy, paused, problem, onStatus]);

  // the pause is over: say so, and put the cursor back in the box
  useEffect(() => {
    if (!pause || paused) return;
    setPause(null);
    setNote('You can enter a code again.');
    input.current?.focus();
  }, [pause, paused]);

  async function send(value: string): Promise<void> {
    if (paused || !ready || sending.current) return;
    if (value.length !== 6) {
      setProblem('Enter all six digits from your authenticator app.');
      input.current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await api(path, { method: 'POST', body: { code: value } });
      setPassed(true);
      await onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const d = describeError(err);
        setPause({ until: Date.now() + (err.retryAfterSec ?? 60) * 1000, title: d.title, message: d.message });
      } else if (err instanceof ApiError && err.code === 'INVALID_CODE') {
        setProblem('That code didn’t match. Codes change every 30 seconds, so enter the one showing now.');
      } else {
        setProblem(errorLine(err, 'checking the code'));
      }
      setCode('');
      setPassed(false);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(code);
      }}
      className="gate-form"
      noValidate
    >
      <label className="login-label" htmlFor={`${id}-code`}>
        Six-digit code
      </label>
      <div className="login-input">
        <input
          id={`${id}-code`}
          ref={input}
          className="code-input"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(next);
            // a problem with the last code is gone once a new one is being typed
            if (problem) setProblem(null);
            if (note) setNote(null);
            // the sixth digit sends it: nothing more to press
            if (next.length === 6 && next !== code) void send(next);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : pause ? `${id}-pause` : undefined}
          autoFocus={autoFocus}
        />
      </div>
      {pause && paused ? (
        <div id={`${id}-pause`} role="alert">
          <Banner tone="warn" title={pause.title}>
            {pause.message}
          </Banner>
        </div>
      ) : problem ? (
        <div id={`${id}-problem`} className="login-field-error" role="alert">
          {problem}
        </div>
      ) : note ? (
        <div className="login-msg" role="status">
          {note}
        </div>
      ) : null}
      <Button className="login-submit" type="submit" busy={busy} disabled={paused || !ready}>
        {paused ? (
          <>
            <Icon name="lock" />
            Try again in {clockTime(left)}
          </>
        ) : busy ? (
          busyLabel
        ) : (
          label
        )}
      </Button>
    </form>
  );
}
