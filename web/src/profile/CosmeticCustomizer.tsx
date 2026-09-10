import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError, requestId } from '../lib/api';
import type { InventoryItem, MeProfile, PurchaseResult, ShopItem } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

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
  const t = useT();
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [zer, setZer] = useState<number | null>(null);
  const [equipped, setEquipped] = useState<{ background: string | null; icon: string | null }>({
    background: me.equippedBackgroundSku ?? null,
    icon: me.equippedIconSku ?? null,
  });
  const [iconEnabled, setIconEnabled] = useState<boolean>(me.premiumIconEnabled ?? true);
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
    if (!s.ok && !inv.ok) setError(describeError(s.ok ? inv.error : s.error, t));
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
      setMsg({ kind: 'ok', text: sku ? t('edit.equippedMsg') : t('edit.removedMsg') });
      onChanged();
    } else {
      setEquipped((e) => ({ ...e, [cat]: prev }));
      setMsg({ kind: 'err', text: describeError(res.error, t) });
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
      setMsg({ kind: 'ok', text: t('edit.purchased', { name: tile.name }) });
      onChanged();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
    setBusy(null);
  }

  if (loading) return <section className="card" style={{ marginTop: 24 }}><p className="muted">{t('edit.loadingCosmetics')}</p></section>;
  if (error) return <section className="card" style={{ marginTop: 24 }}><div className="msg msg-error">{error}</div></section>;

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.cosmetics')}</h2>
        <span className="field-hint">{zer === null ? '' : t('edit.zerAmount', { amount: zer.toLocaleString() })}</span>
      </div>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <CosmeticSection
        title={t('edit.background')}
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
        title={t('edit.icon')}
        cat="icon"
        tiles={mergeCategory('icon', shop, inventory)}
        premium={me.premium ?? false}
        equippedSku={equipped.icon}
        zer={zer}
        busy={busy}
        onEquip={(sku) => void equip('icon', sku)}
        onBuy={(t) => void buy(t)}
      />

      {equipped.icon && (
        <label className="icon-visibility">
          <input
            type="checkbox"
            checked={iconEnabled}
            disabled={busy !== null}
            onChange={(e) => void toggleIconVisibility(e.target.checked)}
          />
          <span>{t('edit.showPremiumIcon')}</span>
        </label>
      )}
    </section>
  );

  async function toggleIconVisibility(enabled: boolean): Promise<void> {
    const prev = iconEnabled;
    setIconEnabled(enabled); // optimistic
    setMsg(null);
    const res = await client.put('/me/cosmetics/icon/visibility', { enabled });
    if (res.ok) {
      onChanged();
    } else {
      setIconEnabled(prev);
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }
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
  const t = useT();
  return (
    <div className="cosmetic-section">
      <div className="cosmetic-section-head">
        <h3 className="cosmetic-section-title">{title}</h3>
        {equippedSku && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => onEquip(null)}>
            {t('groups.remove')}
          </button>
        )}
      </div>

      {tiles.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
            {cat === 'background' ? t('edit.noBackgrounds') : t('edit.noIcons')}
          </p>
      ) : (
        <div className="cosmetic-grid">
          {tiles.map((tile) => {
            const equipped = equippedSku === tile.sku;
            const equippable = tile.owned || (tile.premiumOnly && premium);
            const buyable = !tile.owned && tile.price != null && tile.price > 0;
            const canAfford = zer != null && tile.price != null && zer >= tile.price;
            const disabled = busy !== null;
            return (
              <figure className={`cosmetic-tile${equipped ? ' is-equipped' : ''}`} key={tile.sku}>
                <div className={`cosmetic-thumb cosmetic-thumb-${cat}`}>
                  {tile.assetUrl ? <img src={tile.assetUrl} alt="" loading="lazy" /> : <span className="cosmetic-thumb-empty" aria-hidden="true" />}
                  {tile.premiumOnly && <span className="cosmetic-badge" title={t('profile.premium')}>★</span>}
                </div>
                <figcaption className="cosmetic-name" title={tile.name}>{tile.name}</figcaption>
                {equipped ? (
                  <span className="cosmetic-equipped">{t('edit.equipped')}</span>
                ) : equippable ? (
                  <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onEquip(tile.sku)}>
                    {t('edit.equip')}
                  </button>
                ) : buyable ? (
                  <button type="button" className="btn btn-sm" disabled={disabled || !canAfford} onClick={() => onBuy(tile)}>
                    {canAfford ? t('edit.buyFor', { price: tile.price!.toLocaleString() }) : t('edit.notEnoughZer')}
                  </button>
                ) : (
                  <span className="cosmetic-locked">{t('profile.premium')}</span>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
