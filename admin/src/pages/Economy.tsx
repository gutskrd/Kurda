import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Currency = 'zer' | 'gems';

interface DailyPoint {
  day: string;
  faucet: number;
  sink: number;
  net: number;
  supply: number;
}
interface DriftReport {
  currency: string;
  windowDays: number;
  faucet: number;
  sink: number;
  ratio: number;
  target: number;
  drifting: boolean;
}

const CURRENCY_LABEL: Record<Currency, string> = { zer: 'Zêr', gems: 'Gems' };

/** Economy monitoring dashboard (KUR-074): net supply + faucet/sink drift. */
export function Economy(): React.JSX.Element {
  const [currency, setCurrency] = useState<Currency>('zer');
  const [points, setPoints] = useState<DailyPoint[]>([]);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [aggregating, setAggregating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([
        api<{ currency: Currency; points: DailyPoint[] }>(`/admin/economy/supply?currency=${currency}&days=30`),
        api<DriftReport>(`/admin/economy/drift?currency=${currency}`),
      ]);
      setPoints(s.points);
      setDrift(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load economy metrics');
    } finally {
      setLoading(false);
    }
  }, [currency]);
  useEffect(() => {
    void load();
  }, [load]);

  async function aggregateToday(): Promise<void> {
    setAggregating(true);
    setError(null);
    try {
      await api('/admin/economy/aggregate', { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aggregation failed');
    } finally {
      setAggregating(false);
    }
  }

  const latest = points[points.length - 1];
  const maxSupply = Math.max(1, ...points.map((p) => Math.abs(p.supply)));

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Economy</h1>
          <div className="subtle">Currency supply, faucets &amp; sinks (last 30 days)</div>
        </div>
        <div className="spacer" />
        <label className="subtle" style={{ width: 'auto' }}>
          Currency{' '}
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} style={{ width: 'auto' }}>
            <option value="zer">Zêr</option>
            <option value="gems">Gems</option>
          </select>
        </label>
        <button onClick={() => void aggregateToday()} disabled={aggregating}>
          {aggregating ? 'Aggregating…' : 'Re-aggregate today'}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="card empty">Loading…</div>
      ) : (
        <>
          <div className="tiles">
            <div className="card tile">
              <div className="n">{latest ? latest.supply.toLocaleString() : 0}</div>
              <div className="k">Total {CURRENCY_LABEL[currency]} in circulation</div>
            </div>
            <div className="card tile">
              <div className="n">{drift ? drift.faucet.toLocaleString() : 0}</div>
              <div className="k">Faucet (7d)</div>
            </div>
            <div className="card tile">
              <div className="n">{drift ? drift.sink.toLocaleString() : 0}</div>
              <div className="k">Sink (7d)</div>
            </div>
            <div className="card tile">
              <div className="n">
                {drift ? drift.ratio.toFixed(2) : '—'}{' '}
                {drift && <span className={`badge ${drift.drifting ? 'hi' : 'ok'}`}>{drift.drifting ? 'drifting' : 'healthy'}</span>}
              </div>
              <div className="k">Faucet/sink ratio (target {drift?.target ?? 1})</div>
            </div>
          </div>

          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>
              Net {CURRENCY_LABEL[currency]} supply
            </div>
            {points.length === 0 ? (
              <div className="empty">
                No aggregated days yet. Click “Re-aggregate today” to roll up the wallet ledger.
              </div>
            ) : (
              <div className="bars" title="cumulative supply per day">
                {points.map((p) => (
                  <div
                    key={p.day}
                    className="b"
                    style={{ height: `${(Math.abs(p.supply) / maxSupply) * 100}%` }}
                    title={`${p.day}: supply ${p.supply}`}
                  />
                ))}
              </div>
            )}
          </div>

          {points.length > 0 && (
            <div className="card" style={{ padding: 0, marginTop: 16 }}>
              <div className="section-title" style={{ margin: '14px 16px 8px' }}>
                Daily faucet / sink
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Faucet</th>
                      <th>Sink</th>
                      <th>Net</th>
                      <th>Supply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p) => (
                      <tr key={p.day}>
                        <td>{p.day}</td>
                        <td>{p.faucet.toLocaleString()}</td>
                        <td>{p.sink.toLocaleString()}</td>
                        <td className={p.net < 0 ? 'subtle' : ''}>{p.net.toLocaleString()}</td>
                        <td>{p.supply.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
