import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

/**
 * Economy actions on a single user: balance adjustments and item grants.
 *
 * Both go through the API, which routes balance changes through the double-entry
 * ledger (never a direct balance edit) and records every call in the admin audit
 * log. Each action requires a reason, which is stored with it.
 */

interface EconomyUser {
  id: string;
  username: string;
}

export interface OwnedItem {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  source: string;
  equipped: boolean;
}

interface Props {
  user: EconomyUser;
  onChanged: () => void;
  onError: (err: unknown) => void;
}

/** Add or take away Zêr / Gems. */
export function WalletActions({ user, onChanged, onError }: Props): React.JSX.Element {
  const [currency, setCurrency] = useState<'zer' | 'gems'>('zer');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) {
      setMsg('Enter a whole, non-zero amount — a negative one takes it away.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ balance?: number }>(`/admin/users/${user.id}/wallet`, {
        method: 'POST',
        body: { currency, amount: value, reason: reason.trim() },
      });
      const unit = currency === 'zer' ? 'Zêr' : 'Gems';
      setMsg(
        `${value > 0 ? 'Added' : 'Removed'} ${Math.abs(value)} ${unit}` +
          (res.balance !== undefined ? ` — new balance ${res.balance}.` : '.'),
      );
      setAmount('');
      setReason('');
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 403) setMsg(err.message);
      else onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-title" style={{ margin: 0 }}>
        Adjust balance
      </div>
      <div className="subtle">
        A positive amount adds, a negative one takes away. Each change is written to the ledger with its
        reason, so it stays traceable — balances are never edited directly.
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'zer' | 'gems')}
          style={{ width: 'auto' }}
        >
          <option value="zer">Zêr</option>
          <option value="gems">Gems</option>
        </select>
        <input
          type="number"
          step={1}
          placeholder="500 or -500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 150 }}
        />
        <input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="primary" type="submit" disabled={busy || !amount.trim() || !reason.trim()}>
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {msg && <div className="subtle">{msg}</div>}
    </form>
  );
}

/** Grant or take back shop items. Revoking also un-equips the item. */
export function ItemActions({ user, onChanged, onError }: Props): React.JSX.Element {
  const [items, setItems] = useState<OwnedItem[] | null>(null);
  const [catalog, setCatalog] = useState<{ sku: string; name: string; category: string }[]>([]);
  const [sku, setSku] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: OwnedItem[] }>(`/admin/users/${user.id}/items`);
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
    void api<{ items: { sku: string; name: string; category: string }[] }>('/admin/shop/items')
      .then((r) => setCatalog(r.items))
      .catch(() => setCatalog([]));
  }, [load]);

  async function act(run: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      await run();
      setMsg(done);
      setReason('');
      await load();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 403) setMsg(err.message);
      else onError(err);
    } finally {
      setBusy(false);
    }
  }

  function grant(e: React.FormEvent): void {
    e.preventDefault();
    if (!sku || !reason.trim()) return;
    void act(
      () => api(`/admin/users/${user.id}/items`, { method: 'POST', body: { sku, reason: reason.trim() } }),
      `Granted ${sku}.`,
    );
  }

  function revoke(item: OwnedItem): void {
    const why = prompt(`Reason for removing "${item.name}" from ${user.username}?`);
    if (!why?.trim()) return;
    void act(
      () =>
        api(`/admin/users/${user.id}/items/${encodeURIComponent(item.sku)}`, {
          method: 'DELETE',
          body: { reason: why.trim() },
        }),
      `Removed ${item.sku}.`,
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="section-title" style={{ margin: 0 }}>
        Items
      </div>

      <form className="row" style={{ gap: 10, flexWrap: 'wrap' }} onSubmit={grant}>
        <select value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Choose an item…</option>
          {catalog.map((c) => (
            <option key={c.sku} value={c.sku}>
              {c.category} · {c.name}
            </option>
          ))}
        </select>
        <input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="primary" type="submit" disabled={busy || !sku || !reason.trim()}>
          {busy ? 'Granting…' : 'Give item'}
        </button>
      </form>

      {items === null ? (
        <div className="subtle">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="subtle">Owns nothing yet.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.sku}>
                  <td>
                    {i.name} {i.equipped && <span className="badge">equipped</span>}
                    <div className="subtle">
                      <code>{i.sku}</code>
                    </div>
                  </td>
                  <td className="subtle">{i.category}</td>
                  <td>{i.quantity}</td>
                  <td className="subtle">{i.source}</td>
                  <td>
                    <button className="danger" onClick={() => revoke(i)} disabled={busy}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <div className="subtle">{msg}</div>}
    </div>
  );
}
