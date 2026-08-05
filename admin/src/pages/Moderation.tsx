import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

interface QueueCase {
  id: string;
  source: string;
  sourceRef: string;
  subjectUserId: string | null;
  severity: number;
  summary: string;
  status: 'open' | 'claimed' | 'resolved';
  claimedBy: string | null;
}
type Resolution = 'dismiss' | 'warn' | 'mute' | 'ban' | 'remove';

const RESOLUTIONS: Resolution[] = ['dismiss', 'warn', 'mute', 'ban', 'remove'];

function sevClass(s: number): string {
  return s >= 85 ? 'hi' : s >= 60 ? 'mid' : '';
}

/** Unified moderation queue (KUR-102): claim + one-click resolve. */
export function Moderation(): React.JSX.Element {
  const [cases, setCases] = useState<QueueCase[]>([]);
  const [sla, setSla] = useState<{ medianSeconds: number | null; resolved: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([
        api<{ cases: QueueCase[] }>('/admin/moderation/queue'),
        api<{ medianSeconds: number | null; resolved: number }>('/admin/moderation/sla'),
      ]);
      setCases(q.cases);
      setSla(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(id: string): Promise<void> {
    setBusyId(id);
    try {
      await api(`/admin/moderation/cases/${id}/claim`, { method: 'POST' });
      await load();
    } finally {
      setBusyId(null);
    }
  }
  async function resolve(id: string, resolution: Resolution): Promise<void> {
    setBusyId(id);
    try {
      await api(`/admin/moderation/cases/${id}/resolve`, { method: 'POST', body: { resolution } });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Moderation Queue</h1>
          <div className="subtle">
            {cases.length} open · median time-to-resolution{' '}
            {sla?.medianSeconds != null ? `${Math.round(sla.medianSeconds)}s` : '—'} over {sla?.resolved ?? 0} resolved
          </div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="empty">🎉 Queue is empty — nothing to review.</div>
        ) : (
          <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Source</th>
                <th>Summary</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`badge ${sevClass(c.severity)}`}>{c.severity}</span>
                  </td>
                  <td>
                    <span className="badge">{c.source}</span>
                  </td>
                  <td>{c.summary}</td>
                  <td>
                    {c.status}
                    {c.claimedBy ? ' 🔒' : ''}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      {c.status === 'open' && (
                        <button onClick={() => void claim(c.id)} disabled={busyId === c.id}>
                          Claim
                        </button>
                      )}
                      {RESOLUTIONS.map((r) => (
                        <button
                          key={r}
                          className={r === 'ban' || r === 'remove' ? 'danger' : ''}
                          onClick={() => void resolve(c.id, r)}
                          disabled={busyId === c.id}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
