import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

type Currency = 'zer' | 'gems';
type Category = 'cosmetic' | 'background' | 'icon' | 'powerup' | 'freeze' | 'misc';

const CATEGORIES: Category[] = ['cosmetic', 'background', 'icon', 'powerup', 'freeze', 'misc'];

interface Item {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  active: boolean;
  inStock: boolean;
  premiumOnly?: boolean;
  displayOrder?: number;
  assetKey?: string | null;
}

/**
 * Shop catalog management: what is on sale and what it costs.
 *
 * Prices are server-authoritative — the client sends only a SKU when buying, and
 * a purchase is rejected if the price moved since it was displayed. So editing a
 * price here changes it everywhere immediately and safely.
 */
export function Shop(): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: Item[] }>('/admin/shop/items');
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleStock(item: Item): Promise<void> {
    try {
      await api(`/shop/items/${encodeURIComponent(item.sku)}/stock`, {
        method: 'PATCH',
        body: { inStock: !item.inStock },
      });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed');
    }
  }

  const byCategory = new Map<string, Item[]>();
  for (const i of items) {
    const list = byCategory.get(i.category) ?? [];
    list.push(i);
    byCategory.set(i.category, list);
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Shop</h1>
          <div className="subtle">Catalog items, prices and availability</div>
        </div>
        <div className="spacer" />
        <button onClick={() => setCreating(true)}>New item</button>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="card empty">{error}</div>}

      {(creating || editing) && (
        <ItemForm
          item={editing}
          onDone={async () => {
            setEditing(null);
            setCreating(false);
            await load();
          }}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {loading ? (
        <div className="card empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="card empty">No items yet. Create one to start selling.</div>
      ) : (
        [...byCategory.entries()].map(([category, list]) => (
          <div className="card" style={{ padding: 0, marginBottom: 16 }} key={category}>
            <div className="section-title" style={{ margin: '14px 16px 8px', textTransform: 'capitalize' }}>
              {category} ({list.length})
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.sku}>
                      <td>
                        <strong>{i.name}</strong>
                        {i.description && <div className="subtle">{i.description}</div>}
                      </td>
                      <td>
                        <code>{i.sku}</code>
                      </td>
                      <td>
                        <strong>{i.price.toLocaleString()}</strong>{' '}
                        <span className="subtle">{i.currency === 'zer' ? 'Zêr' : 'Gems'}</span>
                      </td>
                      <td>
                        {!i.active && <span className="badge danger">inactive</span>}
                        {i.active && !i.inStock && <span className="badge mid">out of stock</span>}
                        {i.active && i.inStock && <span className="badge">on sale</span>}
                        {i.premiumOnly && <span className="badge mid">premium</span>}
                      </td>
                      <td>
                        <button onClick={() => setEditing(i)}>Edit</button>
                        <button onClick={() => void toggleStock(i)}>
                          {i.inStock ? 'Take off sale' : 'Put on sale'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Create or edit an item. Saving posts the whole row: the API upserts on SKU, so
 * the same form covers both (keep the SKU to edit, change it to create a new one).
 */
function ItemForm({
  item,
  onDone,
  onCancel,
}: {
  item: Item | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}): React.JSX.Element {
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState<string>(item?.category ?? 'misc');
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'zer');
  const [price, setPrice] = useState<string>(String(item?.price ?? 0));
  const [active, setActive] = useState(item?.active ?? true);
  const [inStock, setInStock] = useState(item?.inStock ?? true);
  const [premiumOnly, setPremiumOnly] = useState(item?.premiumOnly ?? false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const value = Number(price);
    if (!Number.isInteger(value) || value < 0) {
      alert('Price must be a whole number of 0 or more.');
      return;
    }
    setBusy(true);
    try {
      await api('/shop/items', {
        method: 'POST',
        body: {
          sku: sku.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          currency,
          price: value,
          active,
          inStock,
          premiumOnly,
          // preserve fields the form doesn't edit (the upsert writes the whole row)
          isUnique: item?.isUnique ?? true,
          assetKey: item?.assetKey ?? undefined,
          displayOrder: item?.displayOrder ?? 0,
        },
      });
      await onDone();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => void submit(e)}>
      <div className="section-title">{item ? `Edit ${item.name}` : 'New item'}</div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        Prices are enforced on the server: a purchase is rejected if the price changed since the player
        saw it, so edits take effect safely and immediately.
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label>
          SKU
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="bg_newroz" required disabled={!!item} />
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Newroz background" required />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <label>
          Price
          <input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="zer">Zêr</option>
            <option value="gems">Gems</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <label>
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> On sale
        </label>
        <label>
          <input type="checkbox" checked={premiumOnly} onChange={(e) => setPremiumOnly(e.target.checked)} /> Premium only
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ display: 'block' }}>
          Description
          <input
            style={{ width: '100%' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown on the shop card"
          />
        </label>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={busy || !sku.trim() || !name.trim()}>
          {busy ? 'Saving…' : 'Save item'}
        </button>
      </div>
    </form>
  );
}
