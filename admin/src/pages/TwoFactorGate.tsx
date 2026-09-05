import { useCallback, useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api, ApiError } from '../api';

/**
 * Nothing in the admin panel renders until 2FA is done.
 *
 * The API refuses every /admin route without it, so showing the workspace first
 * would only produce a screen of failed requests. This asks the API what this
 * session still needs and shows exactly that: set up an authenticator, or enter
 * a code.
 */

interface SessionState {
  roles: string[];
  needsEnrollment: boolean;
  needsVerification: boolean;
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
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      role="img"
      aria-label="Scan this with your authenticator app"
      style={{ background: '#fff', borderRadius: 8, padding: 4 }}
    >
      <path d={cells.join('')} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}

export function TwoFactorGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await api<SessionState>('/admin/session'));
    } catch (err) {
      // 403 here means the account is not staff at all — a different problem
      // from "needs 2FA", and worth saying plainly
      if (err instanceof ApiError && err.status === 403) setDenied(true);
      else setError(err instanceof ApiError ? err.message : 'Could not check this session');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (denied) {
    return (
      <Screen title="Not an admin account">
        <p className="subtle">
          This account does not have admin access. Sign in with one that does, or ask a superadmin to grant it.
        </p>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Could not check this session">
        <p className="subtle">{error}</p>
        <button className="primary" onClick={() => void load()}>
          Try again
        </button>
      </Screen>
    );
  }

  if (!state) return <Screen title="Checking your session…" />;
  if (state.needsEnrollment) return <Enroll onDone={load} />;
  if (state.needsVerification) return <Verify onDone={load} />;
  return <>{children}</>;
}

/** First-time setup: show the secret as a QR, confirm with a live code. */
function Enroll({ onDone }: { onDone: () => Promise<void> }): React.JSX.Element {
  const [secret, setSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
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
      setMsg(err instanceof ApiError ? err.message : 'Could not confirm');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Set up two-factor authentication">
      <p className="subtle">
        The admin panel requires it. Scan this with an authenticator app — Google Authenticator, 1Password, Aegis,
        anything that does TOTP — then enter the six-digit code it shows.
      </p>

      {secret ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 14px' }}>
            <QrSvg text={secret.otpauthUri} />
          </div>
          <div className="subtle" style={{ marginBottom: 6 }}>
            Can’t scan? Enter this key by hand:
          </div>
          <code className="secret">{secret.secret}</code>
          <p className="subtle" style={{ marginTop: 10 }}>
            Keep a copy somewhere safe. Losing it means another admin has to reset your 2FA — a password alone
            cannot, by design.
          </p>
        </>
      ) : (
        <p className="subtle">Preparing…</p>
      )}

      <form onSubmit={(e) => void confirm(e)} style={{ marginTop: 16 }}>
        <label style={{ display: 'block' }}>
          Six-digit code
          <CodeInput value={code} onChange={setCode} />
        </label>
        {msg && <div className="error" style={{ marginTop: 8 }}>{msg}</div>}
        <button className="primary" type="submit" disabled={busy || code.length !== 6 || !secret} style={{ marginTop: 12 }}>
          {busy ? 'Confirming…' : 'Confirm and continue'}
        </button>
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
      setMsg(err instanceof ApiError ? err.message : 'Could not verify');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Enter your 2FA code">
      <p className="subtle">
        Open your authenticator app and enter the current six-digit code for MyKurda Admin.
      </p>
      <form onSubmit={(e) => void submit(e)} style={{ marginTop: 14 }}>
        <CodeInput value={code} onChange={setCode} autoFocus />
        {msg && <div className="error" style={{ marginTop: 8 }}>{msg}</div>}
        <button className="primary" type="submit" disabled={busy || code.length !== 6} style={{ marginTop: 12 }}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </Screen>
  );
}

/** Six digits, and nothing else — pasting a code with spaces still works. */
function CodeInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}): React.JSX.Element {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      aria-label="Six-digit code"
      autoFocus={autoFocus}
      style={{ letterSpacing: '0.35em', fontSize: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

/** The centred card these steps share with the login screen. */
function Screen({ title, children }: { title: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand" style={{ padding: '0 0 10px' }}>
          MyKurda Admin
        </div>
        <h1 style={{ marginBottom: 10 }}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
