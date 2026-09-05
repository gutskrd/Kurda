import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError, requestId } from '../lib/api';
import type { InventoryItem, PurchaseResult, ShopItem } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { GiftIcon } from '../components/icons';

/** A catalog tile: the item plus whether the viewer already owns it. */
interface Tile {
  sku: string;
  name: string;
  price: number;
  currency: 'zer' | 'gems';
  assetUrl: string | null;
  owned: boolean;
}

interface Friend {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface ReceivedGift {
  id: string;
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  from: { id: string; username: string } | null;
  createdAt: string;
  seenAt: string | null;
}

/** Items can be priced in either currency, so never hardcode one on a label. */
function currencyName(currency: 'zer' | 'gems'): string {
  return currency === 'gems' ? 'Gems' : 'Zêr';
}

function tilesFor(cat: string, shop: ShopItem[], owned: Set<string>): Tile[] {
  // /shop hides owned unique items, so owned ones come from inventory (below).
  return shop
    .filter((i) => i.category === cat)
    .map((i) => ({ sku: i.sku, name: i.name, price: i.price, currency: i.currency, assetUrl: i.assetUrl, owned: owned.has(i.sku) }));
}

/**
 * Shop — browse, buy, and gift profile cosmetics with Zêr.
 *
 * Buying only grants ownership; equipping happens in Edit Profile. All prices,
 * ownership and payment are server-authoritative (POST /shop/purchase and
 * /shop/gift validate the price and move the money atomically); the client
 * displays and requests, and celebrates afterwards.
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
  /** the tile that just succeeded — drives the one-shot celebration */
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [gifting, setGifting] = useState<Tile | null>(null);

  const balance = zer ?? wallet.data?.balances?.zer ?? null;
  const ownedSkus = useMemo(() => {
    const s = new Set((inventory.data?.items ?? []).map((i) => i.sku));
    for (const sku of bought) s.add(sku);
    return s;
  }, [inventory.data, bought]);

  const items = shop.data?.items ?? [];
  const backgrounds = tilesFor('background', items, ownedSkus);
  const icons = tilesFor('icon', items, ownedSkus);

  /** Play the celebration once, then clear it so it can play again later. */
  const celebrate = useCallback((sku: string) => {
    setCelebrating(sku);
    setTimeout(() => setCelebrating((c) => (c === sku ? null : c)), 1100);
  }, []);

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
      celebrate(t.sku);
      setMsg({ kind: 'ok', text: `${t.name} is yours. Equip it from Edit Profile.` });
    } else {
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  async function gift(t: Tile, to: Friend): Promise<void> {
    setBusy(t.sku);
    setMsg(null);
    const res = await client.post<{ balance: number }>('/shop/gift', {
      sku: t.sku,
      toUserId: to.id,
      idempotencyKey: requestId(),
      expectedPrice: t.price,
    });
    setBusy(null);
    setGifting(null);
    if (res.ok) {
      setZer(res.data.balance);
      celebrate(t.sku);
      setMsg({ kind: 'ok', text: `${t.name} is on its way to ${to.username}.` });
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
          Buy profile backgrounds and premium icons with Zêr — for yourself, or as a gift for a friend.{' '}
          {balance !== null && <strong>{balance.toLocaleString()} Zêr</strong>}
        </p>
      </div>

      {msg && (
        <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status" style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      <GiftsReceived onEquipHint={() => setMsg(null)} />

      <ShopSection
        title="Profile Backgrounds"
        cat="background"
        tiles={backgrounds}
        balance={balance}
        busy={busy}
        celebrating={celebrating}
        onBuy={(t) => void buy(t)}
        onGift={setGifting}
      />
      <ShopSection
        title="Premium Icons"
        cat="icon"
        tiles={icons}
        balance={balance}
        busy={busy}
        celebrating={celebrating}
        onBuy={(t) => void buy(t)}
        onGift={setGifting}
      />

      <Modal open={gifting !== null} onClose={() => setGifting(null)} label="Send as a gift">
        {gifting && <GiftPicker tile={gifting} busy={busy !== null} onPick={(f) => void gift(gifting, f)} />}
      </Modal>
    </div>
  );
}

/**
 * Gifts you have been sent.
 *
 * Sits above the catalog and only appears when there is something in it, so the
 * notification ("someone sent you a gift") lands somewhere that acknowledges it
 * rather than dropping you into a shop that looks unchanged. Opening the page
 * marks them seen, which clears the badge.
 */
function GiftsReceived({ onEquipHint }: { onEquipHint: () => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ gifts: ReceivedGift[]; unseen: number }>('/me/gifts');
      if (cancelled || !res.ok) return;
      setGifts(res.data.gifts);
      // reading the list IS opening them; anything else leaves a badge that
      // never clears no matter what you do
      if (res.data.unseen > 0) await client.post('/me/gifts/seen');
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!gifts || gifts.length === 0) return null;

  return (
    <section className="friend-section">
      <h2 className="friend-heading">Your gifts</h2>
      <div className="shop-grid">
        {gifts.map((g) => (
          <figure className={`shop-tile shop-tile-${g.category} gift-tile${g.seenAt ? '' : ' gift-new'}`} key={g.id}>
            <div className={`shop-thumb shop-thumb-${g.category}`}>
              {g.assetUrl ? <img src={g.assetUrl} alt="" loading="lazy" /> : <span className="shop-thumb-empty" aria-hidden="true" />}
            </div>
            <figcaption className="shop-name" title={g.name}>
              {g.name}
            </figcaption>
            <span className="gift-from" onClick={onEquipHint}>
              {g.from ? `from ${g.from.username}` : 'from a former member'}
            </span>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Choose which friend a gift goes to. Gifting is friends-only, server-side. */
function GiftPicker({
  tile,
  busy,
  onPick,
}: {
  tile: Tile;
  busy: boolean;
  onPick: (friend: Friend) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    void (async () => {
      const res = await client.get<{ friends: Friend[] }>('/friends');
      setFriends(res.ok ? res.data.friends : []);
    })();
  }, [client]);

  const shown = (friends ?? []).filter((f) => f.username.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        Send {tile.name}
      </h2>
      <p className="muted">
        {tile.price.toLocaleString()} {currencyName(tile.currency)}, paid by you. They get the item, and a
        notification saying it came from you.
      </p>

      {friends === null ? (
        <Loading />
      ) : friends.length === 0 ? (
        <p className="muted">You have no friends to gift to yet — gifts can only be sent to friends.</p>
      ) : (
        <>
          {friends.length > 6 && (
            <input
              className="input"
              placeholder="Search friends…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search friends"
              style={{ marginBottom: 12 }}
            />
          )}
          <ul className="gift-friends">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" className="gift-friend" disabled={busy} onClick={() => onPick(f)}>
                  <Avatar url={f.avatarUrl} glyphSize={18} />
                  <span className="gift-friend-name">{f.username}</span>
                  <GiftIcon size={17} className="gift-friend-go" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ShopSection({
  title,
  cat,
  tiles,
  balance,
  busy,
  celebrating,
  onBuy,
  onGift,
}: {
  title: string;
  cat: string;
  tiles: Tile[];
  balance: number | null;
  busy: string | null;
  celebrating: string | null;
  onBuy: (tile: Tile) => void;
  onGift: (tile: Tile) => void;
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
              <figure
                className={`shop-tile shop-tile-${cat}${celebrating === t.sku ? ' shop-tile-won' : ''}`}
                key={t.sku}
              >
                <div className={`shop-thumb shop-thumb-${cat}`}>
                  {t.assetUrl ? <img src={t.assetUrl} alt="" loading="lazy" /> : <span className="shop-thumb-empty" aria-hidden="true" />}
                  {celebrating === t.sku && <span className="shop-shine" aria-hidden />}
                </div>
                <figcaption className="shop-name" title={t.name}>{t.name}</figcaption>
                {t.owned ? (
                  <span className="shop-owned">Owned</span>
                ) : (
                  <div className="shop-actions">
                    <Button size="sm" disabled={busy !== null || !canAfford} onClick={() => onBuy(t)}>
                      {canAfford
                        ? `Buy · ${t.price.toLocaleString()} ${currencyName(t.currency)}`
                        : `Not enough ${currencyName(t.currency)}`}
                    </Button>
                    <button
                      type="button"
                      className="shop-gift-btn"
                      disabled={busy !== null || !canAfford}
                      onClick={() => onGift(t)}
                      title={`Gift ${t.name} to a friend`}
                      aria-label={`Gift ${t.name} to a friend`}
                    >
                      <GiftIcon size={17} />
                    </button>
                  </div>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
