import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface BotFlag {
  userId: string;
  score: number;
  tier: string;
  signals: unknown;
  computedAt: string;
}

const TIER_CLS: Record<string, string> = { flagged: 'hi', challenge: 'mid', clear: 'ok' };

function short(id: string): string {
  return id.slice(0, 8);
}

/** Behavioral bot-detection review (KUR-110): flagged accounts, confirm/clear. */
export function Antibot(): React.JSX.Element {
  const [flagged, setFlagged] = useState<BotFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ flagged: BotFlag[] }>('/admin/antibot/flagged');
      setFlagged(res.flagged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load flagged accounts');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function runScoring(): Promise<void> {
    setScoring(true);
    setMsg(null);
    try {
      const res = await api<{ scored: number }>('/admin/antibot/score', { method: 'POST' });
      setMsg(`Scored ${res.scored} active account${res.scored === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Scoring failed');
    } finally {
      setScoring(false);
    }
  }

  async function reverse(userId: string): Promise<void> {
    if (!confirm(`Confirm ${short(userId)} as a bot? This reverses its XP gains through the ledger.`)) return;
    setBusy(userId);
    setMsg(null);
    try {
      const res = await api<{ reversedXp: number }>(`/admin/antibot/${userId}/reverse`, { method: 'POST' });
      setMsg(`Confirmed ${short(userId)} — reversed ${res.reversedXp} XP.`);
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(null);
    }
  }

  async function clear(userId: string): Promise<void> {
    setBusy(userId);
    setMsg(null);
    try {
      await api(`/admin/antibot/${userId}/clear`, { method: 'POST' });
      setMsg(`Cleared ${short(userId)} as a false positive.`);
      await load();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Antibot</h1>
          <div className="subtle">Behaviorally flagged accounts awaiting review</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void runScoring()} disabled={scoring}>
          {scoring ? 'Scoring…' : 'Run scoring job'}
        </button>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'} style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : flagged.length === 0 ? (
          <div className="empty">No accounts are currently flagged.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Score</th>
                  <th>Tier</th>
                  <th>Flagged</th>
                  <th>Signals</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((f) => (
                  <tr key={f.userId}>
                    <td>
                      <code title={f.userId}>{short(f.userId)}</code>
                    </td>
                    <td>{Math.round(f.score * 100)}%</td>
                    <td>
                      <span className={`badge ${TIER_CLS[f.tier] ?? ''}`}>{f.tier}</span>
                    </td>
                    <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{new Date(f.computedAt).toLocaleString()}</td>
                    <td>
                      <details>
                        <summary className="subtle" style={{ cursor: 'pointer' }}>view</summary>
                        <pre className="signals-json">{JSON.stringify(f.signals, null, 2)}</pre>
                      </details>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="danger" onClick={() => void reverse(f.userId)} disabled={busy === f.userId}>
                          Confirm bot
                        </button>
                        <button onClick={() => void clear(f.userId)} disabled={busy === f.userId}>
                          Clear
                        </button>
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
