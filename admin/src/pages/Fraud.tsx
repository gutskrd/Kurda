import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type FraudFlag = 'VELOCITY' | 'REFUND_ABUSE' | 'RECEIPT_REUSE';

interface FraudReview {
  id: string;
  userId: string;
  receiptId: string | null;
  flags: FraudFlag[];
  evidence: Record<string, unknown>;
  status: string;
  createdAt: string;
}

const FLAG_LABEL: Record<FraudFlag, string> = {
  VELOCITY: 'velocity',
  REFUND_ABUSE: 'refund abuse',
  RECEIPT_REUSE: 'receipt reuse',
};

function short(id: string): string {
  return id.slice(0, 8);
}

/** Payment-fraud review queue (KUR-073): held purchases, clear or confirm. */
export function Fraud(): React.JSX.Element {
  const [reviews, setReviews] = useState<FraudReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ reviews: FraudReview[] }>('/admin/fraud/reviews');
      setReviews(res.reviews);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the fraud queue');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, decision: 'clear' | 'confirm'): Promise<void> {
    if (decision === 'confirm' && !confirm('Confirm fraud? The account stays on hold and the held Gems are not granted.')) return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await api<{ status: string; grantedGems: number }>(`/admin/fraud/reviews/${id}/resolve`, {
        method: 'POST',
        body: { decision },
      });
      setMsg(
        decision === 'clear'
          ? `Cleared — released the hold and granted ${res.grantedGems} Gems.`
          : `Confirmed fraud — hold kept (status: ${res.status}).`,
      );
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
          <h1>Fraud</h1>
          <div className="subtle">Held purchases awaiting a fraud decision</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'} style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : reviews.length === 0 ? (
          <div className="empty">No open fraud reviews.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Receipt</th>
                  <th>Flags</th>
                  <th>Opened</th>
                  <th>Evidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code title={r.userId}>{short(r.userId)}</code>
                    </td>
                    <td className="subtle">{r.receiptId ? short(r.receiptId) : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {r.flags.map((f) => (
                          <span key={f} className="badge hi">
                            {FLAG_LABEL[f] ?? f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="subtle" style={{ whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <details>
                        <summary className="subtle" style={{ cursor: 'pointer' }}>view</summary>
                        <pre className="signals-json">{JSON.stringify(r.evidence, null, 2)}</pre>
                      </details>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="primary" onClick={() => void resolve(r.id, 'clear')} disabled={busy === r.id}>
                          Clear
                        </button>
                        <button className="danger" onClick={() => void resolve(r.id, 'confirm')} disabled={busy === r.id}>
                          Confirm fraud
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
