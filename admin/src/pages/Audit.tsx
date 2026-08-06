import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface AuditRow {
  id: string;
  adminId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

function short(id: string | null): string {
  return id ? id.slice(0, 8) : '—';
}
function fmt(d: string): string {
  return new Date(d).toLocaleString();
}

/**
 * Admin audit trail (KUR-104). Read-only, superadmin + 2FA gated. Every
 * successful admin mutation is recorded server-side (append-only) — this just
 * searches it, filterable by action prefix / admin / target.
 */
export function Audit(): React.JSX.Element {
  const [action, setAction] = useState('');
  const [adminId, setAdminId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (action.trim()) params.set('action', action.trim());
      if (adminId.trim()) params.set('adminId', adminId.trim());
      if (targetId.trim()) params.set('targetId', targetId.trim());
      const res = await api<{ entries: AuditRow[] }>(`/admin/audit?${params.toString()}`);
      setEntries(res.entries);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        if (err.code === 'TOTP_REQUIRED') setNeeds2fa(true);
        else setForbidden(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load the audit trail');
    } finally {
      setLoading(false);
    }
  }, [action, adminId, targetId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (needs2fa) {
    return (
      <Frame>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="badge mid">2FA required</span>
          </div>
          <div className="subtle">
            The audit trail needs a confirmed authenticator. Open <a href="#/security">Security</a> to set up 2FA.
          </div>
        </div>
      </Frame>
    );
  }
  if (forbidden) {
    return (
      <Frame>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="badge hi">Superadmin only</span>
          </div>
          <div className="subtle">Only superadmins can view the audit trail.</div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <form
        className="row"
        style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action prefix (e.g. user.)" style={{ width: 200 }} />
        <input value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder="Admin id (uuid)" style={{ width: 200 }} />
        <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Target id" style={{ width: 200 }} />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Filter'}
        </button>
      </form>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="empty">No audit entries match these filters.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Admin</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{fmt(e.createdAt)}</td>
                    <td>
                      <span className="badge">{e.action}</span>
                    </td>
                    <td>
                      <code title={e.adminId}>{short(e.adminId)}</code>
                    </td>
                    <td>
                      {e.targetId ? (
                        <code title={`${e.targetType ?? ''} ${e.targetId}`.trim()}>{short(e.targetId)}</code>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td className="subtle">{e.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Audit log</h1>
          <div className="subtle">Append-only trail of every admin action</div>
        </div>
      </div>
      {children}
    </div>
  );
}
