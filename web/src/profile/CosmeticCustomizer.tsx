import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError, requestId } from '../lib/api';
import type { InventoryItem, MeProfile, PurchaseResult, ShopItem } from '../lib/types';

/** A category's merged view: owned items + buyable catalog items, deduped. */
interface Tile {
  sku: string;
  name: string;
  assetUrl: string | null;
  premiumOnly: boolean;
  owned: boolean;
  /** catalog price when buyable; null once owned */
  price: number | null;
}

type Category = 'background' | 'icon';

/** Merge inventory (owned) + shop (buyable) for one category; owned wins. */
function mergeCategory(cat: Category, shop: ShopItem[], inventory: InventoryItem[]): Tile[] {
  const map = new Map<string, Tile>();
  for (const inv of inventory) {
    if (inv.category !== cat) continue;
    map.set(inv.sku, { sku: inv.sku, name: inv.name, assetUrl: inv.assetUrl, premiumOnly: inv.premiumOnly, owned: true, price: null });
  }
  for (const it of shop) {
    if (it.category !== cat || map.has(it.sku)) continue;
    map.set(it.sku, { sku: it.sku, name: it.name, assetUrl: it.assetUrl, premiumOnly: it.premiumOnly, owned: false, price: it.price });
  }
  return [...map.values()];
}

/**
 * Background + icon customizer: browse owned/buyable cosmetics, buy with Zêr, and
 * equip. All authorization is server-side — the client only sends a SKU to equip
 * and an expected price to buy (rejected if the catalog changed). Empty until the
 * catalog is seeded; background thumbnails need the R2 upload.
 */
export function CosmeticCustomizer({ me, onChanged }: { me: MeProfile; onChanged: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [zer, setZer] = useState<number | null>(null);
  const [equipped, setEquipped] = useState<{ background: string | null; icon: string | null }>({
    background: me.equippedBackgroundSku ?? null,
    icon: me.equippedIconSku ?? null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load(): Promise<void> {
    const [s, inv, w] = await Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ items: InventoryItem[] }>('/me/inventory'),
      client.get<{ balances: { zer: number } }>('/me/wallet'),
    ]);
    if (s.ok) setShop(s.data.items ?? []);
    if (inv.ok) setInventory(inv.data.items ?? []);
    if (w.ok) setZer(w.data.balances?.zer ?? null);
    if (!s.ok && !inv.ok) setError(describeError(s.ok ? inv.error : s.error));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // load once on mount; equip/buy refresh explicitly
  }, [client]);

  async function equip(cat: Category, sku: string | null): Promise<void> {
    if (busy) return;
    setBusy(sku ?? `__clear_${cat}`);
    setMsg(null);
    const prev = equipped[cat];
    setEquipped((e) => ({ ...e, [cat]: sku }));
    const res = await client.put<{ backgroundSku?: string | null; iconSku?: string | null }>(`/me/cosmetics/${cat}`, { sku });
    setBusy(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: sku ? 'Equipped.' : 'Removed.' });
      onChanged();
    } else {
      setEquipped((e) => ({ ...e, [cat]: prev }));
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  async function buy(tile: Tile): Promise<void> {
    if (busy || tile.price == null) return;
    setBusy(tile.sku);
    setMsg(null);
    const res = await client.post<PurchaseResult>('/shop/purchase', {
      sku: tile.sku,
      idempotencyKey: requestId(),
      expectedPrice: tile.price,
    });
    if (res.ok) {
      setZer(res.data.balance);
      await load(); // the item is now owned → becomes equippable
      setMsg({ kind: 'ok', text: `Purchased ${tile.name}.` });
      onChanged();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
    setBusy(null);
  }

  if (loading) return <section className="card" style={{ marginTop: 24 }}><p className="muted">Loading cosmetics…</p></section>;
  if (error) return <section className="card" style={{ marginTop: 24 }}><div className="msg msg-error">{error}</div></section>;

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 className="friend-heading" style={{ marginTop: 0 }}>Cosmetics</h2>
        <span className="field-hint">{zer === null ? '' : `${zer.toLocaleString()} Zêr`}</span>
      </div>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <CosmeticSection
        title="Background"
        cat="background"
        tiles={mergeCategory('background', shop, inventory)}
        premium={me.premium ?? false}
        equippedSku={equipped.background}
        zer={zer}
        busy={busy}
        onEquip={(sku) => void equip('background', sku)}
        onBuy={(t) => void buy(t)}
      />
      <CosmeticSection
        title="Icon"
        cat="icon"
        tiles={mergeCategory('icon', shop, inventory)}
        premium={me.premium ?? false}
        equippedSku={equipped.icon}
        zer={zer}
        busy={busy}
        onEquip={(sku) => void equip('icon', sku)}
        onBuy={(t) => void buy(t)}
      />
    </section>
  );
}

function CosmeticSection({
  title,
  cat,
  tiles,
  premium,
  equippedSku,
  zer,
  busy,
  onEquip,
  onBuy,
}: {
  title: string;
  cat: Category;
  tiles: Tile[];
  premium: boolean;
  equippedSku: string | null;
  zer: number | null;
  busy: string | null;
  onEquip: (sku: string | null) => void;
  onBuy: (tile: Tile) => void;
}): React.JSX.Element {
  return (
    <div className="cosmetic-section">
      <div className="cosmetic-section-head">
        <h3 className="cosmetic-section-title">{title}</h3>
        {equippedSku && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => onEquip(null)}>
            Remove
          </button>
        )}
      </div>

      {tiles.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No {cat}s available yet.</p>
      ) : (
        <div className="cosmetic-grid">
          {tiles.map((t) => {
            const equipped = equippedSku === t.sku;
            const equippable = t.owned || (t.premiumOnly && premium);
            const buyable = !t.owned && t.price != null && t.price > 0;
            const canAfford = zer != null && t.price != null && zer >= t.price;
            const disabled = busy !== null;
            return (
              <figure className={`cosmetic-tile${equipped ? ' is-equipped' : ''}`} key={t.sku}>
                <div className={`cosmetic-thumb cosmetic-thumb-${cat}`}>
                  {t.assetUrl ? <img src={t.assetUrl} alt="" loading="lazy" /> : <span className="cosmetic-thumb-empty" aria-hidden="true" />}
                  {t.premiumOnly && <span className="cosmetic-badge" title="Premium">★</span>}
                </div>
                <figcaption className="cosmetic-name" title={t.name}>{t.name}</figcaption>
                {equipped ? (
                  <span className="cosmetic-equipped">Equipped</span>
                ) : equippable ? (
                  <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onEquip(t.sku)}>
                    Equip
                  </button>
                ) : buyable ? (
                  <button type="button" className="btn btn-sm" disabled={disabled || !canAfford} onClick={() => onBuy(t)}>
                    {canAfford ? `Buy · ${t.price!.toLocaleString()} Zêr` : 'Not enough Zêr'}
                  </button>
                ) : (
                  <span className="cosmetic-locked">Premium</span>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
