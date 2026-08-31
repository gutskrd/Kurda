import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError, requestId } from '../lib/api';
import type { InventoryItem, PurchaseResult, ShopItem } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';

/** A catalog tile: the item plus whether the viewer already owns it. */
interface Tile {
  sku: string;
  name: string;
  price: number;
  currency: 'zer' | 'gems';
  assetUrl: string | null;
  owned: boolean;
}

function tilesFor(cat: string, shop: ShopItem[], owned: Set<string>): Tile[] {
  // /shop hides owned unique items, so owned ones come from inventory (below).
  return shop
    .filter((i) => i.category === cat)
    .map((i) => ({ sku: i.sku, name: i.name, price: i.price, currency: i.currency, assetUrl: i.assetUrl, owned: owned.has(i.sku) }));
}

/**
 * Shop — browse and buy profile cosmetics (backgrounds + premium icons) with Zêr.
 * Buying only grants ownership; equipping happens in Edit Profile. All prices and
 * ownership are server-authoritative (POST /shop/purchase validates the price and
 * debits the wallet atomically); the client just displays and requests.
 */
export function Shop(): React.JSX.Element {
  const { client } = useAuth();
  const shop = useApiGet<{ items: ShopItem[] }>('/shop');
  const inventory = useApiGet<{ items: InventoryItem[] }>('/me/inventory');
  const wallet = useApiGet<{ balances: { zer: number } }>('/me/wallet');

  const [zer, setZer] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());

  const balance = zer ?? wallet.data?.balances?.zer ?? null;
  const ownedSkus = useMemo(() => {
    const s = new Set((inventory.data?.items ?? []).map((i) => i.sku));
    for (const sku of bought) s.add(sku);
    return s;
  }, [inventory.data, bought]);

  const items = shop.data?.items ?? [];
  const backgrounds = tilesFor('background', items, ownedSkus);
  const icons = tilesFor('icon', items, ownedSkus);

  async function buy(t: Tile): Promise<void> {
    if (busy || t.owned) return;
    setBusy(t.sku);
    setMsg(null);
    const res = await client.post<PurchaseResult>('/shop/purchase', {
      sku: t.sku,
      idempotencyKey: requestId(),
      expectedPrice: t.price,
    });
    setBusy(null);
    if (res.ok) {
      setZer(res.data.balance);
      setBought((prev) => new Set(prev).add(t.sku));
      setMsg({ kind: 'ok', text: `Purchased ${t.name}. Equip it from Edit Profile.` });
    } else {
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  if (shop.loading) return <Loading label="Loading the shop…" />;
  if (shop.error) return <ErrorState title="Couldn’t load the shop" message={shop.error} onRetry={shop.reload} />;

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">Bazar · Shop</span>
        <h1 className="page-title">Shop</h1>
        <p className="page-sub">
          Buy profile backgrounds and premium icons with Zêr. {balance !== null && <strong>{balance.toLocaleString()} Zêr</strong>}
        </p>
      </div>

      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status" style={{ marginBottom: 16 }}>{msg.text}</div>}

      <ShopSection title="Profile Backgrounds" cat="background" tiles={backgrounds} balance={balance} busy={busy} onBuy={(t) => void buy(t)} />
      <ShopSection title="Premium Icons" cat="icon" tiles={icons} balance={balance} busy={busy} onBuy={(t) => void buy(t)} />
    </div>
  );
}

function ShopSection({
  title,
  cat,
  tiles,
  balance,
  busy,
  onBuy,
}: {
  title: string;
  cat: string;
  tiles: Tile[];
  balance: number | null;
  busy: string | null;
  onBuy: (tile: Tile) => void;
}): React.JSX.Element {
  return (
    <section className="friend-section">
      <h2 className="friend-heading">{title}</h2>
      {tiles.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nothing here yet — check back soon.</p>
      ) : (
        <div className="shop-grid">
          {tiles.map((t) => {
            const canAfford = balance !== null && balance >= t.price;
            return (
              <figure className={`shop-tile shop-tile-${cat}`} key={t.sku}>
                <div className={`shop-thumb shop-thumb-${cat}`}>
                  {t.assetUrl ? <img src={t.assetUrl} alt="" loading="lazy" /> : <span className="shop-thumb-empty" aria-hidden="true" />}
                </div>
                <figcaption className="shop-name" title={t.name}>{t.name}</figcaption>
                {t.owned ? (
                  <span className="shop-owned">Owned</span>
                ) : (
                  <Button size="sm" disabled={busy !== null || !canAfford} onClick={() => onBuy(t)}>
                    {canAfford ? `Buy · ${t.price.toLocaleString()} Zêr` : 'Not enough Zêr'}
                  </Button>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
