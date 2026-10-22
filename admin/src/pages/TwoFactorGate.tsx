import { useCallback, useEffect, useId, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { SessionProvider, sessionFrom, type AdminSession } from '../session';
import { Banner, Button, Icon, clockTime, describeError, errorLine, useCountdown } from '../ui';
import { HevaloMark } from '../brand/HevaloMark';

/**
 * Nothing in the admin panel renders until 2FA is done.
 *
 * The API refuses every /admin route without it, so showing the workspace first
 * would only produce a screen of failed requests. This asks the API what this
 * session still needs and shows exactly that: set up an authenticator, or enter
 * a code. Once through, it shares what the session may do (its capabilities
 * and staff roles) with everything under it.
 */

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
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      role="img"
      aria-label="Scan this with your authenticator app"
    >
      <path d={cells.join('')} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

export function TwoFactorGate({ children, onSignOut }: { children: React.ReactNode; onSignOut: () => void }): React.JSX.Element {
  const { logout } = useAuth();
  const [state, setState] = useState<AdminSession | null>(null);
  const [error, setError] = useState<unknown>(null);

  // every step before the workspace needs a way back to the sign-in: an
  // admin without their authenticator had none, short of clearing the
  // browser's storage
  const signOut = (): void => {
    logout();
    onSignOut();
  };
  const leave = useRef(signOut);
  leave.current = signOut;

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(sessionFrom(await api<AdminSession>('/admin/session')));
    } catch (err) {
      // an account the console is not for is answered as if it were not there
      // (404), or refused (403): back to the sign-in, with nothing said about why
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) leave.current();
      else setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error != null) {
    const d = describeError(error, 'the admin');
    return (
      <Screen title={d.title} onSignOut={signOut}>
        <p className="gate-text">{d.message}</p>
        <Button className="login-submit" icon="refresh" onClick={() => void load()}>
          Try again
        </Button>
      </Screen>
    );
  }

  if (!state) return <Screen title="Checking your session…" busy />;
  if (state.needsEnrollment) return <Enroll onDone={load} onSignOut={signOut} />;
  if (state.needsVerification) return <Verify onDone={load} onSignOut={signOut} />;
  return <SessionProvider value={state}>{children}</SessionProvider>;
}

/** First-time setup: show the secret as a QR, confirm with a live code. */
function Enroll({ onDone, onSignOut }: { onDone: () => Promise<void>; onSignOut: () => void }): React.JSX.Element {
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
    <Screen title="Set up two-factor authentication" onSignOut={onSignOut}>
      <p className="gate-text">
        The admin panel requires it. Scan this with an authenticator app — Google Authenticator, 1Password, Aegis,
        anything that does TOTP — then enter the six-digit code it shows.
      </p>

      {secret ? (
        <>
          <div className="gate-qr">
            <QrSvg text={secret.otpauthUri} />
          </div>
          <div className="gate-text">Can’t scan? Enter this key by hand:</div>
          <code className="secret">{secret.secret}</code>
          <p className="gate-text">
            Keep a copy somewhere safe. Without it, your 2FA has to be reset on the server by whoever runs Hevalo — a
            password alone cannot open the admin, by design.
          </p>
        </>
      ) : problem ? (
        <div className="login-field-error" role="alert">
          {problem}
        </div>
      ) : (
        <p className="gate-text">Preparing…</p>
      )}

      <CodeForm path="/admin/2fa/confirm" label="Confirm and continue" busyLabel="Confirming…" ready={!!secret} onDone={onDone} />
    </Screen>
  );
}

/** Already enrolled, but this session has not proved it yet. */
function Verify({ onDone, onSignOut }: { onDone: () => Promise<void>; onSignOut: () => void }): React.JSX.Element {
  return (
    <Screen title="Enter your 2FA code" onSignOut={onSignOut}>
      <p className="gate-text">Open your authenticator app and enter the current six-digit code for Hevalo Admin.</p>
      <CodeForm path="/admin/auth/verify" label="Continue" busyLabel="Checking…" ready onDone={onDone} autoFocus />
    </Screen>
  );
}

/**
 * The code, sent to one of the two code routes. A wrong code is said and the
 * box emptied for the next one. After five wrong codes the server pauses code
 * entry (429 TOTP_LOCKED, with how long) — the per-person rate limit answers
 * 429 too — and that is said calmly with the time left, the button counting
 * it down and coming back by itself when it is over: the server's "too many
 * wrong codes — try again later" said neither how long nor that it was not
 * the admin's fault.
 */
function CodeForm({
  path,
  label,
  busyLabel,
  ready,
  onDone,
  autoFocus = false,
}: {
  path: string;
  label: string;
  busyLabel: string;
  /** whether there is anything to confirm yet (the setup's secret has arrived) */
  ready: boolean;
  onDone: () => Promise<void>;
  autoFocus?: boolean;
}): React.JSX.Element {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pause, setPause] = useState<{ until: number; title: string; message: string } | null>(null);
  const left = useCountdown(pause?.until ?? null);
  const paused = left > 0;

  // the pause is over: say so, and put the cursor back in the box
  useEffect(() => {
    if (!pause || paused) return;
    setPause(null);
    setNote('You can enter a code again.');
    input.current?.focus();
  }, [pause, paused]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (paused || !ready) return;
    if (code.length !== 6) {
      setProblem('Enter all six digits from your authenticator app.');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await api(path, { method: 'POST', body: { code } });
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="gate-form" noValidate>
      <label className="login-label" htmlFor={`${id}-code`}>
        Six-digit code
      </label>
      <div className="login-input">
        <CodeInput
          id={`${id}-code`}
          ref={input}
          value={code}
          onChange={(next) => {
            setCode(next);
            // a problem with the last code is gone once a new one is being typed
            if (problem) setProblem(null);
            if (note) setNote(null);
          }}
          invalid={!!problem}
          describedBy={problem ? `${id}-problem` : pause ? `${id}-pause` : undefined}
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

/** Six digits, and nothing else — pasting a code with spaces still works. */
function CodeInput({
  id,
  ref,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  ref: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}): React.JSX.Element {
  return (
    <input
      id={id}
      ref={ref}
      className="code-input"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
    />
  );
}

/** The centred card these steps share, with a way to sign out under it. */
function Screen({
  title,
  children,
  busy = false,
  onSignOut,
}: {
  title: string;
  children?: React.ReactNode;
  busy?: boolean;
  onSignOut?: () => void;
}): React.JSX.Element {
  return (
    <div className="login">
      <div className="login-card gate-card" aria-busy={busy || undefined}>
        <div className="login-top">
          <span className="login-brand">
            <HevaloMark size={40} />
            Hevalo
          </span>
          <span>Admin console</span>
        </div>
        <h1 className="login-title gate-title">
          {busy && <Icon name="refresh" className="gate-busy" />}
          {title}
        </h1>
        {children}
        {onSignOut && (
          <p className="gate-foot">
            Wrong account, or no authenticator to hand?{' '}
            <button type="button" className="login-forgot" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
