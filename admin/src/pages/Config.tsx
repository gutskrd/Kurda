import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

interface PendingChange {
  id: string;
  target: 'shop_item' | 'event';
  payload: Record<string, unknown>;
  sensitive: boolean;
  proposerId: string | null;
  createdAt: string;
}

function summary(c: PendingChange): string {
  const p = c.payload;
  return c.target === 'shop_item'
    ? `${String(p.sku)} · ${String(p.name)} · ${String(p.price)} ${String(p.currency)}`
    : `${String(p.key)} · ${String(p.name)} · ${String(p.startsAt).slice(0, 10)}→${String(p.endsAt).slice(0, 10)}`;
}

/** Shop + event config with dual-admin approval (KUR-103). */
export function Config(): React.JSX.Element {
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ pending: PendingChange[] }>('/admin/config/changes');
      setPending(res.pending);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: 'approve' | 'reject'): Promise<void> {
    setBusyId(id);
    try {
      await api(`/admin/config/changes/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? { reason: 'rejected from admin' } : undefined,
      });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Config Approvals</h1>
          <div className="subtle">Sensitive shop/event changes awaiting a second admin</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="empty">Nothing pending approval.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Change</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="badge">{c.target}</span>
                  </td>
                  <td>{summary(c)}</td>
                  <td>{c.sensitive && <span className="badge mid">sensitive</span>}</td>
                  <td>
                    <div className="row">
                      <button className="primary" onClick={() => void decide(c.id, 'approve')} disabled={busyId === c.id}>
                        Approve
                      </button>
                      <button className="danger" onClick={() => void decide(c.id, 'reject')} disabled={busyId === c.id}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ProposeForm onProposed={load} />
    </div>
  );
}

function ProposeForm({ onProposed }: { onProposed: () => Promise<void> }): React.JSX.Element {
  const [target, setTarget] = useState<'shop_item' | 'event'>('shop_item');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // shop fields
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<'zer' | 'gems'>('zer');
  const [price, setPrice] = useState('100');
  // event fields
  const [key, setKey] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [rewardZer, setRewardZer] = useState('');

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payload =
      target === 'shop_item'
        ? { sku, name, currency, price: Number(price), category: 'tag' }
        : {
            key,
            name,
            type: 'seasonal',
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            ...(rewardZer ? { rewards: { zer: Number(rewardZer) } } : {}),
          };
    try {
      const res = await api<{ status: string }>('/admin/config/changes', { method: 'POST', body: { target, payload } });
      setMsg(res.status === 'applied' ? '✅ Applied immediately.' : '⏳ Queued for a second admin to approve.');
      await onProposed();
    } catch (err) {
      setMsg(err instanceof ApiError ? `❌ ${err.message}` : '❌ Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <h1 style={{ fontSize: 16 }}>Propose a change</h1>
      <label>
        Target
        <select value={target} onChange={(e) => setTarget(e.target.value as 'shop_item' | 'event')}>
          <option value="shop_item">Shop item</option>
          <option value="event">Event</option>
        </select>
      </label>

      {target === 'shop_item' ? (
        <>
          <label>
            SKU<input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label>
            Name<input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value as 'zer' | 'gems')}>
                <option value="zer">Zêr</option>
                <option value="gems">Gems</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Price<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </label>
          </div>
          <div className="subtle">Price ≥ 1000 needs a second admin's approval.</div>
        </>
      ) : (
        <>
          <label>
            Key<input value={key} onChange={(e) => setKey(e.target.value)} required />
          </label>
          <label>
            Name<input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="row">
            <label style={{ flex: 1 }}>
              Starts<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label style={{ flex: 1 }}>
              Ends<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </label>
          </div>
          <label>
            Reward Zêr (optional)<input type="number" value={rewardZer} onChange={(e) => setRewardZer(e.target.value)} />
          </label>
          <div className="subtle">Events must start in the future; those granting rewards need approval.</div>
        </>
      )}

      {msg && <div className={msg.startsWith('❌') ? 'error' : 'subtle'}>{msg}</div>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Propose'}
      </button>
    </form>
  );
}
