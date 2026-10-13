import { useCallback, useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api, ApiError } from '../api';
import { SessionProvider, sessionFrom, type AdminSession } from '../session';
import { Button, Icon } from '../ui';

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

export function TwoFactorGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AdminSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(sessionFrom(await api<AdminSession>('/admin/session')));
    } catch (err) {
      // 403 here means the account is not staff at all — a different problem
      // from "needs 2FA", and worth saying plainly
      if (err instanceof ApiError && err.status === 403) setDenied(true);
      else setError(err instanceof ApiError ? err.message : 'The server could not be reached.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (denied) {
    return (
      <Screen title="Not an admin account">
        <p className="gate-text">
          This account does not have admin access. Sign in with one that does, or ask a superadmin to grant it.
        </p>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Could not check this session">
        <p className="gate-text">{error}</p>
        <Button variant="primary" icon="refresh" onClick={() => void load()}>
          Try again
        </Button>
      </Screen>
    );
  }

  if (!state) return <Screen title="Checking your session…" busy />;
  if (state.needsEnrollment) return <Enroll onDone={load} />;
  if (state.needsVerification) return <Verify onDone={load} />;
  return <SessionProvider value={state}>{children}</SessionProvider>;
}

/** First-time setup: show the secret as a QR, confirm with a live code. */
function Enroll({ onDone }: { onDone: () => Promise<void> }): React.JSX.Element {
  const [secret, setSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
        setMsg(err instanceof ApiError ? err.message : 'Could not start setup');
      }
    })();
  }, []);

  async function confirm(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/2fa/confirm', { method: 'POST', body: { code } });
      await onDone();
    } catch (err) {
      setMsg(err instanceof ApiError && err.code === 'INVALID_CODE' ? 'That code did not match. Enter the one showing now.' : err instanceof ApiError ? err.message : 'Could not confirm');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Set up two-factor authentication">
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
            Keep a copy somewhere safe. Losing it means another admin has to reset your 2FA — a password alone
            cannot, by design.
          </p>
        </>
      ) : (
        !msg && <p className="gate-text">Preparing…</p>
      )}

      <form onSubmit={(e) => void confirm(e)} className="gate-form">
        <label htmlFor="gate-code">Six-digit code</label>
        <CodeInput id="gate-code" value={code} onChange={setCode} />
        {msg && (
          <div className="field-error" role="alert">
            {msg}
          </div>
        )}
        <Button variant="primary" type="submit" busy={busy} disabled={code.length !== 6 || !secret}>
          {busy ? 'Confirming…' : 'Confirm and continue'}
        </Button>
      </form>
    </Screen>
  );
}

/** Already enrolled, but this session has not proved it yet. */
function Verify({ onDone }: { onDone: () => Promise<void> }): React.JSX.Element {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/auth/verify', { method: 'POST', body: { code } });
      await onDone();
    } catch (err) {
      setMsg(err instanceof ApiError && err.code === 'INVALID_CODE' ? 'That code did not match. Enter the one showing now.' : err instanceof ApiError ? err.message : 'Could not verify');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Enter your 2FA code">
      <p className="gate-text">Open your authenticator app and enter the current six-digit code for Hevalo Admin.</p>
      <form onSubmit={(e) => void submit(e)} className="gate-form">
        <label htmlFor="gate-code" className="sr-only">
          Six-digit code
        </label>
        <CodeInput id="gate-code" value={code} onChange={setCode} autoFocus />
        {msg && (
          <div className="field-error" role="alert">
            {msg}
          </div>
        )}
        <Button variant="primary" type="submit" busy={busy} disabled={code.length !== 6}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      </form>
    </Screen>
  );
}

/** Six digits, and nothing else — pasting a code with spaces still works. */
function CodeInput({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}): React.JSX.Element {
  return (
    <input
      id={id}
      className="code-input"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      autoFocus={autoFocus}
    />
  );
}

/** The centred card these steps share. */
function Screen({ title, children, busy = false }: { title: string; children?: React.ReactNode; busy?: boolean }): React.JSX.Element {
  return (
    <div className="gate">
      <div className="card gate-card" aria-busy={busy || undefined}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          Hevalo Admin
        </div>
        <h1 className="gate-title">
          {busy && <Icon name="refresh" className="gate-busy" />}
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
