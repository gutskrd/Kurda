import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface AdminMe {
  userId: string;
  roles: string[];
  capabilities: string[];
}
interface Enrollment {
  secret: string;
  otpauthUri: string;
}

type Status = 'loading' | 'active' | 'needs_2fa';

/**
 * Admin security / 2FA (KUR-099). Probes `/admin/me` (role + confirmed-2FA gated):
 * a 403 `TOTP_REQUIRED` means the admin still has to enrol. Enrolment shows the
 * secret for manual entry into an authenticator app, then confirms with a live code.
 */
export function Security({ onConfirmed }: { onConfirmed?: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<AdminMe | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await api<AdminMe>('/admin/me');
      setMe(res);
      setStatus('active');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setStatus('needs_2fa');
        return;
      }
      throw err;
    }
  }, []);
  useEffect(() => {
    void probe();
  }, [probe]);

  async function startEnroll(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      setEnrollment(await api<Enrollment>('/admin/2fa/enroll', { method: 'POST' }));
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed to start enrolment');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/2fa/confirm', { method: 'POST', body: { code: code.trim() } });
      setEnrollment(null);
      setCode('');
      onConfirmed?.();
      await probe();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Could not confirm code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Security</h1>
          <div className="subtle">Two-factor authentication for privileged admin actions</div>
        </div>
      </div>

      {status === 'loading' && <div className="card empty">Loading…</div>}

      {status === 'active' && me && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <span className="badge ok">2FA active ✓</span>
          </div>
          <div className="subtle" style={{ marginBottom: 6 }}>
            Roles: {me.roles.length ? me.roles.join(', ') : '—'}
          </div>
          <div className="section-title" style={{ marginTop: 8 }}>
            Capabilities
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {me.capabilities.length === 0 ? (
              <span className="subtle">None.</span>
            ) : (
              me.capabilities.map((c) => (
                <span key={c} className="badge">
                  {c}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {status === 'needs_2fa' && (
        <div className="card" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="badge mid">2FA not set up</span>
            </div>
            <div className="subtle">
              User management and economy actions require a confirmed authenticator. Set it up once below.
            </div>
          </div>

          {!enrollment ? (
            <button className="primary" onClick={() => void startEnroll()} disabled={busy} style={{ alignSelf: 'flex-start' }}>
              {busy ? 'Starting…' : 'Set up 2FA'}
            </button>
          ) : (
            <>
              <div>
                <div className="section-title" style={{ marginTop: 0 }}>
                  1. Add this key to your authenticator
                </div>
                <div className="subtle" style={{ marginBottom: 6 }}>
                  Enter it manually (type TOTP), or open the provisioning URI on the device.
                </div>
                <code className="secret">{enrollment.secret}</code>
                <div className="subtle" style={{ wordBreak: 'break-all', marginTop: 8, fontSize: 12 }}>
                  {enrollment.otpauthUri}
                </div>
              </div>
              <form onSubmit={confirm} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="section-title" style={{ marginTop: 0 }}>
                  2. Enter the 6-digit code
                </div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
                <button className="primary" type="submit" disabled={busy || code.trim().length < 6} style={{ alignSelf: 'flex-start' }}>
                  {busy ? 'Confirming…' : 'Confirm & activate'}
                </button>
              </form>
            </>
          )}
          {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
        </div>
      )}

      {status === 'needs_2fa' && msg && !enrollment && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
